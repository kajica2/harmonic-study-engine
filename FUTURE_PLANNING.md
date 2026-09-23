# Future Planning — Harmonic Study Engine

Status as of 2026-09-18 (session freeze). Everything below is grounded
in the current codebase — no roadmap item pretends an unpublished
feature exists. Companion docs: `IMPROVEMENT_PLAN.md` (the 8-option
teardown), `IMPROVEMENT_PLAN_TOP10.md`, `docs/COMPOSITION-ENGINE-PLAN.md`,
`docs/COMPOSITION-MVP-PLAN.md`, `TODO.md`, `CHANGELOG.md`,
`PERF_ROADMAP.md` (Vercel React Best Practices, phased).

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

1. **Guide-tone live tally in the practice header.** — **SHIPPED**
   (2026-09-22, commit `eced8ed`, ADR-001). Exposes the live `tally` as
   an inline "✓ N · ✗ M" chip next to `GuideToneFeedback` so sight-
   reading practice gets immediate feedback without recording. Dims on
   pause, resets on path change.

2. **First-try vs rep #3 snapshots (option-G follow-up).** — **SHIPPED**
   (2026-09-20). Rep tracking on take records (`rep`) and a `±% vs rep #N-1`
   diff row in `RecentTakesPanel`.

3. **Path-level guide-tone coverage map.** — **SHIPPED**
   (2026-09-22, commit `d961f8b`, ADR-002). Precomputed per-bar guide-tone
   targets (`gtTargetsForPath`) rendered in `GtCoverageRow` below the bar
   strip with informational `✓/—` glyphs.

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

---

## PRD-001 alignment (2026-09-22)

The strategic product doc is `docs/PRD-001.md` - mode-driven workbench
(Compose / Etude / Explore + Learn cross-cutting). Where it conflicts
with the tactical items above, **PRD-001 wins** (it says so itself in
section 16). This section maps PRD phases to current state and tells
the loop which near-term work unblocks the strategic plan.

### PRD Phase 0 - Foundations

| PRD item | Status | Notes |
|---|---|---|
| Add `tonal`, `@tonejs/midi` | NOT STARTED | `package.json` only has `fflate` + `midi-writer-js`. Add when starting Phase 0. |
| MIDI-first internal notes | PARTIAL | `HarmonicPath.steps[].notes` already in MIDI; `chordNames` are user-facing. No migration needed. |
| `mulberry32` PRNG | SHIPPED | `src/magenta/noise.ts`. REQ-FND-2 / REQ-FND-3 already covered. |
| `StyleProfile` types + 3 profiles | NOT STARTED | Current "style packs" live in `src/data/styles/` as backing-engine config, not generative style. PRD's `StyleProfile` is a separate concept covering harmony/melody/rhythm/voicing. New module. |
| Versioned data model + migrations skeleton | PARTIAL | `usePersistedState` keys already versioned informally (e.g. `hse.performance.log.v1`). No formal migration runner. |
| Lint rule against `Math.random` in `engine/` | NOT STARTED | No `engine/` directory today. Add when Phase 0 lands. |

### PRD Phase 1 - Mode selector & scaffolding

| PRD item | Status | Notes |
|---|---|---|
| Mode selector component | NOT STARTED | Today the app is a single workspace; modes are sections of one screen. Big refactor. |
| URL + localStorage persistence for mode | NOT STARTED | Easy once the selector exists. |
| Dirty-state tracking + prompt | NOT STARTED | Requires the `Idea` model. |
| Idea bar with chip | NOT STARTED | New global component. |
| Empty states per mode | NOT STARTED | Most empty states are "load a path" today. |

### PRD Phase 2 - Transposition

