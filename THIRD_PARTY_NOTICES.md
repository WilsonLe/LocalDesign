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

Inter by Rasmus Andersson, distributed via @fontsource/inter 5.3.0, SIL Open Font License 1.1. Full font license: public/fonts-OFL.txt. Bundled static 400/600/700 Latin/Latin extended/Vietnamese WOFF2 subsets. Other scripts are not guaranteed.

Other npm dependencies retain their packaged licenses in the lockfile-resolved distributions.

## LocalCut shadcn/Base UI component and theme adaptation

`src/components/ui/button.tsx`, `input.tsx`, `textarea.tsx` and `src/theme.css` adapt the corresponding generated shadcn base-vega components and neutral tokens from https://github.com/WilsonLe/LocalCut at `4e30e849d12ee845d5d3d5b3dd6db78a953632c1`. Copyright (c) 2026 Wilson Le and LocalCut contributors, MIT; the complete notice ships in `public/notices/LocalCut-MIT.txt`. Dialog/native-select wrappers use Base UI and the same shadcn component ownership pattern. LocalDesign keeps disabled actions visible and uses its own supported editor geometry. Its monochrome rounded-square drafting mark follows the same line-art treatment as LocalCut’s scissors mark. The shadcn CLI is not a runtime/build requirement for these checked-in components. Pinned Base UI, Tailwind, class-variance-authority and cn dependencies retain their packaged licenses.
