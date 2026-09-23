# ADR-016: Metronome bus routing + count-in pre-roll gate

- Date: 2026-09-23
- Status: Accepted (PRD-001 Phase 3 Slice 3)
- Context: REQ-PRAC-1/2/10 demanded metronome volume/preset/accents/subdivision/count-in while the W2-declared transport (16th grid, stepsPerMeasure table, onMeasureStart once-per-measure, cycle-12 form-boundary math) is immutable. FROZEN tests/rhythm.test.ts pins playMetronomeClick(true) as SINGLE-ARG.

## Decision

1. **Bus routing (D33):** dedicated `metronomeGain -> compressor` in audio.ts; the click leaves masterGain entirely (volume independence by graph topology, REQ-PRAC-2). Consequence, accepted: AudioRecorder (taps masterGain) no longer captures the click. Config flows via SETTERS (setMetronomeVolume/Preset/Pattern) - the single-arg playMetronomeClick(high) arity is preserved; default config reproduces the legacy click pattern bit-identically, proven by an exhaustive per-meter oracle (T1) written BEFORE the playStep rewire.
2. **Subdivision/accents are pure click math** (src/lib/metronomePatterns.ts clickActionFor): the 16th grid never changes. Triplet = on-grid click + 2 partners scheduled at secPerBeat/3 and 2/3 via WebAudio time (no setTimeout, no grid edits). Compound-meter s=4 clamps to the grid (documented + tooltip).
3. **Count-in = pre-roll gate (D35):** requestPlayState wrapper resolves toggles against (isPlayingAuto || countInActive); during pre-roll isPlayingAuto stays FALSE, so the transport effect, backing, chord advance, and the sacred onMeasureStart handler are structurally unbootable - the handler is unbreakable because playback never starts. All 7 start-intent sites + Escape + MIDI-stop route through it (fix round also caught a stale-closure defect making Escape-to-stop silently broken; now pinned by e2e).
4. **Prefs live in the legacy localStorage registry** (K.metronomeConfig, corruption-safe normalize), NOT zustand: user taste is not session-share state (the sessionStore is URL-synced). F2 latent fixed: metronomeOn now actually persists (it hydrated but never wrote).
5. **Count-in beat pacing derives from the SAME beat-unit source as playStep** (countInMsPerBeat via stepsPerBeatFor - fix round; the design's flat-quarter formula ran 2x slow in compound meters).

## Consequences

- Accepted tail: stop()/setTempo mid-triplet lets <=2 scheduled partners fire (~0.5s) - documented at rhythm.ts stop(), gain-cancel deferred.
- Default click level rides 0.8 vs old masterGain 0.5 (~+4dB) - manual audio smoke owed.
- Escape during pre-roll cancels (behavior now matches the comment; e2e leg discriminative).
- USER-DECISION F3 remains OPEN: sub-range loop math (loopStartBar*4) still assumes 4 steps/bar -> section loops land 4x late on etude paths; fixing means the sacred handler; rail-side disable proposed as fast-follow. Documented in ETUDE-COMPOSER + FUTURE_PLANNING, NOT silently patched.
