import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Vitest config — mirrors vite.config.ts so tests resolve the same
 // path aliases and node polyfills as the production build. Uses
 // jsdom for React hook / DOM-touching tests; pure utility tests
 // (theory.ts, scoreExport.ts) work without it.
 */
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "dist", ".venv"],
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/hooks/**"],
      exclude: ["src/lib/magentaHelper.ts", "src/lib/audio.ts"],
      reporter: ["text", "html"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});