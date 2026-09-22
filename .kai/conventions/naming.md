# Naming

- Commits: `feat/fix/chore(scope): description` — e.g. `feat(masterclass): enable Stella — study-stella + flip inApp`
- Harmonic paths: `study-<slug>` in `RAW_PATHS` (`src/lib/paths.ts`)
- Masterclass catalog: `src/data/masterclass.ts` with `inApp: boolean` + curated `objective`
- Tests: `*.test.ts(x)` colocated in `src/` or under `tests/`
- Backend: `server/app.py` FastAPI app (`server.app:app`)
