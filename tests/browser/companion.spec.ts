import { test, expect } from "@playwright/test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { resolve } from "node:path";
import { open } from "./helpers";
for (const mode of ["legacy", "auto"] as const)
  test(`official MCP SDK client ${mode} uses the real browser engine and survives workspace transitions`, async ({
    page,
  }) => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        "--experimental-strip-types",
        resolve("companion/server.mjs"),
        "--port",
        "0",
      ],
      stderr: "pipe",
    });
    const client = new Client(
      { name: "LocalDesign official SDK acceptance", version: "1.0" },
      { versionNegotiation: { mode } },
    );
    try {
      await client.connect(transport);
      const info = await new Promise<{ endpoint: string; code: string }>(
        (resolveReady, reject) => {
          let buffer = "";
          const timeout = setTimeout(
            () =>
              reject(
                new Error("Companion did not announce its loopback endpoint"),
              ),
            5000,
          );
          transport.stderr?.on("data", (chunk) => {
            buffer += chunk.toString();
            for (const line of buffer.split("\n")) {
              if (!line.startsWith("{")) continue;
              try {
                const value = JSON.parse(line);
                if (value.type === "localdesign-companion") {
                  clearTimeout(timeout);
                  resolveReady(value);
                }
              } catch {
                /* Non-JSON Node diagnostics remain on stderr. */
              }
            }
          });
        },
      );
      const call = async (
        name: string,
        input: Record<string, unknown> = {},
      ) => {
        const result = await client.callTool({
          name: `localdesign_${name}`,
          arguments: input,
        });
        if (!result.structuredContent)
          throw new Error(
            `${name}: ${JSON.stringify(result.content).slice(0, 2500)}`,
          );
        return result.structuredContent as any;
      };
      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(
        ["localdesign_companion_status"],
      );
      await open(page);
      await page
        .getByRole("button", { name: "Connect an agent", exact: true })
        .click();
      await page
        .getByText("Optional local MCP companion", { exact: true })
        .click();
      await page
        .getByLabel("Loopback endpoint", { exact: true })
        .fill(info.endpoint);
      await page
        .getByLabel("Local MCP session code", { exact: true })
        .fill(info.code);
      await page
        .getByRole("button", { name: "Connect local MCP", exact: true })
        .click();
      await expect(
        page.getByText("Local MCP connected", { exact: true }),
      ).toBeVisible();
      await expect
        .poll(async () =>
          (await client.listTools()).tools.some(
            (tool) => tool.name === "localdesign_inspect_document",
          ),
        )
        .toBe(true);
      const d = await call("inspect_document");
      expect(d.isError, d.message).not.toBe(true);
      expect(typeof d.documentId, JSON.stringify(d).slice(0, 1000)).toBe(
        "string",
      );
      const request = {
        expectedDocumentId: d.documentId,
        expectedRevision: d.revision,
        requestId: "mcp-frame",
        commands: [
          {
            op: "create",
            node: {
              id: "mcp-frame",
              type: "frame",
              name: "MCP shared frame",
              pageId: d.pageId,
              width: 200,
              height: 120,
              fill: "#112233",
            },
          },
        ],
      };
      const done = await call("apply_edits", request);
      expect(done.isError, done.message).not.toBe(true);
      expect(await call("apply_edits", request)).toEqual(done);
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Select MCP shared frame",
          exact: true,
        }),
      ).toBeVisible();
      const result = await client.callTool({
        name: "localdesign_preview",
        arguments: { ids: ["mcp-frame"] },
      });
      expect(result.content.some((item) => item.type === "image")).toBe(true);
      let current = await call("inspect_document");
      const artifact = await call("export_design", { format: "svg" });
      const reopened = await call("workspace", {
        action: "open",
        id: current.documentId,
        guard: {
          expectedDocumentId: current.documentId,
          expectedRevision: current.revision,
          requestId: "mcp-reopen",
        },
      });
      expect(reopened.isError, reopened.message).not.toBe(true);
      expect(
        (await call("artifact", { action: "read", id: artifact.id })).code,
      ).toBe("MISSING_ARTIFACT");
      current = await call("inspect_document");
      expect(current.documentId).toBe(d.documentId);
      const closed = await call("workspace", {
        action: "close",
        guard: {
          expectedDocumentId: current.documentId,
          expectedRevision: current.revision,
          requestId: "mcp-close",
        },
      });
      expect(closed.isError, closed.message).not.toBe(true);
      await expect(
        page.getByRole("button", { name: "New blank design", exact: true }),
      ).toBeVisible();
      let status = await call("workspace");
      expect(status.documentOpen).toBe(false);
      const created = await call("workspace", {
        action: "create",
        name: "MCP next workspace",
        guard: {
          expectedDocumentId: status.documentId,
          expectedRevision: status.revision,
          requestId: "mcp-next",
        },
      });
      expect(created.isError, created.message).not.toBe(true);
      await expect(page.getByTestId("canvas")).toBeVisible();
      current = await call("inspect_document");
      expect(current.documentId).not.toBe(d.documentId);
      const stale = await call("apply_edits", {
        ...request,
        requestId: "stale-mcp",
      });
      expect(stale.code).toBe("DOCUMENT_MISMATCH");
      await page
        .getByRole("button", { name: "Connect an agent", exact: true })
        .click();
      await page
        .getByText("Optional local MCP companion", { exact: true })
        .click();
      await page
        .getByRole("button", { name: "Disconnect local MCP", exact: true })
        .click();
      await expect
        .poll(async () => (await call("companion_status")).connected)
        .toBe(false);
      expect((await client.listTools()).tools).toHaveLength(1);
    } finally {
      await client.close();
    }
  });
