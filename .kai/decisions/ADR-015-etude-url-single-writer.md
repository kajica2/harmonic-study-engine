# ADR-015: Etude URL scheme + single-writer discipline

- Date: 2026-09-23
- Status: Accepted (PRD-001 Phase 3 Slice 2)
- Context: REQ-ETU-3 shareable constraint URLs; PRD 11.2's own example URL collides (`mode` used for both app-mode and tonal-mode); Phase 1 already owned a 200ms debounced `history.replaceState` writer (ADR-011 read-once boot rule).

## Decision

1. Param set: core `style,key,tmode,diff,bars,seed` + optional `tempo,start,end,chrom,straight,cts,maxint`. `tmode` for tonal mode - documented PRD deviation (REQ-ETU-3 mandates persistence, not names). Deferred advanced fields (allowedNumerals/allowedQualities/range) have NO params; absent = silent, present-but-malformed = warn-and-drop via `hasEtudeParams()` discriminator.
2. SINGLE writer: the existing debounced effect in App.tsx is extended (subscription predicate extracted to `src/lib/urlSyncPredicate.ts`, mutation-pinned both directions). NEVER add a second replaceState writer - two writers race and lose updates.
3. Boot restore = read-once effect: URL > persisted; prepends the etude path via `planEtudeRestore` (pure: shift activePathIndex +1 iff prepend - preserves the session's active-path identity, never activates, never dirties); `bootDoneRef` one-shot guard makes it StrictMode-idempotent (MED-NEW-001).
4. Determinism is user-facing: same URL => same etude (parse->generate->serialize stable, pinned by 40-variant independent round-trip + e2e reload leg).

## Consequences

- Share URLs carry REQUESTS, not results - the seed makes results reproducible (REQ-FND-3 contract extended to the UI).
- e2e/etude-composer.spec.ts is the repo's first browser-discriminative spec (its 45s highlight-traversal poll FAILS on the pre-fix activeBar mapping; negative-assertion settle windows only).
- etude path ids render as `etu-etu-<hash>` (kind prefix doubled) - cosmetic debt TD-033, visible in download filenames.
