import { z } from "zod";
import {
  AssetSchema,
  Id,
  NodeSchema,
  PageSchema,
  GuidelineSchema,
  DecisionSchema,
  ReferenceSchema,
  TokenSchema,
  TokenThemeSchema,
  TokenProperty,
} from "./model";
import { MAX_PAGES, MAX_TOKEN_THEMES } from "./limits";
import { FontSchema } from "../fonts/schema";
import { MAX_NODES } from "./limits";
const ids = z.array(Id).min(1).max(MAX_NODES);
// Remove creation defaults before making patches optional; Zod applies defaults inside optional fields.
const Patch = z
  .object({
    name: NodeSchema.shape.name.optional(),
    x: NodeSchema.shape.x.removeDefault().optional(),
    y: NodeSchema.shape.y.removeDefault().optional(),
    width: NodeSchema.shape.width.removeDefault().optional(),
    height: NodeSchema.shape.height.removeDefault().optional(),
    rotation: NodeSchema.shape.rotation.removeDefault().optional(),
    fill: NodeSchema.shape.fill.removeDefault().optional(),
    stroke: NodeSchema.shape.stroke.removeDefault().optional(),
    strokeWidth: NodeSchema.shape.strokeWidth.removeDefault().optional(),
    opacity: NodeSchema.shape.opacity.removeDefault().optional(),
    radius: NodeSchema.shape.radius.removeDefault().optional(),
    hidden: NodeSchema.shape.hidden.removeDefault().optional(),
    locked: NodeSchema.shape.locked.removeDefault().optional(),
    clip: NodeSchema.shape.clip.removeDefault().optional(),
    text: NodeSchema.shape.text.removeDefault().optional(),
    fontFamily: NodeSchema.shape.fontFamily.removeDefault().optional(),
    fontId: NodeSchema.shape.fontId.removeDefault().optional(),
    fontStyle: NodeSchema.shape.fontStyle.removeDefault().optional(),
    fontSize: NodeSchema.shape.fontSize.removeDefault().optional(),
    fontWeight: NodeSchema.shape.fontWeight.removeDefault().optional(),
    lineHeight: NodeSchema.shape.lineHeight.removeDefault().optional(),
    letterSpacing: NodeSchema.shape.letterSpacing.removeDefault().optional(),
    textAlign: NodeSchema.shape.textAlign.removeDefault().optional(),
    path: NodeSchema.shape.path.removeDefault().optional(),
    assetId: NodeSchema.shape.assetId.removeDefault().optional(),
    layout: NodeSchema.shape.layout.removeDefault().optional(),
    tokenTheme: NodeSchema.shape.tokenTheme.removeDefault().optional(),
  })
  .strict();
export const CommandSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("token_set"), token: TokenSchema }).strict(),
  z
    .object({
      op: z.literal("token_delete"),
      id: Id,
      detach: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      op: z.literal("token_bind"),
      ids,
      property: TokenProperty,
      tokenId: Id.nullable(),
    })
    .strict(),
  z
    .object({
      op: z.literal("token_themes_set"),
      themes: z.array(TokenThemeSchema).max(MAX_TOKEN_THEMES),
      activeThemeId: Id.nullable(),
    })
    .strict(),
  z
    .object({ op: z.literal("guideline_set"), guideline: GuidelineSchema })
    .strict(),
  z.object({ op: z.literal("guideline_delete"), id: Id }).strict(),
  z
    .object({ op: z.literal("decision_add"), decision: DecisionSchema })
    .strict(),
  z.object({ op: z.literal("decision_delete"), id: Id }).strict(),
  z
    .object({ op: z.literal("reference_set"), reference: ReferenceSchema })
    .strict(),
  z.object({ op: z.literal("reference_delete"), id: Id }).strict(),
  z
    .object({
      op: z.literal("pages_reorder"),
      pageIds: z.array(Id).min(1).max(MAX_PAGES),
    })
    .strict(),
  z.object({ op: z.literal("move_to_page"), ids, pageId: Id }).strict(),
  z.object({ op: z.literal("create"), node: NodeSchema }).strict(),
  z.object({ op: z.literal("update"), ids, patch: Patch }).strict(),
  z.object({ op: z.literal("delete"), ids }).strict(),
  z
    .object({
      op: z.literal("duplicate"),
      ids,
      dx: z.number().finite().min(-100000).max(100000).default(24),
      dy: z.number().finite().min(-100000).max(100000).default(24),
    })
    .strict(),
  z
    .object({ op: z.literal("reparent"), ids, parentId: Id.nullable() })
    .strict(),
  z.object({ op: z.literal("group"), ids, id: Id }).strict(),
  z.object({ op: z.literal("ungroup"), ids }).strict(),
  z
    .object({
      op: z.literal("order"),
      ids,
      direction: z.enum(["front", "back", "forward", "backward"]),
    })
    .strict(),
  z
    .object({
      op: z.literal("align"),
      ids,
      axis: z.enum(["left", "center", "right", "top", "middle", "bottom"]),
    })
    .strict(),
  z
    .object({
      op: z.literal("distribute"),
      ids,
      axis: z.enum(["horizontal", "vertical"]),
    })
    .strict(),
  z.object({ op: z.literal("page_create"), page: PageSchema }).strict(),
  z
    .object({
      op: z.literal("page_update"),
      id: Id,
      patch: z
        .object({
          name: PageSchema.shape.name.optional(),
          background: PageSchema.shape.background.removeDefault().optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ op: z.literal("page_delete"), id: Id }).strict(),
  z.object({ op: z.literal("asset_add"), asset: AssetSchema }).strict(),
  z.object({ op: z.literal("font_add"), font: FontSchema }).strict(),
  z
    .object({ op: z.literal("rename"), name: z.string().min(1).max(200) })
    .strict(),
]);
export const GuardSchema = z
  .object({
    expectedDocumentId: Id,
    expectedRevision: z.number().int().min(0),
    requestId: Id,
  })
  .strict();
export const EditSchema = GuardSchema.extend({
  commands: z.array(CommandSchema).min(1).max(500),
}).strict();
export type Command = z.infer<typeof CommandSchema>;
export type EditRequest = z.infer<typeof EditSchema>;
export type Guard = z.infer<typeof GuardSchema>;
