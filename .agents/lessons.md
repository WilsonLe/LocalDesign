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

## 2026-11-12 — Remove explanatory UI meta text

User correction in PR #2: remove all small description text, including the browser-storage paragraph. Removed helper paragraphs, taglines, format descriptions and decorative footer metadata across canvas, panels and dialogs; removed the entire workspace branding section above Pages after the user’s explicit follow-up; retained labels, state, actionable errors and explicit help/connection instructions. The UI skill owns this project direction. Verify the built empty/editor/dialog states and export controls after copy changes; avoid reintroducing helper copy in future UI work.

## 2026-11-12 — Drawer actions need their own space

Removing the workspace branding block exposed a mobile overlap: the absolute Close layers control intercepted Add page. Independent PR #3 review reproduced the normal click failure at 390 × 844. Reserve heading space for drawer dismissal independently of decorative sections; the existing narrow-screen browser journey now clicks Add page and verifies Page 2 before closing. Recheck real hit targets whenever removing adjacent header content.

## 2026-11-12 — Put consumer browser preferences in exposed skills

Trigger: the user clarified that the built-in browser preference must guide users' external agents, rather than only the current development session. Evidence: issue #4 and the served-package assertions in `tests/browser/agent.spec.ts`. Correction: include built-in browser first, explicit user/attached-tab precedence, observed fallback reasons, discovery retry and browser-local working-copy preservation in every self-contained runtime package. Scope: `public/skills`, its versioned manifest and connection documentation; no global memory or host browser policy. Verify the built-app cold-start journey returns the preference in all three packages and preserves revision/history on reads. On resume, inspect the served bundle version before claiming the change is available. Packaging checks do not establish future agent compliance.

## 2026-11-12 — Derive deployed skill identity from the manifest

Trigger: PR #5 pre-merge inspection found the Pages workflow hardcoded skill bundle 1.0.0 while the reviewed manifest had advanced to 1.0.1. Correction: the release-identity command reads application and skill versions from their owning manifests. Evidence: `tests/skills.test.ts` executes the actual workflow command with distinct fixture versions and checks the generated release.json. Scope: Pages release metadata; no document schema change. Verify deployed release.json against the merged SHA and manifest; on resume do not treat an old hardcoded release label as proof of the served bundle.

## 2026-11-12 — Keep project capacity in one owner

Trigger: the Silebot set was split into 14 documents to work around 4,000-node/100-page/100-asset limits; combining it also exposed the independent 220-entry archive cap and 30 MB portable budget. Evidence: issue #7, `tests/large-document.test.ts` and the large-document browser journey. Correction: count, archive and byte limits share `src/core/limits.ts`, and all ingress, command, clipboard and catalog consumers use those values. Preserve finite resource, image, path and atomic replacement safeguards. Verify large native import/edit/save/export/reopen and rejection recovery; do not claim that a higher schema ceiling establishes performance on every device.

## 2026-11-12 — Layer navigation and reading order are view concerns

Trigger: issue #10 identifies that Layers selection can leave artwork offscreen and asks for semantic reading order without changing composition. Correction: layer activation alone requests world-bounds focus through the existing viewport owner; regular selection remains unchanged. The panel sorts sibling display by world origin with stable ties, independently of scene paint/auto-layout order. Runtime packages and the local UI skill require inspecting the tree alongside the canvas, preserving intentional organization. Evidence: `tests/browser/layers.spec.ts` checks offscreen tall-page and larger-workspace navigation, nested rotation, visible subtree/clipped bounds, controls, selection/history and responsive drawers; served skill checks cover all shared copies. Scope: Layers UI/view state and authoring guidance. Resume with the built-app narrow/wide journey and compare nodes, revision/history and overlap before/after; a sorted array alone does not prove artwork is visible or unchanged. The full suite caught a resize fixture tied to the old initial camera; gesture checks now locate the rendered handle after layer activation instead of assuming screen coordinates.

Independent PR #11 review also reproduced Space/Shift+Space being intercepted by the canvas and disabled-collapse clicks passing through into row activation. Restrict Space-pan interception to canvas/body targets and retain a hit target around disabled auxiliary controls. The layer browser regression now uses real pointer coordinates on that disabled area and checks Space activation plus canvas panning separately.
