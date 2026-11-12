import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  base: "/LocalDesign/",
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "pages-workspace-fallback",
      apply: "build",
      writeBundle(options) {
        const output = options.dir ?? "dist";
        copyFileSync(
          resolve(output, "index.html"),
          resolve(output, "404.html"),
        );
      },
    },
  ],
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
