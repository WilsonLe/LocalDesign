---
name: localdesign-improvement
description: Use whenever changing agent guidance or when project work reveals a repeatable mistake, missing command, stale skill or recovery lesson.
---

# Improvement

The user's request authorizes project-local guidance to improve as agents work; it does not authorize global memory edits or an autonomous background service. Keep rules authoritative in one owner: AGENTS.md for always-needed navigation; a SKILL.md for a task method; code/tests for mechanical contracts. Inspect the current owner before adding another file.

Retain a lesson only when supported by a real failure, repeated navigation problem, user correction or validated capability change. Record it in .agents/lessons.md with date, trigger, evidence (test/issue/PR), correction, scope and a verification/resume check. Distinguish a hypothesis from a proven fix. Do not retain secrets, customer designs or raw session transcripts. Update the owning skill or command when the lesson has a concrete reusable action; avoid append-only contradictory rules.

Descriptions must name when to use the skill. Required references must resolve inside this repository; optional external attribution is never an execution dependency. Each skill names inputs, method, observable completion, failure and resume. Walk through a realistic request (including failure/resume) after changing it. Run npm run check:skills for closure, budget and digests plus affected behavioral checks. Source checks do not prove a future agent follows the instructions.

Runtime skills in public/skills are immutable within a release. To refresh: inspect the desired upstream commit and license, adapt dependencies to actual LocalDesign capabilities, update sourceInventory/disposition/provenance, bump bundle and adaptation versions, recompute manifest bytes/SHA256 using node scripts/check-skills.mjs --update (only after review of intentional edits), and run skill contract plus browser cold-start tests. Never fetch latest at runtime or silently drop unsupported requirements. Development skills have their own adaptation version/provenance in .agents/provenance.json. Do not claim equivalence to unimplemented upstream tools.

Finish with concise evidence, changed guidance and remaining limits. On resume read existing lessons/issue before adding duplicates; supersede an obsolete lesson with a reason rather than erasing its evidence.

## Self-improvement and attribution

Use [the improvement protocol](../improvement/SKILL.md) when work reveals reusable evidence. Inputs are the current request and repository source; successful completion includes the observable checks above. Missing required evidence stays explicit; resume from the existing issue and failing prerequisite.

Adapted v1.0.0 from `agent-instruction-design`, Agentic Workflows at e29fcb3f80371841d529eaea047fa13619378563, Copyright (c) 2026 Wilson Le, MIT. Attribution only: https://github.com/WilsonLe/agentic-workflows . Required guidance is included here. [License](../../LICENSE).
