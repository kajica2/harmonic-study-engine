import path from "path";
import { defineConfig } from "vitest/config";

/**
 * Vitest config — mirrors vite.config.ts so tests resolve the same
 * path aliases and node polyfills as the production build. Uses
 * jsdom for React hook / DOM-touching tests; pure utility tests
 * (theory.ts, scoreExport.ts) work without it.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Match per-test environment to per-file needs:
    //   - src/lib/**/*.test.ts and tests/**/*.test.ts → node (pure logic)
    //   - src/components/**/*.test.tsx → jsdom (DOM)
    // Vitest's default `environment: "node"` is set above; per-file
    // overrides use the @vitest-environment comment at top of file,
    // or fall back to the environmentMatchGlobs mapping below.
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "dist", "**/vite.config.ts", ".venv"],
    setupFiles: ["./tests/setup.ts"],
    environmentMatchGlobs: [
      ["src/components/**/*.test.tsx", "jsdom"],
      // Hook tests that use @testing-library/react's renderHook need a DOM
      ["tests/usePathGenerator.test.ts", "jsdom"],
      ["tests/useSessionStore.test.ts", "jsdom"],
      ["tests/useDDSPProbe.test.ts", "jsdom"],
      ["tests/useBassNotes.test.ts", "jsdom"],
      // webAudio shim is read off window.AudioContext
      ["tests/webAudio.test.ts", "jsdom"],
    ],
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
      "@magenta/music": path.resolve(
        __dirname,
        "node_modules/@magenta/music/esm/index.js",
      ),
    },
  },
});
