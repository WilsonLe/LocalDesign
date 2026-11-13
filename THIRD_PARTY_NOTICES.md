# Third-party notices

Agentic Workflows design and development guidance is adapted from https://github.com/WilsonLe/agentic-workflows at e29fcb3f80371841d529eaea047fa13619378563. Source/disposition digests are in public/skills/manifest.json. Runtime guidance is embedded, with host commands and unavailable tools explicitly replaced or excluded. Development adaptations and improvement protocol are under .agents.

MIT License

Copyright (c) 2026 Wilson Le

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Inter

Inter by Rasmus Andersson, distributed via @fontsource/inter 5.3.0, SIL Open Font License 1.1. Full font license: public/fonts-OFL.txt. Bundled static 400/600/700 normal/italic Latin/Latin extended/Vietnamese WOFF2 subsets. Other scripts are not guaranteed.

Other npm dependencies retain their packaged licenses in the lockfile-resolved distributions.

## LocalCut shadcn/Base UI component and theme adaptation

`src/components/ui/button.tsx`, `input.tsx`, `textarea.tsx` and `src/theme.css` adapt the corresponding generated shadcn base-vega components and neutral tokens from https://github.com/WilsonLe/LocalCut at `4e30e849d12ee845d5d3d5b3dd6db78a953632c1`. Copyright (c) 2026 Wilson Le and LocalCut contributors, MIT; the complete notice ships in `public/notices/LocalCut-MIT.txt`. Dialog/native-select wrappers use Base UI and the same shadcn component ownership pattern. LocalDesign keeps disabled actions visible and uses its own supported editor geometry. Its monochrome rounded-square drafting mark follows the same line-art treatment as LocalCut’s scissors mark. The shadcn CLI is not a runtime/build requirement for these checked-in components. Pinned Base UI, Tailwind, class-variance-authority and cn dependencies retain their packaged licenses.

## Source Serif 4 and IBM Plex Mono

Source Serif 4 by Adobe, via @fontsource/source-serif-4 5.3.1, and IBM Plex Mono by IBM, via @fontsource/ibm-plex-mono 5.3.0, SIL OFL 1.1. Full licenses: public/source-serif-4-OFL.txt and public/ibm-plex-mono-OFL.txt. Source Serif 4 includes 400/600/700 normal/italic; IBM Plex Mono includes 400/700 normal/italic; Latin/extended Latin/Vietnamese subsets. Static upstream OTF/TTF test fixtures retain their OFL notices and source pointers in tests/fixtures/fonts/README.md.

## Font parsing and identity

Fontkit 3.0.0 by Devon Govett, MIT (https://github.com/foliojs/fontkit); static TTF/OTF/WOFF/WOFF2 readers and glyph shaping/outlines are used; input collections, variable and color fonts are rejected. Full MIT notice: public/fontkit-LICENSE.txt. @noble/hashes 2.4.0 by Paul Miller, MIT (https://github.com/paulmillr/noble-hashes), supplies SHA-256 content identity. Full MIT notice: public/noble-hashes-LICENSE.txt. Package licenses are retained in their distributions.

## Fast bundled-font shaping

harfbuzzjs 1.6.4 (https://github.com/harfbuzz/harfbuzzjs), MIT, packages the HarfBuzz WASM shaping engine. Full notices ship in public/harfbuzzjs-LICENSE.txt and public/harfbuzz-LICENSE.txt. It operates locally on the existing validated bundled font bytes; Fontkit retains outline parsing and the fallback shaping path.

## Local vector PDF export

jsPDF 4.2.1 (https://github.com/parallax/jsPDF) and svg2pdf.js 2.9.0 (https://github.com/yWorks/svg2pdf.js), MIT, convert LocalDesign's own outlined SVG into local PDF pages. They are loaded only for PDF output; design content is not sent to a service. Font outlines and scene geometry still come from the shared renderer. Full notices ship in public/jspdf-LICENSE.txt and public/svg2pdf-LICENSE.txt; transitive packages retain their packaged notices.

## Bundled native icons

48 icons from lucide-react 1.72.0, https://github.com/lucide-icons/lucide, Copyright (c) 2026 Lucide Icons and Contributors, ISC. Listed Feather-derived icons also retain the MIT notice, Copyright (c) 2013-present Cole Bemis. The complete combined notice ships in public/lucide-LICENSE.txt and src/icons/catalog.json. scripts/build-icons.mjs converts only the explicit pinned inventory into native path geometry; the build verifies both data and notice against the installed lockfile-pinned source. Native nodes retain the notice, and local SVG/PNG/JPEG/PDF outputs include deduplicated attribution metadata.

## Optional local MCP companion

The Node-only companion uses pinned `@modelcontextprotocol/server` 2.4.0 and `@modelcontextprotocol/client` 2.4.0 (Apache-2.0), from https://github.com/modelcontextprotocol/typescript-sdk, and `ws` 8.23.0 (MIT), from https://github.com/websockets/ws. Complete licenses/NOTICE files accompany the installed packages in node_modules; these packages are not imported into the browser bundle. The client SDK is used by interoperability acceptance tests. The application retains its own MIT license.
