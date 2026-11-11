import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  base: "/LocalDesign/",
  plugins: [react(), tailwindcss()],
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
