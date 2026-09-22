# ADR-006: Mode selector refactor strategy (incremental via <ModeGate>)

- Date: 2026-09-23
- Status: Accepted (PRD-001 Phase 1 implemented, reviewed APPROVE-WITH-NITS)
- Context: 1090+ passing tests; App.tsx ~3300-line monolith owns playback/persona/voicing/transpose/keys/MIDI; PRD §14 Phase 1 = "mode selector with URL + localStorage persistence + dirty-state prompt + idea bar with chip + empty states for all three modes"
- Deciders: @architect (design), @reviewer (verified), Kai (merge)

## Decision

**Option (b) — Incremental via <ModeGate>**. App.tsx stays the orchestrator; <ModeGate> reads `effectiveMode` from the new zustand store and switches between <AppMain> (legacy Etude body), <ComposeSurface>, <ExploreSurface>. URL + localStorage drive the gate. Single source of truth for mode: the new zustand sessionStore (mode slice only in Phase 1; full migration of useSessionStore.ts in Phase 1.5 per ADR-008).

## Rejected alternatives

- **(a) Big-bang router swap** (e.g. react-router). Rejected: 1090-test app, App.tsx monolith, no current router — high regression risk for a 1-week phase.
- **(c) Hard split into compose/etude/explore modules**, App.tsx becomes thin. Rejected: 1-2 day refactor before any feature ships; violates "ship layer-by-layer" (PRD R2). Defers the architectural payoff to a later phase.

## Consequences

- App.tsx edit footprint: ~60 LOC moved + ~30 LOC added (no logic changes). Body kept inline as a JSX fragment passed to <ModeGate> (Phase 1.5 extraction item TD-023).
- Mode resolution order: URL `?mode=` > localStorage `hse.session` > legacy `null` → `'etude'` (preserves single-workspace UX for existing deep links).
- zustand `persist` partialize: `{ mode, globalTranspose, currentIdea }` only. `dirty` + `pendingModeRequest` are session-scoped, not cross-reload state.
- Legacy first-load (no URL, no localStorage) renders `<AppMain>` = today's experience unchanged. Confirmed via test pin.
- One-frame rehydration flash for users with persisted non-Etude mode (TD-024, accepted to ship, Phase 1.5 polish).
- Keyboard 1/2/3 added to handleKeyDown ADDITIVELY (between ? and ArrowRight per design); modifier-key guard (Cmd/Ctrl/Alt) prevents stealing browser-native tab-switch / Spotlight / window-minimize shortcuts (prevention rule PHASE-1-01).
