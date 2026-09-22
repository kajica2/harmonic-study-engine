# ADR-003: Top-level `engine/` directory + vitest purity guard

- Date: 2026-09-22
- Status: Accepted (implemented, reviewed APPROVE-WITH-NITS)
- Context: PRD-001 Phase 0 (Foundations)
- Deciders: @architect (design), @reviewer (verified), Kai (merge)

## Decision

1. Create `engine/` at repo ROOT (not `src/engine/`, not evolving `src/lib/`), mirroring PRD-001 section 10.2: `core/`, `styles/`, `migrations/` shipped in Phase 0; `compose/`, `etude/`, `explore/`, `pedagogy/`, `ear-training/`, `practice/`, `io/` arrive in Phases 3-8.
2. Dependency direction: `src/** -> engine/**` allowed; `engine/** -> src/**` or any external package forbidden. `src/magenta/noise.ts` re-exports `mulberry32`/`hashSeed` from `engine/core/rng.ts` (bodies moved byte-identical; pinned by `engine/core/rng.golden.test.ts` exact streams + function-object identity).
3. Enforcement is a vitest source-scan test (`engine/purity.test.ts`), NOT eslint - the repo has no eslint (`npm run lint` = `tsc --noEmit`). PRD's "lint rule" intent (CI-enforced ban) satisfied via the repo's existing policy-test precedent (`tests/no-debug-logs.test.ts`).

## Rejected alternatives

- `src/engine/`: mixes framework-agnostic code into app tree; PRD 10.2 draws it top-level and PRD-wins clause applies.
- Evolve `src/lib/`: fatal - `src/lib` already has 6 Math.random call sites, so the guard could not apply there without touching working code.
- eslint: disproportionate (new config system + plugin deps + CI changes) for one rule.
- scripts/+CI step: duplicates what `npm test` already gates in CI; zero-new-wiring wins.

## Consequences

- tsconfig/vite/vercel configs needed ZERO changes (tsconfig has no `include` key; engine invisible to builds until first `src/` import; `/engine` URL rewrite in vercel.json is a dist route, unrelated).
- vitest.config.ts: +1 node include (`engine/**/*.test.ts`), +1 coverage include (`engine/**`).
- Engine tests colocated under `engine/` are invisible to the check-links drift gate by design - README test counts stay valid.
- Known accepted gaps (round-2 LOWs): guard is a tripwire, not a sandbox (`//` inside strings blanks line tails; `const {random} = Math` destructuring unmatched; circular-payload + hostile mid-chain up() edge). Test-side imports unguarded. Revisit in Phase 1.
- When `engine/io/` lands (Phase 7+), it MUST get a documented subdirectory allowlist (Web MIDI/Tone imports are inherently its job) - needs PRD-owner ack.
