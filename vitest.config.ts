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
      // `@magenta/music@1.23.1` declares `main: es5/index.js` in its
      // package.json but that file is missing from the installed
      // bundle — only `esm/index.js` is shipped. Vitest's bare
      // resolver fails on the missing entry; aliasing to the ESM
      // barrel fixes it. The production Vite config handles this
      // differently via nodePolyfills.
      "@magenta/music": path.resolve(__dirname, "node_modules/@magenta/music/esm/index.js"),
    },
  },
});