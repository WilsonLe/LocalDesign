import { indexNodes } from "./tree";
import {
  MAX_DOCUMENT_BYTES,
  MAX_PORTABLE_BYTES,
  MAX_NODES,
  MAX_PAGES,
  MAX_ASSETS,
  MAX_ASSET_DATA_CHARS,
  MAX_RASTER_DATA_CHARS,
  MAX_FONT_BYTES,
  FONT_ARCHIVE_RESERVE,
  MAX_GUIDELINES,
  MAX_DECISIONS,
  MAX_REFERENCES,
  MAX_TOKENS,
  MAX_TOKEN_THEMES,
  MAX_COMPONENTS,
  MAX_COMPONENT_PROPERTIES,
  MAX_COMPONENT_VARIANTS,
  MAX_COMPONENT_OVERRIDES,
  MAX_COMPONENT_PROPERTY_OPTIONS,
  MAX_CHECKPOINTS,
  MAX_DOCUMENT_FONTS,
  MAX_REVIEW_THREADS,
  MAX_REVIEW_REPLIES,
  MAX_PROTOTYPE_INTERACTIONS,
  MAX_PACKAGE_SOURCES,
  MAX_HANDOFFS,
} from "./limits";
import {
  DocumentFonts,
  FontFamily,
  FontWeight,
  FontStyle,
} from "../fonts/schema";
import { portableFont, validateFontRecord } from "../fonts/data";
import { z } from "zod";
import { resolveTokens } from "./tokens";
import { resolveComponents } from "./components";
import { validateCheckpoints } from "./checkpoints";
import { validatePrototype } from "./prototype";
import { validatePackageSources } from "./packages";
import { validateHandoffs } from "./approvals";
export const uid = () => crypto.randomUUID();
export const Id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[\w-]+$/);
const dimension = z.number().finite().min(0.1).max(100000);
const coordinate = z.number().finite().min(-1000000).max(1000000);
export const Paint = z
  .string()
  .regex(
    /^(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|none)$/,
  );
export const Layout = z
  .object({
    direction: z.enum(["none", "horizontal", "vertical"]).default("none"),
    gap: z.number().min(0).max(10000).default(16),
    padding: z.number().min(0).max(10000).default(24),
    align: z.enum(["start", "center", "end"]).default("start"),
  })
  .strict();
export const TokenProperty = z.enum([
  "fill",
  "stroke",
  "strokeWidth",
  "opacity",
  "radius",
  "width",
  "height",
  "fontFamily",
  "fontWeight",
  "fontSize",
  "lineHeight",
  "letterSpacing",
  "layout.gap",
  "layout.padding",
]);
export type TokenPropertyName = z.infer<typeof TokenProperty>;
export const ComponentValueSchema = z.union([
  z.string().max(20000),
  z.number().finite(),
  z.boolean(),
]);
export const ComponentBindingSchema = z.union([
  Id,
  z.null(),
  z
    .object({ value: z.union([z.string().max(200), z.number().finite()]) })
    .strict(),
]);
export const ComponentOverrideSchema = z
  .object({
    path: z.array(Id).min(1).max(40),
    // Values are checked against native field schemas and immutable-field rules at resolution.
    patch: z.record(z.string().max(80), z.unknown()),
    bindings: z
      .partialRecord(TokenProperty, ComponentBindingSchema)
      .default({}),
  })
  .strict();
export const ComponentInstanceSchema = z
  .object({
    componentId: Id,
    properties: z.record(Id, ComponentValueSchema).default({}),
    overrides: z
      .array(ComponentOverrideSchema)
      .max(MAX_COMPONENT_OVERRIDES)
      .default([]),
    resolvedRevision: z.number().int().min(0).default(0),
    frozen: z.boolean().default(false),
  })
  .strict();
