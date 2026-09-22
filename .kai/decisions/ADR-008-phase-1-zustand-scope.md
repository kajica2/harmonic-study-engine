# ADR-008: Phase 1 zustand migration scope (mode slice only; Phase 1.5 for the rest)

- Date: 2026-09-23
- Status: Accepted (PRD-001 Phase 1 implemented)
- Context: ADR-004 installed Zustand 5 in Phase 0 but said "zero store code until Phase 1." Phase 1 needs a store for `mode` + `globalTranspose` + `currentIdea` + dirty + `pendingModeRequest`. The legacy `useSessionStore.ts` (586 LOC, 30+ useStates) co-exists today and owns playback / persona / voicing / transpose / MIDI wiring.

## Decision

Phase 1 ships zustand `useSessionStore` (new) with **ONLY the mode slice**: `mode`, `globalTranspose`, `currentIdea`, `dirty: Record<ModeKey, boolean>`, `pendingModeRequest: ModeKey | null`, `actions: { requestMode, setMode, setCurrentIdea, saveCurrentIdea, discardCurrent, ... }`. Persists via zustand `persist` middleware under key `K.session` ("hse.session") with partialize that excludes `dirty` and `pendingModeRequest` (session-scoped, never cross-reload). `migrate` delegates to `engine/migrations/createSessionRunner()` (the Phase 0 runner wired via `engine/migrations/index.ts`).

`useSessionStore.ts` (legacy) stays intact. **Migration of its slices is Phase 1.5** — one PR per slice, each adding a `version` bump + `engine/migrations/SESSION_MIGRATIONS` entry + migration test (the chain validator at `engine/migrations/runner.ts:14-32` will catch any gap). Slices in scope: persona, voicing, transpose, MIDI devices, generator panel, path selection, recording state, transport state. Roughly 8 PRs.

## Rejected alternatives

- **Big-bang migration of all 30+ useStates into zustand in Phase 1**. Rejected: 600+-line diff, no rollback, endangers the 1090-test green streak and Phase 1's 1-week scope.
- **Never migrate the legacy hook** ("Zustand and the hook coexist forever"). Rejected: violates ADR-004 spirit ("install in Phase 0, activate in Phase 1") and the long-term goal of unwiring the App.tsx monolith via per-component subscriptions.

## Consequences

- Phase 1 components read from the new zustand store via selectors (`useStore(s => s.mode)`); legacy components read from `useSessionStore.ts`. Bridge where needed (e.g. ModeSelector reads `mode` from the new store; AppShell uses the legacy hook for persona/voicing).
- `engine/migrations/CURRENT_SESSION_VERSION = 1`, `SESSION_MIGRATIONS = []` (empty chain, baseline). First slice PR bumps to v2 with one migration step; the chain validator pins contiguity.
- Storage keys consolidated to `K.*` in `src/lib/storage.ts:22-70` (the single source of truth); the new sessionStore and the legacy hook both read/write through `K.session` / `K.ideas`. Drift guard in `src/lib/storage.test.ts:37-44` pins every `K.*` entry is registered in `STORAGE_KEYS`.
- Phase 1.5 sequencing: priority on persona + voicing slices (they are the most-read by App.tsx). Document slice-by-slice plan in `.kai/decisions/ADR-008-phase-1-zustand-scope.md` Phase 1.5 follow-up issue (or `FUTURE_PLANNING.md`).
