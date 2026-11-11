import { z } from "zod";
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
    opacity: z.number().min(0).max(1).default(1),
    radius: z.number().min(0).max(50000).default(0),
    hidden: z.boolean().default(false),
    locked: z.boolean().default(false),
    clip: z.boolean().default(true),
    text: z.string().max(20000).default("Text"),
    fontFamily: z.enum(["Inter"]).default("Inter"),
    fontSize: z.number().min(1).max(2000).default(32),
    fontWeight: z.enum(["400", "600", "700"]).default("400"),
    lineHeight: z.number().min(0.5).max(5).default(1.3),
    letterSpacing: z.number().min(-100).max(500).default(0),
    textAlign: z.enum(["left", "center", "right"]).default("left"),
    path: z
      .string()
      .max(20000)
      .regex(/^[MmLlHhVvCcSsQqTtAaZz\d\s,.+eE-]*$/)
      .default(""),
    assetId: Id.nullable().default(null),
    layout: Layout.default({
      direction: "none",
      gap: 16,
      padding: 24,
      align: "start",
    }),
  })
  .strict();
export type DesignNode = z.infer<typeof NodeSchema>;
export const PageSchema = z
  .object({
    id: Id,
    name: z.string().min(1).max(200),
    background: Paint.default("#202023"),
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
      .max(28_000_000)
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/),
    width: dimension,
    height: dimension,
  })
  .strict();
export type DesignAsset = z.infer<typeof AssetSchema>;
export const DocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: Id,
    revision: z.number().int().min(0),
    name: z.string().min(1).max(200),
    pages: z.array(PageSchema).min(1).max(100),
    nodes: z.array(NodeSchema).max(4000),
    assets: z.array(AssetSchema).max(100),
  })
  .strict();
export type DesignDocument = z.infer<typeof DocumentSchema>;
export type Viewport = { x: number; y: number; zoom: number };
export function blankDocument(name = "Untitled design"): DesignDocument {
  return {
    schemaVersion: 1,
    id: uid(),
    revision: 0,
    name,
    pages: [{ id: uid(), name: "Page 1", background: "#202023" }],
    nodes: [],
    assets: [],
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
            : "#a6a0ff",
    stroke: type === "line" || type === "path" ? "#a6a0ff" : "none",
    ...values,
  });
}
export class DesignError extends Error {
  constructor(
    public code: string,
    message: string,
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
  const d = DocumentSchema.parse(input);
  const ids = new Set<string>();
  for (const item of [...d.pages, ...d.nodes, ...d.assets]) {
    requireThat(!ids.has(item.id), "DUPLICATE_ID", `Duplicate ID: ${item.id}`);
    ids.add(item.id);
  }
  const pageIds = new Set(d.pages.map((p) => p.id));
  const nodes = new Map(d.nodes.map((n) => [n.id, n]));
  const assets = new Map(d.assets.map((a) => [a.id, a]));
  requireThat(
    d.assets.reduce((s, a) => s + a.data.length, 0) < 64_000_000,
    "SIZE_LIMIT",
    "Total embedded assets exceed 48 MB.",
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
  return d;
}
export function descendants(d: DesignDocument, id: string): DesignNode[] {
  const out: DesignNode[] = [];
  const visit = (p: string) => {
    for (const n of d.nodes.filter((n) => n.parentId === p)) {
      out.push(n);
      visit(n.id);
    }
  };
  visit(id);
  return out;
}
export function roots(d: DesignDocument, ids: string[]) {
  const selected = new Set(ids);
  return d.nodes.filter(
    (n) =>
      selected.has(n.id) && !ancestors(d, n).some((p) => selected.has(p.id)),
  );
}
export function ancestors(d: DesignDocument, n: DesignNode): DesignNode[] {
  const out: DesignNode[] = [];
  let p = n.parentId;
  while (p) {
    const node = d.nodes.find((n) => n.id === p);
    if (!node) break;
    out.push(node);
    p = node.parentId;
  }
  return out;
}
