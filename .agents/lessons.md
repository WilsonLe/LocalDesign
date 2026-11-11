# Project lessons

Keep evidence-based lessons using the improvement skill. No speculative rules or private design content.

## 2026-11-12 — Creation defaults must not leak into patches

Trigger: renaming a frame in the first built-browser journey reset its width to the create default. Evidence: `tests/engine.test.ts` “updates only provided fields” and the manual canvas/inspector browser journey. Zod 4 applies inner defaults even when those fields are made optional with `.partial()`. Correction: remove creation defaults before making each update field optional; keep the command schema as the single owner. Scope: node/page partial updates, including UI and WebMCP. Verify an isolated name/fill edit preserves position, dimensions, text and typography; on resume rerun the named regression before changing another patch schema.
