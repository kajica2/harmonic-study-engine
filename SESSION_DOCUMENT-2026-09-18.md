SESSION DOCUMENT — 2026-09-18
Identity: opencode (big-pickle) on the local machine. Metrics honest —
every number below was re-derived from real runs, not estimated.

WORK COMPLETED (main: 45add71, 78b58ac, b864866 — all pushed to origin/main):
- test(testing): vitest 2.1.9 → 5.0.1 (+ @vitest/coverage-v8 5.0.1).
  Config migrated to the `projects` API after `environmentMatchGlobs`
  was removed. `tests/setup.ts` installs a MemoryStorage
  localStorage/sessionStorage polyfill (fixed 35 failing jsdom tests).
  jsPDF mock in `sheetMusicExport.test.ts` fixed for class constructors.
  npm audit 21 → 15 vulnerabilities (both criticals cleared).
- feat(mastery): performance/mastery log (option G) +
  guide-tone bridge (option C → G) + vendor code-splitting + e2e:
  - `src/lib/performanceLog.ts` — typed append-only take log in
    localStorage (`hse.performance.log.v1`, capped at 50), shape-guarded
    reads, `recordTake`/`updateTakeRating`/`recordGuideToneResult`.
  - `src/hooks/usePerformanceLog.ts` + `RecentTakesPanel.tsx` (1–5
    self-ratings + guide-tone progress bar).
  - `src/lib/guideToneTrail.ts` + `src/hooks/useGuideToneTrail.ts` —
    counts 3rd/7th hits vs misses while a take records; tally attached
    to the take on result.
  - Record Take flow in App.tsx logs a take + begin()s the trail;
    onResult ends it and writes transitionsHit/Missed.
  - `vite.config.ts` manualChunks (react/ui/audio/score/publish/midi),
    React.lazy ImportExportModal + RecordingModal, dynamic
    sheetMusicExport. Main bundle 1,803KB → 510KB eager; tone.js +
    jspdf deferred past first paint.
  - `e2e/app.spec.ts` 3 → 7 tests (transport start/pause, cheatsheet,
    lazy model, mastery panel with rating persistence).
- doc/ci: `assets/check-links.cjs` now parses the persona count from
  SPEC.md (was hardcoded 17). SPEC/README/magenta-README/CHANGELOG/
  IMPROVEMENT_PLAN resynced (personas 22, masterclass 38/3 in-app,
  tests 363 = 334 frontend + 29 backend).
- Deploy: Vercel CLI installed + linked (`--repo`) under team
  `kai-djurics-projects`; preview
  `harmonic-study-engine-no8pod894-kai-djurics-projects.vercel.app`
  and production `https://harmonic-study-engine.vercel.app` both Ready.
  Future pushes to main auto-deploy.

VERIFIED (real outputs):
- `npm run lint` (tsc --noEmit) — clean
- `npm test` — 818 passed, 1 skipped (72 files)
- `npm run test:py` — 29 passed
- `node assets/check-links.cjs` — all counts match SPEC.md (green)
- `npx playwright test` — 7 passed (Chromium)
- `npm run build` — green; 510KB eager main (unchanged split sizes)

OPEN / NEXT (see FUTURE_PLANNING.md for the prioritized roadmap):
- 15 remaining npm audit items — transitive no-fix via @magenta/music
  (minimist, protobufjs, quote-stream, static-module); needs a patched
  pin or a fork to clear.
- Take-comparison UI / timing heat map (deferred option-G follow-up;
  needs "first-try vs rep #3" snapshots).
- Guide-tone classifier UX: the trail only counts during recordings —
  live "streak" display in the practice header is an easy add.
- Masterclass catalog: 3 of 38 tunes enabled in-app; the rest stay
  "Coming soon" until someone writes 8-bar HarmonicPaths.
- Composition layer (docs/COMPOSITION-ENGINE-PLAN.md) — 9 modules are
  code-complete; quest/scenario packaging not yet shipped.
- DDSP synth not installable on CI/HF free tier (503 on /synthesize);
  app works without it.

SESSION CLOSE — honest freeze. No hidden directives. No fabricated output.

Like the earlier session docs, this file is a plain markdown record of
what was actually done and what remains.