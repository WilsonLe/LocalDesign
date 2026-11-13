import { indexNodes } from "./tree";
import { detachToken, resolveTokens, clearRemovedThemes } from "./tokens";
import { iconAttribution, iconCatalog } from "../icons/catalog";
import { MAX_ACTIVITY_TTL_MS } from "./limits";
import {
  captureCheckpoint,
  checkpointDigest,
  restoreCheckpoint,
} from "./checkpoints";
import {
  captureComponent,
  componentSourceNodes,
  instanceOwner,
  recordComponentPatch,
  recordComponentBinding,
  resolveComponents,
  componentNodeId,
} from "./components";
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
  ComponentSchema,
  ComponentInstanceSchema,
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
  componentImpact?: {
    definitionIds: string[];
    instanceCount: number;
    instanceIds: string[];
    conflicts: import("./components").ComponentConflict[];
    conflictCount: number;
  };
};
export type Snapshot = {
  activity: { actor: string; message: string; expiresAt: number } | null;
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
  private activity: Snapshot["activity"] = null;
  private activityTimer?: ReturnType<typeof setTimeout>;
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
      activity: this.activity,
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
  setActivity(
    expectedDocumentId: string,
    actor: string,
    message: string,
    ttlMs = 30000,
  ) {
    requireThat(
      expectedDocumentId === this.doc.id,
      "DOCUMENT_MISMATCH",
      "The active document changed.",
    );
    requireThat(
      actor.trim().length > 0 &&
        actor.length <= 100 &&
        message.length <= 200 &&
        Number.isInteger(ttlMs) &&
        ttlMs >= 1000 &&
        ttlMs <= MAX_ACTIVITY_TTL_MS,
      "ACTIVITY_VALUE",
      "Activity requires an actor, a message up to 200 characters and a 1–120 second lifetime.",
    );
    clearTimeout(this.activityTimer);
    this.activity = message.trim()
      ? {
          actor: actor.trim(),
          message: message.trim(),
          expiresAt: Date.now() + ttlMs,
        }
      : null;
    if (this.activity) {
      this.activityTimer = setTimeout(() => {
        this.activity = null;
        this.emit();
      }, ttlMs);
      this.activityTimer.unref?.();
    }
    this.emit();
    return this.activity;
  }
  guard(): Guard {
    return {
      expectedDocumentId: this.doc.id,
      expectedRevision: this.doc.revision,
      requestId: uid(),
    };
  }
  replace(d: DesignDocument) {
    clearTimeout(this.activityTimer);
    this.activity = null;
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
    warnings: string[] = [],
    componentImpact?: Receipt["componentImpact"],
  ): Receipt {
    const receipt = {
      documentId: this.doc.id,
      revision: this.doc.revision,
      requestId: g.requestId,
      createdIds,
      warnings,
      ...(componentImpact ? { componentImpact } : {}),
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
    const dropFor = new Set(
      r.commands.flatMap((c) =>
        (c.op === "component_set" || c.op === "component_capture") &&
        c.conflictPolicy === "drop"
          ? [c.id]
          : c.op === "checkpoint_restore" && c.conflictPolicy === "drop"
            ? (next.checkpoints
                .find((item) => item.id === c.id)
                ?.payload.components.map((item) => item.id) ?? [])
            : [],
      ),
    );
    const componentResult = resolveComponents(next, { dropFor });
    this.refreshReviewAnchors(next);
    const changedDefinitions = new Set(
      next.components
        .filter((definition) => {
          const previous = this.doc.components.find(
            (item) => item.id === definition.id,
          );
          return !previous || previous.revision !== definition.revision;
        })
        .map((definition) => definition.id),
    );
    const affected = new Set(changedDefinitions);
    for (let previous = -1; previous !== affected.size;) {
      previous = affected.size;
      for (const definition of next.components)
        if (
          definition.nodes.some(
            (node) =>
              node.component && affected.has(node.component.componentId),
          )
        )
          affected.add(definition.id);
    }
    const impacted = next.nodes.filter(
      (node) => node.component && affected.has(node.component.componentId),
    );
    const componentImpact: Receipt["componentImpact"] = changedDefinitions.size
      ? {
          definitionIds: [...changedDefinitions],
          instanceCount: impacted.length,
          instanceIds: impacted.slice(0, 100).map((node) => node.id),
          conflicts: componentResult.conflicts,
          conflictCount: componentResult.conflictCount,
        }
      : undefined;
    const declared = new Set(created);
    for (const id of componentResult.createdIds)
      if (!declared.has(id)) {
        created.push(id);
        declared.add(id);
      }
    resolveTokens(next);
    applyLayouts(next);
    validateDocument(next);
    if (dryRun)
      return {
        documentId: this.doc.id,
        revision: this.doc.revision,
        requestId: r.requestId,
        createdIds: created,
        warnings: componentResult.warnings,
        ...(componentImpact ? { componentImpact } : {}),
      };
    this.undoStack.push(this.doc);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    next.revision = this.doc.revision + 1;
    this.doc = next;
    this.reconcile();
    const receipt = this.remember(
      r,
      payload,
      created,
      componentResult.warnings,
      componentImpact,
    );
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
  private insertNode(
    d: DesignDocument,
    node: DesignNode,
    created: string[],
    byId: Map<string, DesignNode>,
  ) {
    if (node.parentId) {
      const parent = byId.get(node.parentId);
      requireThat(parent, "MISSING_NODE", "Unknown destination parent.");
      requireThat(
        !parent.locked &&
          !ancestors(d, parent, byId).some((node) => node.locked),
        "LOCKED_NODE",
        "Unlock the destination parent first.",
      );
      requireThat(
        !parent.component && !parent.componentPart,
        "COMPONENT_STRUCTURE",
        "Detach the instance or edit its source before adding children.",
      );
    }
    requireThat(!byId.has(node.id), "DUPLICATE_ID", "Node ID already exists.");
    const copy = structuredClone(node);
    d.nodes.push(copy);
    byId.set(copy.id, copy);
    created.push(copy.id);
  }
  private refreshReviewAnchors(d: DesignDocument) {
    if (!d.reviewThreads.length) return;
    const index = indexNodes(d),
      pages = new Map(d.pages.map((page) => [page.id, page.name]));
    for (const thread of d.reviewThreads) {
      const node = thread.anchor.nodeId
        ? index.byId.get(thread.anchor.nodeId)
        : undefined;
      if (node) {
        const point = worldPoint(
          d,
          node,
          { x: thread.anchor.x, y: thread.anchor.y },
          index,
        );
        Object.assign(thread.anchor, {
          nodeName: node.name,
          pageId: node.pageId,
          lastX: point.x,
          lastY: point.y,
        });
      }
      const pageName = pages.get(thread.anchor.pageId);
      if (pageName) thread.anchor.pageName = pageName;
    }
  }
  private apply(
    d: DesignDocument,
    raw: Command,
    created: string[],
    byId: Map<string, DesignNode>,
  ) {
    const c = CommandSchema.parse(raw);
    if (
      [
        "delete",
        "page_delete",
        "ungroup",
        "component_delete",
        "component_set",
        "component_capture",
      ].includes(c.op)
    )
      this.refreshReviewAnchors(d);
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
      if (
        [
          "delete",
          "duplicate",
          "reparent",
          "group",
          "ungroup",
          "order",
          "move_to_page",
        ].includes(c.op)
      )
        requireThat(
          c.ids.every((id) => !get(id).componentPart) &&
            (c.op !== "ungroup" || c.ids.every((id) => !get(id).component)),
          "COMPONENT_STRUCTURE",
          "Detach the instance before changing its internal structure.",
        );
    }
    const moveParent = (n: DesignNode, parentId: string | null) => {
      const p = parentId ? get(parentId) : undefined;
      requireThat(
        !p ||
          (["group", "frame"].includes(p.type) &&
            !p.component &&
            !p.componentPart &&
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
      case "review_add": {
        const node = c.anchor.nodeId ? byId.get(c.anchor.nodeId) : undefined;
        const page = d.pages.find((page) => page.id === c.anchor.pageId);
        requireThat(
          page && (!c.anchor.nodeId || node?.pageId === page.id),
          "REVIEW_ANCHOR",
          "Choose an existing page and optional layer for a new thread.",
        );
        d.reviewThreads.push({
          id: c.id,
          anchor: {
            ...c.anchor,
            pageName: page.name,
            nodeName: node?.name ?? "",
            lastX: node
              ? worldPoint(d, node, { x: c.anchor.x, y: c.anchor.y }).x
              : c.anchor.x,
            lastY: node
              ? worldPoint(d, node, { x: c.anchor.x, y: c.anchor.y }).y
              : c.anchor.y,
          },
          message: { ...c.message, createdAt: Date.now() },
          replies: [],
          resolved: false,
        });
        created.push(c.id);
        break;
      }
      case "review_reply":
      case "review_resolve":
      case "review_delete": {
        const thread = d.reviewThreads.find((item) => item.id === c.id);
        requireThat(thread, "MISSING_THREAD", "Choose a review thread.");
        if (c.op === "review_reply") {
          requireThat(
            !thread.resolved,
            "REVIEW_RESOLVED",
            "Reopen the thread before replying.",
          );
          thread.replies.push({ ...c.message, createdAt: Date.now() });
        } else if (c.op === "review_resolve") thread.resolved = c.resolved;
        else
          d.reviewThreads = d.reviewThreads.filter((item) => item.id !== c.id);
        break;
      }
      case "checkpoint_create": {
        const payload = captureCheckpoint(d, c.kind, c.targetId);
        d.checkpoints.push({
          id: c.id,
          kind: c.kind,
          targetId: c.targetId,
          label: c.label,
          author: c.author,
          createdAt: Date.now(),
          sourceRevision: d.revision,
          digest: checkpointDigest(payload),
          payload,
        });
        created.push(c.id);
        break;
      }
      case "checkpoint_delete":
        requireThat(
          d.checkpoints.some((item) => item.id === c.id),
          "MISSING_CHECKPOINT",
          "Choose a retained checkpoint.",
        );
        d.checkpoints = d.checkpoints.filter((item) => item.id !== c.id);
        break;
      case "checkpoint_restore": {
        const checkpoint = d.checkpoints.find((item) => item.id === c.id);
        requireThat(
          checkpoint,
          "MISSING_CHECKPOINT",
          "Choose a retained checkpoint.",
        );
        if (checkpoint.kind === "frame") {
          const root = byId.get(checkpoint.targetId);
          requireThat(
            !root ||
              (!root.locked &&
                !ancestors(d, root, byId).some((item) => item.locked)),
            "LOCKED_NODE",
            "Unlock the frame before restoring its content.",
          );
        }
        const before = new Set(d.nodes.map((node) => node.id));
        restoreCheckpoint(d, checkpoint, c.mode, c.restoreDependencies);
        byId.clear();
        for (const node of d.nodes) {
          byId.set(node.id, node);
          if (!before.has(node.id)) created.push(node.id);
        }
        break;
      }
      case "component_capture":
      case "component_set": {
        const previous = d.components.find(
          (component) => component.id === c.id,
        );
        requireThat(
          !previous?.deleted,
          "COMPONENT_DELETED",
          "Restore the retained component before editing it.",
        );
        requireThat(
          previous
            ? c.expectedComponentRevision === previous.revision
            : c.expectedComponentRevision === undefined ||
                c.expectedComponentRevision === 0,
          "STALE_COMPONENT",
          "Inspect the current component revision before updating it.",
        );
        const captured =
          c.op === "component_capture"
            ? captureComponent(d, c.rootId, c.id)
            : null;
        if (
          captured?.sourceRevision !== null &&
          captured?.sourceRevision !== undefined &&
          previous
        )
          requireThat(
            captured.sourceRevision === previous.revision ||
              (c.op === "component_capture" && c.allowStaleSource),
            "COMPONENT_SOURCE_STALE",
            "This editable source predates the current definition. Review impact before explicitly overwriting from it.",
          );
        const rootId =
          captured?.rootId ??
          (c.op === "component_set" ? c.rootId : undefined) ??
          previous?.rootId;
        const nodes =
          captured?.nodes ??
          (c.op === "component_set" ? c.nodes : undefined) ??
          previous?.nodes;
        requireThat(
          rootId && nodes,
          "COMPONENT_ROOT",
          "Supply a native component root and source nodes.",
        );
        const definition = ComponentSchema.parse({
          id: c.id,
          rootId,
          nodes,
          name:
            c.name ??
            previous?.name ??
            (nodes.find((node) => node.id === rootId)?.name || "Component"),
          description: c.description ?? previous?.description ?? "",
          revision: (previous?.revision ?? 0) + 1,
          deleted: false,
          properties: c.properties ?? previous?.properties ?? [],
          variants: c.variants ?? previous?.variants ?? [],
        });
        if (previous) d.components[d.components.indexOf(previous)] = definition;
        else {
          d.components.push(definition);
          created.push(c.id);
        }
        if (c.op === "component_capture") {
          const sourceIds = new Set([
            c.rootId,
            ...descendants(d, c.rootId).map((node) => node.id),
          ]);
          for (const node of d.nodes)
            if (
              sourceIds.has(node.id) &&
              node.componentSource?.componentId === c.id
            )
              node.componentSource.revision = definition.revision;
        }
        break;
      }
      case "component_instance": {
        const definition = d.components.find(
          (component) => component.id === c.componentId && !component.deleted,
        );
        const root = definition?.nodes.find(
          (node) => node.id === definition.rootId,
        );
        requireThat(
          definition && root,
          "MISSING_COMPONENT",
          "Choose an active native component.",
        );
        this.insertNode(
          d,
          {
            ...structuredClone(root),
            id: c.id,
            name: c.name ?? definition.name,
            pageId: c.pageId,
            parentId: c.parentId,
            x: c.x,
            y: c.y,
            rotation: c.rotation,
            hidden: false,
            locked: false,
            componentPart: null,
            componentSource: null,
            component: ComponentInstanceSchema.parse({
              componentId: c.componentId,
              properties: c.properties,
              overrides: c.overrides,
            }),
          },
          created,
          byId,
        );
        break;
      }
      case "component_source":
        for (const node of componentSourceNodes(
          d,
          c.componentId,
          c.id,
          c.pageId,
          c.parentId,
          c.x,
          c.y,
        ))
          this.insertNode(d, node, created, byId);
        break;
      case "component_properties":
        for (const id of c.ids) {
          const node = get(id),
            definition = d.components.find(
              (component) => component.id === node.component?.componentId,
            );
          requireThat(
            node.component &&
              definition &&
              !node.component.frozen &&
              !definition.deleted,
            "COMPONENT_DELETED",
            "Choose an active linked instance, or restore/detach its source first.",
          );
          const values = new Map(Object.entries(node.component.properties));
          for (const [name, value] of Object.entries(c.properties))
            if (value === null) values.delete(name);
            else values.set(name, value);
          node.component.properties = Object.fromEntries(values);
        }
        break;
      case "component_reset":
        for (const id of c.ids) {
          const owner = instanceOwner(d, get(id), byId);
          requireThat(
            owner,
            "MISSING_INSTANCE",
            "Choose a linked instance or one of its parts.",
          );
          requireThat(
            !owner.root.component!.frozen,
            "COMPONENT_DELETED",
            "Restore or detach the frozen source first.",
          );
          owner.root.component!.overrides =
            c.scope === "instance"
              ? []
              : owner.root.component!.overrides.filter(
                  (row) =>
                    JSON.stringify(row.path) !== JSON.stringify(owner.path),
                );
          if (c.properties) owner.root.component!.properties = {};
        }
        break;
      case "component_detach": {
        const owners = new Set(
          c.ids.map((id) => instanceOwner(d, get(id), byId)?.root.id),
        );
        requireThat(
          !owners.has(undefined),
          "MISSING_INSTANCE",
          "Choose linked instances or their parts.",
        );
        for (const node of d.nodes) {
          if (owners.has(node.id)) node.component = null;
          if (node.componentPart && owners.has(node.componentPart.instanceId))
            node.componentPart = null;
        }
        break;
      }
      case "component_delete": {
        const definition = d.components.find(
          (component) => component.id === c.id,
        );
        requireThat(
          definition && !definition.deleted,
          "MISSING_COMPONENT",
          "Choose an active component definition.",
        );
        const owners = new Set(
          d.nodes
            .filter((node) => node.component?.componentId === c.id)
            .map((node) => node.id),
        );
        for (const node of d.nodes) {
          if (owners.has(node.id)) {
            if (c.detach) node.component = null;
            else node.component!.frozen = true;
          }
          if (
            c.detach &&
            node.componentPart &&
            owners.has(node.componentPart.instanceId)
          )
            node.componentPart = null;
        }
        definition.deleted = true;
        definition.revision++;
        break;
      }
      case "component_restore": {
        const definition = d.components.find(
          (component) => component.id === c.id && component.deleted,
        );
        requireThat(
          definition,
          "MISSING_COMPONENT",
          "Choose a retained deleted definition.",
        );
        if (c.name) definition.name = c.name;
        definition.deleted = false;
        definition.revision++;
        for (const node of d.nodes)
          if (node.component?.componentId === c.id)
            node.component.frozen = false;
        break;
      }
      case "icon_insert": {
        const icon = iconCatalog.icons.find((icon) => icon.id === c.iconId);
        requireThat(
          icon,
          "MISSING_ICON",
          "Choose an icon from the bundled catalog.",
        );
        this.apply(
          d,
          {
            op: "create",
            node: makeNode("path", c.pageId, {
              id: c.id,
              parentId: c.parentId,
              name: icon.name,
              x: c.x,
              y: c.y,
              width: c.size,
              height: c.size,
              fill: "none",
              stroke: c.color,
              strokeWidth: c.strokeWidth,
              strokeLinecap: "round",
              strokeLinejoin: "round",
              path: icon.path,
              pathViewBox: {
                width: iconCatalog.viewBox,
                height: iconCatalog.viewBox,
              },
              attribution: iconAttribution,
            }),
          },
          created,
          byId,
        );
        break;
      }
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
          recordComponentBinding(d, node, c.property, c.tokenId, byId);
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
        clearRemovedThemes(d, allowed);
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
      case "create":
        this.insertNode(d, c.node, created, byId);
        break;
      case "update":
        for (const id of c.ids) {
          const node = get(id);
          recordComponentPatch(d, node, c.patch, byId);
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
        const map = new Map<string, string>(
          originals.map((n) => [n.id, uid()]),
        );
        const keepSource = new Set(
          selected
            .filter(
              (node) =>
                node.componentSource &&
                d.components.some(
                  (component) =>
                    component.id === node.componentSource!.componentId &&
                    component.rootId === node.componentSource!.partId,
                ),
            )
            .flatMap((node) => [
              node.id,
              ...descendants(d, node.id).map((child) => child.id),
            ]),
        );
        for (const node of originals)
          if (node.componentPart) {
            const rootId = map.get(node.componentPart.instanceId);
            requireThat(
              rootId,
              "COMPONENT_STRUCTURE",
              "Duplicate the complete instance or detach its part first.",
            );
            map.set(node.id, componentNodeId(rootId, node.componentPart.path));
          }
        for (const n of originals) {
          const clone = structuredClone(n);
          clone.id = map.get(n.id)!;
          if (clone.componentPart)
            clone.componentPart.instanceId = map.get(
              clone.componentPart.instanceId,
            )!;
          if (!keepSource.has(n.id)) clone.componentSource = null;
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
          recordComponentPatch(d, n, { x: n.x, y: n.y }, byId);
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
          recordComponentPatch(d, n, { [axis]: pos }, byId);
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
