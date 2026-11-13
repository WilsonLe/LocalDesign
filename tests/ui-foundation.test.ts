import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

function violations(text: string, path: string) {
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const errors: string[] = [];
  function visit(node: ts.Node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      /^(button|input|select|textarea|dialog)$/.test(
        node.tagName.getText(source),
      )
    )
      errors.push("Use the shared components/ui control");
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text.startsWith("@base-ui/")
    )
      errors.push("Base UI belongs in components/ui");
    if (
      ts.isCallExpression(node) &&
      /^(?:(?:window|globalThis)\.)?(confirm|alert|prompt)$/.test(
        node.expression.getText(source),
      )
    )
      errors.push("Use a shared dialog instead of a browser prompt");
    ts.forEachChild(node, visit);
  }
  visit(source);
  return errors;
}
function files(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(path, entry.name))
      : [join(path, entry.name)],
  );
}

it("keeps app controls and Base UI imports behind the shared shadcn foundation", () => {
  const errors = files("src")
    .filter(
      (path) =>
        /\.tsx?$/.test(path) &&
        !relative("src", path).startsWith("components/ui/"),
    )
    .flatMap((path) =>
      violations(readFileSync(path, "utf8"), path).map(
        (error) => `${path}: ${error}`,
      ),
    );
  expect(errors).toEqual([]);
});
it("rejects native-control, primitive-import and browser-confirm bypasses", () => {
  expect(violations("<button>Delete</button>", "fixture.tsx")).toHaveLength(1);
  expect(
    violations('import { Dialog } from "@base-ui/react/dialog"', "fixture.tsx"),
  ).toHaveLength(1);
  expect(violations('window.confirm("Delete?")', "fixture.tsx")).toHaveLength(
    1,
  );
  expect(
    violations('<Button variant="default">Create</Button>', "fixture.tsx"),
  ).toEqual([]);
});
it("keeps editor CSS below component utilities so it cannot override their variants", () => {
  const css = readFileSync("src/style.css", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
  expect(css.startsWith("@layer components {")).toBe(true);
  let depth = 0;
  for (let i = css.indexOf("{"); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") depth--;
    if (!depth)
      expect(i, "All editor CSS must stay inside its layer").toBe(
        css.length - 1,
      );
  }
  expect(depth).toBe(0);
  expect(
    css.match(/#[\da-f]{6}\b/gi),
    "Use semantic theme tokens for editor colors",
  ).toBeNull();
});
