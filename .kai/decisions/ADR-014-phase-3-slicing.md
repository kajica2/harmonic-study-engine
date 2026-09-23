# ADR-014: Phase 3 sliced engine / UI-wiring / practice-mechanics

- Date: 2026-09-23
- Status: Accepted (PRD-001 Phase 3 execution plan)
- Context: PRD §14 Phase 3 is the largest phase (2-3 weeks nominal) spanning pure generators, UI wiring, and practice mechanics. One mega-pipeline would be reckless.

## Decision

Three slices, one pipeline each, dependency-ordered:
- Slice 1 (SHIPPED 2026-09-23): engine/etude (types/harmony/melody/assemble) + engine/pedagogy (types/concepts/annotate) + purity floor 12->21. Zero src/ edits, zero deps, +128 tests.
- Slice 2: constraint panel on the Etude surface, etudeEngine adapter (EtudeBarStep -> HarmonicStep cast at the boundary), reuse of the existing setPaths accept pipeline + legacy Etude Assistant load path, piano roll (REQ-ETU-20), abcjs etude staff view, MusicXML +melody voice, URL constraint serialization (REQ-ETU-3).
- Slice 3: practice mechanics (metronome volume/preset/accents/subdivision per REQ-PRAC-1 audit - only a bare toggle exists today; count-in REQ-PRAC-10/11; print stylesheet REQ-ETU-32) + annotation display surfaces + concept drawer (REQ-PED-4..7).

REQ-ETU-22/23/24/30 need no slice (already shipped: audioEngine playback, per-exercise transpose + cycle-12 from Phase 2, transpose-aware MIDI export). Ear training/SRS/progress stay Phase 6.

## Consequences

- Slice 1 shipped a user-invisible engine - honest CHANGELOG framing ("NOT yet user-facing").
- Generated etudes emit 1 EtudeBarStep per BAR (W2 audio truth); padPath cycles to 96; detectFormPeriod renders the true form once in WAV export (p=8 golden, or a shorter honest period for internally-repeated templates).
- Slice 2 kickoff must re-audit App.tsx line anchors (monolith shifts between phases) and carry three LOW drive-bys from slice 1 round 2: axis-progression definition wording nit, annotate.test.ts:92-94 comment mismatch, design doc "75 cases" arithmetic (actual 45).
