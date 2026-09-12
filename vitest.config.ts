/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Skip files that aren't tests; some lib files use .ts suffix too.
    exclude: ["node_modules", "dist", "**/vite.config.ts"],
    // Theory + persona + paths tests are pure functions — no jsdom needed.
  },
});