# Changelog

All notable changes to Harmonic Study Engine are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Dates use the user's local timezone on commit.

## [0.2.0] - 2026-09-13

### Sprint 7 (this session) — classical personas, behavioral wiring, audio quality, tests, docs, e2e

**Features**

- 5 classical personas (Scriabin, Rachmaninov, Brahms, Tchaikovsky,
  Mahler) with date/nationality tags, synesthesia status (documented
  vs interpretive), taglines, signature paths, default voicings,
  techniques, and rules.
- 78 paths total: 8 base + 5 classical persona paths + 7 concept paths
  in LV–LXI range + 39 curated masterclass tunes (was 19).
- 9 voicing modes: closed, drop2, minimum_motion, quartal,
  open_drop3, closed_dense, melody_first. Persona defaults flow into
  the picker.
- Per-bar behavioral markers wired into the bar strip: motifTracker
  (Δ glyph), frozenBass (≈), keyDrift, sequenceStepper, motifRepeat
  (◷).
- MIDI input listener (src/lib/midiIn.ts): Web MIDI input → midin
  CustomEvent on window. IN picker chip in the header.
- Slice-and-repeat subdivision in LiveScoreDisplay: when a path has
  sliceAndRepeat=true (Coltrane's Giant Steps Cycle), the score
  renders 4 single-beat cells per bar. ◷ Slice & Repeat badge
  surfaces the subdivision.
- Per-bar harmonic function glyphs in the bar strip: Tonic (○T),
  Dominant (△D), Subdominant (□S), Predominant (◇P). Shape + letter
  pairing for colorblind safety.
- Audio quality: warmth saturation on the melody bus (WaveShaper,
  k=2.5, 4x oversample), per-note velocity scaling (bass softer, top
  louder; arpeggiator accents every 4th step), FluidR3 soundfont
  caching across persona swaps, bass bus highpass EQ.
- Accessibility fix: StageFrame onToggle prop now wired to a
  clickable header button with aria-expanded; action buttons stop
  click propagation.

**Tests**

- 228 unit + 3 e2e (was 0 component tests, 0 e2e).
- 8 test files: theory, paths, personas, audio helpers, concept paths,
  audio, StageFrame (23 tests), useCanvasSize (7 tests).
- New: Playwright e2e against built dist/ covering persona click,
  Path Catalog tab, slice-and-repeat badge.
- 2-job CI: lint-and-unit → e2e with Playwright Chromium.

**Documentation (new docs/ directory)**

- docs/ARCHITECTURE.md — engine graph, file-by-file role table,
  troubleshooting.
- docs/DEVELOPING.md — recipes for adding a persona / path / voicing.
- docs/AUDIO.md — voice design, ADSR curves, warmth math.
- docs/TERMINOLOGY.md — HSE vocabulary glossary + UI glyph
  conventions.

**Infrastructure**

- 2-job CI workflow with Playwright.
- New scripts: test:e2e, test:all, e2e:install.

**Files changed**

- New: docs/ (4 files), e2e/, src/lib/useCanvasSize.ts,
  src/lib/sliceAndRepeat.ts, playwright.config.ts.
- Modified: App.tsx (3050 lines, was 3062), LiveScoreDisplay.tsx,
  PlaySessionRail.tsx, StageFrame.tsx, theory.ts, package.json,
  README.md.

## [0.1.0] - earlier sprints

Foundational features pre-dating this session: iReal-style backing
tracks, scale practice, MIDI/MusicXML/Score21/WAV/MP4 export, DDSP
backend (offline-rendered via server/app.py), masterclass catalog,
path browser, voice leading, generative practice sets, mobile-first
bottom-sheet command bar.

## [Unreleased]

### Added
- **Compose upload UI + analysis review (PRD-001 Phase 4 slice 2)** --
  the Compose mode becomes a real surface. `ComposeSurface` grows from
  the Phase 1 stub (all three pinned strings survive verbatim: the
  heading, the import/export button, the privacy aside) into a
  three-state surface: empty (drop zone + browse, `UploadDropZone`),
  re-upload PROMPT (hash-gated restore per REQ-IO-51: match restores
  overrides, mismatch refuses with use-anyway/Cancel, an unavailable
  hash DROPS edits with a visible notice -- never silently re-applied),
  and loaded (`AnalysisCard`: every detected value overridable --
  key/tempo/meter/melody-track/chord cells -- REQ-COMP-20/21). THE
  HONESTY ITEM (D58): new pure `blendKeyEvidence` in
  `engine/compose/key.ts` weighs declared key signature x functional
  grid evidence (diatonic mass + cadence) x KS correlation into five
  agreement states; property-pinned H1 (correlation ALONE never
  auto-accepts -- the adversarial-jazz guard: ks 0.83 + functional
  0.25 lands in highlight) and H2 (declared-vs-inferred conflict always
  banners with a declared-default radio + Other escape);
  `KEY_BLEND_WEIGHTS` exported for corpus re-tuning that cannot loosen
  the properties. The chord-cell popover (`ChordCellPopover` + new pure
  `src/lib/chordInput.ts` symbol grammar that REJECTS what the grid
  cannot hold, e.g. "C13") gives autocomplete, top-3 alternatives,
  delete, and split-bar-in-two (D60: the one sanctioned engine fix --
  `mergeGrid` now APPENDS out-of-range slot patches, making the
  REQ-COMP-23 flow satisfiable; in-range merge byte-identical). Store
  v3 -> v4 (D57): `composeSession` {fileName, fileHash, overrides,
  analyzeFull} persists; the 30MB project + analysis + snapshot undo
  stacks (cap 32, REQ-COMP-24 via a surface-local Cmd/Ctrl+Z listener
  replicating App's isTyping guard -- zero App.tsx edits) stay
  in-memory; S3/S4 fields will widen the payload WITHOUT a v5.
  Tick-native `ComposePianoRoll` (ROLL_PALETTE import only, TD-040
  safe) with the TD-041 gap-absorption honesty caption. Every shipped
  signal lands on exactly one banner (D62): percussion-only, atonal,
  >4-min truncation + analyze-full (REQ-COMP-53), pitch-bend 12-TET
  warning (REQ-COMP-6), normalize parse notes. REQ-PED-4/5: analysis
  annotations under the chart open the ConceptDrawer (key-prop host
  pattern). e2e: fixture generated IN-SPEC via @tonejs/midi +
  setInputFiles (no committed binary) -- upload -> override -> reload
  prompt -> restore -> browser undo/redo. Zero new npm deps, zero new
  engine files (purity floor 29 unchanged), zero network calls
  (REQ-IO-71). Design: `docs/PHASE-4-S2-ANALYSIS-UI.md` (D57..D65).
- **Compose parse + analysis engine + golden corpus (PRD-001 Phase 4
  slice 1)** -- a zero-UI engine slice that unblocks the Compose mode.
  Imported songs get a new tick-native `NormalizedProject` model (D45:
  NOT `HarmonicPath`, which cannot carry ticks/tempo-map/meter and would
  truncate a 5-min file via `padPath`). New `engine/compose/`:
  `normalize.ts` (the single SMF-quirk choke point over a plain
  `MidiJsonLike` DTO - sorts notes, drops/clamps out-of-range, defaults
  tempo/meter with warnings, `noNotes`/`unsupported`/`tooLarge` error
  arms), `tempo.ts` (piecewise tick<->seconds + meter-aware
  `barBoundaries` + the 4-min `defaultWindow`), `roles.ts` (feature-scored
  track-role classifier), `key.ts` (hand-rolled Krumhansl-Schmuckler with
  ranked candidates + correlations + the atonal->chromatic fallback,
  REQ-COMP-52), `melody.ts` (top-line extraction with eighth-note
  hysteresis, REQ-COMP-11), `harmony.ts` (per-region chord inference with
  calibrated confidence + top-3 alternatives, REQ-COMP-12/23),
  `types.ts` (discriminated-union `Outcome` - analyzers never throw,
  REQ-COMP-15/NFR-5), and `index.ts` (`analyzeProject` pipeline + the
  public surface). `engine/core/chords.ts` extracts the shared quality /
  spelling tables out of `engine/etude/harmony.ts` (which re-exports them
  - etude tests byte-green, D47). The only `@tonejs/midi` import in
  shipped app code is the new `src/lib/composeMidi.ts` adapter (30MB
  cap, SHA-256 F9-guarded, never throws; the two src tests and the dev
  bench load the package too). Golden corpus (`corpus.test.ts`) is
  synthetic + seeded:
  24-key KS accuracy (top-1 24/24, top-3 24/24 on the synthetic set) +
  block-chord root match 768/768 + hand-built edge DTOs (percussion-only,
  pitch-bend, format 2, >5-min truncation). `scripts/compose-perf.ts`
  benches p50/p95 vs the 500ms PRD target (local ~46/69ms for 30k notes);
  the honest CI budget (<1500ms) is pinned in
  `src/lib/composeMidi.perf.test.ts`. Engine purity floor 21 -> 29 (D56).
  Deviations from the design are documented in the completion report
  (the SMF denominator is already converted by `@tonejs/midi`; the
  encoder's key-signature round-trip is broken upstream). Design:
  `docs/PHASE-4-COMPOSE.md`.
- **Practice mechanics + annotation surfaces (PRD-001 Phase 3 slice 3)**
  -- metronome upgrades: an INDEPENDENT click volume (dedicated
  metronome gain -> compressor bus in `src/lib/audio.ts`, so the
  playback-volume slider cannot touch the click; recordings no longer
  contain the click by design), three click syntheses (beep = the
  current sound verbatim / click / shaker), beat-relative subdivision
  1/2/3/4 (triplets ride WebAudio scheduling beside the immutable
  16th grid), per-beat accents (meter-aware chips, 4/6/7/11/16), and
  a 0/1/2-bar COUNT-IN: a pre-roll gate (`requestPlayState` in App)
  upstream of the transport, so the countdown fires before ANY
  playback starts and the measure-tick contract is structurally
  unbreakable; visible "4.. 3.. 2.. 1.." overlay (aria-live). All
  prefs persist via a corruption-safe `synesthesia_metronomeConfig`
  registry key, and the latent metronomeOn read-with-no-write bug is
  fixed. Legacy-equivalence proof: an exhaustive per-meter oracle
  (T1) mirrors the frozen `tests/rhythm.test.ts` spy - the default
  config reproduces the old click pattern bit-identically. Etude
  pedagogy surfaces: margin-note chips + an "About this etude" panel
  over the shipped engine annotations (REQ-PED-4 etude portion) with
  a Notes on/off toggle (REQ-PED-7) and a right-slide ConceptDrawer
  on the ModalShell focus-trap precedent (REQ-PED-5). Print: a global
  `@media print` block + `print-area`/`print-hide` classes and a
  WYSIWYG Print button in the etude views (REQ-ETU-32). TD-035
  must-fix: the Co-compose panel is gated off one-step-per-bar etude
  paths (one accept used to rewrite FOUR etude bars). New browser
  leg: `e2e/count-in.spec.ts`. Design: `docs/PHASE-3-SLICE3.md`.
- **Etude Composer UI wiring (PRD-001 Phase 3 slice 2)** -- the slice 1
  engine is now user-facing. New "Etude Composer" section on the Etude
  surface (after the practice rail): style/key/mode/difficulty/bars/
  tempo/seed controls + a collapsible Advanced row (start-on / end-on
  numerals, required chromaticism, straight rhythms, chord tones on
  strong beats, max melody interval). Generate loads a deterministic
  etude through the existing playback chain (loop, transpose,
  key-cycle, WAV/MIDI export all work unchanged); Randomize rolls a
  fresh uint32 seed. Same URL => same etude: constraints serialize
  into the address bar (`style`, `key`, `tmode`, `diff`, `bars`,
  `tempo`, `seed` + advanced keys) via the single debounced URL
  writer, restore on boot without dirtying, and warn-and-drop on
  malformed params. Accepting marks the Etude session dirty like any
  composer edit (mode-switch prompt), session store v2 -> v3. Two new
  read-out views for the loaded etude: a static SVG piano roll
  (colorblind-safe Okabe-Ito palette with shape redundancy +
  screen-reader summary) and an abcjs staff view (pure ABC builder
  with bar-crossing ties, lazy so abcjs stays code-split). MusicXML
  export gains an additive melody second part ("MusicXML (with
  melody)" button; chord-only exports are byte-identical to before).
  The legacy Etude Assistant in the Generator Lab fold coexists
  untouched. Design: `docs/PHASE-3-SLICE2.md`.
- **Batch MIDI variations export** — `src/lib/midiBatchExport.ts`
  packs N paths × M variations (as written, transpose, split bass /
  upper voices, melody-only, rhythm-only, closed / open voicing)
  into a single ZIP archive via `fflate.zipSync`. New
  `exportMidiWithVariation(path, variation)` in
  `src/lib/midiExport.ts` extends the legacy single-track writer;
  `exportToMidiFile` is preserved as a thin wrapper so the existing
  "Download MIDI" button keeps working. New "Batch export ▾"
  disclosure in `ImportExportModal` lets the user pick variations
  (with a semitone input for transpose, melody index for melody-only,
  duration select for rhythm-only) and a subset of the in-app
  masterclass catalog (+ current path). 14 new unit tests
  (8 for variations, 6 for the batch planner / ZIP packer).

### Changed
- **Etude generation engine (PRD-001 Phase 3 slice 1)** -- pure
  TypeScript core, NOT yet user-facing (the constraint panel, adapter,
  and staff / piano-roll views are slice 2; practice + pedagogy
  surfaces are slice 3). New `engine/etude/`: `generateEtude`
  (REQ-ETU-10..15) runs seeded deterministic harmony + melody
  generators over the Phase 0 `StyleProfile` data (D21 numeral
  grammar, template filter + fit, difficulty-scaled chromatic /
  extension passes, weighted interval-walk melody on an 8-slot-per-bar
  grid) under a fixed draw-order reproducibility contract
  (harmony -> melody -> title, pinned by a 45-case x 2 byte-identity
  matrix); `etudeToSteps` emits one `HarmonicStep`-shaped step per BAR
  for the slice 2 adapter to cast; `feasibilityOf` is the non-throwing
  panel warning. New `engine/pedagogy/`: the 8-concept registry
  (REQ-PED-10, hand-curated per D17) + a truthfulness annotator -
  annotations only claim patterns that actually fire in the generated
  data (REQ-PED-1/2/3/11). Two documented PRD deviations (design:
  `docs/PHASE-3-ETUDE.md`): Q2 RESOLVED -- VexFlow dropped, abcjs
  retained for all staff rendering (REQ-ETU-21 satisfied via abcjs at
  slice 2); and the Tone.js premise corrected -- playback is the
  hand-rolled `audioEngine` (`tone` is a transitive dep only), so
  REQ-ETU-22 is satisfied-in-fact. Purity floor `MIN_SCANNED_FILES`
  12 -> 21. Docs: `docs/engine-etude.md`.
- **Per-exercise transposition + sounding-key badge + cycle-all-12
  (PRD-001 Phase 2)** -- the Etude surface now layers a
  per-exercise offset (`exerciseTranspose`, clamped +/-12) on top
  of the global one (`globalTranspose`, clamped +/-24); the
  sounding shift is the sum (intentionally unclamped, +/-36
  reachable), applied at playback / display / export time and
  never baked into path data (REQ-TRANS-7). New
  `src/components/TransposeControls.tsx` renders both rows in the
  Etude StageFrame meta region (the practice rail keeps its own
  global-only control); the +/-7 fourth/fifth chips are kept. New
  `src/components/EffectiveKeyBadge.tsx` announces the sounding
  key (`role="status"` / `aria-live="polite"` -- every keyboard
  nudge is announced): keyed ("Sounding: Gb major"), drift-aware
  ("Sounding: Eb minor -> Db major"), or a conservative pitch-only
  fallback ("Sounding: +3 st") when no key can be claimed (the 36
  studies paths carry no `key` field; a shared-root first/last-
  chord heuristic may still claim one). Spelling rules -- ties go
  flat, the author's accidental wins when it names the target
  pitch -- live in the pure `engine/core/spelling.ts`. "Cycle 12"
  advances the exercise offset +1 semitone (mod 12) per form pass
  (`src/lib/keyCycle.ts` x `detectFormPeriod()`: a 32-bar form
  padded to 96 bars advances 3x per full loop) and is suppressed
  while a sub-range section loop is active. **Keyboard bindings
  CHANGED (muscle-memory warning)**: `[` / `]` now transpose the
  global offset -1 / +1 semitone and `Shift+[` / `Shift+]`
  -12 / +12 (PRD 9.7), matched by `e.code` so Shift+[ (which
  arrives as "{") works; tempo -5 / +5 MOVES to `,` / `.`. Two
  latent bugs fixed: single-file MIDI export now carries the
  sounding shift (was as-written only), and `?transpose=` is
  finally audible + persists across reloads (the legacy
  `transposeShift` had no persistence writer and the URL param
  drove nothing; the zustand store is now the single source of
  truth, boot precedence URL > persisted `hse.session` > one-shot
  read-only adoption of legacy `synesthesia_transposeShift`
  (when > 0) > 0). Session schema v1 -> v2
  (`CURRENT_SESSION_VERSION = 2`; the `engine/migrations/index.ts`
  step seeds `exerciseTranspose` + `keyCycleActive`). Design:
  `docs/PHASE-2-TRANSPOSITION.md`.
- **WAV export renders the complete detected song form exactly
  once** - `renderPathToWav()` (`src/lib/loopWav.ts`) now stops at
  the period found by `detectFormPeriod()` (`src/lib/formPeriod.ts`)
  instead of printing the full padded practice loop (e.g. 3 passes
  of a 32-bar standard). Non-4/4 meters render at true bar
  durations via `barSeconds()` (6/8 @ 120: 1.5s, was 3s; tintal:
  8s, was 2s - parity with the live grid). The Path Creator "Loop
  WAV" button now honors the selected render mode (was always
  block), and exported pitches carry the live voicing /
  voice-leading / transposition / key-drift via `notesOverride` -
  the WAV is what you hear. Known limitation: forms whose tail
  prefix-matches (e.g. a byte-identical AABA) detect the shorter
  repeating period - three 12-bar blues catalog entries labeled
  b1..b24 (doubled chorus) now export one 12-bar chorus, which is
  the true musical form.
- **Mode selector + scaffolding (PRD-001 Phase 1)** -- the persistent
  top-bar segmented control lives at `src/components/ModeSelector.tsx`
  (`role="tablist"`, three segments: Compose / Etude / Explore,
  roving tabindex, numeric `kbd` chip, mounted in `<header>` at App.tsx
  line 1517). State is a new zustand 5 store at
  `src/state/sessionStore.ts` with `persist` middleware under the
  `hse.session` key (`CURRENT_SESSION_VERSION = 1`; `partialize` keeps
  `mode` / `globalTranspose` / `currentIdea` -- `dirty` +
  `pendingModeRequest` are session-scoped, not persisted). Phase 1
  ships only the mode slice; the rest of `useSessionStore.ts` migrates
  slice-by-slice in Phase 1.5 per ADR-004. `requestMode` consults the
  per-mode dirty flag and either commits or parks onto
  `pendingModeRequest`; the parked request opens
  `src/components/DirtyPromptModal.tsx` (Save / Discard / Cancel on top
  of the existing `ModalShell` -- Save persists the current Idea to
  `hse.ideas` capped at 100 per REQ-IDEA-4; Discard dispatches a
  `hse:revert-last-accept` window event App.tsx forwards to the legacy
  revert machinery). Compose and Explore read `dirty === "none"` in
  Phase 1; only Etude carries real dirty state.
  `src/components/ModeGate.tsx` reads the effective mode (URL
  `?mode=` -> persisted `hse.session.mode` -> legacy `"etude"`) and
  switches the rendered surface: Etude keeps the legacy main body via
  an `AppMain` slot; Compose renders
  `src/components/ComposeSurface.tsx` (faded `SynesthesiaCanvas`
  thumbnail + "Drop a .mid file to get started." + "Open import /
  export" CTA + REQ-IO-70 privacy `<aside>`); Explore renders
  `src/components/ExploreSurface.tsx` (three random preset chips from
  a fixed list of 12 + the existing `<FormTemplatePicker>` +
  `<FormPlanner>` read-only). The Idea bar at
  `src/components/IdeaBar.tsx` sits sticky at the bottom of `<main>`
  (z-10) above the existing `MobileCommandBar`: empty copy "Play
  something or generate an etude to start an idea." + a disabled `+`
  chip; populated shows the chord / scale / kind + a `from <source>`
  pill + an `x` clear button + a `Send to...` native `<select>`
  (Compose + Explore are disabled placeholders that `console.warn`
  "Phase 4 / 5 wires the landing surface", Etude is wired) + Save
  (persists to `hse.ideas`) + Share (base64 JSON `?idea=<base64>` URL
  copied to clipboard, server-less per REQ-IO-50). URL persistence is
  wired both ways in App.tsx: on mount a single `useEffect` parses
  `location.search` and seeds `mode` / `transpose` / decodes a shared
  `?idea=`; on store change a debounced (200 ms)
  `useNewSessionStore.subscribe` writes `?mode=&transpose=` back via
  `history.replaceState` (no `pushState`, never pollutes the back
  stack). Keyboard shortcuts `1` / `2` / `3` switch modes (additive to
  the existing `handleKeyDown` around App.tsx line 988, `isTyping`
  guard preserved). The Idea type itself is pure engine/ at
  `engine/core/idea.ts` -- discriminated union over `kind` (chord /
  progression / scale / melody / seed) with exactly one populated
  slot per kind; `id` is a deterministic `CanonicalId` (ADR-005) so
  dedup collapses identical materials; `isIdea(raw)` is the runtime
  guard for trust boundaries (URL share link, `hse.ideas`).
  `src/lib/storage.ts` registers `K.session` and `K.ideas` with their
  shape metadata in `STORAGE_KEYS`. Empty states per PRD 9.6 ship
  verbatim per the design reference `docs/PHASE-1-MODE-SELECTOR.md`.
  New tests: `engine/core/idea.test.ts` (node) +
  `src/state/sessionStore.test.ts`, `ModeSelector.test.tsx`,
  `IdeaBar.test.tsx`, `DirtyPromptModal.test.tsx`, `ModeGate.test.tsx`
  (jsdom); `vitest.config.ts` `JSDOM_FILES` gets one new entry for
  `sessionStore.test.ts` (the component tests fall under the existing
  `src/components/**/*.test.tsx` glob).
- **`midi-writer-js` Track / Writer calls** are now centralized
  inside two private helpers (`buildSingleTrack`,
  `buildSplitTracks`) so the as-written / transpose / melody /
  / rhythm variations share one code path. No behaviour change for
  the single-track case (byte-identical to `exportToMidiFile`).
- **Guide-tone data feeds the mastery log (option C → option G)** —
  `src/lib/guideToneTrail.ts` folds classifier results into a per-run
  tally (3rd/7th hits vs misses) and `useGuideToneTrail` counts note-ons
  live while a take records; the finished tally is attached to the take
  via `recordGuideToneResult`. The Recent takes panel renders it as
  "3/5 guide tones · 60%" with a fill bar. 16 new unit tests.
  334 frontend tests (was 318).
- **Performance / mastery log** (option G from `IMPROVEMENT_PLAN.md`)
  — `src/lib/performanceLog.ts` persists one entry per take (timestamp,
  path, tempo, meter, instrument, persona, loop duration) to
  `hse.performance.log.v1`, capped at 50; `usePerformanceLog` hook;
  `RecentTakesPanel` renders the last takes with 1–5 self-ratings that
  write straight back into the log. Takes are recorded from the rail's
  Record Take flow. 18 unit tests + an e2e (seed → render → rate →
  survives reload).
- **Vendor code-splitting** — `vite.config.ts` `manualChunks` splits
  react/ui/audio/score/publish/midi; Import/Export + Recording modals
  are `React.lazy`; sheet-music export + tone.js + jspdf load on
  demand. Main bundle 1.8 MB → 510 KB eager.
- **e2e expansion** — `e2e/app.spec.ts` grew from 3 to 7 tests
  (practice transport start/pause, keyboard-shortcuts cheatsheet,
  lazy modal, mastery-log panel).
- **Path Catalog tab** — filterable grid view in the left sidebar
  (composer, key, behavioural-rule chips, technique tags).
  `src/components/PathCatalog.tsx` + RTL tests; wired as the third
  sidebar tab alongside Paths and Practice.
- **7 long-form educational concept paths** (LV–LXI) in a new
  `src/lib/conceptPaths.ts`: `ii_v_i_walk` (9-bar cadence cycling
  all major key centers), `tritone_sub_walk` (bII7 substitution
  per key), `coltrane_changes_demo` (B-G-Eb Giant Steps cycle),
  `rhythm_changes_demo` (I Got Rhythm A-section with bridge
  turnaround), `bird_blues` (Parker-style Bb bebop blues),
  `modal_vamp_demo` (D Dorian / G Mixolydian), `backdoor_ii_v_demo`
  (Cm7→Eb7 vs Cm7→Db7 backdoor). 36 steps × 7 paths.
- **17 masterclass jazz standards** added via
  `scripts/ingest_standards.py`: Body and Soul, All the Things You
  Are, Autumn Leaves, Blue Bossa, In a Sentimental Mood, Take the
  A Train, Misty, 'Round Midnight, Satin Doll, Sophisticated Lady,
  Mood Indigo, Donna Lee, Anthropology, Scrapple from the Apple,
  Au Privave, Now's the Time, Tenor Madness. Total studies now 36
  (was 19). Real Book voicings with 3rd + 7th throughout.
- **17 persona-signature paths** (XXXVIII–LIV) — one per persona,
  each demonstrating their signature technique and wired with the
  matching behavioural rule (`sequenceStepper`, `keyDrift`,
  `bassIsolation`, `sliceAndRepeat`, `motifTracker`). Notable
  additions: Tchaikovsky `siren` (descending sequence at
  `sequenceInterval: -1`), Mahler `adagio` (keyDrift arrow),
  Miles `so_what_vamp` (bassIsolation), Coltrane
  `giant_steps_cycle` (sliceAndRepeat), Brahms `symphony_theme`
  (motifTracker).
- **MIDI input listener** — `src/lib/midiIn.ts` wraps Web MIDI input
  access and dispatches `midin` `CustomEvent`s on `window`. Header
  chip shows a "listening" status flash and an `aria-live` region
  announces device selection + inbound notes.
- **Tchaikovsky `sequenceStepper`** — paths can declare
  `sequenceStepper: true` + `sequenceInterval: 2` to climb by a
  semitone count each bar (e.g. `sequence_ascent` for Tchaikovsky).
- **Mahler `keyDrift`** — paths with `key: "X → Y"` drift linearly
  across their bars via `deriveBarTransposeDrift()`.
- **`HarmonicPath` extensions** — `name` (alias of `title`),
  `sequenceStepper`, `sequenceInterval`, `bassIsolation`,
  `motifTracker`, `sliceAndRepeat`, `techniques` are now first-class
  fields on the type.
- **Per-bar behavioural markers** — `motifTracker` + `frozenBass`
  badges in the bar strip when the active persona declares matching
  rules.
- **Audio quality (warmth saturation)** — soft-knee `WaveShaperNode`
  inserted on the melody bus (k=2.5, 4x oversample). Parallel dry
  + wet routing into `masterGain`. Pure math in `audioHelpers.ts`.
- **Audio quality (velocity scaling)** — `playNote(midi, velocity?)`
  accepts per-note velocity. Bass softer, melody louder
  (60→110 across the chord). Arpeggiator accents every 4th step
  (75→105).
- **EQ polish** — highpass BiquadFilter on the backing bass bus at
  35Hz Q=0.7 to remove DC offset / sub-bass rumble.
- **CI workflow** — `.github/workflows/ci.yml` runs `npm install +
  lint + test + build` on every push to `main` and on every PR.
  Would have caught every bug fixed this sprint.
- **Vitest test infrastructure** — added `vitest.config.ts`,
  `jsdom` + `@testing-library/react` + `@testing-library/dom` as
  devDeps. `tsconfig.json` excludes `**/*.test.ts` so test files
  don't ship in the production bundle. Vite config uses
  `rollupOptions.external` to keep them out at build time too.
- **Test coverage** — 185 tests across 7 files
  (`theory.test.ts`, `personas.test.ts`, `paths.test.ts`,
  `audioHelpers.test.ts`, `studies.test.ts`,
  `InlineStatus.test.tsx`, `PathCatalog.test.tsx`). Was 0 at the
  start of this sprint.

### Changed
- **Vitest upgraded to v5** — vitest 2.1.9 → 5.0.1, `@vitest/coverage-v8`
  5.0.1. Config migrated to the `projects` API (per-file jsdom env via
  a tracked `JSDOM_FILES` list — `environmentMatchGlobs` was removed).
  Fixes 6 npm vulnerabilities (2 critical). Remaining criticals are
  transitive no-fix from `@magenta/music`.
- **Personas** — 17 total (was 12). Added: Scriabin, Rachmaninov,
  Brahms, Tchaikovsky, Mahler. Each persona carries an extended
  schema (synesthesiaStatus, dates, nationality, tagline,
  colorPalette, techniques, defaultPath, defaultVoicing, rules).
  Kandinsky + Scriabin reclassified as documented synesthesia;
  everyone else interpretive.
- **Voicing registry** — replaced the binary Closed/Open toggle
  with a 9-option select: Closed, Drop-2, Minimum Motion, Spread,
  Inversion, Quartal, Open Drop-3, Closed Dense, Melody-First.
  `applyVoicing(notes, voicingId)` is the unified dispatcher.
- **VoicingId type** — first-class `VoicingId` union replaces
  string pairs. Persona `defaultVoicing` is now type-checked.
- **`Persona` interface** — added `synesthesiaStatus`, `dates`,
  `nationality`, `tagline`, `instrumentLabel`, `colorMap`,
  `colorPalette`, `defaultVoicing`, `defaultPath`, `techniques`,
  `scale`, `rhythmLayers`, `rules`. All optional for backward
  compatibility with the existing 12 entries.
- **`analyzeChord` Maj7 fix** — the outer condition required
  `hasMinor7 || sorted.length < 4`; now also allows `hasMajor7`,
  so a Maj7 voicing (e.g. `[48,52,55,60]`) classifies as "major"
  instead of "unknown". Triad-only default to major preserved.
- **`deriveBarTransposeDrift` keyDrift regex fix** — the previous
  regex `/\s*m(in)?(aj)?\s*$/i` could not match "minor" (the
  trailing "or" was unaccounted for), so progressive_tonality
  never actually drifted. Now matches "m"/"min"/"maj"/"minor"/
  "major".
- **Persona selection UX** — each card shows a synesthesia badge
  (`✓ syn` for documented, `❖ art` for interpretive) and 2
  technique chips. Cards grew from `h-28` to `h-36` to fit.
- **Voicing dropdown in the inspector** — replaces the old
  binary toggle. Selecting a non-closed voicing triggers
  `applyVoicing` from `audioHelpers`.
- **Theory helpers consolidated** — `transposeChordName`,
  `NOTE_NAMES_FLAT`, `midiToName` (alias of hardened
  `getNoteNameFromMidi`) now live in `src/lib/theory.ts`. The flat
  wheel reads better in jazz contexts (Cm + 1 → Dbm, not C#m), and
  the negative-MIDI bug in `getNoteNameFromMidi` is fixed.
- **Modal accessibility** — Lead Sheet, Cheatsheet, and the mobile
  "More" sheet now use `ModalShell` for `aria-modal`, focus trap,
  Escape, body-scroll-lock, and focus restoration.
- **`Math.min(...step.notes)` guards** — both `App.tsx` and
  `backingEngine.ts` fall back to `60` instead of `Infinity` when a
  step has no notes.
- **`analyzeChord` Roman** — switched from `bassPc` to `rootPc`
  for the Roman numeral lookup. No-op for root-position chords;
  inversion support still TODO (rootPc falls back to bassPc when
  no 3rd exists above bass).

### Fixed
- **Stale `setOnMeasureStart` listener** — `App.tsx` now detaches
  the rhythm handler on unmount/re-bind so a stale closure never
  advances the cursor against a different path's step count.
- **`(path as any).sequenceStepper` / `sequenceInterval` /
  `composer`** — fields are declared on `HarmonicPath`; the casts
  are gone in `theory.ts` and `scoreExport.ts`.
- **`analyzeChord` 13th tension shadow** — the `s === 9` branch
  had `!tensions.includes("9")` guard, which made 13 unreachable
  whenever a 9th was also present. Removed the dead guard.
- **`ingest_standards.py` Maj7 parser** — `intervals_for_quality`
  was mis-classifying Maj7 as mMaj7 because `"maj7".startswith("m")`
  is True. Added `not quality.startswith("maj")` guard. Affected
  the 19 existing studies too — every Maj7 had been wrong.
- **4 pre-existing tsc errors** — cleared (BackingStyle vs BeatType,
  setMeter/setBeat typing, missing onOpenInspector prop).

### Removed
- **`scripts/ingest_standards.py`** still exists but the upstream
  `.mxl` corpus at `~/GrokDesk/bob-mover-lexicon-push/musicxml/`
  turned out to be voiceless melody fragments (no `<harmony>`
  tags), so it's not used for chord extraction. SONGS-dict is the
  only path.

## [Phase 5] — 2026-09-12

### Added
- **Persona system (classical)** — Kandinsky, Scriabin, Rachmaninov,
  Brahms, Tchaikovsky, Mahler, plus the existing jazz/pop roster,
  driving both the synesthesia canvas theme and per-path behavioural
  rules.
- **VoicingId registry** — first-class voicing types (`closed`,
  `spread`, `drop2`, `min_motion`, etc.) replace the old string
  pair.

## [Phase 4] — 2026-08-13

### Added
- **Practice Sets** — 4 phases (types, seed, browser, session player,
  CRUD editor).
- **Masterclass catalog** — 33 curated jazz standards with composer
  + key filters.
- **Backing engine bass plumbed to React** for the live bass layer.
- **Single-container HF Spaces build** (SPA + API).
- **Saved-voicings tab** in the chord inspector.
- **Toggleable piano layers** (chord / sounding / bass).
- **Track chips, mobile More menu, chord context strip**.

## [Phase 3] — 2026-08-13

### Added
- **Rhythm drill** (3-iteration subdivision player).
- **HD sounds, scale practice, sub-range loop, recording to MP4**.

## [Phase 2] — 2026-08-12

### Added
- **Mobile-first UI** with iRealBook import.
- **Magenta etude generator** (with melodic fallback when the
  tfjs-util fetch shim is broken).
- **WAV loop export** for offline practice.
- **Design tokens** layered over Tailwind.

## [Phase 1] — 2026-08-12

### Added
- **DDSP backend + FX engine** (degraded on HF free tier; see
  README "What's degraded" section).
- **19-study standards ingestion** via `scripts/ingest_standards.py`.
- **Chord inspector** + **MIDI / MusicXML / Score21 export**.

## [Phase 0] — 2026-08-08

### Added
- **Gemini AI etude generator** via OpenRouter.
- **Initial repo** — Vite + React + FastAPI shell.
