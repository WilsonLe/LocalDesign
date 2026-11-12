---
name: localdesign-development
description: Use whenever implementing, changing or delivering LocalDesign code, configuration, documentation or artifacts.
---

# Development

Read AGENTS.md, README.md and relevant docs/adr decisions. Inspect the current owner/callers before adding an abstraction. Resolve repository, branch, base, clean/dirty state and user authority. Preserve unrelated changes. Use an isolated feature branch/worktree from refreshed main. A new empty repository may bootstrap its baseline first.

Use a live issue as the outcome/acceptance owner. An approved linked plan plus an explicit implementation request authorizes its scoped implementation. Reuse settled decisions; ask only when a material unresolved choice blocks useful work. Write a concise plan of components, contracts, failure behavior, evidence and rollback. Keep one authoritative record; do not add a control-plane framework. Honor the user's explicit local-only, review-only and stop boundaries.

When changing project capacity, update the shared resource owner in `src/core/limits.ts` and its schema/import/clipboard/catalog consumers together. Verify a large native round trip and rejected replacement before recommending document splitting.

All edits flow through src/core/engine.ts and src/core/commands.ts. Keep scene validation, atomicity, monotonic revisions, idempotent retries, undo and UI/tool parity intact. Scene rendering and exports share src/render. Workspace persistence is src/storage; imports fully validate before replacement. No backend, design uploads, provider credentials or built-in agent.

Install with npm ci using .nvmrc. Use package.json for commands. Run focused meaningful tests as you work, then npm run check for merge (build/typecheck/skills, unit contracts, real-browser end-to-end). Freeze a clean committed head, push a linked draft PR, and obtain an independent read-only review. The review skill defines its report. Follow one bounded review/address cycle and recheck material fixes; do not invent a pass when no reviewer ran. No force pushes or bypass of checks/protection.

Before authorized merge, verify current base/head, full checks and review disposition. Before authorized GitHub Pages delivery, follow docs/deployment.md; verify active revision and deployed functionality. User implementation/merge/deployment instructions remain authority; local skills do not demand repeated approval for already authorized actions. Report local, CI, merge, deployment, manual browser and actual external-agent evidence distinctly. A harness is not proof of real browser discovery.

On failure preserve the first error and current work, apply diagnosis, retry the failing prerequisite before dependent work. On resume read the issue/PR and actual source, refresh stale evidence and continue the existing record. On completion update README/tool parity/ADR/skills affected by behavior; apply the improvement protocol below.

## Self-improvement and attribution

Use [the improvement protocol](../improvement/SKILL.md) when work reveals reusable evidence. Inputs are the current request and repository source; successful completion includes the observable checks above. Missing required evidence stays explicit; resume from the existing issue and failing prerequisite.

Adapted v1.0.0 from `standard-development-workflow`, Agentic Workflows at e29fcb3f80371841d529eaea047fa13619378563, Copyright (c) 2026 Wilson Le, MIT. Attribution only: https://github.com/WilsonLe/agentic-workflows . Required guidance is included here. [License](../../LICENSE).
