# Tech Debt Register

Initialized 2026-09-22.

| ID | Area | Description | Priority | Status |
|----|------|-------------|----------|--------|
| TD-001 | practice tally (take purity) | Record-flow `begin()` is now no-op when transport already playing → pre-record notes fold into take. If clean takes wanted, do `end(); begin();` at record start. Needs product sign-off + one-line doc note. | P3 | Open — from review MED-001, commit eced8ed |
| TD-002 | practice tally (post-record stall) | After take `end()`, live tally stays inactive while `isPlayingAuto` still true until next pause/play. Pre-existing. Fix: re-`begin()` if still playing, or document by design. | P3 | Open — from review MED-002 |
| TD-003 | practice tally (hygiene) | `useGuideToneTrail.ts` missing trailing newline; effects omit stable `guideTrail` fns from deps (safe, `useCallback([])`); hook test reaches into `midiOut.inputListeners` (brittle); paused dim needs contrast spot-check. | P4 | Open — from review LOW-001–004 |
| TD-004 | docs (stale wording) | `FUTURE_PLANNING.md` #1 + `practiceHeader.ts:96-97` still say "streak" (impl is cumulative tally). `docs/ARCHITECTURE.md` still describes trail as record-only. Proposals in pipeline report 2026-09-22, not yet applied. | P3 | Open — from @docs |
