# ADR-010: Hand-rolled key spelling in engine/core (purity beats tonal)

- Date: 2026-09-23
- Status: Accepted (PRD-001 Phase 2)
- Context: REQ-TRANS-4 effective-key display + REQ-FND4 sharp/flat spelling needed a key-name engine. `tonal` was installed in Phase 0 for exactly this. But ADR-003's purity guard bans ALL non-relative imports in engine/ sources, and engine/core is where the effective-key logic belongs (pure, testable, PRD 10.2).

## Decision

`engine/core/spelling.ts` is hand-rolled with ZERO imports: parseKey (all 21 catalog key-string formats), spellTonic (12-entry major/minor tables, min-accidental-count, TIES GO FLAT for major (pc6 -> Gb); minor table sharp-wins where conventional: C#m/F#m/G#m, Ebm), effectiveKeyLabel (drift endpoints shifted independently, no blending; slash takes first endpoint; 36 key-less studies paths use first/last-chord tonic heuristic with plain-quality gate, else pitch-only fallback - "refuses to lie").

## Rejected alternatives

- tonal inside engine: requires a purity-guard allowlist carve-out for one function - guard absoluteness is worth more than a table.
- src/lib placement: works, but spelling is engine-core territory (PRD 10.2 lists core/spelling); src/lib would fragment the module map.

## Consequences

- `tonal` remains UNUSED (dead-dep window continues; revisit at Phase 4 analysis, where Krumhansl-Schmuckler + chord inference may genuinely earn it).
- Fuzz-verified: 5,840 shift/key combinations, zero anomalies (@tester independent oracle).
- Modal-accuracy approximation documented: modal keys spell tonic via MAJOR table + keep suffix verbatim; parent-scale accuracy deferred.
