import path from "path";
import { defineConfig } from "vitest/config";

/**
 * Files that need a DOM (React components, hooks using renderHook,
 * webAudio/canvas shims). The jsdom project runs exactly these; the
 * node project explicitly excludes them so nothing double-runs. A few
 * files carry a `// @vitest-environment jsdom` banner comment — vitest
 * 5 ignores per-file comments under multi-project mode, so the file
 * has to be opted in here instead. Keep this list in sync when adding
 * a DOM-touching test file.
 */
const JSDOM_FILES = [
  "src/components/**/*.test.tsx",
  "src/hooks/useFeedback.test.ts",
  "src/hooks/useSessionStore.test.ts",
  "src/lib/sheetMusicExport.test.ts",
  "src/lib/useCanvasSize.test.ts",
  "src/lib/backingTrack.test.ts",
  "tests/usePathGenerator.test.ts",
  "tests/useSessionStore.test.ts",
  "tests/useDDSPProbe.test.ts",
  "tests/useBassNotes.test.ts",
  "tests/webAudio.test.ts",
];

/**
 * Vitest config — mirrors vite.config.ts so tests resolve the same
 * path aliases and node polyfills as the production build. Uses
 * jsdom for React hook / DOM-touching tests; pure utility tests
 * (theory.ts, scoreExport.ts) work without it.
 *
 * vitest 5 dropped `environmentMatchGlobs`; per-file environments are
 * now expressed with the `projects` API (one project per environment,
 * each with its own `include`).
 */
export default defineConfig({
  test: {
    globals: true,
    // Shared across both projects below.
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/hooks/**"],
      exclude: ["src/lib/magentaHelper.ts", "src/lib/audio.ts"],
      reporter: ["text", "html"],
    },
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
          exclude: [
            "node_modules",
            "dist",
            "**/vite.config.ts",
            ".venv",
            ...JSDOM_FILES,
          ],
        },
      },
      {
        test: {
          name: "jsdom",
          environment: "jsdom",
          environmentOptions: {
            jsdom: {
              // Gives the DOM a real origin so window.localStorage is
              // well-defined (jsdom has no storage on about:blank).
              url: "http://localhost/",
            },
          },
          include: [...JSDOM_FILES],
        },
      },
    ],
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