import { indexNodes } from "./tree";
import { detachToken, resolveTokens } from "./tokens";
import {
  CommandSchema,
  EditSchema,
  GuardSchema,
  type Command,
  type EditRequest,
  type Guard,
} from "./commands";
import {
  ancestors,
  blankDocument,
  descendants,
  DesignError,
  makeNode,
  requireThat,
  roots,
  uid,
  validateDocument,
  type DesignDocument,
  type DesignNode,
  type Viewport,
} from "./model";
import {
  applyLayouts,
  bounds,
  localPoint,
  worldPoint,
  worldRotation,
} from "./geometry";
export type Receipt = {
  documentId: string;
  revision: number;
  requestId: string;
  createdIds: string[];
  warnings: string[];
};
export type Snapshot = {
  document: DesignDocument;
  pageId: string;
  selection: string[];
  viewport: Viewport;
  canUndo: boolean;
  canRedo: boolean;
  version: number;
};
export class DesignEngine {
  private doc: DesignDocument;
  private undoStack: DesignDocument[] = [];
  private redoStack: DesignDocument[] = [];
  private receipts = new Map<string, { payload: string; receipt: Receipt }>();
  private listeners = new Set<() => void>();
  private version = 0;
  pageId: string;
  selection: string[] = [];
  viewport: Viewport = { x: 100, y: 100, zoom: 1 };
  private snapshot: Snapshot;
  constructor(d = blankDocument()) {
    this.doc = validateDocument(d);
    this.pageId = d.pages[0].id;
    this.snapshot = this.buildSnapshot();
  }
  private buildSnapshot(): Snapshot {
    return {
      document: this.doc,
      pageId: this.pageId,
      selection: this.selection,
      viewport: this.viewport,
      canUndo: !!this.undoStack.length,
      canRedo: !!this.redoStack.length,
      version: this.version,
    };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private emit() {
    this.version++;
    this.snapshot = this.buildSnapshot();
    for (const fn of this.listeners) fn();
  }
  get document() {
    return this.doc;
  }
  guard(): Guard {
    return {
      expectedDocumentId: this.doc.id,
      expectedRevision: this.doc.revision,
      requestId: uid(),
    };
  }
  replace(d: DesignDocument) {
    this.doc = validateDocument(d);
    this.undoStack = [];
    this.redoStack = [];
    this.receipts.clear();
    this.pageId = d.pages[0].id;
    this.selection = [];
    this.viewport = { x: 100, y: 100, zoom: 1 };
    this.emit();
  }
  select(ids: string[], pageId = this.pageId) {
    requireThat(
      this.doc.pages.some((p) => p.id === pageId),
      "MISSING_PAGE",
      "Unknown page.",
    );
    const { byId } = indexNodes(this.doc);
    requireThat(
      ids.every((id) => byId.get(id)?.pageId === pageId),
      "MISSING_NODE",
      "Selection contains unknown nodes or nodes on another page.",
    );
    this.pageId = pageId;
    this.selection = [...new Set(ids)];
    this.emit();
  }
  setViewport(v: Partial<Viewport>) {
    const next = { ...this.viewport, ...v };
    requireThat(
      Number.isFinite(next.x) &&
        Number.isFinite(next.y) &&
        Number.isFinite(next.zoom) &&
        next.zoom >= 0.05 &&
        next.zoom <= 8,
      "INVALID_VIEWPORT",
      "Zoom must be between 0.05 and 8; coordinates must be finite.",
    );
    this.viewport = next;
    this.emit();
  }
  private check(g: Guard, payload: string) {
    const old = this.receipts.get(g.requestId);
    if (old) {
      requireThat(
        old.payload === payload,
        "REQUEST_ID_REUSED",
        "Request ID was already used with another payload.",
      );
      return old.receipt;
    }
    requireThat(
      g.expectedDocumentId === this.doc.id,
      "DOCUMENT_MISMATCH",
      "The active document changed; inspect again.",
    );
    requireThat(
      g.expectedRevision === this.doc.revision,
      "STALE_REVISION",
      `Expected revision ${g.expectedRevision}; current revision is ${this.doc.revision}. Inspect and retry with a new requestId.`,
    );
  }
  private remember(
    g: Guard,
    payload: string,
    createdIds: string[] = [],
  ): Receipt {
    const receipt = {
      documentId: this.doc.id,
      revision: this.doc.revision,
      requestId: g.requestId,
      createdIds,
      warnings: [],
    };
    this.receipts.set(g.requestId, { payload, receipt });
    if (this.receipts.size > 256)
      this.receipts.delete(this.receipts.keys().next().value!);
    return receipt;
  }
  edit(request: EditRequest, dryRun = false): Receipt {
    const r = EditSchema.parse(request),
      payload = JSON.stringify(r);
    const prior = this.check(r, payload);
    if (prior) return prior;
    const next = structuredClone(this.doc);
    const created: string[] = [];
    // Transaction-owned references: refresh at the boundary, maintain structural edits below.
    const byId = new Map(next.nodes.map((n) => [n.id, n]));
    for (const c of r.commands) this.apply(next, c, created, byId);
    resolveTokens(next);
    applyLayouts(next);
    validateDocument(next);
    if (dryRun)
      return {
        documentId: this.doc.id,
        revision: this.doc.revision,
        requestId: r.requestId,
        createdIds: created,
        warnings: [],
      };
    this.undoStack.push(this.doc);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    next.revision = this.doc.revision + 1;
    this.doc = next;
    this.reconcile();
    const receipt = this.remember(r, payload, created);
    this.emit();
    return receipt;
  }
  dispatch(commands: Command[]) {
    return this.edit({ ...this.guard(), commands });
  }
  history(action: "undo" | "redo", guard: Guard) {
    const g = GuardSchema.parse(guard),
      payload = JSON.stringify({ action, ...g });
    const prior = this.check(g, payload);
    if (prior) return prior;
    const source = action === "undo" ? this.undoStack : this.redoStack,
      dest = action === "undo" ? this.redoStack : this.undoStack;
    requireThat(source.length, "EMPTY_HISTORY", `Nothing to ${action}.`);
    const next = structuredClone(source.pop()!);
    dest.push(this.doc);
    next.revision = this.doc.revision + 1;
    this.doc = next;
    this.reconcile();
    const receipt = this.remember(g, payload);
    this.emit();
    return receipt;
  }
  private reconcile() {
    if (!this.doc.pages.some((p) => p.id === this.pageId))
      this.pageId = this.doc.pages[0].id;
    const { byId } = indexNodes(this.doc);
    this.selection = this.selection.filter(
      (id) => byId.get(id)?.pageId === this.pageId,
    );
  }
  private apply(
    d: DesignDocument,
    raw: Command,
    created: string[],
    byId: Map<string, DesignNode>,
  ) {
    const c = CommandSchema.parse(raw);
    const get = (id: string) => {
      const n = byId.get(id);
      requireThat(n, "MISSING_NODE", `Unknown node: ${id}`);
      return n;
    };
    const selected = "ids" in c ? roots(d, c.ids, byId) : [];
    if ("ids" in c) {
      c.ids.forEach(get);
      requireThat(
        c.ids
          .map(get)
          .every(
            (n) => !n.locked && !ancestors(d, n, byId).some((p) => p.locked),
          ) ||
          (c.op === "update" &&
            Object.keys(c.patch).every((k) => k === "locked")),
        "LOCKED_NODE",
        "Unlock the selected layer or its parent first.",
      );
    }
    const moveParent = (n: DesignNode, parentId: string | null) => {
      const p = parentId ? get(parentId) : undefined;
      requireThat(
        !p ||
          (["group", "frame"].includes(p.type) &&
            !p.locked &&
            !ancestors(d, p, byId).some((n) => n.locked)),
        "INVALID_PARENT",
        "Destination must be an unlocked frame/group.",
      );
      requireThat(
        !p ||
          (p.id !== n.id && !descendants(d, n.id).some((x) => x.id === p.id)),
        "INVALID_PARENT",
        "Cannot move a node inside itself.",
      );
      const point = worldPoint(d, n),
        rotation = worldRotation(d, n);
      const pos = localPoint(d, p, point);
      n.x = pos.x;
      n.y = pos.y;
      n.rotation = rotation - (p ? worldRotation(d, p) : 0);
      n.parentId = parentId;
      if (p) {
        n.pageId = p.pageId;
        for (const child of descendants(d, n.id)) child.pageId = p.pageId;
      }
    };
    switch (c.op) {
      case "token_set": {
        const index = d.tokens.findIndex((token) => token.id === c.token.id);
        if (index < 0) {
          d.tokens.push(structuredClone(c.token));
          created.push(c.token.id);
        } else d.tokens[index] = structuredClone(c.token);
        break;
      }
      case "token_delete":
        detachToken(d, c.id, c.detach);
        break;
      case "token_bind":
        for (const id of c.ids) {
          const node = get(id);
          if (c.tokenId === null) delete node.bindings[c.property];
          else {
            node.bindings[c.property] = c.tokenId;
            if (c.property === "fontFamily" || c.property === "fontWeight")
              node.fontId = null;
          }
        }
        break;
      case "token_themes_set": {
        d.tokenThemes = structuredClone(c.themes);
        d.activeTokenTheme = c.activeThemeId;
        const allowed = new Set(c.themes.map((theme) => theme.id));
        for (const node of d.nodes)
          if (node.tokenTheme && !allowed.has(node.tokenTheme))
            node.tokenTheme = null;
        for (const token of d.tokens)
          token.themes = Object.fromEntries(
            Object.entries(token.themes).filter(([id]) => allowed.has(id)),
          );
        break;
      }
      case "guideline_set": {
        const index = d.guidelines.findIndex((g) => g.id === c.guideline.id);
        if (index < 0) {
          d.guidelines.push(structuredClone(c.guideline));
          created.push(c.guideline.id);
        } else d.guidelines[index] = structuredClone(c.guideline);
        break;
      }
      case "decision_add":
        d.decisions.push(structuredClone(c.decision));
        created.push(c.decision.id);
        break;
      case "reference_set": {
        const index = d.references.findIndex((r) => r.id === c.reference.id);
        if (index < 0) {
          d.references.push(structuredClone(c.reference));
          created.push(c.reference.id);
        } else d.references[index] = structuredClone(c.reference);
        break;
      }
      case "guideline_delete":
      case "decision_delete":
      case "reference_delete": {
        const key =
          c.op === "guideline_delete"
            ? "guidelines"
            : c.op === "decision_delete"
              ? "decisions"
              : "references";
        const index = d[key].findIndex((item) => item.id === c.id);
        requireThat(
          index >= 0,
          "MISSING_CONTEXT",
          "Unknown document context record.",
        );
        d[key].splice(index, 1);
        break;
      }
      case "pages_reorder": {
        requireThat(
          c.pageIds.length === d.pages.length &&
            new Set(c.pageIds).size === d.pages.length,
          "INVALID_PAGE_ORDER",
          "Supply every current page ID exactly once.",
        );
        const pages = new Map(d.pages.map((p) => [p.id, p]));
        requireThat(
          c.pageIds.every((id) => pages.has(id)),
          "MISSING_PAGE",
          "Unknown page in order.",
        );
        d.pages = c.pageIds.map((id) => pages.get(id)!);
        break;
      }
      case "move_to_page": {
        requireThat(
          d.pages.some((p) => p.id === c.pageId),
          "MISSING_PAGE",
          "Unknown destination page.",
        );
        for (const node of selected) {
          const point = worldPoint(d, node),
            rotation = worldRotation(d, node);
          node.parentId = null;
          node.x = point.x;
          node.y = point.y;
          node.rotation = rotation;
          node.pageId = c.pageId;
          for (const child of descendants(d, node.id)) child.pageId = c.pageId;
        }
        break;
      }
      case "create": {
        if (c.node.parentId) {
          const p = get(c.node.parentId);
          requireThat(
            !p.locked && !ancestors(d, p, byId).some((n) => n.locked),
            "LOCKED_NODE",
            "Unlock the destination parent first.",
          );
        }
        requireThat(
          !byId.has(c.node.id),
          "DUPLICATE_ID",
          "Node ID already exists.",
        );
        const node = structuredClone(c.node);
        d.nodes.push(node);
        byId.set(node.id, node);
        created.push(c.node.id);
        break;
      }
      case "update":
        for (const id of c.ids) {
          const node = get(id);
          for (const property of Object.keys(node.bindings))
            if (
              property in c.patch ||
              (property.startsWith("layout.") && c.patch.layout)
            )
              delete node.bindings[property as keyof typeof node.bindings];
          Object.assign(node, c.patch);
        }
        break;
      case "delete": {
        const remove = new Set(
          selected.flatMap((n) => [
            n.id,
            ...descendants(d, n.id).map((x) => x.id),
          ]),
        );
        d.nodes = d.nodes.filter((n) => !remove.has(n.id));
        for (const id of remove) byId.delete(id);
        break;
      }
      case "duplicate": {
        const originals = selected.flatMap((n) => [n, ...descendants(d, n.id)]);
        const map = new Map(originals.map((n) => [n.id, uid()]));
        for (const n of originals) {
          const clone = structuredClone(n);
          clone.id = map.get(n.id)!;
          if (n.parentId && map.has(n.parentId))
            clone.parentId = map.get(n.parentId)!;
          else {
            clone.x += c.dx;
            clone.y += c.dy;
            clone.name += " copy";
          }
          d.nodes.push(clone);
          byId.set(clone.id, clone);
          created.push(clone.id);
        }
        break;
      }
      case "reparent":
        for (const n of selected) moveParent(n, c.parentId);
        break;
      case "group": {
        requireThat(
          selected.length > 0 &&
            selected.every(
              (n) =>
                n.parentId === selected[0].parentId &&
                n.pageId === selected[0].pageId,
            ),
          "INVALID_GROUP",
          "Group siblings on one page.",
        );
        requireThat(!byId.has(c.id), "DUPLICATE_ID", "Group ID exists.");
        const b = bounds(d, selected),
          parent = selected[0].parentId ? get(selected[0].parentId) : undefined;
        const point = localPoint(d, parent, b);
        const group = makeNode("group", selected[0].pageId, {
          id: c.id,
          name: "Group",
          parentId: parent?.id ?? null,
          ...point,
          width: b.width,
          height: b.height,
          rotation: -(parent ? worldRotation(d, parent) : 0),
          fill: "none",
          clip: false,
        });
        const index = Math.max(...selected.map((n) => d.nodes.indexOf(n)));
        d.nodes.splice(index + 1, 0, group);
        byId.set(group.id, group);
        for (const n of selected) moveParent(n, group.id);
        created.push(group.id);
        break;
      }
      case "ungroup":
        for (const n of selected) {
          requireThat(
            n.type === "group",
            "INVALID_GROUP",
            "Only groups can be ungrouped.",
          );
          for (const child of d.nodes.filter((x) => x.parentId === n.id))
            moveParent(child, n.parentId);
          d.nodes = d.nodes.filter((x) => x.id !== n.id);
          byId.delete(n.id);
        }
        break;
      case "order": {
        const wanted = new Set(selected.map((n) => n.id));
        if (c.direction === "front")
          d.nodes = [
            ...d.nodes.filter((n) => !wanted.has(n.id)),
            ...d.nodes.filter((n) => wanted.has(n.id)),
          ];
        else if (c.direction === "back")
          d.nodes = [
            ...d.nodes.filter((n) => wanted.has(n.id)),
            ...d.nodes.filter((n) => !wanted.has(n.id)),
          ];
        else {
          const indices = d.nodes
            .map((n, i) => (wanted.has(n.id) ? i : -1))
            .filter((i) => i >= 0);
          if (c.direction === "forward") indices.reverse();
          for (const i of indices) {
            const n = d.nodes[i];
            let j = i + (c.direction === "forward" ? 1 : -1);
            while (j >= 0 && j < d.nodes.length) {
              if (
                d.nodes[j].parentId === n.parentId &&
                d.nodes[j].pageId === n.pageId &&
                !wanted.has(d.nodes[j].id)
              ) {
                [d.nodes[i], d.nodes[j]] = [d.nodes[j], d.nodes[i]];
                break;
              }
              j += c.direction === "forward" ? 1 : -1;
            }
          }
        }
        break;
      }
      case "align": {
        requireThat(
          selected.every((n) => n.parentId === selected[0].parentId),
          "INVALID_SELECTION",
          "Align siblings.",
        );
        const x = Math.min(...selected.map((n) => n.x)),
          y = Math.min(...selected.map((n) => n.y)),
          r = Math.max(...selected.map((n) => n.x + n.width)),
          b = Math.max(...selected.map((n) => n.y + n.height));
        for (const n of selected) {
          if (c.axis === "left") n.x = x;
          if (c.axis === "center") n.x = (x + r - n.width) / 2;
          if (c.axis === "right") n.x = r - n.width;
          if (c.axis === "top") n.y = y;
          if (c.axis === "middle") n.y = (y + b - n.height) / 2;
          if (c.axis === "bottom") n.y = b - n.height;
        }
        break;
      }
      case "distribute": {
        requireThat(
          selected.length >= 3 &&
            selected.every((n) => n.parentId === selected[0].parentId),
          "INVALID_SELECTION",
          "Distribute at least three siblings.",
        );
        const horizontal = c.axis === "horizontal",
          axis = horizontal ? "x" : "y",
          size = horizontal ? "width" : "height";
        const list = [...selected].sort((a, b) => a[axis] - b[axis]);
        const end = list.at(-1)![axis] + list.at(-1)![size];
        const gap =
          (end - list[0][axis] - list.reduce((s, n) => s + n[size], 0)) /
          (list.length - 1);
        let pos = list[0][axis];
        for (const n of list) {
          n[axis] = pos;
          pos += n[size] + gap;
        }
        break;
      }
      case "page_create":
        d.pages.push(c.page);
        created.push(c.page.id);
        break;
      case "page_update": {
        const p = d.pages.find((p) => p.id === c.id);
        requireThat(p, "MISSING_PAGE", "Unknown page.");
        Object.assign(p, c.patch);
        break;
      }
      case "page_delete":
        requireThat(d.pages.length > 1, "LAST_PAGE", "Keep at least one page.");
        requireThat(
          d.pages.some((p) => p.id === c.id),
          "MISSING_PAGE",
          "Unknown page.",
        );
        d.pages = d.pages.filter((p) => p.id !== c.id);
        d.nodes = d.nodes.filter((n) => {
          if (n.pageId !== c.id) return true;
          byId.delete(n.id);
          return false;
        });
        break;
      case "asset_add":
        d.assets.push(structuredClone(c.asset));
        created.push(c.asset.id);
        break;
      case "rename":
        d.name = c.name;
        break;
      case "font_add": {
        const old = d.fonts.find((f) => f.id === c.font.id);
        requireThat(
          !old || JSON.stringify(old) === JSON.stringify(c.font),
          "DUPLICATE_ID",
          "Font ID already has different bytes or provenance.",
        );
        if (!old) d.fonts.push(structuredClone(c.font));
        break;
      }
      default:
        throw new DesignError("UNKNOWN_COMMAND", "Unsupported command.");
    }
  }
}
