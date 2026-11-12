---
name: localdesign-diagnosis
description: Use whenever fixing a bug, repeated test failure, broken import/export, storage problem or UI/agent inconsistency.
---

# Diagnosis

Reproduce the actual user symptom with a minimal disposable fixture. Trace the full path from UI/tool input through schema, command owner, layout, renderer/storage/export to the affected consumer. Record observed values separately from hypotheses. Inventory materially different causes: stale document/revision, locked/hidden ancestor, geometry/parent transforms, async document switch, font readiness, quota, invalid archives or unsupported SVG, optional WebMCP and asset paths.

For slowness, measure the built app with a disposable representative node/page/text distribution before and after. Match active-page text/glyph density as well as node count; measure mounted SVG/glyph elements, opening, panning and zoomed-out navigation. Trace repeated traversal, text shaping, mounted controls and gesture clones separately from capacity limits; check async readiness invalidation and index reuse across outer loops; verify offscreen navigation, saved edits and output after optimization.

Read current callers/invariants before patching. Find the earliest failed prerequisite; do not mask it with a later fallback or weaken checks. Change the smallest owner that fixes the cause, preserving atomic failure and current user work. Check sibling consumers that share that owner. Add a regression test for the supported failing scenario; a helper-only assertion does not prove visible behavior.

Run focused tests and the consumer-boundary journey for the original symptom and distinct relevant branches. A screenshot establishes appearance, not saved data or interoperability. For external failures distinguish measured failure, unavailable channel and unverified root cause. Resume at the failed prerequisite and preserve task-owned evidence. Use development for delivery and improvement for lessons.

## Self-improvement and attribution

Use [the improvement protocol](../improvement/SKILL.md) when work reveals reusable evidence. Inputs are the current request and repository source; successful completion includes the observable checks above. Missing required evidence stays explicit; resume from the existing issue and failing prerequisite.

Adapted v1.0.0 from `engineering-diagnosis`, Agentic Workflows at e29fcb3f80371841d529eaea047fa13619378563, Copyright (c) 2026 Wilson Le, MIT. Attribution only: https://github.com/WilsonLe/agentic-workflows . Required guidance is included here. [License](../../LICENSE).