export const NodeSchema = z
  .object({
    id: Id,
    type: z.enum([
      "frame",
      "group",
      "rectangle",
      "ellipse",
      "line",
      "path",
      "text",
      "image",
    ]),
    name: z.string().max(200),
    pageId: Id,
    parentId: Id.nullable().default(null),
    x: coordinate.default(0),
    y: coordinate.default(0),
    width: dimension.default(160),
    height: dimension.default(100),
    rotation: z.number().finite().min(-36000).max(36000).default(0),
    fill: Paint.default("#d9d9d9"),
    stroke: Paint.default("none"),
    strokeWidth: z.number().min(0).max(1000).default(1),
    strokeLinecap: z.enum(["butt", "round", "square"]).default("butt"),
    strokeLinejoin: z.enum(["miter", "round", "bevel"]).default("miter"),
    opacity: z.number().min(0).max(1).default(1),
    radius: z.number().min(0).max(50000).default(0),
    hidden: z.boolean().default(false),
    locked: z.boolean().default(false),
    clip: z.boolean().default(true),
    text: z.string().max(20000).default("Text"),
    fontFamily: FontFamily.default("Inter"),
    fontId: Id.nullable().default(null),
    fontStyle: FontStyle.default("normal"),
    fontSize: z.number().min(1).max(2000).default(32),
    fontWeight: FontWeight.default("400"),
    lineHeight: z.number().min(0.5).max(5).default(1.3),
    letterSpacing: z.number().min(-100).max(500).default(0),
    textAlign: z.enum(["left", "center", "right"]).default("left"),
    path: z
      .string()
      .max(20000)
      .regex(/^[MmLlHhVvCcSsQqTtAaZz\d\s,.+eE-]*$/)
      .default(""),
    pathViewBox: z
      .object({ width: dimension, height: dimension })
      .strict()
      .nullable()
      .default(null),
    attribution: z.string().max(8000).default(""),
    component: ComponentInstanceSchema.nullable().default(null),
    componentPart: z
      .object({ instanceId: Id, path: z.array(Id).min(1).max(40) })
      .strict()
      .nullable()
      .default(null),
    componentSource: z
      .object({
        componentId: Id,
        partId: Id,
        revision: z.number().int().min(1),
      })
      .strict()
      .nullable()
      .default(null),
    assetId: Id.nullable().default(null),
    layout: Layout.default({
      direction: "none",
      gap: 16,
      padding: 24,
      align: "start",
    }),
    bindings: z.partialRecord(TokenProperty, Id).default({}),
    tokenTheme: Id.nullable().default(null),
  })
  .strict();
export type DesignNode = z.infer<typeof NodeSchema>;
export const ComponentField = z.enum([
  ...TokenProperty.options,
  "text",
  "fontStyle",
  "hidden",
  "locked",
  "path",
  "strokeLinecap",
  "strokeLinejoin",
  "x",
  "y",
  "rotation",
  "clip",
]);
export const ComponentPropertySchema = z
  .object({
    name: Id,
    type: z.enum(["text", "boolean", "number", "color", "enum"]),
    defaultValue: ComponentValueSchema,
    options: z
      .array(z.string().min(1).max(200))
      .max(MAX_COMPONENT_PROPERTY_OPTIONS)
      .default([]),
    bindings: z
      .array(z.object({ partId: Id, field: ComponentField }).strict())
      .max(MAX_COMPONENT_OVERRIDES)
      .default([]),
  })
  .strict();
export const ComponentVariantSchema = z
  .object({
    id: Id,
    name: z.string().min(1).max(200),
    when: z.record(Id, ComponentValueSchema),
    overrides: z
      .array(
        z
          .object({
            partId: Id,
            patch: z.record(z.string().max(80), z.unknown()),
            bindings: z
              .partialRecord(TokenProperty, ComponentBindingSchema)
              .default({}),
          })
          .strict(),
      )
      .max(MAX_COMPONENT_OVERRIDES),
  })
  .strict();
