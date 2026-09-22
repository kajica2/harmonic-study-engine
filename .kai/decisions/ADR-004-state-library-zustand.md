# ADR-004: State library = Zustand 5 (resolves PRD-001 Q1)

- Date: 2026-09-22
- Status: Accepted (installed in Phase 0; zero store code until Phase 1)
- Context: PRD-001 section 15 Q1 (due Phase 0); Phase 1 mode selector + session store
- Deciders: @architect (design), Kai (merge)

## Decision

Zustand 5 (`zustand@^5.0.15`). Phase 0 installs the dep ONLY - no stores, no App.tsx refactor.

## Rationale (vs Redux Toolkit, vs signals-lite)

- React 19 native (`useSyncExternalStore`, no Provider).
- ~1.4-3 KB gzip vs ~25 KB for RTK+react-redux.
- Built-in `persist` middleware with `version` + `migrate` options maps 1:1 onto REQ-FND-5: `migrate` callback will delegate to `createSessionRunner()` from `engine/migrations/`; zustand's envelope `version` mirrors `CURRENT_SESSION_VERSION`; the runner reads the payload's own `version` field - no conflict.
- Selector subscriptions fit INCREMENTAL unwiring of the ~3300-line App.tsx monolith (each slice moved out drops re-render churn per-slice).
- Non-React access (`getState`/`subscribe`) needed by audio singletons (`rhythmEngine`, `backingEngine`).
- Signals adapters on React 19 still shaky; DIY signals = maintenance burden.

## Consequences

- New persisted keys follow `hse.<domain>` with version IN THE PAYLOAD (zustand requirement), coexisting with legacy `hse.performance.log.v1` (version-in-key; do not rewrite). Planned: `hse.session` (Phase 1), then `hse.ideas`, `hse.pedagogy.srs`, `hse.pedagogy.log`, `hse.practice.sessions`, `hse.practice.latency`. PRD's unqualified names (`pedagogy.srs` etc.) adopted with `hse.` prefix per repo convention.
- Dead-dep window: `tsc` does not flag unused deps; zustand stays unused until Phase 1 by design.
