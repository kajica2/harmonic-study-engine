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
  "src/components/EffectiveKeyBadge.test.tsx",
  "src/components/GtCoverageRow.test.tsx",
  "src/components/TransposeControls.test.tsx",
  "src/hooks/useFeedback.test.ts",
  "src/hooks/useGuideToneTrail.test.ts",
  "src/hooks/useKeyDown.test.ts",
  "src/hooks/useSessionStore.test.ts",
  "src/lib/sheetMusicExport.test.ts",
  "src/lib/midiIn.test.ts",
  "src/lib/playbackClock.test.ts",
  "src/lib/useCanvasSize.test.ts",
  "src/lib/backingTrack.test.ts",
  // PRD-001 Phase 7 S2: backingEngine rest-mute bus pins (fake ctx on
  // window) + the mechanics panel DOM test. Vitest 5 IGNORES per-file
  // env comments - the list is the only opt-in (AGENTS gotcha).
  "src/lib/backingEngine.test.ts",
  "src/components/PracticeMechanicsPanel.test.tsx",
  // PRD-001 Phase 7 S3: the detection hook jsdom pins (synthetic
  // "midin" CustomEvents + explicit flushNow - the flush API is the
  // seam, the test NEVER starts a clock).
  "src/hooks/usePlayedCorrectly.test.ts",
  // PRD-001 Phase 7 S3 step 9: the latency wizard DOM pins (ModalShell
  // state machine, fake-timer roll, saveLatency roundtrip).
  "src/components/LatencyWizard.test.tsx",
  // PRD-001 Phase 7 S4: the synthetic note bus (window "midin"
  // dispatch pins) + the computer-keyboard listener pins. The new
  // component test NoteInputPiano.test.tsx is covered by the
  // components glob at the top - do NOT add it here twice.
  "src/lib/noteInputBus.test.ts",
  "src/hooks/useNoteInput.test.ts",
  "src/lib/storage.test.ts",
  "src/state/sessionStore.test.ts",
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
      include: ["src/lib/**", "src/hooks/**", "engine/**"],
      exclude: ["src/lib/magentaHelper.ts", "src/lib/audio.ts"],
      reporter: ["text", "html"],
    },
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}", "engine/**/*.test.ts"],
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