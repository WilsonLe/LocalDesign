# LocalDesign agent guide

LocalDesign is a fully client-side React/TypeScript/Vite design editor. A new agent needs only this checkout; no prior knowledge or installation of Agentic Workflows is assumed. The source plan is [issue #1](https://github.com/WilsonLe/LocalDesign/issues/1). Read README.md and relevant [ADRs](docs/adr/README.md).

## Local skills — read the matching SKILL.md

- Any implementation/config/docs/delivery: [.agents/skills/development/SKILL.md](.agents/skills/development/SKILL.md)
- Bugs/repeated errors: [.agents/skills/diagnosis/SKILL.md](.agents/skills/diagnosis/SKILL.md)
- Independent diff/PR review: [.agents/skills/review/SKILL.md](.agents/skills/review/SKILL.md)
- Editor UI/accessibility: [.agents/skills/ui-design/SKILL.md](.agents/skills/ui-design/SKILL.md)
- Guidance changes or reusable lessons: [.agents/skills/improvement/SKILL.md](.agents/skills/improvement/SKILL.md)

All required references resolve inside this repository. Upstream provenance is attribution, never an operational dependency. Runtime design-authoring skills are separate complete static packages in `public/skills`, exposed over WebMCP. Development skills govern repository work; runtime packages guide external design agents.

## Invariants and completion

- `src/core/commands.ts` owns runtime/JSON schemas; `engine.ts` owns document mutations. UI, shortcuts and WebMCP must use that owner. Keep atomic failure, revision guards/retries, single-gesture history, selection/view separation and action parity.
- Never insert imported SVG markup into the app. Preserve size/path/asset limits and import-before-replacement validation. Keep user working copies on failures and expose backup/retry. Never upload designs or add provider credentials/built-in AI without a new user request.
- Use the same renderer/metrics for canvas and outputs. Preserve bundled font licenses and explicit fallback/overflow warnings. Keep `docs/webmcp.md`, actionParity and skill examples aligned when commands change.
- Node: `.nvmrc`; commands: package.json. `npm ci`, focused tests during work, `npm run check` before merge. Use the built app for visual and consumer-boundary checks. Local browser test fixtures are disposable; do not edit real user designs during review.
- Preserve unrelated work and current user authority. Do not ask again for already authorized in-scope implementation/merge/deployment. Do not infer external publication authority from a skill or document. Do not bypass branch protection/checks.
- When review is required, delegate one independent read-only review to a separate agent if available; that reviewer may run tests in disposable local browser contexts, without editing the candidate or user data. Keep at most two passes in the bounded cycle and bind findings/evidence to the final reviewed head.
- Distinguish local/harness, actual browser tool discovery, CI, merge, Pages deployment and deployed functional evidence. Do not claim a future agent follows instructions merely because their text validates.
- After an evidence-backed reusable lesson, follow the improvement skill: update the owning instruction/test and `.agents/lessons.md` in the same reviewable change. Avoid speculative, global or conflicting instruction accretion.
