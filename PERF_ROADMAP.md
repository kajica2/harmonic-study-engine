# PERF_ROADMAP — Vercel React Best Practices, applied progressively

Guide: the 8 Vercel React Best Practices rule categories, mapped onto this
codebase (React 19 SPA + FastAPI backend — **no Next.js/RSC**, so the
`server-*` category is N/A). Status as of 2026-09-18, grounded in current
code. Companion docs: `IMPLEMENTED` markers cross-checked at each merge.

Legend: ✅ shipped · ◐ partially done · ☐ queued · N/A not applicable

## Baseline (verified)

```
lint        tsc --noEmit            clean
frontend    818 passed / 1 skipped  (72 files)
e2e         7 passed
gate        node assets/check-links.cjs  green (363 tests)
build       vite build              green (510KB eager main)
```

---

## Phase 1 — Bundle Size Optimization (`bundle-*`) · CRITICAL

Mostly shipped under the "vendor code-splitting" commit. Remaining item
is perceived-speed preloading.

| Rule | Status | Evidence / work |
|------|--------|-----------------|
| `bundle-barrel-imports` | ✅ | No barrel imports; `src/magenta/index.ts` unused & not imported |
| `bundle-dynamic-imports` | ✅ | `ImportExportModal`/`RecordingModal` = `lazy()`; `SetEditor` loaded on demand; `@magenta/music` + `sheetMusicExport` behind `import()` |
| `bundle-conditional` | ✅ | Magenta loads only on "Generate"; DDSP probe is opt-in |
| `bundle-analyzable-paths` | ✅ | All dynamic imports use static string literals (no template paths) |
| `bundle-defer-third-party` | ☐ | Check RUM/timing scripts post-hydrate (currently none) — keep future analytics `requestIdleCallback`-gated |
| `bundle-preload` | ☐ | `<link rel="preload">` / hover-preload the Magenta chunk on first hover of the generator button (`App.tsx` gen button) |

**Effort:** 0.5–1 day total (preload + any analytics guard).

---

## Phase 2 — Re-render Optimization (`rerender-*`) · MEDIUM

The 3 high-value items already shipped; remaining are incremental.

| Rule | Status | Evidence / work |
|------|--------|-----------------|
| `rerender-defer-reads` | ✅ | MIDI-in chip split into `MidiInPicker` (owns its own state); `activeMidis` pulled out of App state into `SynesthesiaProvider` context (value ctx consumed only by canvas/keyboard/audition controls; App writes via the stable setter ctx) so sibling panels never re-render on note churn |
| `rerender-memo` | ✅ | `PathCatalog`, `CoComposePanel`, `TexturePanel`, `StylePackPicker`, `QuizPanel`, `RecentTakesPanel`, `MobileCommandBar`, `StyleWarnings` all `memo`'d with stable `useCallback` handlers |
| `rerender-memo-with-default-value` | ✅ | Hoisted `NO_VIOLATIONS` constant (was inline `violations={[]}`); remaining defaults already primitive literals |
| `rerender-dependencies` | ✅/◐ | Audited App.tsx + session store: deps already primitives/destructured (App never lists `session`; `path.steps`, `optimizedStepsNotes`, `barDriftShifts` identities are stable). No churn found to fix |
| `rerender-derived-state` | ✅ | Hoisted `activePackName` (was `loadStylePack(...).name` inline in JSX) + `voicingCount` in the step header |
| `rerender-split-combined-hooks` | ✅ | App ephemeral state split into purpose-built hooks: `useMidiDevices` (device lists + engine-init effect), `useExportFlow` (modals, sheet/WAV export, recording lifecycle), `useGeneratorPanel` (DDSP/etude/HD/gen knobs), `useScaleDrill`. Session prefs stay in `useSessionStore`; ui-fold booleans (`isArpFolded`/`isGenFolded`/`activePanel`) kept in App |
| `rerender-transitions` | ✅ | Path catalog select + tab switch wrapped in `startTransition` |
| `rerender-functional-setstate` | ✅ | Setters use functional form where reading prev (predominantly) |
| `rerender-lazy-state-init` | ✅ | `loadPracticeSets`, `getRecentSessions`, `loadString`/`loadJSON` passed as lazy init |
| `rerender-no-inline-components` | ✅ | `ModalFallback` hoisted; no components defined inside `App` |

**Effort:** context extraction ~1–2 days; remainder 1 day.

---

## Phase 3 — Client-Side Data Fetching (`client-*`) · MEDIUM-HIGH

| Rule | Status | Evidence / work |
|------|--------|-----------------|
| `client-event-listeners` | ✅ | `playbackClock` is a single shared subscription (module-level listener set); MidiInPicker scopes its `midin` listener |
| `client-passive-event-listeners` | ☐ | Global `keydown`/`mousedown` init listeners (`App.tsx:426`) are fine; ensure any future `wheel`/`touchmove` uses `{ passive: true }` |
| `client-localstorage-schema` | ☐ | **Biggest open medium item.** Bare keys: `synesthesia_paths`, `synesthesia_melodyByStep`, `synesthesia_counterMelodyByStep`, `synesthesia_feedbackHistory`, `synesthesia_quizScore`, `synesthesia_stylePackId`, `synesthesia_humanize*`, `synesthesia_arpType`, etc. Perf log already versioned (`hse.performance.log.v1`). Plan: introduce a single `synesthesia.schema.v1` marker + migration registry in `usePersistedState`/`useSessionStore`; wrap reads through one helper |
| `client-swr-dedup` | N/A | No client HTTP data fetching in-app (FastAPI/DDSB only server-side) |

