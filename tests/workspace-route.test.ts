import { describe, expect, it } from "vitest";
import {
  readWorkspaceRoute as read,
  workspacePath as pathFor,
} from "../src/editor/workspaceRoute";

const readWorkspaceRoute = (path: string) => read(path, "/LocalDesign/");
const workspacePath = (id?: string) => pathFor(id, "/LocalDesign/");

describe("workspace paths respect the application base and document IDs", () => {
  it("resolves the root and a saved workspace", () => {
    expect(readWorkspaceRoute("/LocalDesign/")).toEqual({ kind: "list" });
    expect(readWorkspaceRoute("/LocalDesign")).toEqual({ kind: "list" });
    expect(readWorkspaceRoute("/LocalDesign/workspace/project-1")).toEqual({
      kind: "workspace",
      id: "project-1",
    });
    expect(readWorkspaceRoute("/LocalDesign/workspace/%70roject-1/")).toEqual({
      kind: "workspace",
      id: "project-1",
    });
    expect(workspacePath("project-1")).toBe("/LocalDesign/workspace/project-1");
    expect(workspacePath()).toBe("/LocalDesign/");
  });
  it.each([
    "/",
    "/LocalDesign2/",
    "/LocalDesign/extra",
    "/LocalDesign/workspace/",
    "/LocalDesign/workspace/id/extra",
    "/LocalDesign/workspace/%",
    "/LocalDesign/workspace/%2F",
    "/LocalDesign/workspace/" + "x".repeat(101),
  ])("rejects unknown or malformed path %s", (path) => {
    expect(readWorkspaceRoute(path)).toEqual({ kind: "missing" });
  });
});
