# 0001 — Browser-local scene engine and optional WebMCP

Status: accepted for v0.1 (issue #1). The implementation request approves plan v2; merge and GitHub Pages delivery were explicitly requested on 2026-11-12.

React/TypeScript/Vite render a static app. `src/core/commands.ts` owns runtime schemas and tool JSON schemas. `src/core/engine.ts` owns all document edits, layout, atomic validation, monotonic revisions, retry receipts and undo/redo. UI gestures preview transient clones and submit one batch on pointer release; selection/view state has no undo entries. Browser-local IndexedDB copies save before document switching. Explicit native file exports are the portable backup.

SVG scene rendering is shared by canvas, SVG and rasterized PNG export. Native `.localdesign` ZIP archives hold schema-v1 `document.json`, embedded images and the bundled licensed fonts. Safe SVG import intentionally rejects unsupported constructs rather than inserting markup. Versions, hierarchy, sizes, paths and assets validate before replacement. Text is browser-canvas measured and rendered by the same scene path; unsupported-script fallback is explicit. Arbitrary font installation, .fig files, vector booleans, advanced constraints and multiplayer remain outside v0.1.

Feature-detected `document.modelContext.registerTool` adapters invoke the same engine. Registration owns AbortSignals and retires document tools/artifacts on switch or close. Tool reads return bounded metadata; exports provide temporary artifact IDs and bounded byte reads. No remote MCP server, built-in model/provider, auth system, upload or credentials are introduced. Browser host API support is optional and actual discovery is verified separately from the controlled harness.

Consequences: the static app fits GitHub Pages without runtime secrets; browser storage and live history have separate durability limits. Saved documents retain data, while history/receipt caches reset on reload. Reverting a release changes code, not browser user data. Future schema changes must preserve/reject files explicitly rather than silently discarding fields.
