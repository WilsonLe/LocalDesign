# 0005 — WebMCP as the only agent interface

Status: accepted on 13 November 2026 in [issue #28](https://github.com/WilsonLe/LocalDesign/issues/28). Supersedes this ADR’s original decision to add the F12 companion.

The owner clarified that LocalDesign should expose tools through browser WebMCP only. The 0.3.0 release included an optional authenticated Node stdio companion with a browser loopback socket to support standard MCP clients. It added a separate process, pairing controls and a browser loopback permission flow. [Issue #23](https://github.com/WilsonLe/LocalDesign/issues/23) retains that release and its test results.

The editor registers tools with `document.modelContext.registerTool`. The page owns artifact lifetime, document activation, registration cancellation and shared command guards. Agent hosts discover the tools and read bundled skills in a WebMCP-capable browser. Manual editing remains available in other browsers. Native documents and browser working copies use the existing schema and storage.

Remove the companion listener, CLI, pairing UI, dependencies and corresponding setup guidance. Verify discovery, editing, export and document retirement through WebMCP in the built editor and on GitHub Pages.
