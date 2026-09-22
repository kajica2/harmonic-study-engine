# Tech Debt Register

Initialized 2026-09-22.

| ID | Area | Description | Priority | Status |
|----|------|-------------|----------|--------|
| TD-001 | practice tally (take purity) | Record-flow `begin()` is idempotent when transport playing → pre-record notes fold into take (continuous-practice semantics). Documented in `App.tsx:1668`. | P3 | Closed — 2026-09-22, commit 25374b5 |
| TD-002 | practice tally (post-record stall) | After take `end()`, live tally immediately restarts via `guideTrail.begin()` if `isPlayingAutoRef.current` is true. | P3 | Closed — 2026-09-22, commit 25374b5 |
| TD-003 | practice tally (hygiene) | `useGuideToneTrail.ts` trailing newline added; effect deps use stable destructured callbacks. | P4 | Closed — 2026-09-22, commits 14b12de, 25374b5 |
| TD-004 | docs (stale wording) | Replaced "streak" with cumulative tally in `FUTURE_PLANNING.md`, `practiceHeader.ts`, and `docs/ARCHITECTURE.md`. | P3 | Closed — 2026-09-22, commit c816670 |
| TD-005 | coverage map (interval duplication) | Deduplicated interval table into exported `intervalToRole` and `roleToGuideToneTarget` in `guideTones.ts`, used by `gtTargets.ts`, pinned with 3 parity tests. | P3 | Closed — 2026-09-22, commit a5b7e88 |
| TD-006 | coverage map (hygiene) | Length-guard `console.warn` moved to `useEffect` in `PlaySessionRail.tsx`. | P4 | Closed — 2026-09-22, commit 14b12de |
| TD-007 | config (test discovery) | Renamed `tests/count-tunes.test.js` to `.ts` for automatic discovery by Vitest. | P3 | Closed — 2026-09-22, commit 9ea7b82 |
| TD-008 | docs (coverage row) | Resynced test counts across `SPEC.md`, `README.md`, `src/magenta/README.md`, and `docs/ARCHITECTURE.md` to 384 (355 frontend + 29 backend). | P3 | Closed — 2026-09-22, commit 9ea7b82 |
| TD-009 | midi input (channel splat) | Expose `channel` (1-16) on `MidiInEvent` + `midiOut` input fan-out. Backward-compatible signature on `onNoteOn` / `onNoteOff`. | P3 | Closed — 2026-09-22, commit 63d2ca5 |
| TD-010 | guide tones (channel filter) | `useGuideToneTrail(chordNotes, bassChannel)` drops bass-channel notes from the tally so a Stick / bass-pedal setup doesn't pollute guide-tone feedback. | P3 | Closed — 2026-09-22, commit 63d2ca5 |
| TD-011 | piano bass layer (merge) | `useBassNotes` merges `backingEngine` stream + live MIDI bass on the configured channel (default 2). Both subscriptions clean up on unmount. | P3 | Closed — 2026-09-22, commit 63d2ca5 |
| TD-012 | config (persisted bass channel) | `bassMidiChannel` via `usePersistedState` (`bassMidiChannel`, default 2). Header chip "BASS CH" selects 1-16. | P3 | Closed — 2026-09-22, commit 63d2ca5 |
| TD-013 | tests (channel split pins) | +12 pins across midiIn (3), useGuideToneTrail (2), useBassNotes (7). Total tests: 969 passed / 1 skipped (+70 vs pre-feature baseline 899 / 1). | P3 | Closed — 2026-09-22, commit 63d2ca5 |
| TD-014 | docs (channel-split spec) | `docs/midiChannelSplit-feature.md` follows `docs/midiClock-feature.md` structure. Data flow diagram included. | P3 | Closed — 2026-09-22, commit 63d2ca5 |
| TD-015 | engine (validator branch coverage) | `validateStyleProfile`: ~31 of 33 error branches untested (registers, enums, tempo NaN ride shared paths). Data ships valid; risk is future-edit drift. Add table-driven invalid-input tests in Phase 1. | P3 | Open |
| TD-016 | engine (purity guard blind spots) | LOW-006/007: `//` inside a string blanks line tail; `const {random} = Math` destructuring unmatched; circular-payload fallback returns raw ref. Tripwire, not sandbox. Consider `/\bMath\s*[{,}]/` + string-aware strip in Phase 1. | P4 | Open |
| TD-017 | engine (rng destructuring pin) | FIX-5 (int closure) has no test pin; add `const { range } = createRng(1); range(1,6)`. | P4 | Open |
| TD-018 | repo (pre-Phase-0, surfaced by pipeline) | CI blockers NOT caused by Phase 0: (a) check-links drift gate RED at HEAD — tests/*.test.ts count 362 vs README-pinned 355 (commit 63d2ca5 added tests without resync); (b) uncommitted src/components CSS-token WIP breaks FormPlanner + FormTemplatePicker tests (pin old bg-purple classes). Both must clear before ANY commit lands green. | P1 | Open |
| TD-019 | ui (export label stale) | PlaySessionRail.tsx:927 expectedSec = steps*(60/tempo)*4 now over-predicts the WAV ~3x (form-once export) and is meter-blind. Fix = detectFormPeriod(steps)*barSeconds(tempo,meter) via exported loopWav helper. GATED: file is the CSS-WIP author's — apply after that merge. | P2 | Open (gated) |
| TD-020 | theory (drift indexing seam) | barDriftShifts: per-BAR ramp array indexed by STEP index (theory.ts:322 + App.tsx:704); ramp is 4x compressed vs audio; form-once export captures only first pass of drift. Export==live for first pass (faithful) but the seam itself remains. | P3 | Open |
| TD-021 | export (small gaps) | (a) Entry-B filename lacks mode suffix; (b) empty path renders 1.25s silence — document contract; (c) wavMode/notesOverride passthrough at App.tsx call sites untested (mutation-untested class) — e2e candidate. | P4 | Open |
| TD-022 | data (catalog bar counts) | Ingested forms diverge from real-world: i-got-rhythm 28 bars, blue-bossa 17 (prime!), body-and-soul 21 vs canonical 32. Export honors declared form (correct behavior); the SONGS dict segmentation in ingest_standards.py needs review vs real changes. Also: 3 doubled-blues entries labeled b1..b24 are really 12-bar forms — consider relabel. | P3 | Open |
