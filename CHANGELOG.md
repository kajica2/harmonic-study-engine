# Changelog

All notable changes to Harmonic Study Engine are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Dates use the user's local timezone on commit.

## [Unreleased]

### Added
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
  `sequenceStepper`, `sequenceInterval` are now first-class fields
  on the type.
- **Per-bar behavioural markers** — `motifTracker` + `frozenBass`
  badges in the bar strip when the active persona declares matching
  rules.

### Changed
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

### Fixed
- **Stale `setOnMeasureStart` listener** — `App.tsx` now detaches
  the rhythm handler on unmount/re-bind so a stale closure never
  advances the cursor against a different path's step count.
- **`(path as any).sequenceStepper` / `sequenceInterval` /
  `composer`** — fields are declared on `HarmonicPath`; the casts
  are gone in `theory.ts` and `scoreExport.ts`.

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
