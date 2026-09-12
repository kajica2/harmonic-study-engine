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
