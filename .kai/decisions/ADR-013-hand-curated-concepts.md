# ADR-013: Hand-curated concept registry + truthful annotation principle

- Date: 2026-09-23
- Status: Accepted (PRD-001 Phase 3, resolves PRD open question Q7)
- Context: REQ-PED-10 requires 8 concepts; PRD Q7 asked hand-curated vs LLM-assisted vs hybrid.

## Decision

Hand-curated `engine/pedagogy/concepts.ts` (TS data, precedent: style profiles). The 8 concepts are textbook-stable, and the repo already contains reviewed in-voice prose (coCompose technique explanations, conceptPaths, HARMONIC-WORKBOOK) to harvest. LLM-assist would add a pipeline AND still need the same fact-check (round 1 review found 3 errors; dev found 2 more independently - curated prose still requires theory review, automated prose would require more).

Annotation truthfulness is a HARD principle: a concept links ONLY when its pattern actually fires in generator output (detectors read the D21 numeral grammar + realized voicings, never prose). Example working in production: a V/ii chord whose ii-target was re-harmonized to a tritone sub gets NO secondary-dominant claim.

## Consequences

- Every detector needs negative fixtures that differ ONLY in the claimed property (ii-V-iii vs ii-V-I with identical prefix) - a mutation test proved the first round's fixtures were too weak (adjacency-only mutation survived the whole suite).
- feasibilityOf is conservative-sound: may over-warn, but null => generateEtude never throws for ANY seed (property-swept 300 seeds x 48 feasible shapes; invariant checked against all 9 RangeError sites).
- Concept prose carries a review bar: shape validator test (word counts, definition length) + theory-fact check per round.
