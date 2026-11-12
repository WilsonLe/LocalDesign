---
name: localdesign-ui-design
description: Use whenever creating or changing LocalDesign UI, editor controls, responsive layout or accessibility.
---

# Ui Design

Start from role, task and next useful action. Preserve LocalCut’s shadcn base-vega/Base UI controls, shared neutral theme tokens and monochrome line-art branding, plus the dark dotted document canvas, compact file controls, page/layers navigation, contextual inspector and solid floating tools unless the user changes the product direction. Do not insert starter designs without user action. Every visible control needs a purpose and a matching shared operation.

Extend `src/components/ui` for shared controls and `src/theme.css` for tokens; keep editor geometry in `src/style.css`. Keep the interface free of small explanatory meta text (taglines, helper paragraphs, export-format descriptions and decorative footer metadata), per the user’s UI direction. Keep actionable errors, save/connection state, field labels and explicit help/connection instructions. Use concise labels, alignment/whitespace and a small token set before containers/decorations. Keep status/recovery visible; reveal relevant properties with selection. Make drawers reachable on narrow screens and preserve input/selection. Use semantic buttons/inputs, labels, visible focus, keyboard dismissal and non-hover access. Color is not the only signal. Native dialogs must label and restore focus; controls cannot trigger global canvas shortcuts while being edited.

Before coding outline empty/populated/error/selection states. Verify the rendered built app at wide, intermediate and narrow widths, actual controls, keyboard/focus and target sizes. Screenshots prove appearance only; separately verify saved edits and file output. Include a current screenshot when handing off a UI change. Use the runtime ui-design package for composition/finishing guidance; all its instructions are embedded in public/skills/ui-design.md. Apply improvement after supported discoveries.

## Self-improvement and attribution

Use [the improvement protocol](../improvement/SKILL.md) when work reveals reusable evidence. Inputs are the current request and repository source; successful completion includes the observable checks above. Missing required evidence stays explicit; resume from the existing issue and failing prerequisite.

Adapted v1.0.0 from `ui-design`, Agentic Workflows at e29fcb3f80371841d529eaea047fa13619378563, Copyright (c) 2026 Wilson Le, MIT. Attribution only: https://github.com/WilsonLe/agentic-workflows . Required guidance is included here. [License](../../LICENSE).
