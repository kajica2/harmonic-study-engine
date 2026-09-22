# ADR-002 — Guide-tone coverage row

Date: 2026-09-22
Commit: d961f8b (`feat(practice): guide-tone coverage row — GtCoverageRow + rail wiring + 16 tests`)

## Context

FUTURE_PLANNING #3 asked for a per-bar "GT targets" row. Pure `gtTargetsForPath(path)` already existed in `src/lib/gtTargets.ts` with 21 pinned tests and zero importers.

## Decisions

- ARCH-Q1 raw canonical: map input is raw `path.steps` first-step per bar (matches strip/readout/test precedent, persona-stable, transpose-invariant). Voiced `optimizedStepsNotes` excluded. Inversion/revoicing divergence accepted + documented.
- ARCH-glyphs: coverage `✓/—` (muted neutrals, informational) vs live tally `✓/✗` (evaluative, ADR-001 preserved). Tooltip disambiguates "Targets — not your hits".
- ARCH-layout: sibling row in shared `overflow-x-auto` scroller, mirrored `flex-1 min-w-[60px] gap-1`, fixed `min-h-[24px]`, non-interactive divs, loop visual-only, no `aria-current`.

## Consequences

- `PerformStage` memoizes `gtTargets = useMemo(()=>gtTargetsForPath(path),[path])` with warn-only length guard.
- New `GtCoverageRow.tsx` (memo) + 16 jsdom tests. `gtTargets.ts` logic untouched.
- Duplicated interval table (`guideTones.ts` vs `gtTargets.ts`) logged as debt, not refactored.
