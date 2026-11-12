import f400 from "@fontsource/inter/files/inter-latin-400-normal.woff2?url";
import f600 from "@fontsource/inter/files/inter-latin-600-normal.woff2?url";
import f700 from "@fontsource/inter/files/inter-latin-700-normal.woff2?url";
import e400 from "@fontsource/inter/files/inter-latin-ext-400-normal.woff2?url";
import e600 from "@fontsource/inter/files/inter-latin-ext-600-normal.woff2?url";
import e700 from "@fontsource/inter/files/inter-latin-ext-700-normal.woff2?url";
import v400 from "@fontsource/inter/files/inter-vietnamese-400-normal.woff2?url";
import v600 from "@fontsource/inter/files/inter-vietnamese-600-normal.woff2?url";
import v700 from "@fontsource/inter/files/inter-vietnamese-700-normal.woff2?url";
export const fonts = [
  ...[f400, f600, f700].map((url, i) => ({
    url,
    weight: [400, 600, 700][i],
    subset: "latin",
    range:
      "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  })),
  ...[e400, e600, e700].map((url, i) => ({
    url,
    weight: [400, 600, 700][i],
    subset: "latin-ext",
    range:
      "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
  })),
  ...[v400, v600, v700].map((url, i) => ({
    url,
    weight: [400, 600, 700][i],
    subset: "vietnamese",
    range:
      "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB",
  })),
];
export const fontCatalog = {
  id: "inter",
  family: "Inter",
  weights: ["400", "600", "700"],
  style: "normal",
  scripts: ["Latin", "Latin extended", "Vietnamese"],
  license: "SIL Open Font License 1.1",
  limitations:
    "Other scripts and emoji use system fallback. Imported fonts are not supported in v0.1. Inspect the rendered text; fallback fidelity is not guaranteed.",
};
export function fontCSS(urls: string[] = fonts.map((f) => f.url)) {
  return fonts
    .map(
      (f, i) =>
        `@font-face{font-family:Inter;font-style:normal;font-weight:${f.weight};font-display:block;src:url('${urls[i]}') format('woff2');unicode-range:${f.range};}`,
    )
    .join("\n");
}
let ready: Promise<void> | undefined;
export function fontsReady() {
  return (ready ??= (async () => {
    if (typeof document === "undefined") return;
    const style = document.createElement("style");
    style.textContent = fontCSS();
    document.head.appendChild(style);
    await Promise.all(
      [400, 600, 700].map((w) =>
        document.fonts.load(`${w} 16px Inter`, "LocalDesign Tiếng Việt"),
      ),
    );
    await document.fonts.ready;
  })());
}
let loaded: Promise<Uint8Array[]> | undefined;
export function fontBytes() {
  return (loaded ??= Promise.all(
    fonts.map(async (f) => {
      const r = await fetch(f.url);
      if (!r.ok)
        throw new Error(
          "Bundled font could not be loaded. Reload before exporting.",
        );
      return new Uint8Array(await r.arrayBuffer());
    }),
  ));
}
export function base64(bytes: Uint8Array) {
  let str = "";
  for (let i = 0; i < bytes.length; i += 8192)
    str += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(str);
}
