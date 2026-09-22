# Tech Debt Register

Initialized 2026-09-22.

| ID | Area | Description | Priority | Status |
|----|------|-------------|----------|--------|
| TD-001 | practice tally (take purity) | Record-flow `begin()` is now no-op when transport already playing → pre-record notes fold into take. If clean takes wanted, do `end(); begin();` at record start. Needs product sign-off + one-line doc note. | P3 | Open — from review MED-001, commit eced8ed |
| TD-002 | practice tally (post-record stall) | After take `end()`, live tally stays inactive while `isPlayingAuto` still true until next pause/play. Pre-existing. Fix: re-`begin()` if still playing, or document by design. | P3 | Open — from review MED-002 |
| TD-003 | practice tally (hygiene) | `useGuideToneTrail.ts` missing trailing newline; effects omit stable `guideTrail` fns from deps (safe, `useCallback([])`); hook test reaches into `midiOut.inputListeners` (brittle); paused dim needs contrast spot-check. | P4 | Open — from review LOW-001–004 |
| TD-004 | docs (stale wording) | `FUTURE_PLANNING.md` #1 + `practiceHeader.ts:96-97` still say "streak" (impl is cumulative tally). `docs/ARCHITECTURE.md` still describes trail as record-only. Proposals in pipeline report 2026-09-22, not yet applied. | P3 | Open — from @docs |
| TD-005 | coverage map (interval duplication) | Interval table duplicated between `classifyGuideTone` (guideTones.ts) and `classifyBarTargets` (gtTargets.ts). Future share via exported helper + parity test. Do NOT fix without parity pins. | P3 | Open — commit d961f8b |
| TD-006 | coverage map (hygiene) | Length-guard `console.warn` in render body (move to useEffect); rail indent nit; loop-band alignment not pinned in test (manual verified); JSDOM entry redundant with glob (keep explicit per AGENTS.md). | P4 | Open — review LOW-001–004, d961f8b |
| TD-007 | config (test discovery) | `tests/count-tunes.test.js` (.js) excluded by vitest include `tests/**/*.test.{ts,tsx}` — pin verified manually (40). Rename to .ts or widen include in separate chore. | P3 | Open — tester 2026-09-22 |
| TD-008 | docs (coverage row) | FUTURE #3 SHIPPED note + ARCHITECTURE strip/module/contract updates proposed 2026-09-22, not yet applied. ARCH test-count lines (363/72, 818/72) stale vs 946/82. | P3 | Open — from @docs |
