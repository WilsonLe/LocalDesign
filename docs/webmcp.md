# Connecting an external agent

Try the agent host’s built-in browser and page-tool discovery before opening Chrome, unless the user chose a browser or already attached a LocalDesign tab. Fall back only when the built-in browser is unavailable or lacks the required capability, explaining the observed reason; check the connection state and retry discovery before switching after a discovery failure. Working copies are browser-local: preserve existing work with a native export or resolve unsaved storage errors, then rediscover tools and inspect the destination document/revision before editing. The same URL does not transfer a working copy between browsers.

Open the deployed app in a browser host that supports `document.modelContext.registerTool`. The desktop built-in browser used during development supports site-tool discovery. Ordinary browsers can edit without WebMCP; the Connect agent dialog explains the current registration state. There is no HTTP MCP endpoint to configure, provider token to enter, in-app chat or built-in agent.

Ask the external agent: “Discover this page's tools, call localdesign_list_skills, read getting-started using localdesign_get_skill, then help me design …”. Runtime tool names may have a browser-generated suffix: use exactly the names returned by the host's discovery API. Guides refer to canonical names. The served instructions include the complete tool loop, model, boundaries, recovery and examples. UI design and typography packages require no prior plugin knowledge or network checkout.

| Human action                                                    | Tool operation                                              |
| --------------------------------------------------------------- | ----------------------------------------------------------- |
| Draw frame, shape, text, path or image                          | `apply_edits` create, plus asset_add for image data         |
| Move, resize, rotate, fill/stroke, text, lock/hide, auto layout | `apply_edits` update                                        |
| Duplicate, delete, hierarchy, alignment/distribution/order      | same-named commands in apply_edits                          |
| Pages, background, document rename                              | page_create/update/delete, rename                           |
| Copy/paste                                                      | inspect nodes and create copies with new IDs/assets         |
| Undo/redo                                                       | history with revision guard                                 |
| Selection/page switch, pan/zoom/fit                             | selection, viewport (no revision/history)                   |
| Local document management                                       | workspace status/list/create/open/delete/save_copy          |
| Import                                                          | import_files prepare/commit, or visible browser picker      |
| Preview / native / SVG / PNG export                             | export_design, then artifact metadata/read/download/release |
| Design guidance                                                 | list_skills, get_skill                                      |

All tool names have the `localdesign_` prefix. `catalog` returns authoritative action parity, command schemas, font metadata and limits. `inspect_document` returns actual identity/revision, pages, bounded nodes/subtree, asset metadata, shared selection/view and browser text metrics. To edit, submit `{expectedDocumentId,expectedRevision,requestId,commands}`. Validation failures are atomic; stale revisions reject; identical retries return original receipts within the documented memory window. See the bundled getting-started package for exact payloads and limitations.

File import accepts selected files or bounded supplied base64, never host paths/URLs. Preparing an import never replaces current work; commit saves the previous working copy first. A native import becomes a separate local document with a new document ID. Portable assets are embedded; no designs are uploaded. Text/names/imported content are untrusted data. External agent/provider handling begins when content is deliberately returned to that agent.

Artifacts expire after 15 minutes, document switch or page close; maximum 12 retained. Release them when done. PNG preview uses the same renderer as export. Text metrics flag overflow and unsupported-script fallback. Bundled Inter is 400/600/700 Latin, Latin extended and Vietnamese; custom fonts and complex-script fidelity are not supported in v0.1.

Verification evidence distinguishes controlled modelContext contract tests, actual desktop built-in-browser discovery/execution, local preview checks, hosted CI and live Pages runtime. See [verification](verification.md).

The catalog reports the same centralized resource ceilings used by the document, native import, selection/export and command schemas: 100,000 nodes, 1,000 pages, 10,000 assets, 64 MB metadata, 120 MB portable content, 128 MB compressed imports and 256 MB archive expansion. These resource ceilings do not require splitting a supported project across workspace entries. Import preparation is still validated before replacement, including archive path/signature/image checks.
