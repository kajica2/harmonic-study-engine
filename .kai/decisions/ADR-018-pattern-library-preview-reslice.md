# ADR-018: Pattern library authored + preview re-slice (D66/D72) + singleton contract

- Date: 2026-09-23
- Status: Accepted (PRD-001 Phase 4 Slice 3)
- Context: PRD Appendix C deferred pattern content to "the Pattern Library reference" - which did not exist. Phase 0 shipped StyleProfile fields (chordPattern/bassPattern/swingRatio/gridDivisions) with ZERO consumers. Separately, the parent slice map put ALL audio in S4.

## Decision

1. **D66 - the library IS the reference**: 14 patterns authored as transcribable data in engine/compose/patterns.ts (8 chord: freddieGreen, charleston, block, pulse, offbeat, lazy, sustain, alberti; 6 bass: walking, twoFeel, rootFifth, eighthPulse, shuffleBoogie, drone) - hits/spans/density-ranks/accents/feel-affinities/labels + meter-tiling table (compound beats, 7/8 floor-clamp, span -1 = once-per-cell sustain exception). docs/PATTERN-LIBRARY.md is the human-facing mirror. Density thinning is rank-ordered POST-PITCH filtering: lower-density output is a structural SUBSET (exact-tuple) of higher - "thins, never reshapes" is a pinned property, not a behavior.
2. **D72 - re-slice approved by orchestrator**: S3 ships a render-and-play PREVIEW (OfflineAudioContext via shared src/lib/composeVoices.ts recipe table; accompaniment-only; 90s cap) rather than staying silent, because RK6 ("sounds generic") cannot be evaluated on a silent roll and S4's mixer absorbs the same voice recipes at zero rewrite cost. Parent intent amended, documented in CHANGELOG.
3. **Preview singleton contract**: play() always stopSource()-first (no overlapping sources), superseded onended guarded by identity, one AudioContext ever (StrictMode-safe lazy), stop() idempotent from any state, unmount/mode-switch/regenerate all stop. Pinned by mutation-proven test (GAP-2).
4. **Determinism contract**: draw order chords -> pad (0 draws when off... actually documented in accompany.ts header; rests consume ZERO rng draws - pinned with rng-stream-POSITION checks that are seed-coincidence-proof (a lesson from the fix round: the first pin survived a draw-on-rest mutation by seed luck).

## Consequences

- swingRatio/gridDivisions finally have consumers (tick realization, pinned 0.64@ppq480->154).
- Etude-vs-compose voicing divergence documented as asserted shape (theory re-anchors bass on ii->V wide register; engine leads all voices - musically defensible for comping when a bass role covers the root).
- 8 of 14 patterns are unreferenced by shipped profiles (by design: library > any one style) - surfacing them needs a style pack or per-pattern control (TD-045f).
- RK6 remains HUMAN-GATED: e2e proves the state machine, not the sound; manual listen check is OPEN (recorded in three docs).