export const ComponentSchema = z
  .object({
    id: Id,
    name: z.string().trim().min(1).max(200),
    description: z.string().max(1000).default(""),
    revision: z.number().int().min(1).default(1),
    deleted: z.boolean().default(false),
    rootId: Id,
    nodes: z.array(NodeSchema).min(1).max(MAX_NODES),
    properties: z
      .array(ComponentPropertySchema)
      .max(MAX_COMPONENT_PROPERTIES)
      .default([]),
    variants: z
      .array(ComponentVariantSchema)
      .max(MAX_COMPONENT_VARIANTS)
      .default([]),
  })
  .strict();
export type ComponentDefinition = z.infer<typeof ComponentSchema>;
export type ComponentInstance = z.infer<typeof ComponentInstanceSchema>;
export type ComponentValue = z.infer<typeof ComponentValueSchema>;
export const PageSchema = z
  .object({
    id: Id,
    name: z.string().min(1).max(200),
    background: Paint.default("#202020"),
  })
  .strict();
export type DesignPage = z.infer<typeof PageSchema>;
export const AssetSchema = z
  .object({
    id: Id,
    name: z.string().max(200),
    mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
    data: z
      .string()
      .max(MAX_RASTER_DATA_CHARS)
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/),
    width: dimension,
    height: dimension,
  })
  .strict();
export type DesignAsset = z.infer<typeof AssetSchema>;
export const GuidelineSchema = z
  .object({
    id: Id,
    name: z.string().trim().min(1).max(200),
    content: z.string().min(1).max(24000),
  })
  .strict();
