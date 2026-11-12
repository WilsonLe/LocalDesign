import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { NativeSelect } from "../components/ui/native-select";
import type { DesignEngine } from "../core/engine";
import type { Command } from "../core/commands";
import {
  TokenSchema,
  uid,
  type DesignDocument,
  type TokenPropertyName,
} from "../core/model";
import { tokenPropertyTypes, tokenResolver } from "../core/tokens";
const typeLabels = {
  color: "Color",
  spacing: "Spacing",
  radius: "Radius",
  opacity: "Opacity",
  dimension: "Dimension",
  fontFamily: "Font family",
  fontWeight: "Font weight",
  fontSize: "Font size",
  lineHeight: "Line height",
  letterSpacing: "Letter spacing",
};
const propertyLabels = {
  fill: "Fill",
  stroke: "Stroke",
  strokeWidth: "Stroke width",
  opacity: "Opacity",
  radius: "Radius",
  width: "Width",
  height: "Height",
  fontFamily: "Font family",
  fontWeight: "Font weight",
  fontSize: "Font size",
  lineHeight: "Line height",
  letterSpacing: "Letter spacing",
  "layout.gap": "Gap",
  "layout.padding": "Padding",
};

export function TokenResources({
  engine,
  document: doc,
  onError,
}: {
  engine: DesignEngine;
  document: DesignDocument;
  onError: (s: string) => void;
}) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] =
    useState<DesignDocument["tokens"][number]["type"]>("color");
  const [value, setValue] = useState("#222222");
  const [alias, setAlias] = useState("");
  const [mode, setMode] = useState<"literal" | "alias">("literal");
  const [themeScope, setThemeScope] = useState("");
  const [themeName, setThemeName] = useState("");
  const [property, setProperty] = useState<TokenPropertyName>("fill");
  const [binding, setBinding] = useState("");
  const selected = doc.nodes.filter((node) =>
    engine.selection.includes(node.id),
  );
  const resolver = tokenResolver(doc);
  const run = (commands: Command[]) => {
    try {
      engine.dispatch(commands);
      return true;
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  const load = (tokenId: string, theme = themeScope) => {
    const token = doc.tokens.find((token) => token.id === tokenId);
    setId(tokenId);
    setName(token?.name ?? "");
    setDescription(token?.description ?? "");
    setKind(token?.type ?? "color");
    const raw = token
      ? theme
        ? (token.themes[theme] ?? token.value)
        : token.value
      : "#222222";
    setMode(typeof raw === "object" ? "alias" : "literal");
    setAlias(typeof raw === "object" ? raw.tokenId : "");
    setValue(typeof raw === "object" ? "" : String(raw));
  };
  const eligible = Object.keys(tokenPropertyTypes).filter(
    (key) =>
      ((!key.startsWith("font") &&
        !["lineHeight", "letterSpacing"].includes(key)) ||
        selected.every((node) => node.type === "text")) &&
      (!key.startsWith("layout.") ||
        selected.every((node) => node.type === "frame")),
  ) as TokenPropertyName[];
  const matching = doc.tokens.filter(
    (token) => token.type === tokenPropertyTypes[property],
  );
  return (
    <div className="resource-sections">
      <section>
        <h3>Tokens</h3>
        <label>
          Token
          <NativeSelect
            aria-label="Choose token"
            value={id}
            onChange={(e) => load(e.target.value)}
          >
            <option value="">New token</option>
            {doc.tokens.map((token) => (
              <option key={token.id} value={token.id}>
                {token.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const previous = doc.tokens.find((token) => token.id === id);
            const raw =
              mode === "alias"
                ? { tokenId: alias }
                : ["color", "fontFamily", "fontWeight"].includes(kind)
                  ? value
                  : Number(value);
            const token: DesignDocument["tokens"][number] = {
              id: id || uid(),
              name,
              type: kind,
              value: themeScope && previous ? previous.value : raw,
              themes: themeScope
                ? { ...previous?.themes, [themeScope]: raw }
                : (previous?.themes ?? {}),
              description,
            };
            if (run([{ op: "token_set", token }])) load("");
          }}
        >
          <label>
            Name
            <Input
              aria-label="Token name"
              value={name}
              required
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Type
            <NativeSelect
              aria-label="Token type"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              {TokenSchema.shape.type.options.map((type) => (
                <option key={type} value={type}>
                  {typeLabels[type]}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label>
            Value for
            <NativeSelect
              aria-label="Token value theme"
              value={themeScope}
              onChange={(e) => {
                setThemeScope(e.target.value);
                load(id, e.target.value);
              }}
            >
              <option value="">Default</option>
              {doc.tokenThemes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label>
            Source
            <NativeSelect
              aria-label="Token value source"
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="literal">Value</option>
              <option value="alias">Another token</option>
            </NativeSelect>
          </label>
          {mode === "literal" ? (
            <label>
              Value
              <Input
                aria-label="Token value"
                value={value}
                required
                type={
                  ["color", "fontFamily", "fontWeight"].includes(kind)
                    ? "text"
                    : "number"
                }
                step="any"
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
          ) : (
            <label>
              Alias
              <NativeSelect
                aria-label="Alias token"
                value={alias}
                required
                onChange={(e) => setAlias(e.target.value)}
              >
                <option value="">Choose token</option>
                {doc.tokens
                  .filter((token) => token.type === kind && token.id !== id)
                  .map((token) => (
                    <option key={token.id} value={token.id}>
                      {token.name}
                    </option>
                  ))}
              </NativeSelect>
            </label>
          )}
          <label>
            Usage note
            <Input
              aria-label="Token usage note"
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="button-row">
            <Button type="submit">Save token</Button>
            {id && (
              <>
                <Button
                  type="button"
                  onClick={() => {
                    if (run([{ op: "token_delete", id, detach: false }]))
                      load("");
                  }}
                >
                  Delete token
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (run([{ op: "token_delete", id, detach: true }]))
                      load("");
                  }}
                >
                  Detach and delete
                </Button>
              </>
            )}
          </div>
        </form>
        <ol className="resource-records">
          {doc.tokens.map((token) => (
            <li key={token.id}>
              <Button onClick={() => load(token.id)}>{token.name}</Button>{" "}
              <span>
                {String(resolver.value(token.id, doc.activeTokenTheme))}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h3>Bind selection</h3>
        <label>
          Property
          <NativeSelect
            aria-label="Bound property"
            value={property}
            onChange={(e) => {
              setProperty(e.target.value as TokenPropertyName);
              setBinding("");
            }}
          >
            {eligible.map((key) => (
              <option key={key} value={key}>
                {propertyLabels[key]}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label>
          Token
          <NativeSelect
            aria-label="Binding token"
            value={binding}
            onChange={(e) => setBinding(e.target.value)}
          >
            <option value="">Detach binding</option>
            {matching.map((token) => (
              <option key={token.id} value={token.id}>
                {token.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button
          disabled={!selected.length || !eligible.includes(property)}
          onClick={() =>
            run([
              {
                op: "token_bind",
                ids: engine.selection,
                property,
                tokenId: binding || null,
              },
            ])
          }
        >
          Apply binding
        </Button>
      </section>
      <section>
        <h3>Themes</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (
              run([
                {
                  op: "token_themes_set",
                  themes: [
                    ...doc.tokenThemes,
                    { id: uid(), name: themeName.trim() },
                  ],
                  activeThemeId: doc.activeTokenTheme,
                },
              ])
            )
              setThemeName("");
          }}
        >
          <label>
            Name
            <Input
              aria-label="Theme name"
              value={themeName}
              required
              maxLength={80}
              onChange={(e) => setThemeName(e.target.value)}
            />
          </label>
          <Button type="submit">Add theme</Button>
        </form>
        <label>
          Document theme
          <NativeSelect
            aria-label="Document token theme"
            value={doc.activeTokenTheme ?? ""}
            onChange={(e) =>
              run([
                {
                  op: "token_themes_set",
                  themes: doc.tokenThemes,
                  activeThemeId: e.target.value || null,
                },
              ])
            }
          >
            <option value="">Default</option>
            {doc.tokenThemes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label>
          Selection theme
          <NativeSelect
            aria-label="Selection token theme"
            disabled={!selected.length}
            value={selected[0]?.tokenTheme ?? ""}
            onChange={(e) =>
              run([
                {
                  op: "update",
                  ids: engine.selection,
                  patch: { tokenTheme: e.target.value || null },
                },
              ])
            }
          >
            <option value="">Inherit</option>
            {doc.tokenThemes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <ol className="resource-records">
          {doc.tokenThemes.map((theme, index) => (
            <li key={theme.id}>
              <Input
                key={`${theme.id}-${theme.name}`}
                aria-label={`Rename theme ${theme.name}`}
                defaultValue={theme.name}
                maxLength={80}
                onBlur={(e) => {
                  if (e.target.value !== theme.name)
                    run([
                      {
                        op: "token_themes_set",
                        themes: doc.tokenThemes.map((item) =>
                          item.id === theme.id
                            ? { ...item, name: e.target.value.trim() }
                            : item,
                        ),
                        activeThemeId: doc.activeTokenTheme,
                      },
                    ]);
                }}
              />
              {([-1, 1] as const).map((delta) => (
                <Button
                  key={delta}
                  aria-label={`Move theme ${theme.name} ${delta < 0 ? "earlier" : "later"}`}
                  disabled={
                    index + delta < 0 || index + delta >= doc.tokenThemes.length
                  }
                  onClick={() => {
                    const themes = [...doc.tokenThemes];
                    [themes[index], themes[index + delta]] = [
                      themes[index + delta],
                      themes[index],
                    ];
                    run([
                      {
                        op: "token_themes_set",
                        themes,
                        activeThemeId: doc.activeTokenTheme,
                      },
                    ]);
                  }}
                >
                  {delta < 0 ? "Earlier" : "Later"}
                </Button>
              ))}
              <Button
                aria-label={`Delete theme ${theme.name}`}
                onClick={() =>
                  run([
                    {
                      op: "token_themes_set",
                      themes: doc.tokenThemes.filter(
                        (item) => item.id !== theme.id,
                      ),
                      activeThemeId:
                        doc.activeTokenTheme === theme.id
                          ? null
                          : doc.activeTokenTheme,
                    },
                  ])
                }
              >
                Delete
              </Button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
