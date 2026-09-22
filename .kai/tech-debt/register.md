# Tech Debt Register

Initialized 2026-09-22.

| ID | Area | Description | Priority | Status |
|----|------|-------------|----------|--------|
| TD-001 | practice tally (take purity) | Record-flow `begin()` is idempotent when transport playing → pre-record notes fold into take (continuous-practice semantics). Documented in `App.tsx:1668`. | P3 | Closed — 2026-09-22, commit 25374b5 |
| TD-002 | practice tally (post-record stall) | After take `end()`, live tally immediately restarts via `guideTrail.begin()` if `isPlayingAutoRef.current` is true. | P3 | Closed — 2026-09-22, commit 25374b5 |
| TD-003 | practice tally (hygiene) | `useGuideToneTrail.ts` trailing newline added; effect deps use stable destructured callbacks. | P4 | Closed — 2026-09-22, commits 14b12de, 25374b5 |
| TD-004 | docs (stale wording) | Replaced "streak" with cumulative tally in `FUTURE_PLANNING.md`, `practiceHeader.ts`, and `docs/ARCHITECTURE.md`. | P3 | Closed — 2026-09-22, commit c816670 |
| TD-005 | coverage map (interval duplication) | Deduplicated interval table into exported `intervalToRole` and `roleToGuideToneTarget` in `guideTones.ts`, used by `gtTargets.ts`, pinned with 3 parity tests. | P3 | Closed — 2026-09-22, commit a5b7e88 |
| TD-006 | coverage map (hygiene) | Length-guard `console.warn` moved to `useEffect` in `PlaySessionRail.tsx`. | P4 | Closed — 2026-09-22, commit 14b12de |
| TD-007 | config (test discovery) | Renamed `tests/count-tunes.test.js` to `.ts` for automatic discovery by Vitest. | P3 | Closed — 2026-09-22, commit 9ea7b82 |
| TD-008 | docs (coverage row) | Resynced test counts across `SPEC.md`, `README.md`, `src/magenta/README.md`, and `docs/ARCHITECTURE.md` to 384 (355 frontend + 29 backend). | P3 | Closed — 2026-09-22, commit 9ea7b82 |