export const DecisionSchema = z
  .object({
    id: Id,
    decision: z.string().min(1).max(500),
    rationale: z.string().min(1).max(1000),
    author: z.string().min(1).max(80),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const ReferenceSchema = z
  .object({
    id: Id,
    title: z.string().min(1).max(200),
    assetId: Id,
    provenance: z.string().min(1).max(1000),
    sourceDocumentId: Id.optional(),
    sourceRevision: z.number().int().min(0).optional(),
  })
  .strict();
export const TokenValueSchema = z.union([
  z.string().max(200),
  z.number().finite(),
  z.object({ tokenId: Id }).strict(),
]);
export const TokenSchema = z
  .object({
    id: Id,
    name: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[A-Za-z][\w-]*$/),
    type: z.enum([
      "color",
      "spacing",
      "radius",
      "opacity",
      "dimension",
      "fontFamily",
      "fontWeight",
      "fontSize",
      "lineHeight",
      "letterSpacing",
    ]),
    value: TokenValueSchema,
    themes: z.record(Id, TokenValueSchema).default({}),
    description: z.string().max(500).default(""),
  })
  .strict();
export const TokenThemeSchema = z
  .object({ id: Id, name: z.string().min(1).max(80) })
  .strict();
export const CheckpointPayloadSchema = z
  .object({
    rootId: Id,
    nodes: z.array(NodeSchema).max(MAX_NODES),
    components: z.array(ComponentSchema).max(MAX_COMPONENTS),
    tokens: z.array(TokenSchema).max(MAX_TOKENS),
    tokenThemes: z.array(TokenThemeSchema).max(MAX_TOKEN_THEMES),
    activeTokenTheme: Id.nullable(),
    assetIds: z.array(Id).max(MAX_ASSETS),
    fontIds: z.array(Id).max(MAX_DOCUMENT_FONTS),
    resourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const CheckpointSchema = z
  .object({
    id: Id,
    kind: z.enum(["frame", "component"]),
    targetId: Id,
    label: z.string().trim().min(1).max(200),
    author: z.string().trim().min(1).max(100),
    createdAt: z.number().int().min(0),
    sourceRevision: z.number().int().min(0),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    payload: CheckpointPayloadSchema,
  })
  .strict();
export type Checkpoint = z.infer<typeof CheckpointSchema>;
export const ReviewMessageSchema = z
  .object({
    id: Id,
    author: z.string().trim().min(1).max(100),
    body: z.string().trim().min(1).max(4000),
    createdAt: z.number().int().min(0),
  })
  .strict();
export const ReviewAnchorSchema = z
  .object({
    pageId: Id,
    nodeId: Id.nullable().default(null),
    x: coordinate,
    y: coordinate,
    pageName: z.string().max(200).default(""),
    nodeName: z.string().max(200).default(""),
    lastX: coordinate.default(0),
    lastY: coordinate.default(0),
  })
  .strict();
export const ReviewThreadSchema = z
  .object({
    id: Id,
    anchor: ReviewAnchorSchema,
    message: ReviewMessageSchema,
    replies: z.array(ReviewMessageSchema).max(MAX_REVIEW_REPLIES).default([]),
    resolved: z.boolean().default(false),
  })
  .strict();
export type ReviewThread = z.infer<typeof ReviewThreadSchema>;
export const PrototypeInteractionSchema = z
  .object({
    id: Id,
    sourceId: Id,
    sourceName: z.string().max(200).default(""),
    action: z.enum(["navigate", "back", "overlay", "close_overlay"]),
    targetFrameId: Id.nullable().default(null),
    targetName: z.string().max(200).default(""),
    position: z
      .enum(["center", "top-left", "top-right", "bottom-left", "bottom-right"])
      .default("center"),
  })
  .strict();
export const PrototypeSchema = z
  .object({
    entryFrameId: Id.nullable().default(null),
    interactions: z
      .array(PrototypeInteractionSchema)
      .max(MAX_PROTOTYPE_INTERACTIONS)
      .default([]),
  })
  .strict();
export const LibraryPayloadSchema = z
  .object({
    nodes: z.array(NodeSchema).max(MAX_NODES).default([]),
    components: z.array(ComponentSchema).max(MAX_COMPONENTS),
    tokens: z.array(TokenSchema).max(MAX_TOKENS),
    tokenThemes: z.array(TokenThemeSchema).max(MAX_TOKEN_THEMES),
    activeTokenTheme: Id.nullable(),
    assets: z.array(AssetSchema).max(MAX_ASSETS),
    fonts: DocumentFonts,
  })
  .strict();
export type LibraryPayload = z.infer<typeof LibraryPayloadSchema>;
export const PackageSourceSchema = z
  .object({
    originId: Id,
    version: z.number().int().min(1),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    componentMap: z.record(Id, Id),
    tokenMap: z.record(Id, Id),
    themeMap: z.record(Id, Id),
    assetMap: z.record(Id, Id),
    fontMap: z.record(Id, Id),
    baselines: z.record(Id, z.string().regex(/^[a-f0-9]{64}$/)),
  })
  .strict();
export const HandoffApprovalSchema = z
  .object({
    historical: z.boolean().default(false),
    grantId: Id,
    documentId: Id,
    reviewer: z.string().trim().min(1).max(100),
    note: z.string().max(4000),
    approvedAt: z.number().int().min(0),
    contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
    checkpointId: Id,
    checkpointDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const HandoffSchema = z
  .object({
    id: Id,
    frameId: Id,
    frameName: z.string().max(200),
    requestedBy: z.string().trim().min(1).max(100),
    note: z.string().max(4000),
    createdAt: z.number().int().min(0),
    sourceRevision: z.number().int().min(0),
    approval: HandoffApprovalSchema.nullable().default(null),
  })
  .strict();
export type Handoff = z.infer<typeof HandoffSchema>;
export const DocumentSchema = z
  .object({
    schemaVersion: z.literal(3),
    id: Id,
    revision: z.number().int().min(0),
    name: z.string().min(1).max(200),
    pages: z.array(PageSchema).min(1).max(MAX_PAGES),
    nodes: z.array(NodeSchema).max(MAX_NODES),
    assets: z.array(AssetSchema).max(MAX_ASSETS),
    fonts: DocumentFonts,
    guidelines: z.array(GuidelineSchema).max(MAX_GUIDELINES).default([]),
    decisions: z.array(DecisionSchema).max(MAX_DECISIONS).default([]),
    references: z.array(ReferenceSchema).max(MAX_REFERENCES).default([]),
    tokens: z.array(TokenSchema).max(MAX_TOKENS).default([]),
    tokenThemes: z.array(TokenThemeSchema).max(MAX_TOKEN_THEMES).default([]),
    activeTokenTheme: Id.nullable().default(null),
    components: z.array(ComponentSchema).max(MAX_COMPONENTS).default([]),
    packageSources: z
      .array(PackageSourceSchema)
      .max(MAX_PACKAGE_SOURCES)
      .default([]),
    handoffs: z.array(HandoffSchema).max(MAX_HANDOFFS).default([]),
    checkpoints: z.array(CheckpointSchema).max(MAX_CHECKPOINTS).default([]),
    reviewThreads: z
      .array(ReviewThreadSchema)
      .max(MAX_REVIEW_THREADS)
      .default([]),
    prototype: PrototypeSchema.default({
      entryFrameId: null,
      interactions: [],
    }),
  })
  .strict();
export type DesignDocument = z.infer<typeof DocumentSchema>;
const nodeWireDefaults = NodeSchema.parse({
  id: "_",
  type: "rectangle",
  name: "_",
  pageId: "_",
});
const requiredNodeFields = new Set(["id", "type", "name", "pageId"]);
/** Schema-v3 wire defaults are fixed: omit only exact defaults, never sparse override intent. */
export function compactNativeNode(node: DesignNode) {
  return Object.fromEntries(
    Object.entries(node).filter(([key, value]) => {
      if (requiredNodeFields.has(key)) return true;
      const fallback = nodeWireDefaults[key as keyof DesignNode];
      if (value === fallback) return false;
      if (
        value &&
        fallback &&
        typeof value === "object" &&
        typeof fallback === "object"
      ) {
        const a = value as Record<string, unknown>,
          b = fallback as Record<string, unknown>;
        return (
          Object.keys(a).length !== Object.keys(b).length ||
          Object.keys(a).some((field) => a[field] !== b[field])
        );
      }
      return true;
    }),
  );
}
export function nativeDocumentData(doc: DesignDocument) {
  const roots = new Map(
    doc.nodes.filter((node) => node.component).map((node) => [node.id, node]),
  );
  return {
    ...doc,
    nodes: doc.nodes
      .filter(
        (node) =>
          !node.componentPart ||
          roots.get(node.componentPart.instanceId)?.component?.frozen !== false,
      )
      .map(compactNativeNode),
    components: doc.components.map((component) => ({
      ...component,
      nodes: component.nodes.map(compactNativeNode),
    })),
    checkpoints: doc.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      payload: {
        ...checkpoint.payload,
        nodes: checkpoint.payload.nodes.map(compactNativeNode),
        components: checkpoint.payload.components.map((component) => ({
          ...component,
          nodes: component.nodes.map(compactNativeNode),
        })),
      },
    })),
  };
}
export type Viewport = { x: number; y: number; zoom: number };
export function blankDocument(name = "Untitled design"): DesignDocument {
  return {
    schemaVersion: 3,
    id: uid(),
    revision: 0,
    name,
    pages: [{ id: uid(), name: "Page 1", background: "#202020" }],
    nodes: [],
    assets: [],
    fonts: [],
    guidelines: [],
    decisions: [],
    references: [],
    tokens: [],
    tokenThemes: [],
    activeTokenTheme: null,
    components: [],
    checkpoints: [],
    reviewThreads: [],
    prototype: { entryFrameId: null, interactions: [] },
    packageSources: [],
    handoffs: [],
  };
}
export function makeNode(
  type: DesignNode["type"],
  pageId: string,
  values: Partial<DesignNode> = {},
): DesignNode {
  return NodeSchema.parse({
    id: uid(),
    name: type[0].toUpperCase() + type.slice(1),
    type,
    pageId,
    fill:
      type === "text"
        ? "#f5f5f5"
        : type === "frame"
          ? "#ffffff"
          : type === "line" || type === "path"
            ? "none"
            : "#c4c4c4",
    stroke: type === "line" || type === "path" ? "#c4c4c4" : "none",
    ...values,
  });
}
export class DesignError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export function requireThat(
  condition: unknown,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new DesignError(code, message);
}
export function validateDocument(input: unknown): DesignDocument {
  const raw = input as { schemaVersion?: number } | null;
  const d = DocumentSchema.parse(
    raw && [1, 2].includes(raw.schemaVersion ?? 0)
      ? { ...raw, schemaVersion: 3 }
      : input,
  );
  resolveComponents(d);
  const ids = new Set<string>();
  for (const item of [
    ...d.pages,
    ...d.nodes,
    ...d.assets,
    ...d.fonts,
    ...d.guidelines,
    ...d.decisions,
    ...d.references,
    ...d.tokens,
    ...d.tokenThemes,
    ...d.components,
    ...d.checkpoints,
    ...d.reviewThreads,
    ...d.prototype.interactions,
    ...d.handoffs,
  ]) {
    requireThat(!ids.has(item.id), "DUPLICATE_ID", `Duplicate ID: ${item.id}`);
    ids.add(item.id);
  }
  const pageIds = new Set(d.pages.map((p) => p.id));
  const nodes = new Map(d.nodes.map((n) => [n.id, n]));
  const assets = new Map(d.assets.map((a) => [a.id, a]));
  requireThat(
    new Set(d.guidelines.map((g) => g.name.toLocaleLowerCase())).size ===
      d.guidelines.length,
    "DUPLICATE_GUIDELINE",
    "Guideline names must be unique.",
  );
  for (const reference of d.references)
    requireThat(
      assets.has(reference.assetId),
      "MISSING_ASSET",
      `Missing reference image: ${reference.title}`,
    );
  let fontBytes = 0;
  let bundledBytes = 0;
  for (const font of d.fonts) {
    const size = font.files.reduce(
      (sum, f) =>
        sum +
        Math.floor((f.data.length * 3) / 4) -
        (f.data.endsWith("==") ? 2 : f.data.endsWith("=") ? 1 : 0),
      0,
    );
    if (font.source === "bundled") bundledBytes += size;
    else fontBytes += size;
  }
  requireThat(
    fontBytes <= MAX_FONT_BYTES &&
      d.fonts.filter((f) => f.source === "local").length <= 48 &&
      bundledBytes +
        new TextEncoder().encode(
          JSON.stringify(
            d.fonts.filter((f) => f.source === "bundled").map(portableFont),
          ),
        ).length <=
        FONT_ARCHIVE_RESERVE &&
      d.fonts.filter((f) => f.source === "bundled").length <= 18,
    "FONT_LIMIT",
    "Document fonts exceed 48 local faces / 12 MB or the 1 MB bundled-font reserve. Use smaller static font files.",
  );
  d.fonts.forEach(validateFontRecord);
  requireThat(
    d.assets.reduce((s, a) => s + a.data.length, 0) <= MAX_ASSET_DATA_CHARS,
    "SIZE_LIMIT",
    "Embedded assets exceed the portable content budget.",
  );
  for (const a of d.assets)
    requireThat(
      a.data.startsWith(`data:${a.mime};base64,`),
      "ASSET_MIME",
      "Asset MIME does not match its data.",
    );
  for (const n of d.nodes) {
    requireThat(
      pageIds.has(n.pageId),
      "MISSING_PAGE",
      `Missing page for ${n.id}`,
    );
    if (n.type === "image")
      requireThat(
        n.assetId && assets.has(n.assetId),
        "MISSING_ASSET",
        `Missing image asset for ${n.id}`,
      );
    let p = n;
    const seen = new Set([n.id]);
    let depth = 0;
    while (p.parentId) {
      const parent = nodes.get(p.parentId);
      requireThat(
        parent &&
          ["frame", "group"].includes(parent.type) &&
          parent.pageId === n.pageId,
        "INVALID_PARENT",
        `Invalid parent for ${n.id}`,
      );
      requireThat(
        !seen.has(parent.id) && ++depth <= 40,
        "INVALID_HIERARCHY",
        "Hierarchy is cyclic or deeper than 40 levels.",
      );
      seen.add(parent.id);
      p = parent;
    }
  }
  resolveTokens(d);
  validatePrototype(d);
  validatePackageSources(d);
  validateHandoffs(d);
  for (const thread of d.reviewThreads)
    requireThat(
      new Set([thread.message.id, ...thread.replies.map((reply) => reply.id)])
        .size ===
        thread.replies.length + 1,
      "REVIEW_ID",
      "Reply IDs must be unique in their thread.",
    );
  validateCheckpoints(d);
  const portable = {
    ...d,
    assets: d.assets.map((a) => ({
      ...a,
      data: `assets/${a.id}.${a.mime.split("/")[1]}`,
    })),
    fonts: d.fonts.filter((f) => f.source !== "bundled").map(portableFont),
  };
  // Count resolved parts too: repeated definitions must not evade the editable
  // metadata ceiling just because their live cache is omitted from the archive.
  const encoder = new TextEncoder();
  const wire = nativeDocumentData({ ...portable, nodes: [] });
  let documentBytes = encoder.encode(JSON.stringify(wire)).length;
  for (const node of d.nodes) {
    documentBytes +=
      encoder.encode(JSON.stringify(compactNativeNode(node))).length + 1;
    requireThat(
      documentBytes <= MAX_DOCUMENT_BYTES,
      "SIZE_LIMIT",
      "Resolved design metadata exceeds the 64 MB editable-file limit.",
    );
  }
  const assetBytes = d.assets.reduce((sum, a) => {
    const data = a.data.split(",")[1];
    return (
      sum +
      Math.floor((data.length * 3) / 4) -
      (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0)
    );
  }, 0);
  requireThat(
    documentBytes <= MAX_DOCUMENT_BYTES,
    "SIZE_LIMIT",
    `Design metadata exceeds the ${MAX_DOCUMENT_BYTES / 1_000_000} MB editable-file limit.`,
  );
  requireThat(
    documentBytes + assetBytes + fontBytes <= MAX_PORTABLE_BYTES,
    "SIZE_LIMIT",
    `Design content exceeds the ${MAX_PORTABLE_BYTES / 1_000_000} MB portable-file budget. Use smaller images/fonts or separate documents.`,
  );
  return d;
}
export function descendants(
  d: DesignDocument,
  id: string,
  index = indexNodes(d),
): DesignNode[] {
  const out: DesignNode[] = [];
  const { children } = index;
  const visit = (p: string) => {
    for (const n of children.get(p) ?? []) {
      out.push(n);
      visit(n.id);
    }
  };
  visit(id);
  return out;
}
export function roots(
  d: DesignDocument,
  ids: string[],
  byId?: ReadonlyMap<string, DesignNode>,
) {
  if (!ids.length) return [];
  const selected = new Set(ids);
  const lookup = byId ?? indexNodes(d).byId;
  return d.nodes.filter(
    (n) =>
      selected.has(n.id) &&
      !ancestors(d, n, lookup).some((p) => selected.has(p.id)),
  );
}
export function ancestors(
  d: DesignDocument,
  n: DesignNode,
  byId?: ReadonlyMap<string, DesignNode>,
): DesignNode[] {
  const out: DesignNode[] = [];
  let p = n.parentId;
  while (p) {
    const node = byId ? byId.get(p) : d.nodes.find((n) => n.id === p);
    if (!node) break;
    out.push(node);
    p = node.parentId;
  }
  return out;
}

export function assertNotAborted(signal?: AbortSignal) {
  requireThat(
    !signal?.aborted,
    "DISPOSED",
    "The operation was cancelled or its page tools retired. Discover the current tools again.",
  );
}
