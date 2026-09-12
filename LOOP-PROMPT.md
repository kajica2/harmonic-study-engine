# Loop Prompt — Harmonic Study Engine, Phase 5 leftovers

You are working on `feat/personas-classical` in
`/Users/kaidejuricmasscmbook/Documents/github-recovery/harmonic-study-engine`.

## Project

A trumpet practice engine with persona-driven synesthesia, harmonic paths,
backing tracks, and full export. Read the project's `README.md` and the
existing code in `src/lib/` and `src/components/` before making changes.

## Your task

Open `TODO.md`. Pick the highest-priority unchecked `- [ ]` item. Implement
it in one iteration. When the task is verified, edit `TODO.md` to mark it
`- [x]`. Do not add new tasks. Do not uncheck completed ones.

## Invariants (must hold for every commit)

1. `npm run lint` (== `tsc --noEmit`) returns 0 errors.
2. `npm run build` (== `vite build`) succeeds.
3. Changes to personas/personas.json are reflected in `dist/assets/index-*.js`.
4. **Do NOT kill sibling processes.** Port 3000 is owned by the Hermes
   WhatsApp bridge (PID ~4734). Vite must run on `:5174`. If you need a
   server, use `npx vite --port=5174 --host=127.0.0.1 --strictPort`.
5. **Do NOT commit secrets, .env, .venv, or `server/requirements-arm64.txt`.**
7. Commit messages: `feat/fix/chore(scope): description`. Reference the
   TODO item being closed.

## Workflow

1. Read the failing/needed item.
2. Read the relevant existing code (search, don't guess).
3. Make the change with surgical `patch` calls.
4. Run `npm run lint` and `npm run build`.
5. If both pass, `git add -u <changed files>` + `git commit -m "..."`.
6. Edit `TODO.md` to `- [x]`.
7. End the iteration. The wiggum wrapper will call you again.

## Stop conditions

- All TODO items are `- [x]` → exit gracefully.
- You hit a hard wall (auth, missing dep, env). Report it and exit.
- You have made 0 forward progress for 2 iterations in a row on the same
  item. Split the item into smaller pieces (add 2 new `- [ ]` items, mark
  the parent blocked) and exit.

## Style

- Match the existing code style (look at adjacent functions first).
- Prefer small, surgical edits over rewrites.
- TypeScript: extend existing interfaces, don't introduce parallel ones.
- React: keep the existing destructuring/props style per file.