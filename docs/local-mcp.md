# Optional local MCP companion

The app works without this companion. Use browser WebMCP when the host supports it. A standard MCP host can instead launch this repository's Node companion, then explicitly attach the intended browser tab. Designs and rendering stay in that tab; the companion forwards exposed tools over authenticated loopback and stores no design files. This is a stdio MCP server with a private browser socket, not an HTTP MCP endpoint.

Use Node from `.nvmrc` and install the pinned checkout dependencies:

```sh
nvm use
npm ci
```

Configure the host with a stdio server command using this checkout's **absolute** path. Substitute your actual path:

```json
{
  "mcpServers": {
    "localdesign": {
      "command": "node",
      "args": [
        "--experimental-strip-types",
        "/absolute/path/to/LocalDesign/companion/server.mjs"
      ]
    }
  }
}
```

The process prints one JSON readiness line on **stderr** containing endpoint and a fresh 43-character code. Read it in the host's server log. Do not copy protocol stdout into another service. For a manual launch use `npm run --silent mcp`; a host must own its stdin/stdout to call tools. Optional `--port 4211` changes only the loopback port; the default is 4210. No global Codex configuration is changed by the application or this repository.

In the intended LocalDesign tab, open **Connect agent → Optional local MCP companion**. Enter the exact `ws://127.0.0.1:<port>/bridge` endpoint and code, then Connect local MCP. The code field clears after the attempt and is never stored in a URL, native file or browser settings. The local host can now discover the same page tools. Read list_skills/get_skill and inspect the active document before editing. The companion-only status tool reports connection/document identity but never returns the code.

Only one tab attaches to a process at a time. Use Disconnect local MCP before attaching a different tab. Closing/navigating the page disconnects; reconnect explicitly after returning. A workspace create/open/close/import (including reopening the same document ID) changes the catalog epoch and retires unrelated pending calls. The transition's own receipt can complete; guards and original request IDs still determine whether a retry is safe. Inspect after a timeout/disconnect or unknown outcome before submitting another edit. Exports remain expiring local artifacts; read all chunks through the declared size and release them.

The browser must permit loopback WebSocket access. If it refuses the connection, check the running process, endpoint/code and browser's local-network permissions. Do not disable certificate validation, grant broad network access automatically or move the listener to a LAN address. Both HTTPS Pages and loopback development origins are permitted by the companion's exact Origin/Host/path checks; other origins and unauthenticated connections reject. The process binds 127.0.0.1, limits messages and concurrent requests, and ends with its host. Stopping/restarting it rotates the code.

The exposed API cannot grant human sign-off. Agents can request handoff review and read the human-controlled result. Imported approval claims remain unverified; the separate browser-local grant registry never travels through the companion. A host with complete script/UI control of a browser can impersonate a gesture, so this is an API boundary rather than proof of physical identity.

The named acceptance client is official `@modelcontextprotocol/client` 2.4.0, paired with server SDK 2.4.0 and ws 8.23.0. The actual Codex in-app browser passed both a loopback probe and the complete built editor connection: standard-client authoring, stable retries, image content, same-ID reopen and old-artifact retirement. `tests/browser/companion.spec.ts` exercises the real built editor without a modelContext harness in both legacy and automatic protocol-negotiation modes, including authoring, image responses, retries and workspace transitions. Local, actual host, CI and deployed results are recorded separately in the delivery decision document; these tests do not establish every MCP host or browser. See the [official SDK stdio documentation](https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio) for the underlying standard transport and [ADR 0005](adr/0005-optional-loopback-mcp-companion.md) for this project's boundary.