**Effort:** localStorage schema 0.5–1 day.

---

## Phase 4 — Rendering Performance (`rendering-*`) · MEDIUM

| Rule | Status | Evidence / work |
|------|--------|-----------------|
| `rendering-conditional-render` | ✅/◐ | Audited all ~16 `{x && (...)}` sites in App: none return array branches (all single JSX nodes, safe). `false`-node pattern not present in `.map` returns. No change needed beyond audit |
| `rendering-hoist-jsx` | ◐ | AuditionControls, MidiInPicker already extracted. Full ~700-line sidebar (`SidebarPanel`) + right-column (`VisualizationColumn`) extraction remains a dedicated PR (1–2 days, roadmap estimate). **Caution (2026-09-18):** `PersonasRibbon` extraction was attempted via scripted tooling and **reverted in `5a525ff`** — the automation layer drifted 129 vs 145 leaf lines, so it was NOT byte-faithful. Extraction must be a **de-indent-8 + re-indent job done with a real editor, byte-exact cut/paste**, then gate-green; do not re-attempt with scripted heredoc/bin-editing |
| `rendering-content-visibility` | ✅ | `PathCatalog` cards: `content-visibility:auto` + `contain-intrinsic-size:auto 140px` (long catalogs skip offscreen layout/repaint). LiveScore is a single SVG — not applicable |
| `rendering-svg-precision` | N/A | No heavy dynamic SVG coordinate strings |
| `rendering-usetransition-loading` | ✅ | Folded into `rerender-transitions` (startTransition around path select + tab switch shipped in Phase 2) |
| `rendering-resource-hints` / `rendering-script-defer-async` | ☐ | Deferred with `bundle-preload` phase |

**Effort:** JSX extraction 1–2 days; rest under a day.

---

## Phase 5 — JavaScript Performance (`js-*`) · LOW-MEDIUM

| Rule | Status | Evidence / work |
|------|--------|-----------------|
| `js-hoist-regexp` / constants | ✅ | `NOTE_NAMES` hoisted out of the `midin` hot handler (MidiInPicker) |
| `js-cache-storage` | ✅/N/A | `readHDSetting()` (`audio.ts:17`) already runs at module scope (single `AudioEngine` singleton — read once per load, not per "engine init"); practice-store reads now idle-deferred (see `js-request-idle-callback`). `allStylePacks()` is a tiny `[...PACKS.values()]` spread → no measurable win |
| `js-cache-function-results` | ✅/N/A | Style data is static/import-time (module `Map` in `stylePack.ts`, `allStylePacks` trivially cheap) — memoization adds indirection without benefit |
| `js-index-maps` | ✅/N/A | `PERSONAS.find((x) => x.id === …)` all sit in user-action handlers / settled `useMemo` (`App.tsx:582` etc.) over a 6-element array — never a per-render hot loop; a `Map` gains nothing |
| `js-early-exit`, `js-length-check-first` | ✅ | Existing guards (e.g. `if (!alt.alternative) return`) |
| `js-request-idle-callback` | ✅ | `loadPracticeSets()` + `getRecentSessions(5)` moved off the first-paint path — hydrated inside `useEffect` → `window.requestIdleCallback` (1000 ms timeout, `setTimeout` fallback), so the initial `localStorage` + `JSON.parse`/merge of the practice store no longer blocks first render (`App.tsx`) |
| `js-lazy-load-lib` | ✅ | `LiveScoreDisplay` → `React.lazy` (splits `abcjs` ~160 kB raw / ~54 kB gzip out of the initial ~511 kB main chunk; fetched only when the score mounts). Sheet-music PDF (jsPDF/svg2pdf + `sheetMusicExport`) already dynamic-`import()`ed; `@magenta/music` lazy (`magentaHelper`/`quantize`); MIDI export now `await import("./lib/midiExport")` so `midi-writer-js` loads on first export click |

**Effort:** ~0.5–1 day.

---

## N/A / low-value categories

- `async-*` (waterfalls): SPA has no fetch waterfall; Magenta load is
  deferred + conditional. Keep `Promise.all` discipline if backend calls
  are ever added to composer generation.
- `server-*`: no Next.js/RSC runtime. FastAPI is out of scope for this
  guide; treat auth on FastAPI endpoints like `server-auth-actions`.
- `advanced-*`: only evergreen-style hygiene; revisit `advanced-init-once`
  when DDSP/model warm-up moves into a service worker.

---

## Ordering rationale & gate

Preferred merge order: **Phase 3 → Phase 2 (context extraction) → Phase 4 →**
**Phase 5 → Phase 1 leftovers**. Rationale: `client-localstorage-schema`
first (cheap, prevents future migration pain); the `activeMidis` context
extraction is the highest-value single refactor left; JSX hoisting enables
it to be smaller per PR.

Each PR must keep: `npm run lint` clean, `npm test` green,
`node assets/check-links.cjs` green, `npm run build` green, then push
(auto-deploy to Vercel production). Test count 363-gate is unchanged by
these refactors unless a new component/hook gets unit coverage — add tests
for any new extracted component (register in `vitest.config.ts`
`JSDOM_FILES` if it touches the DOM).