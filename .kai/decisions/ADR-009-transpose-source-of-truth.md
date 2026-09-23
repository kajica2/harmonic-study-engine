# ADR-009: Transpose source-of-truth consolidation + legacy bridge

- Date: 2026-09-23
- Status: Accepted (PRD-001 Phase 2, reviewed + fix-rounded)
- Context: Phase 2 forensics found TWO disconnected global-transpose states: legacy `transposeShift` (useSessionStore.ts) drove playback/WAV/notation but had NO persistence writer (K.transposeShift read at boot, never written); zustand `globalTranspose` persisted + URL-synced but drove NOTHING (`?transpose=` was a dead stub). FUTURE_PLANNING's "SHIPPED" claim was wrong.

## Decision

Zustand store = single source of truth. Legacy hook's `transposeShift`/`setTransposeShift` became a read-through/write-through bridge to `globalTranspose` with byte-compatible `Setter<number>` shape (functional updates resolved via getState()) so the 2 frozen tests/ pins pass untouched. Boot precedence via pure `resolveBootTranspose`: URL `?transpose=` > `hse.session` > legacy `synesthesia_transposeShift` (ONE-SHOT READ-ONLY adoption, no writer added) > 0. `exerciseTranspose` (clamped +/-12) + `keyCycleActive` added to the same slice; `soundingShift = global + exercise` (sum UNCLAMPED so -12 means octave-down); session schema v2 with contiguous 1->2 migration.

## Consequences

- `?transpose=` deep links became AUDIBLE (behavior change for existing links - PRD-intended, CHANGELOG-noted).
- PlaySessionRail prop + (originally) LiveScoreDisplay stayed global-only; LiveScoreDisplay corrected to soundingShift in the fix round (design's 15-site list was incomplete - erratum in docs/PHASE-2-TRANSPOSITION.md §3).
- Single-file MIDI export now applies soundingShift (was asWritten - REQ-TRANS-7 violation fixed).
- Bridge is the pattern for Phase 1.5 slice migrations: freeze the legacy API shape, route through the store, delete dead boot reads.
