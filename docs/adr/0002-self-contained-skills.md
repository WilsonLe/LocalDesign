# 0002 — Versioned self-contained skill adaptations

Status: accepted for v0.1 (issue #1 and the user's development-skill requirement).

Runtime design skills are read-only static packages in `public/skills`. Each embeds inputs, capability limits, tool mappings, schema-checkable examples, all required reference guidance, completion evidence, error/recovery/resume behavior and attribution. The pinned manifest records source commit, file inventory/disposition/digests and response budgets. A build check rejects stale digests, oversized packages and unresolved local references. The browser bundles instructions eagerly, so retrieval needs no upstream fetch or installed plugin.

Repository-development adaptations live separately in `.agents/skills`: development, diagnosis, review, UI design and instruction improvement. They are concise adaptations of the necessary methods, with operational dependencies rewritten to this repository. `.agents/provenance.json` and the manifest retain source ownership and exclusions; full upstream plugin orchestration is deliberately excluded. New agents need only this checkout. `AGENTS.md` is the navigation owner.

Self-improvement is evidence-based maintenance during authorized project work: record a real reusable failure/correction in `.agents/lessons.md`, update the owning guidance or deterministic check, and review/test it with the code. There is no background model, automatic source refresh, global memory mutation or instruction ingestion from imported designs. Runtime updates are explicit versioned reviewed releases.

Verification: closure/digest/budget checks plus example-schema tests and an actual browser authoring/export/reopen harness. These source checks prove packaging and contracts; they do not prove future agents always obey prose. Actual browser tool discovery and observed agent execution are reported separately.
