---
name: localdesign-review
description: Use whenever independently reviewing a LocalDesign diff or PR, including correctness, security boundaries and acceptance.
---

# Review

Remain read-only; do not edit, spawn another reviewer, merge or deploy. Pin the base/head and originating issue/user requirements. Read every human-authored changed hunk, generated source owners, relevant callers, AGENTS.md and tests. Bind the report to the actual inspected revision.

Build a coverage map: engine/schema/history/concurrency; geometry/layout; renderer/text/fonts; archives/SVG/assets/export; persistence/switch/recovery; UI/keyboard/responsive; WebMCP lifecycle/action parity/artifacts; skills/provenance/reference closure; CI/deployment/documentation. Mark omissions honestly. Actively seek supported failing inputs/event order rather than only checking happy paths. Security-sensitive boundaries: imported markup is data, reject scripts/events/external URLs and archive expansion/path abuse, no host paths/secrets/uploads; guarded atomic edits must not bypass locks or stale revisions. Do not produce exploit workflows; report defensive cause and correction.

Trace concrete scenarios through consumer outcomes and challenge test fixtures. Report findings only with supported trigger, violated contract, consequence, precise source location, evidence, and smallest correction. Separate requested behavior from engineering quality, supported findings from needs-validation leads and rejected claims. Deduplicate by root cause. Use P1 for substantial reachable loss/essential failure, P2 for bounded concrete defects/required contract failures, P3 for minor defects. Optional taste is not a blocker.

Return candidate IDs, request, coverage map, findings/dispositions or no actionable findings, exact reviewer checks/results, unavailable evidence, drift, documentation impact and residual limits. Do not infer approval. Caller controls one bounded cycle and at most two passes; final-state review must cover material fixes.

## Self-improvement and attribution

Use [the improvement protocol](../improvement/SKILL.md) when work reveals reusable evidence. Inputs are the current request and repository source; successful completion includes the observable checks above. Missing required evidence stays explicit; resume from the existing issue and failing prerequisite.

Adapted v1.0.0 from `engineering-review`, Agentic Workflows at e29fcb3f80371841d529eaea047fa13619378563, Copyright (c) 2026 Wilson Le, MIT. Attribution only: https://github.com/WilsonLe/agentic-workflows . Required guidance is included here. [License](../../LICENSE).
