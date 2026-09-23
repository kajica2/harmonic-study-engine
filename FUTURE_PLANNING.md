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
| Constraint panel (style, key, mode, difficulty, bars, tempo, seed) | SHIPPED - Phase 3 slice 2, 2026-09-23 | `EtudeComposerPanel` on the Etude surface (full-width, below the practice rail): 7 core controls + Generate + Randomize-seed + collapsible Advanced. Carve-out: advanced constraints ship 6 of 9 (`allowedQualities` / `allowedNumerals` / melody `range` deferred, D29). Legacy Generator Lab assistant coexists untouched. Docs: `docs/ETUDE-COMPOSER.md`. |
| Harmony / melody / difficulty generators | SHIPPED (engine) - Phase 3 slice 1, 2026-09-23 | `engine/etude/` + `engine/pedagogy/`: `generateEtude` - seeded deterministic harmony/melody generators over the Phase 0 `StyleProfile`s with difficulty scaling (REQ-ETU-10..15) + the 8-concept truthfulness annotator (REQ-PED-1/2/3/10/11). User-facing since slice 2 (`EtudeComposerPanel` + `src/lib/etudeEngine.ts` adapter); annotations stay data-only until slice 3 (no display surface). Legacy `melodyMarkov.ts`/`coCompose.ts` stay in `src/lib/` (superseded; consumers untouched). Design: `docs/PHASE-3-ETUDE.md`; docs: `docs/engine-etude.md`. |
| Piano roll for etude | SHIPPED - Phase 3 slice 2, 2026-09-23 | Static SVG display roll (`EtudePianoRoll.tsx`): Okabe-Ito palette with shape redundancy, screen-reader summary. Carve-out: display-only - the piano-roll EDITOR stays Phase 8. |
| Staff notation via VexFlow | SHIPPED via abcjs - Phase 3 slice 2, 2026-09-23 (Q2 RESOLVED, D16: VexFlow dropped) | abcjs is retained for ALL staff rendering (the only installed renderer; the PRD's VexFlow premise never held). REQ-ETU-21 ships as `EtudeStaffView.tsx` (lazy; pure ABC builder `src/lib/etudeAbc.ts` - chord symbols, bar-crossing ties); `LiveScoreDisplay` untouched. `docs/PHASE-3-ETUDE.md`. |
| MIDI export | SHIPPED | `src/lib/midiExport.ts` covers `asWritten` + `splitTracks`. |
| MusicXML export | SHIPPED - Phase 3 slice 2, 2026-09-23 (melody voice) | `toMusicXml` gains an additive second part P2 (melody) behind the "MusicXML (with melody)" button - true-form export; chord-only exports stay byte-identical (frozen pins). Carve-out: the melody ships as notation + roll only - melody AUDIO playback is NOT wired (chord backing plays through the existing chain). |
| URL constraint serialization (shareable etude links, REQ-ETU-3) | SHIPPED - Phase 3 slice 2, 2026-09-23 | `?style=&key=&tmode=&diff=&bars=&tempo=&seed=` (+ advanced keys) via the single debounced replaceState writer; same URL => same etude (round-trip pinned). `tmode` avoids the `mode=` collision with the app-mode selector. Carve-outs: boot read only (no popstate/back-forward, TD-027), no copy-link button. |
| Metronome settings (volume / presets / subdivision / accents, REQ-PRAC-1/2) | SHIPPED - Phase 3 slice 3, 2026-09-23 | Click-settings gear popover in `PracticeHeader`: independent click bus (playback volume cannot touch the click; the click left the recording tap by design), 3 syntheses (beep/click/shaker), beat-relative subdivision 1-4 (triplets ride WebAudio scheduling beside the immutable 16th grid), meter-derived accent chips (4/6/7/11/16). All prefs persist (fixes the latent `metronomeOn` read-with-no-write bug). Default config is bit-identical to the legacy click (exhaustive per-meter oracle vs the frozen `tests/rhythm.test.ts` spy). Docs: `docs/PRACTICE-MECHANICS.md`. |
| Count-in (REQ-PRAC-10/11) | SHIPPED - Phase 3 slice 3, 2026-09-23 | Pre-roll gate (`requestPlayState`) upstream of the transport: the countdown fires before ANY playback starts (grid/backing/chords untouched by construction), visible beats-left overlay (`aria-live`), 0/1/2 bars, second-press cancels, clicks sound even with the Click toggle off (opt-in IS the consent), subdivision deliberately not applied to the pre-roll. e2e leg: `e2e/count-in.spec.ts`. |
| Annotation surfaces + Concept drawer (REQ-PED-4/5/7) | SHIPPED - Phase 3 slice 3, 2026-09-23 | Margin-note chips + "About this etude" panel + Notes toggle in `EtudeViews`; concept chips open the right-slide `ConceptDrawer` (on `ModalShell`: focus trap/restore, Escape). Carve-outs: REQ-PED-4 ships the ETUDE portion only (Compose/Explore annotation hosts deferred - dirty files); REQ-PED-6 right-click chord -> drawer deferred (D39); REQ-PED-12 search + REQ-PED-13 hear-example / send-to-explore deferred (D38). |
| Print (REQ-ETU-32) | SHIPPED - Phase 3 slice 3, 2026-09-23 | Global `@media print` block + `print-area`/`print-hide` classes + WYSIWYG Print button in the etude views (active tab + visible annotations; light-token flip, 14 mm margins). Etude views only - other surfaces can opt in later. |
| Section loop ranges on generated etude paths (F3) | USER-DECISION - open | The sub-range loop math in the transport's measure handler assumes 4 steps/bar; etude paths carry 1 step/bar, so a start/end-bar range lands on the wrong window (whole-path looping unaffected). Pre-existing, not worsened by slice 3; fixing it touches the sacred handler - dedicated transport slice vs ~10-line rail gate fast-follow, per `docs/PHASE-3-SLICE3.md` D41. |

### PRD Phase 4 - Compose mode

| PRD item | Status | Notes |
|---|---|---|
| MIDI upload + parse | SHIPPED (parse, engine) - Phase 4 slice 1, 2026-09-23 | `engine/compose/` + the `src/lib/composeMidi.ts` adapter: SMF 0/1/2 parse -> tick-native `NormalizedProject` (30MB cap pre-parse, meter/tempo-map aware, never-throwing `Outcome`). Carve-outs: NOT user-facing until slice 2 (no upload UI today). Pre-slice-1 row was FALSE (C1): `ImportExportModal` does NOT read `.mid` - it is a text-only (.txt/.json/.irealb) importer for the etude catalog; the parse pipeline was 100% greenfield. Docs: `docs/engine-compose.md`. |
| Track role classification | SHIPPED (engine) - Phase 4 slice 1, 2026-09-23 | `classifyRoles` (`engine/compose/roles.ts`): deterministic feature-scored melody/bass/harmony/percussion/unknown + confidence (REQ-COMP-4). The old row ("no formal classifier", only the `midiExport.buildSplitTracks` lowest-note heuristic) predates it. NOT user-facing until slice 2. |
| Key / melody / chord analysis | SHIPPED (engine) - Phase 4 slice 1, 2026-09-23 | `detectKey` (hand-rolled Krumhansl-Schmuckler, top-3 candidates + atonal chromatic fallback), `extractMelody` (confident role track, else top-line synthesis), `inferChords` (tick-aligned grid, calibrated confidence + top-3 alternatives) behind `analyzeProject`. Carve-outs: accuracy proven on the SEEDED SYNTHETIC corpus only (key top-1 24/24, chord roots 768/768 - idealized diatonic material; real-world MIDI unproven, RK2 open); `@tonejs/midi`'s encoder does NOT round-trip key signatures (upstream bug) - flagged for the slice 4 export. |
| Editable analysis card | NOT STARTED | No Compose surface today. |
| Accompaniment generation | NOT STARTED | `backingEngine` plays existing style tracks but does not generate accompaniment to a user's melody. |
| WAV export | SHIPPED (limited) - premise corrected (C2) | The old note was FALSE: `Tone.Offline` does not exist (zero `Tone.` imports in src/; tone is a @magenta/music transitive). Offline WAV DOES ship user-facing via raw `OfflineAudioContext` + hand-rolled `encodeWav` in `src/lib/loopWav.ts` (backing-track loop render - not Compose). Compose full-mix WAV (REQ-COMP-41) is Phase 4 slice 4. |
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
| Annotations on every artifact | SHIPPED | Phase 3 slice 3 - ETUDE portion: margin-note chips + "About this etude" + Notes toggle in `EtudeViews` (annotations on every etude artifact). Compose/Explore annotation hosts deferred (dirty files). |
| Concept registry (>= 8 concepts) | NOT STARTED | `TERMINOLOGY.md` exists as a glossary; no structured Concept type. |
| Concept drawer | SHIPPED | Phase 3 slice 3: right-slide `ConceptDrawer` on `ModalShell` (REQ-PED-5), opened from etude annotation chips; global hosts + right-click entry deferred (D39). |
| Ear training sub-mode | NOT STARTED | Quiz module (`src/data/quizzes/`) covers quiz topics; not ear training. |
| Spaced repetition | NOT STARTED | New. |

### PRD Phase 7 - Practice deepening

| PRD item | Status | Notes |
|---|---|---|
| Metronome | SHIPPED | `src/lib/rhythm.ts` + `metronomeEnabled` state; toolbar toggle. |
| Count-in | SHIPPED | Phase 3 slice 3: visible beats-left overlay + pre-roll gate (`requestPlayState`, 0/1/2 bars, second-press/Escape cancels); e2e `e2e/count-in.spec.ts`. |
| Section looping | SHIPPED | Loop range picker exists (curated paths; etude paths = F3 USER-DECISION - the sub-range math assumes 4 steps/bar). |
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
