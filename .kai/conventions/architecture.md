# Architecture

Source: `docs/ARCHITECTURE.md`, `AGENTS.md`.

- SPA: React 19 + Vite 6 + Tailwind 4. `src/App.tsx` ~3300-line monolith owns playback state, persona/voicing/tempo, keyboard/MIDI wiring.
- Audio singletons (module-level):
  - `audioEngine` (`src/lib/audio.ts`)
  - `rhythmEngine` (`src/lib/rhythm.ts`) — `playStep()` fires `audioEngine.playMetronomeClick()` gated on `metronomeEnabled`
  - `backingEngine` (`src/lib/backingEngine.ts`) — owns backing beat styles; muting click does NOT mute backing (by design)
  - `playbackClock` (`src/lib/playbackClock.ts`)
- `src/lib/` = pure testable logic; `src/components/` = React UI; `src/data/` = personas.json, masterclass.ts, styles/, formTemplates/, quizzes/
- `engine/` (repo root, PRD-001 Phase 0, ADR-003) = pure generative core: `core/` (rng, ids, versioned), `migrations/` (runner), `styles/` (StyleProfile data). Direction rule: `src/** -> engine/**` allowed; `engine/** -> src/**` or any external package FORBIDDEN - enforced by `engine/purity.test.ts` (bans Math.random/Date.now/new Date/performance.now/require/console + non-relative imports in non-test sources).
- `engine/**/​*.test.ts` colocated, node-env, deliberately OUTSIDE `tests/` so the check-links drift gate (counts `tests/*.test.ts` only) never sees them. Never add engine tests to `tests/`.
- Zustand 5 installed (ADR-004) but ZERO store code as of Phase 0; Phase 1 wires `hse.session` via zustand persist + `createSessionRunner` from `engine/migrations/`.
- Generated: `src/lib/studies.ts` via `scripts/ingest_standards.py` — fix SONGS dict, not TS output
- Build: TWO builds — `vite.rnn.config.ts` first, then main build. Stamps `__APP_COMMIT__` / `__APP_BUILD_TIME__` (Vercel `VERCEL_GIT_COMMIT_SHA` or git).
- Backend (optional): FastAPI `:8765`, degraded without DDSP. `VITE_DDSP_API` defaults to `http://127.0.0.1:8765`.
- Deploy: Vercel auto-deploys `main` (project `harmonic-study-engine`).
