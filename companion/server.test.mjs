import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import {
  startCompanion,
  allowedBrowserOrigin,
  normalizeResult,
} from "./server.mjs";
test("loopback origin, token and path checks reject untrusted browser connections", async () => {
  assert.equal(allowedBrowserOrigin("https://wilsonle.github.io"), true);
  assert.equal(allowedBrowserOrigin("http://127.0.0.1:4208"), true);
  for (const origin of [
    undefined,
    "null",
    "https://evil.example",
    "http://127.0.0.1.evil.example:4208",
    "https://wilsonle.github.io.evil.example",
  ])
    assert.equal(allowedBrowserOrigin(origin), false);
  const companion = await startCompanion({
    port: 0,
    serve: false,
    onReady: () => {},
  });
  try {
    assert.equal(
      (await fetch(companion.endpoint.replace("ws:", "http:"))).status,
      404,
    );
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(companion.endpoint, {
        origin: "https://evil.example",
      });
      socket.on("unexpected-response", (_req, res) => {
        assert.equal(res.statusCode, 403);
        res.resume();
        socket.terminate();
        resolve();
      });
      socket.on("open", () => reject(new Error("Untrusted origin connected")));
      socket.on("error", () => {});
    });
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(companion.endpoint, {
        origin: "https://wilsonle.github.io",
      });
      socket.on("open", () =>
        socket.send(JSON.stringify({ type: "auth", code: "x".repeat(43) })),
      );
      socket.on("close", (code) => {
        assert.equal(code, 1008);
        resolve();
      });
      socket.on("error", reject);
    });
  } finally {
    await companion.close();
  }
});
test("MCP image results keep one image body and structured metadata", () => {
  const result = normalizeResult({
    revision: 2,
    content: [{ type: "image", mimeType: "image/png", data: "AA==" }],
  });
  assert.equal(result.content[1].type, "image");
  assert.equal(result.structuredContent.content, undefined);
  assert.equal(result.structuredContent.revision, 2);
});
