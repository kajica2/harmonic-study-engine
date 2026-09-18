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
| `rerender-memo` | ✅/◐ | `PathCatalog`, `CoComposePanel`, `TexturePanel`, `StylePackPicker` wrapped in `memo` + stable `useCallback` handlers. Remaining candidates: `QuizPanel`, `RecentTakesPanel`, `MobileCommandBar` (props stable during playback) |
| `rerender-memo-with-default-value` | ☐ | Hoist `stylePackId ?? null`, `violations={[]}` etc. to stable module constants so memo comparisons stay true |
| `rerender-dependencies` | ◐ | Some `useEffect`s list whole objects (e.g. `session`); tighten to primitives where the value is destructured later |
| `rerender-derived-state` | ☐ | `loadStylePack(...).name` computed inline in JSX — derive once |
| `rerender-split-combined-hooks` | ☐ | `App.tsx` still declares ~49 `useState` for unrelated concerns; split into purpose-built hooks (playback, export, ui-fold, midi) so a change in one doesn't re-render the rest is a *larger* refactor — worth it after `activeMidis` context extraction |
| `rerender-transitions` | ☐ | Wrap `setActivePathIndex`/`setActivePanel("paths")` (PathCatalog select) + dataset/pack loads in `startTransition` |
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
| `rendering-conditional-render` | ◐ | ~16 `{x && (...)}` sites (`App.tsx:1260,1660+,2470+`); switch array-branch/`&&` returns to ternaries where the branch returns arrays (avoids rendering `false` nodes). Style-level win |
| `rendering-hoist-jsx` | ☐ | Extract the ~700-line sidebar (Personas ribbon → catalog/practice tabs, `App.tsx` ~1650–2300) and the right column into components (`SidebarPanel`, `VisualizationColumn`) — also unlocks finer memo boundaries |
| `rendering-content-visibility` | ☐ | `PathCatalog` list: add `content-visibility:auto` + `contain-intrinsic-size` on row containers for long catalogs |
| `rendering-svg-precision` | N/A | No heavy dynamic SVG coordinate strings |
| `rendering-usetransition-loading` | ☐ | Fold into `rerender-transitions` item (startTransition around path/pack loads) |
| `rendering-resource-hints` / `rendering-script-defer-async` | ☐ | Deferred with `bundle-preload` phase |

**Effort:** JSX extraction 1–2 days; rest under a day.

---

## Phase 5 — JavaScript Performance (`js-*`) · LOW-MEDIUM

| Rule | Status | Evidence / work |
|------|--------|-----------------|
| `js-hoist-regexp` / constants | ✅ | `NOTE_NAMES` hoisted out of the `midin` hot handler (MidiInPicker) |
| `js-cache-storage` | ☐ | `readHDSetting()` (`audio.ts:20`) re-reads localStorage per engine init; `allStylePacks()` rebuilds arrays per render (`StylePackPicker.tsx:27`); cache at module level |
| `js-cache-function-results` | ☐ | `loadStylePack`/`allStylePacks` memoize at module scope (exported style data is static/import-time) |
| `js-index-maps` | ☐ | `contexts.find(x => x.id === …)` lookups in render paths (`App.tsx:1274` etc.) → build `Map` once |
| `js-early-exit`, `js-length-check-first` | ✅ | Existing guards (e.g. `if (!alt.alternative) return`) |
| `js-request-idle-callback` | ☐ | Defer `getRecentSessions(5)` + practice-set hydration to idle (they run on first paint today) |

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