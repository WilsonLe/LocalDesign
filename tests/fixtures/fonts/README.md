Licensed static fixtures for font ingress, glyph coverage, rendering and portable-file regressions. Downloaded 12 November 2026; kept offline for deterministic tests.

- `SourceSerif4-Regular.otf`: https://github.com/adobe-fonts/source-serif/blob/release/OTF/SourceSerif4-Regular.otf — Adobe, SIL OFL 1.1; full notice in [source-serif-4-OFL.txt](../../../public/source-serif-4-OFL.txt).
- `IBMPlexMono-Regular.ttf`: https://github.com/IBM/plex/blob/master/packages/plex-mono/fonts/complete/ttf/IBMPlexMono-Regular.ttf — IBM, SIL OFL 1.1; full notice in [ibm-plex-mono-OFL.txt](../../../public/ibm-plex-mono-OFL.txt).

WOFF/WOFF2 fixtures come from the pinned `@fontsource` dependencies. The fixtures contain no user designs or proprietary system fonts.

`shaping-reference.json` records independent unhinted advances from HarfBuzz 12.1.0 (uharfbuzz 0.51.7, fontTools 4.60.2), using the exact font-file SHA-256 values, unitsPerEm scale, guessed Latin/LTR segment properties and default OpenType features. fontTools decodes WOFF2 to sfnt before shaping. These offline values cover kerning and ligatures without depending on OS browser hinting; the runtime and test suite do not require Python or HarfBuzz. Regenerate deliberately from the declared toolchain when changing these font bytes, rather than copying LocalDesign's measured widths.
