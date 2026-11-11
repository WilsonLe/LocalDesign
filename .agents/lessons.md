# Project lessons

Keep evidence-based lessons using the improvement skill. No speculative rules or private design content.

## 2026-11-12 — Creation defaults must not leak into patches

Trigger: renaming a frame in the first built-browser journey reset its width to the create default. Evidence: `tests/engine.test.ts` “updates only provided fields” and the manual canvas/inspector browser journey. Zod 4 applies inner defaults even when those fields are made optional with `.partial()`. Correction: remove creation defaults before making each update field optional; keep the command schema as the single owner. Scope: node/page partial updates, including UI and WebMCP. Verify an isolated name/fill edit preserves position, dimensions, text and typography; on resume rerun the named regression before changing another patch schema.

## 2026-11-12 — Test visible outputs and both sides of portable-file contracts

Trigger: independent PR #2 pass 1 found cropped group descendants, incorrect accepted SVG transform composition, native images validated by signature but not decoding, and an exporter/importer metadata-size mismatch. Evidence: `tests/browser/review-regressions.spec.ts`, native large-scene tests and document-budget regression. Correction: shared visible subtree bounds (respect clipping/hidden layers), compose SVG transforms at local origins, decode raster ingress before committing, and use shared round-trip budgets at document/edit/export/import boundaries. Scope: preview/SVG/PNG, fit/group geometry, native backups and UI/tool/clipboard raster ingress. Verify rendered pixels/dimensions and actual native export/reopen, not only the helper or magic bytes. Resume with the failing consumer-boundary case before changing another file-format contract.

## 2026-11-12 — Async UI acknowledgment must match the latest durable state

Trigger: Escape followed by blur used a stale field draft; queued saves could report saved while a newer snapshot was pending. Evidence: inspector-cancel and held-second-save/unload-protection browser regressions. Correction: suppress cancelled blur commits explicitly and count pending saves before acknowledging saved. Scope: inspector editing and workspace persistence status. Verify value/revision/history and the actual beforeunload consumer while the final save is delayed.
