import {
  blankDocument,
  makeNode,
  requireThat,
  type DesignDocument,
  type DesignNode,
} from "../core/model";
import { CommandSchema, type Command } from "../core/commands";
import { resolveFont } from "../render/fonts";
import { MAX_NODES } from "../core/limits";
// Import a deliberately narrow safe SVG subset; never insert imported markup into the DOM.
export function svgImport(source: string): {
  document: DesignDocument;
  warnings: string[];
} {
  requireThat(
    source.length <= 2_000_000,
    "SIZE_LIMIT",
    "SVG import is limited to 2 MB.",
  );
  requireThat(
    !/<!DOCTYPE|<!ENTITY/i.test(source),
    "UNSAFE_SVG",
    "SVG entity declarations are unsupported.",
  );
  const xml = new DOMParser().parseFromString(source, "image/svg+xml");
  requireThat(
    !xml.querySelector("parsererror") &&
      xml.documentElement.localName === "svg",
    "INVALID_SVG",
    "Invalid SVG file.",
  );
  const allowed = new Set([
    "svg",
    "g",
    "rect",
    "ellipse",
    "circle",
    "line",
    "path",
    "text",
    "title",
    "desc",
  ]);
  const attrs = new Set([
    "xmlns",
    "width",
    "height",
    "viewBox",
    "x",
    "y",
    "rx",
    "ry",
    "cx",
    "cy",
    "r",
    "x1",
    "y1",
    "x2",
    "y2",
    "d",
    "fill",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "opacity",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "letter-spacing",
    "line-height",
    "text-anchor",
    "transform",
    "id",
    "version",
  ]);
  for (const el of Array.from(xml.querySelectorAll("*"))) {
    requireThat(
      el.namespaceURI === "http://www.w3.org/2000/svg",
      "UNSAFE_SVG",
      "SVG namespace is required.",
    );
    requireThat(
      allowed.has(el.localName),
      "UNSUPPORTED_SVG",
      `Unsupported SVG element: ${el.localName}. Import a flattened PNG instead.`,
    );
    for (const a of Array.from(el.attributes)) {
      if (a.name === "xmlns") {
        requireThat(
          a.value === "http://www.w3.org/2000/svg",
          "UNSAFE_SVG",
          "Unsupported SVG namespace.",
        );
        continue;
      }
      requireThat(
        attrs.has(a.name) &&
          !/(url\s*\(|javascript:|https?:|data:)/i.test(a.value),
        "UNSAFE_SVG",
        `Unsupported SVG attribute: ${a.name}.`,
      );
    }
  }
  const doc = blankDocument("Imported SVG"),
    page = doc.pages[0].id;
  const warnings: string[] = [];
  const num = (el: Element, key: string, fallback: number) => {
    const raw = el.getAttribute(key);
    if (raw === null) return fallback;
    requireThat(
      /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?(px)?$/i.test(raw),
      "UNSUPPORTED_SVG",
      `Unsupported SVG ${key} units.`,
    );
    return parseFloat(raw);
  };
  const parse = (
    el: Element,
    parentId: string | null,
    inherited: Partial<DesignNode>,
    inheritedFamily?: string,
  ) => {
    const tag = el.localName;
    if (tag === "title" || tag === "desc") return;
    const family = el.getAttribute("font-family") ?? inheritedFamily;
    const rawWeight = el.getAttribute("font-weight");
    const rawStyle = el.getAttribute("font-style");
    const anchor = el.getAttribute("text-anchor");
    const common: Partial<DesignNode> = {
      ...inherited,
      parentId,
      fill: el.getAttribute("fill") ?? inherited.fill ?? "#000000",
      stroke: el.getAttribute("stroke") ?? inherited.stroke ?? "none",
      strokeWidth: num(el, "stroke-width", inherited.strokeWidth ?? 1),
      strokeLinecap: (el.getAttribute("stroke-linecap") ??
        inherited.strokeLinecap ??
        "butt") as DesignNode["strokeLinecap"],
      strokeLinejoin: (el.getAttribute("stroke-linejoin") ??
        inherited.strokeLinejoin ??
        "miter") as DesignNode["strokeLinejoin"],
      opacity: num(el, "opacity", 1),
      fontSize: num(el, "font-size", inherited.fontSize ?? 16),
      fontFamily: family ?? inherited.fontFamily ?? "Inter",
      fontWeight: rawWeight
        ? rawWeight === "bold"
          ? "700"
          : rawWeight === "normal"
            ? "400"
            : rawWeight
        : (inherited.fontWeight ?? "400"),
      fontStyle: rawStyle
        ? (rawStyle as DesignNode["fontStyle"])
        : (inherited.fontStyle ?? "normal"),
      letterSpacing: num(el, "letter-spacing", inherited.letterSpacing ?? 0),
      lineHeight: num(el, "line-height", inherited.lineHeight ?? 1.3),
      textAlign: anchor
        ? anchor === "middle"
          ? "center"
          : anchor === "end"
            ? "right"
            : "left"
        : (inherited.textAlign ?? "left"),
    };
    let node: DesignNode;
    if (tag === "svg" || tag === "g") {
      const width = num(el, "width", 800),
        height = num(el, "height", 600);
      node = makeNode(tag === "svg" ? "frame" : "group", page, {
        ...common,
        name: tag === "svg" ? "Imported SVG" : "Group",
        width,
        height,
        fill: tag === "svg" ? "none" : common.fill,
        clip: tag === "svg",
      });
      if (tag === "svg" && el.hasAttribute("viewBox")) {
        const parts = el
          .getAttribute("viewBox")!
          .trim()
          .split(/[ ,]+/)
          .map(Number);
        requireThat(
          parts.length === 4 &&
            parts.every(Number.isFinite) &&
            parts[0] === 0 &&
            parts[1] === 0 &&
            (!el.hasAttribute("width") || width === parts[2]) &&
            (!el.hasAttribute("height") || height === parts[3]),
          "UNSUPPORTED_SVG",
          "SVG viewBox scaling is unsupported. Normalize dimensions or import PNG.",
        );
        node.width = parts[2];
        node.height = parts[3];
      }
    } else if (tag === "rect")
      node = makeNode("rectangle", page, {
        ...common,
        x: num(el, "x", 0),
        y: num(el, "y", 0),
        width: num(el, "width", 100),
        height: num(el, "height", 100),
        radius: num(el, "rx", 0),
      });
    else if (tag === "ellipse" || tag === "circle") {
      const rx = num(el, tag === "circle" ? "r" : "rx", 50),
        ry = num(el, tag === "circle" ? "r" : "ry", 50);
      node = makeNode("ellipse", page, {
        ...common,
        x: num(el, "cx", 0) - rx,
        y: num(el, "cy", 0) - ry,
        width: rx * 2,
        height: ry * 2,
      });
    } else if (tag === "line") {
      const x = num(el, "x1", 0),
        y = num(el, "y1", 0),
        dx = num(el, "x2", 100) - x,
        dy = num(el, "y2", 0) - y;
      node = makeNode("path", page, {
        ...common,
        x,
        y,
        path: `M0 0 L${dx} ${dy}`,
        width: Math.max(0.1, Math.abs(dx)),
        height: Math.max(0.1, Math.abs(dy)),
        fill: "none",
      });
    } else if (tag === "path") {
      node = makeNode("path", page, {
        ...common,
        path: el.getAttribute("d") ?? "",
        width: 800,
        height: 600,
      });
      warnings.push(
        "Path bounds default to the SVG viewport; adjust width/height if needed.",
      );
    } else {
      if (!family)
        warnings.push(
          "Unspecified SVG fonts use bundled Inter. Verify text metrics and appearance.",
        );
      const size = common.fontSize!;
      node = makeNode("text", page, {
        ...common,
        x:
          num(el, "x", 0) -
          (common.textAlign === "center"
            ? 250
            : common.textAlign === "right"
              ? 500
              : 0),
        y: num(el, "y", size) - size,
        text: el.textContent ?? "",
        fontSize: size,
        width: 500,
        height: size * 2,
      });
      const font = resolveFont(node, doc);
      if (font.warning) warnings.push(`${node.id}: ${font.warning}`);
    }
    const t = el.getAttribute("transform");
    if (t) {
      const match = t.match(
        /^translate\(\s*([+-]?[\d.]+)(?:[ ,]+([+-]?[\d.]+))?\s*\)(?:\s*rotate\(\s*([+-]?[\d.]+)\s*\))?$/,
      );
      requireThat(
        match,
        "UNSUPPORTED_SVG",
        "Only translate and origin rotation transforms are supported.",
      );
      // SVG applies the element's x/y before its transform list: T · R · P.
      // Fold that rotated local origin into our T · R scene representation.
      const rotation = Number(match[3] ?? 0),
        r = (rotation * Math.PI) / 180,
        x = node.x,
        y = node.y;
      node.x = Number(match[1]) + x * Math.cos(r) - y * Math.sin(r);
      node.y = Number(match[2] ?? 0) + x * Math.sin(r) + y * Math.cos(r);
      node.rotation = rotation;
    }
    CommandSchema.parse({ op: "create", node } satisfies Command);
    doc.nodes.push(node);
    requireThat(
      doc.nodes.length <= MAX_NODES,
      "SIZE_LIMIT",
      "Too many SVG nodes.",
    );
    for (const child of Array.from(el.children))
      parse(child, node.id, common, family);
  };
  parse(xml.documentElement, null, {});
  return { document: doc, warnings: [...new Set(warnings)] };
}
