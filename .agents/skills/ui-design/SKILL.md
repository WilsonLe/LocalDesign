---
name: localdesign-ui-design
description: Use whenever creating or changing LocalDesign UI, editor controls, responsive layout or accessibility.
---

# Ui Design

Start from role, task and next useful action. Preserve LocalCut’s shadcn base-vega/Base UI controls, shared neutral theme tokens and monochrome line-art branding, plus the theme-following blank dotted canvas (explicit page paints remain document content), compact file controls, page/layers navigation, contextual inspector and solid floating tools unless the user changes the product direction. Do not insert starter designs without user action. Every visible control needs a purpose and a matching shared operation.

Extend `src/components/ui` for shared controls and `src/theme.css` for tokens; keep editor geometry inside `src/style.css`’s components cascade layer, below the shared control utilities. Use component variants/sizes for control appearance; never add raw controls, direct Base UI imports outside that owner, browser prompts or unlayered editor CSS. Run `npm run check:ui` to enforce this boundary. New blank pages use the existing `none` paint so their surface follows the selected light/dark app theme without recoloring artwork or exports. Keep the interface free of small explanatory meta text (taglines, helper paragraphs, export-format descriptions and decorative footer metadata and the workspace branding section above Pages), per the user’s UI direction. Keep actionable errors, save/connection state, field labels and explicit help/connection instructions. Use concise labels, alignment/whitespace and a small token set before containers/decorations. Keep status/recovery visible; reveal relevant properties with selection. Make drawers reachable on narrow screens and preserve input/selection. Use semantic buttons/inputs, labels, visible focus, keyboard dismissal and non-hover access. Color is not the only signal. Shared dialogs must label and restore focus; controls cannot trigger global canvas shortcuts while being edited.

Before coding outline empty/populated/error/selection states. Verify the rendered built app at wide, intermediate and narrow widths (including both sides of changed breakpoints and individual control bounds), actual controls, keyboard/focus and target sizes. Screenshots prove appearance only; separately verify saved edits and file output. Include a current screenshot when handing off a UI change. For authored designs, prefer semantic section names and a Layers tree matching top-to-bottom canvas reading order (left-to-right within a row, stable ties). Inspect the tree alongside the canvas before finishing; preserve intentional organization, scene stacking, hierarchy and auto-layout. Panel display order must remain separate from scene order. Use the runtime ui-design package for composition/finishing guidance; all its instructions are embedded in public/skills/ui-design.md. Apply improvement after supported discoveries.

## Self-improvement and attribution

Use [the improvement protocol](../improvement/SKILL.md) when work reveals reusable evidence. Inputs are the current request and repository source; successful completion includes the observable checks above. Missing required evidence stays explicit; resume from the existing issue and failing prerequisite.

Adapted v1.0.2 from `ui-design`, Agentic Workflows at e29fcb3f80371841d529eaea047fa13619378563, Copyright (c) 2026 Wilson Le, MIT. Attribution only: https://github.com/WilsonLe/agentic-workflows . Required guidance is included here. [License](../../LICENSE).
