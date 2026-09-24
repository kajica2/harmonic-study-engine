# ADR-020: Explore mode — seeds, ops, honesty-gated cards, crossover

- Date: 2026-09-24
- Status: Accepted (PRD-001 Phase 5)
- Context: Explore is the harmonic what-if surface (REQ-EXP-1..22). Prior art in-repo: etude harmony tables, compose chords/voicing, concepts registry, Idea object, chart parser.

## Decision

1. **Engine ops over ChordGrid (engine/explore/)**: seeds (5 kinds + 12 presets), substitute, reharmonize, expand, vary, voicelead (voiceSequence re-skin, conceptIds gated on realized pitches), modulate STUB only (REQ-EXP-14 deferred - no pivot primitive; honesty bar for key-change claims unmet).
2. **Truthfulness lineage continues** (ADR-013 + PHASE-3-01): technique labels describe what was ACTUALLY computed; rationale conceptIds resolve (10 ids, pinned). Negative fixtures differ only in the claimed property; D47 equivalence ported for card rationales.
3. **Crossover reuses S4 seams, zero adapters**: Send-to-Compose = progression -> chart TEXT -> S4 parser (ChordGrid identity verified byte-level, incl. Bb survival); Send-to-Etude = constraints-carry honestly labeled "Practice in this key" (literal transplant forbidden - symbol/numeral grammars disjoint).
4. **Hear reuses the composePreview singleton + VOICE_RECIPES** (transient synthetic project+result; pure builder unit-tested, no AudioContext in unit tests). No new audio path.
5. **Store untouched**: explore session is local + explicit Save; DirtyMap.explore stays "none"; no version bump.
6. **Coverage deliberately reduced, not silently lost**: modal pools cut to major [bVI,bVII7] + minor [bII7] (root-residual detector cannot label diatonic-root chords - keeping iv7/III7 would emit self-contradicting candidates). Tracked as TD-EXP-MODAL-Q.

## Consequences

- IdeaBar Send-to arms (compose/etude/explore) all wired; old disabled stubs removed.
- e2e/explore.spec.ts: seed->cards->compose-landing + Hear machine + Etude carry (18/18 suite).
- TD-EXP-MOD (modulate), TD-EXP-MODAL-Q (quality-borrow detector), TD-048 (Space quirk) carried.
