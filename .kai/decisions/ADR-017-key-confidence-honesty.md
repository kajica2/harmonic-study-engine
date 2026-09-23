# ADR-017: Key-confidence honesty contract (H1/H2) + evidence blend

- Date: 2026-09-23
- Status: Accepted (PRD-001 Phase 4 Slice 2; constraint originated Slice 1 adversarial testing)
- Context: Slice 1's KS key detection scored 100% on idealized synthetic material but 18.3% on jazz-flavored content (secondary dominants/tritone subs destroy the pitch histogram) - and wrong answers carried correlations >0.80, which PRD REQ-COMP-22's tier scheme would silently AUTO-ACCEPT. The PRD's >85% target remains OPEN pending a real-world corpus (RK2).

## Decision

`blendKeyEvidence(analysis): KeyBlend` in engine/compose/key.ts - five agreement states (agree / conflict[relative|parallel|other] / declared-only / inferred-only / none), blend = declared-agreement x functional-evidence (diatonic mass + cadence) x KS correlation, constants exported as KEY_BLEND_WEIGHTS (the sole re-tuning surface). Two UNIVERSAL invariants, property-pinned (cross-product batteries, not examples):
- **H1**: KS correlation ALONE never auto-accepts. Auto requires agreement in {agree, inferred-only}; inferred-only auto additionally requires functional > 0.55 AND ks > 0.80.
- **H2**: declared-vs-inferred conflict ALWAYS blends to fixed 0.60 (ks-INDEPENDENT - arithmetically unreachable from ks in those switch arms), lands in highlight, selects declared as default, and surfaces a banner + 2-way radio + "Other..." manual escape.

UI-side belt-and-braces clamp in AnalysisCard (demote-only) exists but is UNREACHABLE under engine constants - the engine is the single load-bearing source; if constants are ever re-tuned, engine property tests fail loudly before the clamp could mask anything. (LOW note: export the allowed-agreement set from key.ts to kill the stated-in-two-places risk.)

## Verification

Tester's independent battery: 357,018 combos, ZERO auto-accept violations; 33,552 H2 combos all blend to exactly 0.60. Tuning-guard mutation (raise declaredOnly past 0.8) fails 3 tests loudly; property tests are provably independent of the guard pins.

## Consequences

- User-facing copy tells the truth: "agreement is the precondition, evidence is the gate" - even agree needs blended > 0.80 to auto-accept.
- S3/S4 producers of blend inputs must respect H1/H2; the constraint lives in docs/PHASE-4-S2-ANALYSIS-UI.md + docs/engine-compose.md as an ENGINE CONTRACT.
- Related honesty fix from the same review round: no-op blur commits now short-circuit (MED-003) - the key field's "Change"-then-blur previously flipped a DETECTED key into a manual override (provenance lie in the honesty slice).
