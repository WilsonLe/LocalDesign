import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/LocalDesign/",
  plugins: [react()],
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
