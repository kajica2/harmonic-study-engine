/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    // Match per-test environment to per-file needs:
    //   - src/lib/**/*.test.ts  → node (pure logic)
    //   - src/components/**/*.test.tsx → jsdom (DOM)
    // Vitest's default `environment: "node"` is set above; per-file
    // overrides use the @vitest-environment comment at top of file.
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "dist", "**/vite.config.ts"],
    environmentMatchGlobs: [
      ["src/components/**/*.test.tsx", "jsdom"],
    ],
  },
});