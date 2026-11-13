import { describe, expect, it } from "vitest";
import { DesignEngine } from "../src/core/engine";
import {
  blankDocument,
  makeNode,
  uid,
  type DesignDocument,
  ComponentSchema,
  ComponentInstanceSchema,
} from "../src/core/model";
import { tokenResolver } from "../src/core/tokens";

function fixture() {
  const doc = blankDocument();
  const frame = makeNode("frame", doc.pages[0].id, {
    layout: { direction: "vertical", gap: 10, padding: 10, align: "start" },
  });
  const text = makeNode("text", doc.pages[0].id, {
    parentId: frame.id,
    text: "Token heading",
    fontSize: 20,
  });
  const box = makeNode("rectangle", doc.pages[0].id, { parentId: frame.id });
  doc.nodes.push(frame, text, box);
  return { engine: new DesignEngine(doc), frame, text, box };
}
function token(
  id: string,
  value: string | number | { tokenId: string },
  extra: Partial<DesignDocument["tokens"][number]> = {},
): DesignDocument["tokens"][number] {
  return {
    id,
    name: /^[A-Za-z]/.test(id) ? id : `token-${id}`,
    type: "color",
    value,
    themes: {},
    description: "",
    ...extra,
  };
}

describe("native token resolution", () => {
  it("updates linked aliases and inherited themes in canonical fields used by layout, then restores through undo", () => {
    const { engine, frame, text, box } = fixture();
    engine.dispatch([
      {
        op: "token_themes_set",
        themes: [{ id: "dark", name: "Dark" }],
        activeThemeId: null,
      },
      {
        op: "token_set",
        token: token("ink", "#111111", { themes: { dark: "#eeeeee" } }),
      },
      { op: "token_set", token: token("heading-ink", { tokenId: "ink" }) },
      {
        op: "token_set",
        token: token("space", 24, { type: "spacing", themes: { dark: 32 } }),
      },
      {
        op: "token_bind",
        ids: [text.id],
        property: "fill",
        tokenId: "heading-ink",
      },
      {
        op: "token_bind",
        ids: [frame.id],
        property: "layout.padding",
        tokenId: "space",
      },
    ]);
    expect(engine.document.nodes.find((n) => n.id === text.id)).toMatchObject({
      fill: "#111111",
      x: 24,
      y: 24,
    });
    engine.dispatch([
      { op: "update", ids: [frame.id], patch: { tokenTheme: "dark" } },
    ]);
    expect(engine.document.nodes.find((n) => n.id === text.id)).toMatchObject({
      fill: "#eeeeee",
      x: 32,
      y: 32,
    });
    const themedBox = engine.document.nodes.find((n) => n.id === box.id)!;
    expect(themedBox.y).toBe(32 + text.height + frame.layout.gap);
    engine.history("undo", engine.guard());
    expect(engine.document.nodes.find((n) => n.id === text.id)).toMatchObject({
      fill: "#111111",
      x: 24,
      y: 24,
    });
  });
  it("keeps stable bindings through rename and detaches only a manually edited property", () => {
    const { engine, text } = fixture();
    engine.dispatch([
      { op: "token_set", token: token("ink", "#123456") },
      { op: "token_bind", ids: [text.id], property: "fill", tokenId: "ink" },
      { op: "token_bind", ids: [text.id], property: "stroke", tokenId: "ink" },
    ]);
    engine.dispatch([
      {
        op: "token_set",
        token: token("ink", "#654321", { name: "renamed-ink" }),
      },
    ]);
    expect(engine.document.nodes.find((n) => n.id === text.id)?.fill).toBe(
      "#654321",
    );
    engine.dispatch([
      { op: "update", ids: [text.id], patch: { fill: "#ffffff" } },
    ]);
    const changed = engine.document.nodes.find((n) => n.id === text.id)!;
    expect(changed.bindings.fill).toBeUndefined();
    expect(changed.bindings.stroke).toBe("ink");
    expect(changed.fill).toBe("#ffffff");
    engine.history("undo", engine.guard());
    expect(
      engine.document.nodes.find((n) => n.id === text.id)?.bindings.fill,
    ).toBe("ink");
  });
  it("rejects cyclic aliases, wrong types/ranges and incompatible targets atomically, including unused tokens", () => {
    const { engine, box } = fixture(),
      before = engine.document;
    for (const commands of [
      [
        { op: "token_set" as const, token: token("a", { tokenId: "b" }) },
        { op: "token_set" as const, token: token("b", { tokenId: "a" }) },
      ],
      [
        {
          op: "token_set" as const,
          token: token("bad", -1, { type: "spacing" }),
        },
      ],
      [{ op: "token_set" as const, token: token("bad", "red") }],
      [
        {
          op: "token_set" as const,
          token: token("weight", "600", { type: "fontWeight" }),
        },
        {
          op: "token_bind" as const,
          ids: [box.id],
          property: "fontWeight" as const,
          tokenId: "weight",
        },
      ],
    ]) {
      expect(() =>
        engine.dispatch([{ op: "rename", name: "Rejected" }, ...commands]),
      ).toThrow();
      expect(engine.document).toBe(before);
      expect(engine.getSnapshot().canUndo).toBe(false);
    }
  });
  it("requires explicit deletion of uses and preserves every alias theme when detaching", () => {
    const { engine, text } = fixture();
    engine.dispatch([
      {
        op: "token_themes_set",
        themes: [{ id: "dark", name: "Dark" }],
        activeThemeId: null,
      },
      {
        op: "token_set",
        token: token("ink", "#112233", { themes: { dark: "#ddeeff" } }),
      },
      { op: "token_set", token: token("alias", { tokenId: "ink" }) },
      { op: "token_bind", ids: [text.id], property: "fill", tokenId: "ink" },
    ]);
    const before = engine.document;
    expect(() =>
      engine.dispatch([{ op: "token_delete", id: "ink", detach: false }]),
    ).toThrow(/in use/);
    expect(engine.document).toBe(before);
    engine.dispatch([{ op: "token_delete", id: "ink", detach: true }]);
    expect(engine.document.nodes.find((n) => n.id === text.id)).toMatchObject({
      fill: "#112233",
      bindings: {},
    });
    expect(tokenResolver(engine.document).value("alias", "dark")).toBe(
      "#ddeeff",
    );
    engine.history("undo", engine.guard());
    expect(engine.document.tokens).toEqual(before.tokens);
    expect(
      engine.document.nodes.find((n) => n.id === text.id)?.bindings.fill,
    ).toBe("ink");
  });
  it("removes deleted theme overrides and selects inheritance without losing base values", () => {
    const { engine, frame, text } = fixture();
    engine.dispatch([
      {
        op: "token_themes_set",
        themes: [{ id: "dark", name: "Dark" }],
        activeThemeId: "dark",
      },
      {
        op: "token_set",
        token: token("ink", "#123456", { themes: { dark: "#abcdef" } }),
      },
      { op: "token_bind", ids: [text.id], property: "fill", tokenId: "ink" },
      { op: "update", ids: [frame.id], patch: { tokenTheme: "dark" } },
    ]);
    engine.dispatch([
      { op: "token_themes_set", themes: [], activeThemeId: null },
    ]);
    expect(engine.document.tokens[0].themes).toEqual({});
    expect(
      engine.document.nodes.find((n) => n.id === frame.id)?.tokenTheme,
    ).toBeNull();
    expect(engine.document.nodes.find((n) => n.id === text.id)?.fill).toBe(
      "#123456",
    );
  });
  it("rejects stale token batches and leaves dry runs uncommitted", () => {
    const { engine, text } = fixture(),
      guard = engine.guard(),
      id = uid();
    const request = {
      ...guard,
      commands: [
        { op: "token_set" as const, token: token(id, "#334455") },
        {
          op: "token_bind" as const,
          ids: [text.id],
          property: "fill" as const,
          tokenId: id,
        },
      ],
    };
    engine.edit(request, true);
    expect(engine.document.tokens).toEqual([]);
    engine.dispatch([{ op: "rename", name: "Human edit" }]);
    expect(() => engine.edit(request)).toThrow(/current revision/);
    expect(engine.document.tokens).toEqual([]);
  });
  it("allows the full spacing range but rejects a binding whose inactive theme exceeds its target range", () => {
    const { engine, frame, text } = fixture();
    engine.dispatch([
      {
        op: "token_themes_set",
        themes: [{ id: "dark", name: "Dark" }],
        activeThemeId: null,
      },
      {
        op: "token_set",
        token: token("space", 30, { type: "spacing", themes: { dark: 2000 } }),
      },
      {
        op: "token_bind",
        ids: [frame.id],
        property: "layout.padding",
        tokenId: "space",
      },
    ]);
    const before = engine.document;
    expect(() =>
      engine.dispatch([
        {
          op: "token_bind",
          ids: [text.id],
          property: "strokeWidth",
          tokenId: "space",
        },
      ]),
    ).toThrow(/strokeWidth/);
    expect(engine.document).toBe(before);
  });
  it("resolves the same acyclic alias graph regardless of insertion order", () => {
    const entries = Array.from({ length: 45 }, (_, index) =>
      token(
        `alias-${index}`,
        index === 44 ? "#123456" : { tokenId: `alias-${index + 1}` },
      ),
    );
    for (const list of [entries, [...entries].reverse()]) {
      const engine = new DesignEngine();
      engine.dispatch(
        list.map((item) => ({ op: "token_set" as const, token: item })),
      );
      expect(tokenResolver(engine.document).value("alias-0")).toBe("#123456");
    }
  });
});

