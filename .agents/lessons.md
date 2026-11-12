# Project lessons

Keep evidence-based lessons using the improvement skill. No speculative rules or private design content.

## 2026-11-12 — Creation defaults must not leak into patches

Trigger: renaming a frame in the first built-browser journey reset its width to the create default. Evidence: `tests/engine.test.ts` “updates only provided fields” and the manual canvas/inspector browser journey. Zod 4 applies inner defaults even when those fields are made optional with `.partial()`. Correction: remove creation defaults before making each update field optional; keep the command schema as the single owner. Scope: node/page partial updates, including UI and WebMCP. Verify an isolated name/fill edit preserves position, dimensions, text and typography; on resume rerun the named regression before changing another patch schema.

## 2026-11-12 — Test visible outputs and both sides of portable-file contracts

Trigger: independent PR #2 pass 1 found cropped group descendants, incorrect accepted SVG transform composition, native images validated by signature but not decoding, and an exporter/importer metadata-size mismatch. Evidence: `tests/browser/review-regressions.spec.ts`, native large-scene tests and document-budget regression. Correction: shared visible subtree bounds (respect clipping/hidden layers), compose SVG transforms at local origins, decode raster ingress before committing, and use shared round-trip budgets at document/edit/export/import boundaries. Scope: preview/SVG/PNG, fit/group geometry, native backups and UI/tool/clipboard raster ingress. Verify rendered pixels/dimensions and actual native export/reopen, not only the helper or magic bytes. Resume with the failing consumer-boundary case before changing another file-format contract.

## 2026-11-12 — Async UI acknowledgment must match the latest durable state

Trigger: Escape followed by blur used a stale field draft; queued saves could report saved while a newer snapshot was pending. Evidence: inspector-cancel and held-second-save/unload-protection browser regressions. Correction: suppress cancelled blur commits explicitly and count pending saves before acknowledging saved. Scope: inspector editing and workspace persistence status. Verify value/revision/history and the actual beforeunload consumer while the final save is delayed.

## 2026-11-12 — Recheck lifetime and byte identity at asynchronous commit boundaries

Trigger: independent PR #2 pass 2 held image decoding across tool retirement and found a delayed edit could still commit; a JPEG declared as PNG decoded successfully but produced a native file rejected on reopen. Evidence: asynchronous image-validation, waiting-to-save and declared-MIME browser regressions in `tests/browser/review-regressions.spec.ts`. Correction: check the combined caller/registration AbortSignal immediately after awaits and at workspace precommit boundaries; use one image-signature owner plus decode/dimension checks before tool/clipboard/import acceptance or native export. Scope: apply/dry-run, workspace create/open/delete/import/save-copy, and raster round trips. Verify both pagehide/restoration and caller cancellation with valid delayed bytes, plus wrong MIME and correct-format roundtrip controls. On resume, source-only early checks or successful decoding are insufficient evidence for these boundaries.

## 2026-11-12 — Carry an explicit review-budget extension through the task

User correction during PR #2: “yes, stop asking, review as many as you deem necessary.” This explicitly extends the default review-pass ceiling for this implementation and its in-scope fixes, merge and Pages delivery. Record that authority in the PR and continue proportionate review/fix verification without asking for the same review decision again. This is current-task authority, not permission for unrelated publication or global memory changes. Future tasks use their own user instructions and the review skill's default.
