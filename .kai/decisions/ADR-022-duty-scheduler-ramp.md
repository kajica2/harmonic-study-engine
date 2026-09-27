# ADR-022: Practice mechanics - duty scheduler with equivalence-pinned handler surgery

- Date: 2026-09-27
- Status: Accepted (PRD-001 Phase 7 Slice 2)
- Context: Pause-mode (N/M duty), A/B compare, and tempo ramp all need measure-boundary scheduling - which lives in the sacred onMeasureStart handler that F3 (S1) had just stabilized. The handler is the single most load-bearing piece of transport code in the app.

## Decision

1. **Pure duty scheduler** (engine/practice/duty.ts): advanceTransport({barCounter, prev, windows, mode, cfg}) -> {next, phase, activeWindow, passCompleted}. windows.ts stays byte-untouched (geometry vs duty split - D123 deviation, ratified). Handler gains EXACTLY ONE branch; the F3 loop path survives as `else if` with value-identical semantics.
2. **Equivalence pin as the handler-safety net**: duty.test.ts oracle #2 transcribes the shipped F3 6 lines VERBATIM ("do not fix") and sweeps the handler's exact input domain (prev x window x formLen 4..16 x 3-pass padding). RED-FIRST: written before duty.ts existed. Independently re-derived by the tester: 75,168 checks, exact.
3. **Ramp outcome is source-agnostic** (D121 hybrid): rampNext(state, cfg, RampEvent) - S2 feeds "Made it / Missed it" clicks; S3's detector replaces the INPUT, machine unchanged. Laws 1-7 pinned (21,332-tester-transition agreement). Success/fail streaks are mutually exclusive by law - design doc's "S3/F1" chip example was an impossible state, caught by the dev, corrected in docs.
4. **Rest silence by bus gate + chord gate ordering** (D128): backingEngine.setRestMuted (third gain factor, composed with mutes) + chord-effect early-return AFTER stopAll/setActiveMidis BEFORE playNote (honest takes - no phantom sustain during rests). schedule-skip REJECTED (backingEngine's 4-bar lookahead would silence the wrong bars). Metronome survives structurally: rhythm.ts diff EMPTY, click rides metronomeGain outside every gate (REQ-PRAC-3 by construction).
5. **Tempo via store only** (D124): ramp never calls setTempo directly; writes the store tempo (slider-equivalent path, S1-pinned). Reseed echo-guard closes at the synchronously-written rampStateRef (equality check); the e2e leg for this is break-guard-FAIL-proven discriminative.
6. **State**: ONE optional zustand field (no v5 - runner spreads unknown keys), persist `merge` normalizes it on hydrate (MED-1: version-match skips migrate - shallow merge let corrupt payloads through; guard now wired), live run state refs-only, honest-restart semantics on reload (documented caveat: reload re-engages ramp at startBpm and WRITES it).

## Consequences

- TD-052 (runner/handler dual-writer, D125 guard shipped, coverage accepted-gap TD-054), TD-053 (backing chord CONTENT ignores sub-window wraps - pre-existing, rest-gate content-agnostic).
- D127: zero new global keyboard shortcuts (frozen tests/keyboard-shortcuts.test.ts reverse-check is the binding constraint, stricter than the key list).
- LOW-3 contract change: an edited-but-invalid ladder SURVIVES disabled (editedRampLadder) instead of silently resetting; "ENABLED => valid" is the pinned invariant.
- Bar-counter-on-engage mid-cycle start (LOW-4) deferred to S3's wiring decision.