it("detaching a variant token preserves inherited private themes and differently themed existing instances", () => {
  const d = blankDocument();
  d.tokenThemes = [{ id: "dark", name: "Dark" }];
  d.tokens = [token("ink", "#111111", { themes: { dark: "#eeeeee" } })];
  d.components = [
    ComponentSchema.parse({
      id: "card",
      name: "Card",
      rootId: "root",
      nodes: [
        makeNode("frame", "private", { id: "root", tokenTheme: "dark" }),
        makeNode("rectangle", "private", { id: "part", parentId: "root" }),
      ],
      variants: [
        {
          id: "paint",
          name: "Paint",
          when: {},
          overrides: [{ partId: "part", patch: {}, bindings: { fill: "ink" } }],
        },
      ],
    }),
  ];
  const spec = ComponentInstanceSchema.parse({ componentId: "card" });
  d.nodes = [
    makeNode("frame", d.pages[0].id, { id: "dark-card", component: spec }),
    makeNode("frame", d.pages[0].id, {
      id: "base-card",
      component: {
        ...structuredClone(spec),
        overrides: [
          { path: ["root"], patch: { tokenTheme: null }, bindings: {} },
        ],
      },
    }),
  ];
  const e = new DesignEngine(d);
  const paints = () =>
    e.document.nodes.filter((n) => n.componentPart).map((n) => [n.id, n.fill]);
  const before = paints();
  expect(before.map(([, fill]) => fill)).toEqual(["#eeeeee", "#111111"]);
  e.dispatch([{ op: "token_delete", id: "ink", detach: true }]);
  expect(paints()).toEqual(before);
  expect(
    e.document.components[0].variants[0].overrides[0].bindings.fill,
  ).toEqual({ value: "#eeeeee" });
  e.dispatch([{ op: "rename", name: "Retained" }]);
  expect(paints()).toEqual(before);
  e.history("undo", e.guard());
  e.history("undo", e.guard());
  expect(e.document.tokens[0].id).toBe("ink");
  expect(paints()).toEqual(before);
});
