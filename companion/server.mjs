import { createServer } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import { MAX_FILE_BASE64_CHARS } from "../src/core/limits.ts";
export const MAX_BRIDGE_MESSAGE_BYTES = MAX_FILE_BASE64_CHARS + 4_000_000;
const Tool = z
  .object({
    name: z
      .string()
      .regex(/^localdesign_[\w]+$/)
      .max(100),
    description: z.string().max(20000),
    inputSchema: z.record(z.string(), z.unknown()),
    annotations: z.object({
      readOnlyHint: z.boolean(),
      untrustedContentHint: z.boolean(),
    }),
  })
  .strict();
const Catalog = z
  .object({
    type: z.literal("catalog"),
    epoch: z.string().min(1).max(100),
    documentId: z.string().min(1).max(100),
    documentOpen: z.boolean(),
    tools: z.array(Tool).max(100),
    retainedCalls: z.array(z.string().max(100)).max(16).default([]),
  })
  .strict();
export function allowedBrowserOrigin(origin) {
  try {
    const url = new URL(origin);
    return (
      url.origin === origin &&
      (origin === "https://wilsonle.github.io" ||
        (url.protocol === "http:" &&
          ["127.0.0.1", "localhost"].includes(url.hostname) &&
          Boolean(url.port)))
    );
  } catch {
    return false;
  }
}
export function normalizeResult(value) {
  const object =
    value && typeof value === "object" && !Array.isArray(value)
      ? { ...value }
      : { result: value };
  const extra = Array.isArray(object.content)
    ? object.content.filter(
        (item) =>
          item &&
          ((item.type === "image" &&
            typeof item.data === "string" &&
            typeof item.mimeType === "string") ||
            (item.type === "text" && typeof item.text === "string")),
      )
    : [];
  if (Array.isArray(object.content)) delete object.content;
  return {
    content: [{ type: "text", text: JSON.stringify(object) }, ...extra],
    structuredContent: object,
    ...(object.isError ? { isError: true } : {}),
  };
}
export async function startCompanion({
  port = 4210,
  onReady = (info) =>
    console.error(JSON.stringify({ type: "localdesign-companion", ...info })),
  serve = true,
} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Use an integer loopback port from 0 to 65535.");
  const code = randomBytes(32).toString("base64url"),
    pending = new Map(),
    registered = [];
  let browser = null,
    catalog = null,
    server = null,
    closing = false;
  const failPending = (message) => {
    for (const request of pending.values()) request.reject(new Error(message));
    pending.clear();
  };
  const clearTools = () => {
    for (const tool of registered) tool.remove();
    registered.length = 0;
    catalog = null;
  };
  const forward = (name, args, epoch, signal) =>
    new Promise((resolve, reject) => {
      if (
        !browser ||
        browser.readyState !== WebSocket.OPEN ||
        !catalog ||
        catalog.epoch !== epoch
      )
        return reject(new Error("Browser session changed. List tools again."));
      if (pending.size >= 16)
        return reject(
          new Error("At most 16 browser operations may be in flight."),
        );
      const id = randomUUID(),
        socket = browser;
      let timer;
      const finish = (error, result) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
        pending.delete(id);
        error ? reject(error) : resolve(result);
      };
      const cancel = () => {
        if (socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ type: "cancel", id }));
        finish(new Error("The MCP request was cancelled."));
      };
      if (signal.aborted) return cancel();
      signal.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(() => {
        if (socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ type: "cancel", id }));
        finish(
          new Error(
            "Browser tool timed out. Inspect before retrying with the original request ID.",
          ),
        );
      }, 120000);
      const wire = JSON.stringify({
        type: "call",
        id,
        epoch,
        name,
        input: args,
      });
      if (Buffer.byteLength(wire) > MAX_BRIDGE_MESSAGE_BYTES) {
        finish(
          new Error("Arguments exceed the portable bridge transport limit."),
        );
        return;
      }
      pending.set(id, {
        epoch,
        transition: [
          "localdesign_workspace",
          "localdesign_import_files",
        ].includes(name),
        resolve: (value) => finish(null, value),
        reject: (error) => finish(error),
      });
      socket.send(wire, (error) => {
        if (error) finish(error);
      });
    });
  const updateTools = (next) => {
    if (new Set(next.tools.map((tool) => tool.name)).size !== next.tools.length)
      throw new Error("Duplicate page tool names.");
    const retained = new Set(next.retainedCalls);
    for (const [id, request] of pending)
      if (!request.transition || !retained.has(id))
        request.reject(
          new Error("Browser catalog changed; discover tools again."),
        );
    clearTools();
    catalog = next;
    if (server)
      for (const tool of next.tools) {
        if (tool.name === "localdesign_companion_status")
          throw new Error("Reserved companion tool name.");
        const epoch = next.epoch;
        registered.push(
          server.registerTool(
            tool.name,
            {
              description: tool.description,
              inputSchema: fromJsonSchema(tool.inputSchema),
              annotations: {
                readOnlyHint: tool.annotations.readOnlyHint,
                openWorldHint: false,
              },
            },
            async (args, context) => {
              try {
                return normalizeResult(
                  await forward(tool.name, args, epoch, context.mcpReq.signal),
                );
              } catch (error) {
                return normalizeResult({
                  isError: true,
                  code: "BRIDGE_UNAVAILABLE",
                  message: error.message,
                });
              }
            },
          ),
        );
      }
  };
  const http = createServer((_req, res) => {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_BRIDGE_MESSAGE_BYTES,
    perMessageDeflate: false,
  });
  http.on("upgrade", (req, socket, head) => {
    const address = http.address(),
      expected = `127.0.0.1:${address.port}`;
    if (
      req.url !== "/bridge" ||
      req.headers.host !== expected ||
      !allowedBrowserOrigin(req.headers.origin)
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    if (wss.clients.size >= 5) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (client) =>
      wss.emit("connection", client, req),
    );
  });
  wss.on("connection", (socket) => {
    let authenticated = false;
    const authTimer = setTimeout(
      () => socket.close(1008, "Authentication expired"),
      5000,
    );
    socket.on("message", (raw) => {
      try {
        if (!authenticated) {
          if (raw.length > 4096) throw new Error("Authentication failed");
          const auth = z
            .object({ type: z.literal("auth"), code: z.string().length(43) })
            .strict()
            .parse(JSON.parse(raw.toString()));
          if (
            !timingSafeEqual(Buffer.from(auth.code), Buffer.from(code)) ||
            browser
          )
            throw new Error(
              "Authentication failed or another browser is attached",
            );
          authenticated = true;
          clearTimeout(authTimer);
          browser = socket;
          socket.send(JSON.stringify({ type: "authenticated" }));
          return;
        }
        const message = JSON.parse(raw.toString());
        if (message.type === "catalog") {
          updateTools(Catalog.parse(message));
          return;
        }
        if (message.type === "result") {
          const result = z
            .object({
              type: z.literal("result"),
              id: z.string().max(100),
              epoch: z.string().max(100),
              value: z.unknown(),
            })
            .strict()
            .parse(message);
          const request = pending.get(result.id);
          if (request?.epoch !== result.epoch) return;
          request.resolve(result.value);
          return;
        }
        throw new Error("Unsupported bridge message");
      } catch {
        socket.close(1008, "Invalid bridge message");
      }
    });
    socket.on("close", () => {
      clearTimeout(authTimer);
      if (browser === socket) {
        browser = null;
        failPending(
          "The browser disconnected. Reconnect the intended tab and inspect before retrying.",
        );
        clearTools();
      }
    });
    socket.on("error", () => {});
  });
  await new Promise((resolve, reject) => {
    http.once("error", reject);
    http.listen(port, "127.0.0.1", resolve);
  });
  const endpoint = `ws://127.0.0.1:${http.address().port}/bridge`;
  const buildServer = () => {
    server = new McpServer({
      name: "localdesign-loopback-companion",
      version: "1.0.0",
    });
    server.registerTool(
      "localdesign_companion_status",
      {
        description:
          "Read the local companion connection state. The session code is shown only on the launching process's stderr; enter it in the intended LocalDesign tab. No designs are stored by the companion.",
        inputSchema: fromJsonSchema({
          type: "object",
          properties: {},
          additionalProperties: false,
        }),
        annotations: { readOnlyHint: true },
      },
      () =>
        normalizeResult({
          endpoint,
          connected: Boolean(browser && catalog),
          documentId: catalog?.documentId ?? null,
          documentOpen: catalog?.documentOpen ?? false,
          epoch: catalog?.epoch ?? null,
          toolCount: catalog?.tools.length ?? 0,
        }),
    );
    if (catalog) updateTools(catalog);
    return server;
  };
  const handle = serve ? serveStdio(buildServer) : null;
  const close = async () => {
    if (closing) return;
    closing = true;
    failPending("Companion stopped.");
    for (const socket of wss.clients) socket.terminate();
    await new Promise((resolve) => wss.close(resolve));
    await new Promise((resolve) => http.close(resolve));
    await handle?.close();
  };
  onReady({ endpoint, code });
  return { endpoint, code, close, buildServer };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const portIndex = process.argv.indexOf("--port"),
    port = portIndex < 0 ? 4210 : Number(process.argv[portIndex + 1]);
  const companion = await startCompanion({ port });
  process.stdin.on("end", () => void companion.close());
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(
      signal,
      () => void companion.close().finally(() => process.exit(0)),
    );
}
