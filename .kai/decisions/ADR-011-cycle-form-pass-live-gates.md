# ADR-011: Cycle-all-12 advances per FORM pass; gates must be live

- Date: 2026-09-23
- Status: Accepted (PRD-001 Phase 2 + ModeGate critical fix)
- Context: REQ-TRANS-6 practice loop; and the Phase 2 fix round exposed that Phase 1's ModeGate resolved the mode ONLY at mount - live setMode never switched surfaces (REQ-MODE-1/4 cosmetic).

## Decision

1. **Cycle advance boundary = form pass, not padded loop.** `keyCycle.shouldAdvanceCycle(prev, next, formLen, subLoopActive, active)` fires iff `next % formLen === 0` where formLen = detectFormPeriod(path.steps) memoized on path identity (W2's formPeriod reused). Star Eyes (96 padded steps, 32-bar form): advances at 31->32, 63->64, 95->0. Sub-range section loops SUPPRESS the advance (drilling must not change key). Cycle OFF keeps the current offset. Reset sites (generate x3, persona switch, import) zero exerciseTranspose + keyCycleActive; manual path switch does NOT (erratum-corrected). Dirty is NEVER touched by the cycle path (structural: single dirty writer; pinned both directions by tests).
2. **Dispatch safety:** the measure handler is ref-based (activeStepIndexRef synced in useLayoutEffect - NOT a passive effect, which raced interval ticks against external seeks) and the store advance is queued via queueMicrotask OUTSIDE the state updater (StrictMode double-invoke safety).
3. **Gates are live.** ModeGate: boot render = resolveEffectiveMode (URL > persisted > etude, read ONCE); post-boot render = live store subscription. The URL is never re-read after mount (App's store->URL sync is 200ms debounced; re-reading would race the user's click). App's showExerciseTranspose mirrors the same live subscription - gate and control visibility switch in the same commit. Regression tests pin BOTH directions: store write MUST switch, URL mutation MUST NOT.

## Consequences

- popstate / browser back-forward is NOT wired (never was; replaceState sync pushes no entries) - TD-027.
- Any future gate-like component must subscribe or be explicitly documented as mount-frozen (prevention rule PHASE-2-01).
- Keyboard bindings changed per PRD §9.7: `[`/`]` = transpose +/-1, Shift+brackets = +/-12 (matched by e.code - Shift+[ arrives as e.key "{"), tempo moved to `,`/`.`. Muscle-memory note in CHANGELOG.
