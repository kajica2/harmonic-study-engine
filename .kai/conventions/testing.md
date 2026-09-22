# Testing

Gate order (CI mirrors): `npm run lint` → `npm test` → `npm run build`. Run all three before committing.

- `npm run lint` = `tsc --noEmit`
- `npm test` = `vitest run` (Vitest 5 multi-project: node + jsdom via `JSDOM_FILES` in `vitest.config.ts`)
- **New DOM-touching test files MUST be added to `JSDOM_FILES`** — per-file `// @vitest-environment jsdom` is IGNORED
- Pure logic in `src/lib/` tested in node env; React components intentionally NOT unit-tested (audio singletons = low ROI)
- Count pins: `tunesCount()` → 40, `curatedBriefingCount()` → 12 — bump when enabling tunes
- Drift gate: `assets/check-links.cjs` runs FIRST in CI (README + personaProfiles vs SPEC.md)
- `npm run check:paths` = bar-count invariant via `tsx scripts/check-path-bars.ts`
- `npm run test:py` = backend pytest (prefers `.venv/bin/python`)
- `npm run test:e2e` = Playwright — REQUIRES `npm run build` first (serves `dist/` on `:4173`)
