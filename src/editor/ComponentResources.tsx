import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { NativeSelect } from "../components/ui/native-select";
import { DesignEngine, type Receipt } from "../core/engine";
import type { Command, EditRequest } from "../core/commands";
import {
  ComponentField,
  uid,
  type ComponentDefinition,
  type ComponentValue,
  type DesignDocument,
} from "../core/model";
import { instanceOwner } from "../core/components";
import { pngExport } from "../files/export";
import { componentVariantPreview } from "../files/component-preview";

type Props = {
  engine: DesignEngine;
  document: DesignDocument;
  onError: (s: string) => void;
};
function ValueInput({
  property,
  value,
  onChange,
}: {
  property: ComponentDefinition["properties"][number];
  value: ComponentValue;
  onChange: (value: ComponentValue) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  if (property.type === "enum")
    return (
      <NativeSelect
        aria-label={property.name}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
      >
        {property.options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </NativeSelect>
    );
  if (property.type === "boolean")
    return (
      <Input
        aria-label={property.name}
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  return (
    <Input
      aria-label={property.name}
      type={property.type === "number" ? "number" : "text"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== String(value))
          onChange(property.type === "number" ? Number(draft) : draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(String(value));
      }}
    />
  );
}
export function ComponentSelection({ engine, document: doc, onError }: Props) {
  const node = doc.nodes.find((item) => item.id === engine.selection[0]);
  const owner = node && instanceOwner(doc, node);
  if (!owner) return null;
  const spec = owner.root.component!;
  const definition = doc.components.find(
    (item) => item.id === spec.componentId,
  )!;
  const run = (commands: Command[]) => {
    try {
      engine.dispatch(commands);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <section className="inspector-section">
      <h3>
        {definition.name}
        {spec.frozen ? " · Frozen" : " · Instance"}
      </h3>
      {!spec.frozen &&
        definition.properties.map((property) => (
          <label className="field" key={property.name}>
            <span>{property.name}</span>
            <ValueInput
              property={property}
              value={spec.properties[property.name] ?? property.defaultValue}
              onChange={(value) =>
                run([
                  {
                    op: "component_properties",
                    ids: [owner.root.id],
                    properties: { [property.name]: value },
                  },
                ])
              }
            />
          </label>
        ))}
      <div className="button-row">
        <Button
          disabled={spec.frozen}
          onClick={() =>
            run([
              {
                op: "component_reset",
                ids: [node!.id],
                scope: "part",
                properties: false,
              },
            ])
          }
        >
          Reset part
        </Button>
        <Button
          disabled={spec.frozen}
          onClick={() =>
            run([
              {
                op: "component_reset",
                ids: [owner.root.id],
                scope: "instance",
                properties: true,
              },
            ])
          }
        >
          Reset instance
        </Button>
        <Button
          onClick={() =>
            run([{ op: "component_detach", ids: [owner.root.id] }])
          }
        >
          Detach
        </Button>
      </div>
    </section>
  );
}
export function ComponentResources({
  engine,
  document: doc,
  onError,
  onInserted,
}: Props & { onInserted: () => void }) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [properties, setProperties] = useState<
    ComponentDefinition["properties"]
  >([]);
  const [variants, setVariants] = useState<ComponentDefinition["variants"]>([]);
  const [propertyName, setPropertyName] = useState("");
  const [propertyType, setPropertyType] =
    useState<ComponentDefinition["properties"][number]["type"]>("text");
  const [defaultValue, setDefaultValue] = useState("");
  const [options, setOptions] = useState("");
  const [partId, setPartId] = useState("");
  const [field, setField] =
    useState<(typeof ComponentField.options)[number]>("text");
  const [variantName, setVariantName] = useState("");
  const [condition, setCondition] = useState("");
  const [conditionValue, setConditionValue] = useState("");
  const [variantValue, setVariantValue] = useState("");
  const [previewProperties, setPreviewProperties] = useState<
    Record<string, ComponentValue>
  >({});
  const [previewUrl, setPreviewUrl] = useState("");
  const [pending, setPending] = useState<{
    request: EditRequest;
    receipt: Receipt;
  } | null>(null);
  const [drop, setDrop] = useState(false);
  const definition = doc.components.find((item) => item.id === id);
  const selected = doc.nodes.find((item) => item.id === engine.selection[0]);
  const source =
    selected?.componentSource && selected.componentSource.componentId === id;
  const parts =
    definition?.nodes ??
    (selected
      ? [selected, ...doc.nodes.filter((node) => node.parentId === selected.id)]
      : []);
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );
  const run = (commands: Command[]) => {
    try {
      return engine.dispatch(commands);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      return null;
    }
  };
  const load = (next: string) => {
    const item = engine.document.components.find((item) => item.id === next);
    setId(next);
    setName(item?.name ?? "");
    setDescription(item?.description ?? "");
    setProperties(structuredClone(item?.properties ?? []));
    setVariants(structuredClone(item?.variants ?? []));
    setPending(null);
    setPreviewProperties({});
    setPreviewUrl("");
  };
  const valueFor = (type: string, value: string): ComponentValue =>
    type === "boolean"
      ? value === "true"
      : type === "number"
        ? Number(value)
        : value;
  const insert = (sourceCopy: boolean) => {
    if (!definition) return;
    const newId = uid();
    const commands: Command[] = [
      sourceCopy
        ? {
            op: "component_source",
            id: newId,
            componentId: id,
            pageId: engine.pageId,
            parentId: null,
            x: 40,
            y: 40,
          }
        : {
            op: "component_instance",
            id: newId,
            componentId: id,
            pageId: engine.pageId,
            parentId: null,
            x: 40,
            y: 40,
            rotation: 0,
            properties: previewProperties,
            overrides: [],
          },
    ];
    if (run(commands)) {
      engine.select([newId]);
      onInserted();
    }
  };
  const prepare = () => {
    try {
      const command: Command =
        selected && (!definition || source)
          ? {
              op: "component_capture",
              id: id || uid(),
              rootId: selected.id,
              name,
              description,
              properties,
              variants,
              expectedComponentRevision: definition?.revision,
              conflictPolicy: drop ? "drop" : "reject",
              allowStaleSource: false,
            }
          : {
              op: "component_set",
              id,
              name,
              description,
              properties,
              variants,
              expectedComponentRevision: definition?.revision,
              conflictPolicy: drop ? "drop" : "reject",
            };
      const request = { ...engine.guard(), commands: [command] };
      setPending({ request, receipt: engine.edit(request, true) });
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const preview = async () => {
    try {
      if (!definition) return;
      const temp = new DesignEngine({ ...structuredClone(doc), nodes: [] });
      const root = uid();
      temp.dispatch([
        {
          op: "component_instance",
          id: root,
          componentId: id,
          pageId: doc.pages[0].id,
          parentId: null,
          x: 0,
          y: 0,
          rotation: 0,
          properties: previewProperties,
          overrides: [],
        },
      ]);
      const blob = await pngExport(temp.document, temp.pageId, [root], {
        background: "#ffffff",
        scale: 1,
      });
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="resource-sections">
      <section>
        <h3>Components</h3>
        <label>
          Component
          <NativeSelect
            aria-label="Choose component"
            value={id}
            onChange={(e) => load(e.target.value)}
          >
            <option value="">New from selection</option>
            {doc.components.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.deleted ? " (deleted)" : ""}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label>
          Name
          <Input
            aria-label="Component name"
            value={name}
            maxLength={200}
            onChange={(e) => {
              setName(e.target.value);
              setPending(null);
            }}
          />
        </label>
        <label>
          Description
          <Textarea
            value={description}
            maxLength={1000}
            onChange={(e) => {
              setDescription(e.target.value);
              setPending(null);
            }}
          />
        </label>
        {definition?.deleted ? (
          <Button
            onClick={() => {
              run([{ op: "component_restore", id, name: name || undefined }]);
            }}
          >
            Restore component
          </Button>
        ) : (
          <>
            <div className="button-row">
              <Button disabled={!definition} onClick={() => insert(false)}>
                Insert instance
              </Button>
              <Button disabled={!definition} onClick={() => insert(true)}>
                Edit source copy
              </Button>
              <Button
                disabled={!name.trim() || (!definition && !selected)}
                onClick={prepare}
              >
                {source ? "Review source update" : "Review library change"}
              </Button>
            </div>
            <label className="checks">
              <Input
                type="checkbox"
                checked={drop}
                onChange={(e) => {
                  setDrop(e.target.checked);
                  setPending(null);
                }}
              />
              Drop incompatible overrides
            </label>
            {pending && (
              <div role="status" className="resource-confirm">
                <strong>
                  {pending.receipt.componentImpact?.instanceCount ?? 0}{" "}
                  instances affected
                </strong>
                {pending.receipt.warnings.map((warning, i) => (
                  <p key={i}>{warning}</p>
                ))}
                <div className="button-row">
                  <Button
                    onClick={() => {
                      try {
                        engine.edit(pending.request);
                        setPending(null);
                        const command = pending.request.commands[0];
                        load(
                          id ||
                            (command.op === "component_capture"
                              ? command.id
                              : ""),
                        );
                      } catch (e) {
                        onError(e instanceof Error ? e.message : String(e));
                      }
                    }}
                  >
                    Apply library change
                  </Button>
                  <Button onClick={() => setPending(null)}>
                    Cancel change
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
      {!definition?.deleted && (
        <>
          <section>
            <h3>Properties</h3>
            <ul className="resource-records">
              {properties.map((property, index) => (
                <li key={property.name}>
                  <span>
                    {property.name} · {property.type} ·{" "}
                    {String(property.defaultValue)}
                  </span>
                  <Button
                    aria-label={`Remove property ${property.name}`}
                    onClick={() => {
                      setProperties(properties.filter((_, i) => i !== index));
                      setPending(null);
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setProperties([
                  ...properties,
                  {
                    name: propertyName,
                    type: propertyType,
                    defaultValue: valueFor(propertyType, defaultValue),
                    options:
                      propertyType === "enum"
                        ? options
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean)
                        : [],
                    bindings: partId ? [{ partId, field }] : [],
                  },
                ]);
                setPropertyName("");
                setPending(null);
              }}
            >
              <label>
                Property name
                <Input
                  required
                  value={propertyName}
                  onChange={(e) => setPropertyName(e.target.value)}
                />
              </label>
              <label>
                Property type
                <NativeSelect
                  value={propertyType}
                  onChange={(e) =>
                    setPropertyType(e.target.value as typeof propertyType)
                  }
                >
                  {["text", "boolean", "number", "color", "enum"].map(
                    (kind) => (
                      <option key={kind}>{kind}</option>
                    ),
                  )}
                </NativeSelect>
              </label>
              <label>
                Default value
                <Input
                  value={defaultValue}
                  onChange={(e) => setDefaultValue(e.target.value)}
                />
              </label>
              {propertyType === "enum" && (
                <label>
                  Options, separated by commas
                  <Input
                    value={options}
                    onChange={(e) => setOptions(e.target.value)}
                  />
                </label>
              )}
              <label>
                Bind part
                <NativeSelect
                  value={partId}
                  onChange={(e) => setPartId(e.target.value)}
                >
                  <option value="">No binding</option>
                  {parts.map((part) => (
                    <option
                      key={part.id}
                      value={part.componentSource?.partId ?? part.id}
                    >
                      {part.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label>
                Bind field
                <NativeSelect
                  value={field}
                  onChange={(e) => setField(e.target.value as typeof field)}
                >
                  {ComponentField.options.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </NativeSelect>
              </label>
              <Button type="submit">Add property</Button>
            </form>
          </section>
          <section>
            <h3>Variants</h3>
            <ul className="resource-records">
              {variants.map((variant, index) => (
                <li key={variant.id}>
                  <span>{variant.name}</span>
                  <Button
                    onClick={() => {
                      setVariants(variants.filter((_, i) => i !== index));
                      setPending(null);
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const property = properties.find(
                  (item) => item.name === condition,
                );
                if (!property || !partId) return;
                setVariants([
                  ...variants,
                  {
                    id: uid(),
                    name: variantName,
                    when: {
                      [condition]: valueFor(property.type, conditionValue),
                    },
                    overrides: [
                      {
                        partId,
                        patch: {
                          [field]: ["hidden", "locked", "clip"].includes(field)
                            ? variantValue === "true"
                            : [
                                  "text",
                                  "fill",
                                  "stroke",
                                  "fontFamily",
                                  "fontWeight",
                                  "fontStyle",
                                  "path",
                                  "strokeLinecap",
                                  "strokeLinejoin",
                                ].includes(field)
                              ? variantValue
                              : Number(variantValue),
                        },
                        bindings: {},
                      },
                    ],
                  },
                ]);
                setVariantName("");
                setPending(null);
              }}
            >
              <label>
                Variant name
                <Input
                  required
                  value={variantName}
                  onChange={(e) => setVariantName(e.target.value)}
                />
              </label>
              <label>
                When property
                <NativeSelect
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                >
                  <option value="">Choose property</option>
                  {properties.map((property) => (
                    <option key={property.name}>{property.name}</option>
                  ))}
                </NativeSelect>
              </label>
              <label>
                Equals
                <Input
                  value={conditionValue}
                  onChange={(e) => setConditionValue(e.target.value)}
                />
              </label>
              <label>
                Override value
                <Input
                  value={variantValue}
                  onChange={(e) => setVariantValue(e.target.value)}
                />
              </label>
              <Button type="submit" disabled={!partId || !condition}>
                Add variant for selected part and field
              </Button>
            </form>
          </section>
          {definition && (
            <section>
              <h3>Preview</h3>
              <label>
                Variant state
                <NativeSelect
                  value={JSON.stringify(previewProperties)}
                  onChange={(e) =>
                    setPreviewProperties(JSON.parse(e.target.value))
                  }
                >
                  <option value="{}">Default</option>
                  {definition.variants.map((variant) => (
                    <option
                      key={variant.id}
                      value={JSON.stringify(variant.when)}
                    >
                      {variant.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              {definition.properties.map((property) => (
                <label key={property.name}>
                  {property.name}
                  <ValueInput
                    property={property}
                    value={
                      previewProperties[property.name] ?? property.defaultValue
                    }
                    onChange={(value) =>
                      setPreviewProperties({
                        ...previewProperties,
                        [property.name]: value,
                      })
                    }
                  />
                </label>
              ))}
              <Button onClick={() => void preview()}>
                Render component preview
              </Button>
              <Button
                onClick={() =>
                  void (async () => {
                    try {
                      const result = await componentVariantPreview(doc, id);
                      setPreviewUrl(URL.createObjectURL(result.blob));
                    } catch (e) {
                      onError(e instanceof Error ? e.message : String(e));
                    }
                  })()
                }
              >
                Render variant matrix
              </Button>
              {previewUrl && (
                <img
                  className="component-preview"
                  src={previewUrl}
                  alt={`${definition.name} preview`}
                />
              )}
            </section>
          )}
        </>
      )}
      {definition && !definition.deleted && (
        <section>
          <h3>Library deletion</h3>
          <Button
            onClick={() => {
              const request = {
                ...engine.guard(),
                commands: [
                  { op: "component_delete" as const, id, detach: false },
                ],
              };
              try {
                setPending({ request, receipt: engine.edit(request, true) });
              } catch (e) {
                onError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Review deletion
          </Button>
        </section>
      )}
    </div>
  );
}