| PRD item | Status | Notes |
|---|---|---|
| Global transpose | SHIPPED - Phase 2, 2026-09-23 | zustand `globalTranspose` (+/-24 clamp) is the single source of truth; persists to `hse.session` + URL-syncs (boot precedence URL > persisted > legacy one-shot > 0). Pre-Phase-2 row was wrong: the legacy `transposeShift` had NO persistence writer and `?transpose=` drove nothing audible. |
| Per-exercise transpose (Etude) | SHIPPED - Phase 2, 2026-09-23 | `exerciseTranspose` (+/-12) via `src/components/TransposeControls.tsx` (Etude-only row); sounding shift = global + exercise, applied at playback/export time, never baked into path data (REQ-TRANS-7). |
| Compose key + opt-in offsets (REQ-TRANS-3) | DEFERRED - Phase 4 | Full Compose-mode transposition semantics deferred with the Compose surface (`docs/PHASE-2-TRANSPOSITION.md` section 7). |
| Effective key display | SHIPPED - Phase 2, 2026-09-23 | `src/components/EffectiveKeyBadge.tsx` (`role="status"`, `aria-live="polite"`): keyed / drift / pitch-only fallback content forms; spelling in `engine/core/spelling.ts`. |
| Cycle-all-12-keys | SHIPPED - Phase 2, 2026-09-23 | "Cycle 12" toggle advances the exercise offset +1 mod 12 per form pass (`src/lib/keyCycle.ts` x `detectFormPeriod`); suppressed under sub-range section loops. |
| Keyboard `[` / `]` / `Shift+[` / `Shift+]` | SHIPPED - Phase 2, 2026-09-23 | Brackets transpose the global offset -1/+1 and -12/+12 with Shift (PRD 9.7), matched by `e.code`; tempo +/-5 moved to `,` / `.` (muscle-memory change). Pre-Phase-2 row was wrong: the bracket bindings were tempo, not transpose. |

### PRD Phase 3 - Etude mode

