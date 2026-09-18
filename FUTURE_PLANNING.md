# Future Planning — Harmonic Study Engine

Status as of 2026-09-18 (session freeze). Everything below is grounded
in the current codebase — no roadmap item pretends an unpublished
feature exists. Companion docs: `IMPROVEMENT_PLAN.md` (the 8-option
teardown), `IMPROVEMENT_PLAN_TOP10.md`, `docs/COMPOSITION-ENGINE-PLAN.md`,
`docs/COMPOSITION-MVP-PLAN.md`, `TODO.md`, `CHANGELOG.md`.

## Where we are (verified baseline)

```
lint        tsc --noEmit            clean
frontend    818 passed / 1 skipped  (72 files)
backend     29 passed               (FastAPI, pytest)
e2e         7 passed                (Playwright/Chromium)
gate        node assets/check-links.cjs  green (363 tests)
build       vite build              green (510KB eager main)
deploy      Vercel linked; preview + production Ready
```

Shipped this sprint: vitest 5 + jsdom/localStorage test infra, adaptive
CI drift gate, vendor code-splitting, e2e expansion, the performance/
mastery log (option G) and its guide-tone bridge (option C → G).

## Near term — small, high-leverage (≤ 1 day each)

1. **Guide-tone live streak in the practice header.**
   `useGuideToneTrail` already classifies every note-on in real time;
   the trail is only surfaced at record end. Expose the live `tally` as
   an inline "✓ 3 · ✗ 1" chip next to `GuideToneFeedback` so sight-
   reading practice gets immediate feedback without recording.
   Surface: `PracticeHeader` — it already owns `chordNotes`.

2. **First-try vs rep #3 snapshots (option-G follow-up).**
   Extend the take record with `rep` (which repetition of the path),
   computed from `loopRange`/playhead resets. Then the Recent takes
   panel can diff "rep 1 vs rep 3" guide-tone accuracy per path — the
   original "Your take on Bar 4 was 80% on guide tones; last week's
   was 65%" comparison. Needs one new field + a diff row; no schema
   migration (added fields are optional and shape-guarded).

3. **Path-level guide-tone coverage map.**
   Precompute which bars of each `HarmonicPath` contain a 3rd/7th in
   their voicing; render a tiny "GT targets" row under the bar strip so
   players know where the guide tones actually are before they play.
   Pure function on `path.steps` → trivially unit-testable.

4. **Masterclass in-app enablement.**
   35 of 38 tunes are `inApp: false`. The ingest pipeline
   (`scripts/ingest_standards.py` → `studies.ts`) already emits Real
   Book voicings; enabling a tune = adding an 8-bar `HarmonicPath`
   entry + flipping `inApp: true`. Batch one MC-family at a time
   (MC 1–10 first) so the catalog grows without a big-bang change.

## Mid term — machine + product depth (2–5 days each)

5. **Take-comparison UI + timing heat map (option G, deferred piece).**
   Once rep-3 snapshots exist (item 2): per-path accuracy trend chart,
   and a per-bar heat strip showing which bars consistently miss guide
   tones. Data model already supports it — takes are keyed by pathId
   with `transitionsHit/Missed`.

6. **Guide-tone classifier upgrades (option C).**
   `classifyGuideTone` handles triads/sevenths well but labels
   tensions loosely ("color tone") and ignores inversions (bassPc vs
   rootPc is a known gap, pinned in `paths.test.ts`). Feed the chord
   root from `analyzeChord` into slot assignment so inversions classify
   correctly; surface 9th/11th/13th labels from `tensions`.

7. **Curriculum / briefing layer (option B completion).**
   `PathBriefing` exists; it currently templates from
   `mainExercise`/`description`. Write hand-curated briefings for the
   first masterclass batch (item 4) and persist dismissal per-session
   (already spec'd in IMPROVEMENT_PLAN section B).

8. **Composition layer → playable quests.**
   The 9 `src/lib/` modules (Markov melody, counterpoint, style packs,
   co-compose, quiz engine) are code-complete per ARCHITECTURE.md.
   The missing piece is a guided composition flow: a form template →
   co-compose suggestions → counterpoint warnings → export. See
   `docs/COMPOSITION-MVP-PLAN.md` for the 28 already-split tasks.

## Far term — strategic

9. **Replace / fork @magenta/music (audit endgame).**
   15 remaining npm audit items (minimist, protobufjs, quote-stream,
   static-module) are transitive no-fix from `@magenta/music`. Options:
   (a) pin a patched fork, (b) lazy-load the magentaHelper chunk even
   more aggressively (it already 2.5MB in its own chunk), (c) vendor
   only the RNN jams code the app actually uses. Do not hold the
   roadmap hostage to it — document as accepted risk meanwhile.

10. **Multi-workspace routing (IMPROVEMENT_PLAN H).**
    One clear practice loop is the current win and it works. Revisit
    Practice / Explore / Create / Record routing only if the masterclass,
    composition, and mastery surfaces each earn real traffic.

11. **DDSP on persistent infra.**
    `/synthesize` is a 503 on HF free tier (ddsp not installable).
    `render.yaml` exists for Render; a real model endpoint would power
    instrument synthesis behind the personas. Lowest priority — the app
    is fully functional without it.

12. **Take-log sync / export.**
    `hse.performance.log.v1` is localStorage-only. A JSON export
    (already have `performanceLog.ts` — one `exportTakes()` function)
    plus an optional server sync would make the mastery log durable
    across devices. Do this after item 2 so the schema is stable.

## Guardrails (from LOOP-PROMPT + repo invariants)

- Every commit: `npm run lint` + `npm run build` must pass.
- Test/SPEC/README/magenta-README counts are gated consistently:
  run `node assets/check-links.cjs` before committing doc changes.
  Frontend count = `it(` blocks in `tests/*.test.ts` only.
- New DOM-component tests must be added to `JSDOM_FILES` in
  `vitest.config.ts` (`projects` API replaced per-file env comments).
- Never commit secrets; `.env*`, `.venv/`, `server/requirements-arm64.txt`
  stay out.
- If a TODO item exceeds one iteration, split it before starting.