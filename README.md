# LocalDesign

A browser-local design editor for people and external agents, using LocalCut’s shadcn/Base UI components, neutral theme and monochrome line-art branding. Draw on a canvas, organize layers, edit typography and layout, and export an editable `.localdesign` file, SVG or PNG. No account, backend, model provider or runtime credentials.

**Try it:** https://wilsonle.github.io/LocalDesign/

**Plan:** [issue #1](https://github.com/WilsonLe/LocalDesign/issues/1)

## Use the editor

Start with a blank dotted canvas. Choose Frame (F), Rectangle (R), Ellipse (O), Line (L), Path (P), Text (T) or Image (I). Drag to draw/move, use corner handles to resize and the round handle to rotate (Shift snaps to 15°). Shapes snap to a 4 px grid; Alt disables it. The inspector exposes exact position, size, rotation, appearance, text and frame auto layout. Layers support multiselection (Shift), visibility, lock, grouping, ordering, duplication, alignment and distribution. Frame layout uses padding, gap and cross-axis alignment; clipping is optional.

Space-drag or Hand (H) pans; ⌘/Ctrl-scroll zooms. `1` fits the page, `2` fits selection, `0` resets zoom. ⌘/Ctrl Z undoes; Shift Z redoes; D duplicates; G groups (Shift G ungroups); C/X/V copies/cuts/pastes; arrows nudge (Shift moves 10 px). Input fields keep their own normal typing/shortcuts. Narrow screens expose Pages & layers and Properties drawers. Help lists shortcuts and the complete bundled guides.

The workspace menu opens/creates/manages browser-local documents. IndexedDB saves working copies; storage errors expose retry, save-a-copy and portable backup actions. Export `.localdesign` to keep a backup or move to another device. Native/SVG/raster imports validate before opening as a separate local document, preserving the old working copy. Use Image to add a raster asset to the current design. Unsupported SVG constructs reject with an error; use a flattened PNG where appropriate.

### Connect an agent

Use the agent host’s built-in browser first and discover this page’s tools before opening Chrome. Respect an explicit browser choice or an already attached LocalDesign tab; use another browser when the built-in browser is unavailable or lacks the required capability, and explain the observed reason. Open the same URL in that WebMCP-capable agent browser. Ask it to discover this page's tools, call `localdesign_list_skills`, and read `getting-started` with `localdesign_get_skill`. It edits the same document/history as you. Browser hosts may suffix canonical tool names: use the discovered names. The Connect agent dialog reports availability; there is no remote MCP server or API key flow. [Connection and parity guide](docs/webmcp.md).

Three self-contained static instruction packages ship with the app: getting-started, UI design/critique and typography. They include complete operational guidance and attribution, need no Agentic Workflows installation or runtime GitHub fetch, and remain readable offline after the app loads. Design content deliberately returned to an external agent is handled by that agent/provider; LocalDesign itself does not upload it.

### v0.1 limits

Native `.fig`, custom fonts, arbitrary SVG CSS/gradients/filters, vector booleans, components/variants, advanced constraints, multiplayer, comments, animation and prototyping are outside this release. The narrow safe SVG importer is not a general SVG round-trip engine. Native archives preserve the complete editable scene; use them for lossless LocalDesign editing. Paths retain their local path data when their bounds are resized. One document supports 100,000 nodes, 1,000 pages and 10,000 image assets. These are resource ceilings rather than format restrictions. Supported native designs stay within 64 MB UTF-8 metadata and a 120 MB combined portable content budget, so a successful native export fits the importer. Embedded raster images must decode and match their catalog dimensions. Inter 400/600/700 is bundled for Latin/extended Latin/Vietnamese; other scripts/emoji use system fallback with warnings and need visual verification. Browser working copies remain origin/device-local. History and retry receipts are memory-only and reset on reload/switch; export before clearing browser data.

## Develop

Use Node from `.nvmrc` (22.23.3) and npm. Dependencies are pinned by package-lock.json.

```sh
npm ci
npx playwright install chromium
npm run dev       # http://127.0.0.1:4179/LocalDesign/
npm run check     # production build, type/skills, unit and built-browser tests
```

The editor and preview bind loopback on port 4179. Stop an existing owned dev/preview server before running another on the same port. For an isolated test server alongside another checkout, use `LOCALDESIGN_TEST_PORT=4198 npm run check`; the default remains 4179. CI starts its own built preview. Use `npm run build` then `npm run preview` for the production app. No `.env` or external service is required.

Read [AGENTS.md](AGENTS.md) for repository-local skills. They are self-contained adaptations for development, diagnosis, review, UI design and evidence-based instruction improvement. `npm run check:skills` validates digests, response budgets, source provenance and local reference closure. Update the owning guidance and meaningful regression checks as project work reveals reusable lessons; never import document text as trusted agent instructions.

[Architecture decisions](docs/adr/README.md) · [Deployment/rollback](docs/deployment.md) · [Verification and limits](docs/verification.md) · [Third-party notices](THIRD_PARTY_NOTICES.md)

MIT © 2026 Wilson Le. Adapted Agentic Workflows guidance is MIT; bundled Inter is SIL OFL 1.1. Licenses/provenance accompany both source and runtime packages.