| PRD item | Status | Notes |
|---|---|---|
| Constraint panel (style, key, mode, difficulty, bars, tempo, seed) | PARTIAL | Generator lab exists (`GeneratorLab`) but is a separate surface, not "Etude mode." Today Etude = curated paths, not generated ones. |
| Harmony / melody / difficulty generators | SHIPPED (engine) - Phase 3 slice 1, 2026-09-23 | `engine/etude/` + `engine/pedagogy/`: `generateEtude` - seeded deterministic harmony/melody generators over the Phase 0 `StyleProfile`s with difficulty scaling (REQ-ETU-10..15) + the 8-concept truthfulness annotator (REQ-PED-1/2/3/10/11). Pure engine, NOT user-facing yet - the constraint panel + adapter are slice 2. Legacy `melodyMarkov.ts`/`coCompose.ts` stay in `src/lib/` (superseded; consumers untouched). Design: `docs/PHASE-3-ETUDE.md`; docs: `docs/engine-etude.md`. |
| Piano roll for etude | NOT STARTED | Live score is staff notation (`LiveScoreDisplay`), not piano roll. |
| Staff notation via VexFlow | DECIDED - Q2 RESOLVED (D16): VexFlow dropped | abcjs is retained for ALL staff rendering (it is the only installed renderer; the PRD's VexFlow premise never held). REQ-ETU-21 ships via abcjs at slice 2 (new `EtudeStaffView`; `LiveScoreDisplay` untouched). `docs/PHASE-3-ETUDE.md`. |
| MIDI export | SHIPPED | `src/lib/midiExport.ts` covers `asWritten` + `splitTracks`. |
| MusicXML export | PARTIAL - chords-only via scoreExport.ts; melody voice pending slice 2 | `toMusicXml` writes chord-per-bar harmony only (no melody voice); ABC export exists. |
| Practice mechanics (metronome volume/preset/accents/subdivision, count-in, annotation surfaces, print) | NOT STARTED - pending slice 3 | Metronome toggle + section looping already exist (REQ-PRAC-20); slice 3 closes the REQ-PRAC-1/2/10/11 gaps + REQ-PED-4/5/7 surfaces + REQ-ETU-32 print, per `docs/PHASE-3-ETUDE.md`. |

### PRD Phase 4 - Compose mode

| PRD item | Status | Notes |
|---|---|---|
| MIDI upload + parse | PARTIAL | `ImportExportModal` reads `.mid` files but does not retain them as a Compose session. |
| Track role classification | PARTIAL | `midiExport.buildSplitTracks` does a lowest-note-per-step heuristic; no formal classifier. |
| Key / melody / chord analysis | PARTIAL | `analyzeChord` exists for individual chords; no key/melody inference over a file. |
| Editable analysis card | NOT STARTED | No Compose surface today. |
| Accompaniment generation | NOT STARTED | `backingEngine` plays existing style tracks but does not generate accompaniment to a user's melody. |
| WAV export | SHIPPED (limited) | `Tone.Offline` exists in `src/lib/`; used for test fixtures, not user export. |
| Privacy statement on upload | NOT STARTED | Required by REQ-IO-70 before any upload surface ships. |

### PRD Phase 5 - Explore mode

| PRD item | Status | Notes |
|---|---|---|
| Seed-based exploration | NOT STARTED | No Explore surface today. |
| Reharmonize + substitute | PARTIAL | `coCompose.ts` reharmonizes a single bar; no full progression reharm. |
| Idea cards with rationale + concept links | NOT STARTED | Depends on Pedagogy layer (Phase 6). |

### PRD Phase 6 - Pedagogy

| PRD item | Status | Notes |
|---|---|---|
| Annotations on every artifact | NOT STARTED | `PathBriefing` is the closest existing thing - curated objectives per path, not per-generated-element. |
| Concept registry (>= 8 concepts) | NOT STARTED | `TERMINOLOGY.md` exists as a glossary; no structured Concept type. |
| Concept drawer | NOT STARTED | New global component. |
| Ear training sub-mode | NOT STARTED | Quiz module (`src/data/quizzes/`) covers quiz topics; not ear training. |
| Spaced repetition | NOT STARTED | New. |

### PRD Phase 7 - Practice deepening

| PRD item | Status | Notes |
|---|---|---|
| Metronome | SHIPPED | `src/lib/rhythm.ts` + `metronomeEnabled` state; toolbar toggle. |
| Count-in | PARTIAL | Metronome ticks before playback but no visible "3... 2... 1..." |
| Section looping | SHIPPED | Loop range picker exists. |
| A/B compare | NOT STARTED | New. |
| Tempo ramp | NOT STARTED | New. |
| Latency calibration | NOT STARTED | New. |
| Web MIDI input (device list, permission) | SHIPPED | `src/lib/midiIn.ts` + `MidiInPicker.tsx` + `midiClock.ts` (clock sync). |
| Channel routing for MIDI input | SHIPPED | Channel-split for bass (commit 63d2ca5) - the foundation PRD REQ-IO-3 needs. |
| Played-correctly detection | NOT STARTED | New; depends on PRAC-40 latency calibration. |

### PRD Phase 8 - Extended I/O

| PRD item | Status | Notes |
|---|---|---|
| Chord-chart paste | PARTIAL | `src/lib/formTemplates/` has form data; no paste parser. |
| Piano-roll editor | NOT STARTED | New. |
| WAV export (user-facing) | NOT STARTED | Code path exists; not wired to a button. |
| MusicXML export | NOT STARTED | New (Q2 / Phase 3 decision). |
| ABC export | PARTIAL | `sheetMusicExport.ts` exists. |
| Session sharing via URL | NOT STARTED | No URL serialization of state today (transposition and tempo are persisted locally only). |
| `/play` route for idea links | NOT STARTED | New. |

### PRD Phase 9 - Polish & launch

Nothing to ship here yet; this phase only makes sense once Phases 0-8
are close to done. Snapshot tests for all generators is the cheapest
unblocker and can run incrementally against any shipped generator.

### Recommended first moves (PRD-aware, fit in <= 1 day each)

These are the highest-leverage near-term items from the PRD that are
also small enough to land without restructuring:

1. **Idea type stub (REQ-IDEA-1)** - define `Idea` as a tagged union
   in `src/lib/idea.ts`. No consumers yet. ~30 lines + 5 tests.
   Unblocks Phase 1 (mode selector + Idea bar).
2. **Privacy statement on MIDI import (REQ-IO-70)** - single
   `<aside>` next to the file input in `ImportExportModal.tsx`.
   Trivial. Unblocks Phase 4.
3. **Engine modules audit (REQ-FND-7)** - grep for `Math.random`
   in `src/lib/` and replace with the existing `mulberry32` import
   from `src/magenta/noise.ts`. Already-true invariant; the audit
   just makes it grep-able. ~1 file touched.
4. **Effective key display (REQ-TRANS-4)** - render the current
   sounding key in the header next to the transposition buttons.
   Single component, ~15 lines.
5. **Per-exercise transpose stub (REQ-TRANS-2)** - add an
   `exerciseTranspose` field to `useSessionStore` and a +/- pair in
   the toolbar (disabled until Etude mode exists). No UI behavior
   change yet; just the persisted field + UI affordance.

These five items are intentionally cheap: each is one PR, no new
external dependencies, no architectural decision needed. They prime
the codebase for the Phase 0/1/2 work without committing to the
multi-week Etude / Compose / Explore builds yet.
