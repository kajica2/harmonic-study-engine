# PRD-001 Phase 3 Slice 3 Design: Practice Mechanics + Annotation Surfaces

Status: APPROVED DESIGN (from @architect research packet, 2026-09-23). Implementation authority for @developer. Final slice of Phase 3.
Scope (ADR-014 slice map): metronome upgrades (REQ-PRAC-1/2 P0, REQ-PRAC-10/11 count-in), annotation display surfaces + Concept drawer (REQ-PED-4 Etude portion / PED-5 P0, PED-7 P1; PED-6 decided below), print stylesheet (REQ-ETU-32 P1), carry-ins TD-035 (audit + per-site verdicts), TD-034 (verdict), TD-036a, TD-033e.
Baseline (per task packet, verified this round at HEAD 7135064): `npm test` = 1447 passed / 1 skipped / 2 failed; the 2 failures are the pre-existing CSS-WIP component tests (FormPlanner.test.tsx, FormTemplatePicker.test.tsx) - do NOT fix. `tests/` it( count = 362 (FROZEN). engine purity floor = 21. check:paths 36/36. check-links asserts README/SPEC persona+tune counts - untouched by this slice.

Rules for every new/edited file (inherited, standing): ASCII only; no `console.*` except warn/error; no `any`, no `@ts-ignore`; relative imports; engine/ purity absolute (this slice does NOT touch engine/ - annotation display is UI, click-pattern logic is src/lib pure; purity floor STAYS 21); new component tests are auto-registered by the `src/components/**/*.test.tsx` glob in vitest.config.ts JSDOM_FILES (line 14) - verify, do not duplicate; src/lib tests are node-project and drift-gate-invisible; PHASE-2-01 live-gate rule and PHASE-3-03 StrictMode one-shot rule apply to every new effect.

---

## 1. Re-audit (anchors re-mapped at HEAD 7135064; App.tsx = 4159 lines)

Line numbers shift; every anchor below was verified THIS round and is given with a search string. Cite the search string in PR descriptions if an anchor moved.

| Anchor | Location | Verified content |
|---|---|---|
| RhythmEngine grid | src/lib/rhythm.ts (144 lines, CLEAN) | setInterval at msPer16th = 60/tempo/4*1000 (start(), 89-108); `currentStep = (currentStep + 1) % stepsPerMeasure`; first step fired synchronously at 97; onMeasureStart fires INSIDE the interval when `currentStep === 0` (103-105) - once per measure, NOT for the first measure; `stepsPerMeasure` table via setTimeSignature (43-69): 16/12/14/44/64 for 4/4, 6/8, 7/8, 11/4, tintal; `setTempo` restarts the interval when running (77-83). |
| playStep (the click source) | rhythm.ts 118-141, private | Gate order: `if (!this.metronomeEnabled) return;` then step 0 -> `audioEngine.playMetronomeClick(true)`; 6/8 + 7/8 -> weak click on `step % 2 === 0`; all other meters -> weak on `step % 4 === 0`. THE beat definition: eighth-note beats in compound meters, quarter beats elsewhere. No other callback exists per step. |
| FROZEN rhythm pins | tests/rhythm.test.ts (75 lines) | `vi.spyOn(audioEngine, "playMetronomeClick")` + private playStep access via `(e as unknown as {...}).playStep(n)`. Pins: default engine enabled; `playStep(0)` -> `expect(spy).toHaveBeenCalledWith(true)` - EXACT ARITY: a second argument (even `undefined`) FAILS this assertion; muted engine fires nothing at steps 0 and 4. Hard design constraint: the default-config path must keep calling `playMetronomeClick(bool)` with ONE argument. |
| Click synthesis | src/lib/audio.ts:532-550 `playMetronomeClick(high)` | Sine 800 Hz (high) / 400 Hz (low), exponential ramp to 0.01 over 0.1 s, fixed gain 0.5 -> **connects directly to `this.masterGain`** (546) - so the master volume slider (setVolume -> masterGain, 135-137) currently scales the click. REQ-PRAC-2 independence gap. |
| Audio chain | audio.ts init() 176-223 | melodyBus -> {warmth, masterGain} -> masterGain -> compressor (LOCAL const, 203-208) -> destination (+ reverb send from compressor). Recording tap: `connectMasterTo(dest)` (147-155) attaches masterGain to the AudioRecorder destination (audioRecorder.ts:88). The compressor is NOT stored as a field today - the metronome bus needs it stored or must terminate at destination. |
| Metronome UI today | PracticeHeader.tsx (330 lines, CLEAN - NOT in dirty-11) | "Click" toggle button 249-266 (`data-testid="metronome-toggle"`, aria-pressed, Drum icon); props `metronomeOn`/`onMetronomeToggle` (71-72, 114). PlaySessionRail.tsx:73-76 comment: the rail's old metronome toggle was REMOVED at dfd2be3 - PracticeHeader is the single access point. AGENTS.md documents the sync: App.tsx `useEffect(() => rhythmEngine.setMetronomeEnabled(metronomeOn), [metronomeOn])`. |
| Metronome state + PERSISTENCE BUG | src/hooks/useSessionStore.ts:417-423, 569-570 | `metronomeOn` hydrates via `loadBool("synesthesia_metronomeOn", false)` but there is NO write path - the persist-effect block (477-499) covers humanize/melody/stylePack/quiz/feedback only. The comment at 417-420 claims "Persisted so the preference survives reloads" - FALSE at HEAD (toggle resets on reload). Fix in this slice (F2). |
| Storage registry | src/lib/storage.ts | `K.metronomeOn` (44) + STORAGE_KEYS entry (112); drift guard in src/lib/storage.test.ts:37-44 asserts EVERY K key has a registry entry - new keys must be added to both. `STORAGE_SCHEMA_VERSION = "1"` (17); new keys need no bump (only existing-shape changes do). |
| zustand session store | src/state/sessionStore.ts | v4 envelope (`hse.session`, K.session), partialize persists mode/globalTranspose/exerciseTranspose/keyCycleActive/currentIdea/etudeConstraints - i.e. SESSION-SHARE state (URL-synced via the single debounced writer, App.tsx ~1280-1310 `shouldScheduleUrlWrite`). Metronome prefs are NOT session-share state -> wrong home (D32). |
| Transport start/stop choke point | App.tsx 1411-1423 | `useEffect(() => { if (isPlayingAuto) { rhythmEngine.start(); playbackClock.start(); } else { stop x2 } cleanup stop x2 }, [isPlayingAuto])` - THE single effect that boots the grid. Every play intent funnels through `setIsPlayingAuto`. START-intent sites (7): header toggle 1974-1976; Space key 1130-1133; "Auto" audition button 3422-3426; command-commit 734-737 (`recorder.start(); setIsPlayingAuto(true)`); MIDI/transport follower 476-477; MobileCommandBar PROP PASS-THROUGH 1769-1770; PlaySessionRail PROP PASS-THROUGH 2113-2114 (rail prop type `(v: boolean) => void` at PlaySessionRail.tsx:42; rail calls at :607/:616 and nests a pass at :189). STOP-only sites (3): Escape-stop 1059-1062; auto-stop at path end 1374-1378; onStopped 3295. |
| onMeasureStart handler (W2 SACRED) | App.tsx 1353-1409 | Advances `activeStepIndex` once per measure; sub-range loop math `fromStep = loopStartBar * 4`, `totalBars = ceil(steps.length / 4)` (1365-1373) - 4-steps-per-bar assumption; cycle-12 via `shouldAdvanceKeyCycle` + `queueMicrotask(advanceKeyCycle)` (1389-1401); deps `[path.steps.length, loopStartBar, loopEndBar, formLen, keyCycleActive]`; detaches noop callback on cleanup. MUST NOT change (constraint). |
| formLen / cycle-12 safety | App.tsx 711; src/lib/keyCycle.ts | `formLen = detectFormPeriod(path.steps)` - shape-agnostic: on a padded etude path (whole-form passes, `steps.length % bars === 0`) it returns the true form length IN STEPS (= bars, 1 step/bar). Cycle math `nextStepIndex % formLen === 0` is therefore ALREADY correct for etude paths. No action needed; do not touch. |
| Etude path shape | src/lib/etudeEngine.ts:117-155, 203-210 | `etudeToHarmonicPath`: ONE STEP PER BAR, padded by whole-form passes to >= 96 steps; `etudeActiveBarFor(etude, stepIndex) = ((step % bars) + bars) % bars`. The EtudeViews mount (App.tsx 3841-3864) already uses it behind the render gate `activeEtude && path.id === etudePathId(activeEtude)`. |
| TD-035 sites (floor(step/4) family) | see D41 verdict table | App.tsx 534 + 551-552 (handleCoComposeAccept: writes FOUR steps `activeBar*4 + s`), App.tsx 2049 (CoComposePanel mount seed/barIndex), App.tsx 3872 (melody-lane activeBar), PlaySessionRail.tsx:577 (currentBar label + loop-range UI), InspectPanel.tsx:89 (DIRTY, label only), LiveScoreDisplay.tsx:94 + 521 (DIRTY; 94 uses `stepsPerBar(timeSignature)` from loopWav - meter-aware but still 4-beats-per-step-group, wrong for 1-step-per-bar etude paths; 521 hardcoded `/4` label). |
| melodyByStep consumers | grep-verified | ONLY MelodyLane.tsx (edit/display) + storage + App 3874-3901 (lane wiring). NO audio playback path exists anywhere in src (the lane's "audio" label is aspirational; TD-034 confirms "chords play, melody does not"). Chord audition on step change (App 919-945) plays `currentChordNotes` - not melody. Basis of the TD-034 verdict (D42). |
| Annotation data (shipped, unused by UI) | engine/pedagogy/types.ts, concepts.ts:176-181; engine/etude/types.ts:102 | `Etude.annotations: readonly Annotation[]`; Annotation = { id, target: chord{bar} / progression{fromBar,toBar} / note{slot} / melody / voicing{bar} / scale, label (<=40 ch), text (1-3 sentences), conceptId (resolves when non-null, test-pinned), confidence }. Slice-1 detectors EMIT only chord/progression/melody targets. Registry accessors EXIST: `getConcept(id): Concept | null`, `allConcepts()`, `CONCEPT_IDS` (8). No src/ file renders annotations today (grep "annotation" in src hits only tests + leadSheet comment). |
| Modal precedent + z-ladder | src/components/ModalShell.tsx (CLEAN); index.css 160-187 | ModalShell: role=dialog + aria-modal, labelledBy, Escape, backdrop click, FOCUS TRAP + focus restore, body scroll lock, backdrop `fixed inset-0 z-50`. Ladder: sticky header z-30, recording pill z-50, error strip z-50, modals z-50. Drawer reuses ModalShell (D38) -> z-50 consistent, no new trap machinery. |
| EtudeViews (annotation host - VERIFIED) | src/components/EtudeViews.tsx (97 lines, CLEAN, slice-2) | Section with Roll/Staff tab pair; props { etude, pathId, transposeShift, activeBar }; lazy EtudeStaffView boundary inside. Natural host: it already owns the etude object and the tab state; annotations ride in without new App wiring (D37). |
| Print today | src/index.css (187 lines); grep `@media print` | ZERO print rules anywhere (only max-width 768 + prefers-reduced-motion blocks at 116/124). Greenfield. PHASE-3-ETUDE.md:438 proposed jsPDF reuse, but REQ-ETU-32 literally says "via browser print with print-optimized stylesheet" (D40). |
| Count-in today | grep `countIn` / `CountIn` in src/ | ZERO code. Greenfield. |
| e2e convention | e2e/etude-composer.spec.ts + playwright.config.ts | Serves built dist/ on :4173 (`npx serve dist -p 4173 -L`); discriminative DOM-state assertions (not audio); `test.setTimeout(90_000)` with an honest runtime justification in the header comment; FIRST_PATH_TITLE HARDCODED as a string (TD-033e - the real value lives in src/lib/paths.ts:92). |
| Findings (new, this audit) | F1-F4 | F1: frozen playStep spy pins single-arg `playMetronomeClick(true)` (shapes D33/D34). F2: metronomeOn has NO persistence write path despite the comment - latent bug, fixed by D32. F3: the SUB-RANGE LOOP math inside the sacred onMeasureStart handler assumes 4 steps/bar - on etude paths `loopStartBar * 4` lands 4x late (wrong window, never crashes). NOT in TD-035's listed sites; fixing it touches the W2 handler -> USER-DECISION flag, see D41 + Risks. F4: `recorder.start()` at App 736 fires BEFORE playback - with count-in it will also capture the pre-roll beats (note-event recorder, not audio; accepted, documented in D35). |

---

## 2. Decisions

### D32: Metronome settings model + persistence home = legacy localStorage registry (NOT zustand).

Decision: one config object, one new storage key, managed in src/hooks/useSessionStore.ts next to the existing `metronomeOn`:

```ts
// src/lib/metronomePatterns.ts (types live with the pure logic)
export type MetronomePreset = "beep" | "click" | "shaker";
export type MetronomeSubdivision = 1 | 2 | 3 | 4;
export interface MetronomeConfig {
  volume: number;              // 0..100, default 80 (independent bus - D33)
  preset: MetronomePreset;     // default "beep" (closest to the current sound)
  subdivision: MetronomeSubdivision; // default 1 (= today's quarter/eighth pulse)
  accentBeats: readonly number[];    // 0-based BEAT indices sounded high; default [0] (= today)
  countInBars: 0 | 1 | 2;      // default 0 (= today: no pre-roll)
}
export const DEFAULT_METRONOME_CONFIG: MetronomeConfig;
export function normalizeMetronomeConfig(raw: unknown): MetronomeConfig; // corruption-safe
```

- Storage: `K.metronomeConfig = "synesthesia_metronomeConfig"` (JSON blob) + STORAGE_KEYS registry entry `{ key: K.metronomeConfig, since: "1", shape: "MetronomeConfig JSON" }` (the drift guard in src/lib/storage.test.ts requires the registry entry; new keys need no schema bump). Hydrate via the existing `loadJSON` + `normalizeMetronomeConfig` (clamps volume, whitelists preset/subdivision/countIn, filters accentBeats to valid beat indices at read time per meter - actually stores raw ints; UI + clickActionFor ignore out-of-range beats, so a meter change never corrupts data).
- `metronomeOn` STAYS its own `"0"|"1"` key (F2 fix): add the missing `useEffect(() => storageSet(K.metronomeOn, metronomeOn ? "1" : "0"), [metronomeOn])` in the persist block. This makes the existing comment true instead of deleting it.
- Rejected (zustand sessionStore): `hse.session` is the SESSION-SHARE envelope - partialized fields feed the URL writer and the mode-switch dirty semantics; metronome taste is a cross-session USER PREF (like volume/instrument, which all live in the legacy registry). Putting it there would either leak click taste into share URLs (if partialized) or fight the v4->v5 migration + runner pins for zero benefit. The task hint "the store already has the persist+migrate machinery" is true but the machinery is aimed at the wrong object: prefs are not session state. The legacy hook already owns `metronomeOn`, `volume`, `loop*` - cohesion wins.
- Engine purity: accent/subdivision logic is a src/lib pure module (metronomePatterns.ts), NOT engine/ - it is transport glue, not music theory. Purity floor STAYS 21; no ADR-014 amendment needed.
- Confidence: HIGH.

### D33: Click bus - independent metronome volume via a dedicated gain node in audio.ts; presets as engine-internal state.

Decision (all additive; `playMetronomeClick(high: boolean)` KEEPS its single-arg public signature):
- Store the compressor as a field (`private compressor: DynamicsCompressorNode | null`) during init; create `private metronomeGain: GainNode` (gain = default 0.8) wired `metronomeGain -> compressor` - the click bypasses `masterGain` (so the playback-volume slider cannot touch it: REQ-PRAC-2) but still shares the safety limiter + destination path. playMetronomeClick re-targets its envelope gain node from masterGain to `this.metronomeGain ?? this.masterGain` (pre-init fallback keeps the no-ctx guard behavior).
- `setMetronomeVolume(v01: number)` / `getMetronomeVolume()` - setTargetAtTime like setVolume (0.05 time constant). App sync effect: `useEffect(() => audioEngine.setMetronomeVolume(cfg.volume / 100), [cfg.volume])` - the documented AGENTS.md sync pattern, extended.
- Presets: `setMetronomePreset(p: MetronomePreset)` stored on the engine; playMetronomeClick switches synthesis internally:
  - "beep" = CURRENT sound verbatim (sine 800/400, 0.1 s) - default, zero behavior change on upgrade.
  - "click" = square 1000/600 Hz, 0.03 s decay, gain 0.3 - dry stick.
  - "shaker" = noise burst from a lazily-created 0.05 s white-noise buffer through a bandpass (6 kHz high / 4 kHz low), 0.06 s decay - soft-attack option.
  All ASCII comments; no assets; no new deps.
- `scheduleMetronomeClick(high: boolean, delaySec: number)` - NEW method: same synthesis as playMetronomeClick but triggered at `ctx.currentTime + delaySec` (WebAudio sample-accurate). Used ONLY by the triplet path (D34) and never by the legacy-equivalent default config - the frozen spy pin (F1) is safe because the single-arg immediate path is untouched.
- Recording consequence (documented, accepted): the click leaves the masterGain tap, so `AudioRecorder` takes no longer contain the click. That is an improvement for practice recordings (the click is a monitoring signal); the note-event recorder (recordNoteOn/Off) is unaffected.
- Confidence: HIGH.

### D34: Subdivision + per-beat accents = pure pattern module consumed by playStep; grid, stepsPerMeasure, onMeasureStart UNTOUCHED; triplet rides WebAudio, not the JS grid.

Decision: `src/lib/metronomePatterns.ts` owns ALL click math:

```ts
export function stepsPerBeatFor(ts: TimeSignature): number;      // 6/8,7/8 -> 2; else 4 (matches F1-era playStep)
export function beatsPerMeasureFor(ts: TimeSignature): number;   // stepsPerMeasure / stepsPerBeat -> 4,6,7,11,16
export type ClickAction =
  | { kind: "none" }
  | { kind: "click"; high: boolean }
  | { kind: "triplet"; high: boolean; secPerBeat: number };      // schedule 2 extra clicks inside the beat
export function clickActionFor(
  step: number, ts: TimeSignature, subdivision: MetronomeSubdivision,
  accentBeats: readonly number[], secPerBeat: number,
): ClickAction;
```

- Semantics: subdivision is RELATIVE TO THE BEAT (the repo's beat: quarter in 4/4/11/4/tintal, eighth in 6/8/7/8 - the existing step%4 vs step%2 split, now derived via `stepsPerBeatFor`). s=1: one click per beat (TODAY). s=2: half-beat period (`stepsPerBeat / 2`, floor 1). s=4: quarter-beat period (clamps to every step where stepsPerBeat=2 - in compound meters s=2 and s=4 both yield the 16th grid; documented in the UI: "beat" tooltip). s=3: TRIPLET - three clicks per beat at beat boundaries via `click` (first) + `scheduleMetronomeClick(false, secPerBeat/3)` + `(false, 2*secPerBeat/3)`. The setInterval grid NEVER changes: triplet resolution lives in WebAudio time (the same jitter class the grid already has; within-beat spacing is sample-accurate). This is the answer to "verify the grid can carry it": it carries 1/2/4 natively; 3 rides beside it without touching it.
- Accents: `high = accentBeats.includes(beatIndex)` where `beatIndex = floor(step / stepsPerBeat)`; non-accented clicks are weak; an empty accentBeats = all-weak (allowed - user choice). Default `[0]` reproduces today's downbeat-only accent exactly.
- rhythm.ts changes (CLEAN file, surgical): add `private subdivision = 1; private accentBeats: readonly number[] = [0];` + ONE atomic setter `setMetronomePattern(subdivision, accentBeats)` (mirrors the setMetronomeEnabled shape; App sync effect: `useEffect(() => rhythmEngine.setMetronomeEnabled(metronomeOn), ...) // existing` gains a sibling `useEffect(() => rhythmEngine.setMetronomePattern(cfg.subdivision, cfg.accentBeats), [cfg.subdivision, cfg.accentBeats])`). playStep becomes: `if (!metronomeEnabled) return; const a = clickActionFor(step, timeSignature, subdivision, accentBeats, 60000/tempo/1000 * (stepsPerBeatFor(timeSignature) / 4));` switch on kind. Default fields => DEFAULT ENGINE IS BIT-IDENTICAL in click behavior.
- HARD SAFETY RULE (F1): the "click" branch calls `audioEngine.playMetronomeClick(high)` with EXACTLY one argument. The frozen tests/rhythm.test.ts `toHaveBeenCalledWith(true)` must stay green - T1 pins the full legacy-equivalence table so CI catches any drift.
- MUST NOT (constraint honored): stepsPerMeasure table, setInterval rate, currentStep wrap, onMeasureStart timing, playStep's gating order, metronomeEnabled default true. None change.
- Confidence: HIGH.

### D35: Count-in = App-level PRE-ROLL GATE in front of `isPlayingAuto`; rhythm.ts never knows it exists.

Decision: count-in runs BEFORE the grid starts, so the grid itself is untouched:

- New pure module `src/lib/countIn.ts`: `countInBeats(bars: number, beatsPerBar: number): number[]` (total tick count = bars * beatsPerBar; returns the remaining-beat sequence [total..1]) + `countInDurationMs(bars, beatsPerBar, tempo)`. Node-tested; the visible "3.. 2.. 1.." is exactly `beatsLeft` from this sequence.
- New hook `src/hooks/useCountIn.ts`: imperative `start()` / `cancel()` (user-gesture-driven, NOT a boot effect - the PHASE-3-03 one-shot rule does not apply; the internal timer effect cleans up on unmount and re-derives interval ms when tempo/beatsPerBar change mid-count, preserving beatsLeft). Each tick: fire the click via `audioEngine.playMetronomeClick(beatsLeftInBar === beatsPerBar)` (downbeat high - honors preset + volume through the D33 bus; beat pulse only, subdivision deliberately NOT applied during count-in: the pre-roll exists to establish the TEMPO, subdivided pre-roll is a metronome-app anti-pattern; documented deviation from a maximal reading of "honoring the metronome config") + update `beatsLeft` state. At 0: `cancel()` internals + call `onComplete()`.
- Interception point (the ONLY wiring change): a `requestPlayState` wrapper in App with the SAME `Dispatch<SetStateAction<boolean>>` signature as `setIsPlayingAuto`, so every existing consumer prop keeps its type. CRITICAL SEMANTICS: the wrapper resolves a functional updater against the COMBINED active state `wasActive = isPlayingAuto || countInActive` (via a ref), NOT against `isPlayingAuto` alone - otherwise the toggle sites (which today compute `!isPlayingAuto` from a value that stays false throughout the pre-roll) would pass `true` during count-in and a naive wrapper would RESTART the count-in instead of cancelling it:
  - `requestPlayState(true)` / `requestPlayState(p => !p)` while `!wasActive`: `cfg.countInBars > 0 && !rhythmEngine.isRunning` -> start count-in; else `setIsPlayingAuto(true)`.
  - `requestPlayState(p => !p)` while `countInActive` (a second Play press during pre-roll): resolves to `false` -> `countIn.cancel()`, stay idle (the press becomes a cancel - intuitive).
  - `requestPlayState(false)` while counting: `countIn.cancel()`, stay idle.
  - `requestPlayState(false)` while playing: `setIsPlayingAuto(false)` directly.
  - The three TOGGLE sites (header 1975, Space 1132, Audition 3423) MUST switch from `setIsPlayingAuto(!isPlayingAuto)` to `requestPlayState((p) => !p)` (functional form, so the wrapper's `wasActive` resolution governs); the two pure-START sites (command-commit 736, follower 477) pass literal `true`; the stop-only sites stay raw (below).
  - Rewire the SEVEN start-intent sites (see the choke-point anchor row) to the wrapper: header onPlayPause (1974-1976), Space (1130-1133), "Auto" audition button (3422-3426), handleCommandCommit (734-737), transport follower (476-477), and the two PROP PASS-THROUGHS - MobileCommandBar (1769-1770) and PlaySessionRail (2113-2114; the wrapper satisfies the rail's narrower `(v: boolean) => void` prop type since `Dispatch<SetStateAction<boolean>>` accepts plain booleans by contravariance). Escape-stop (1059), auto-stop (1374-1378), onStopped (3295) are STOP paths - leave them on the raw setter (idempotent, no gate needed; a stop can only arrive while playing).
  - Consumers that render a Play/Pause glyph from `isPlayingAuto` (header `isPlaying`, rail `isPlayingAuto`, MobileCommandBar) gain `isPlayingAuto || countInActive` so the button shows PAUSE during the pre-roll (pressing it cancels) - a one-token change at each of the three display props, no component edits.
  - The start/stop effect (1411-1423) and the onMeasureStart handler (1353-1409) DO NOT CHANGE AT ALL: during count-in `isPlayingAuto` is still false, so no grid, no backing engine (1445/1471 effects also keyed on isPlayingAuto - they stay silent), no chord advance (activeStepIndex frozen), no cycle-12 ticks. REQ-PRAC-10 "plays before any playback starts" is satisfied by construction, and the measure-tick contract is structurally unbreakable because the gate sits upstream of the whole playback cluster.
- Semantics (documented): count-in fires even when `metronomeOn === false` (opting into bars > 0 IS the consent; a silent count-in defeats the purpose - the visible numbers still render); it counts beats, not bars ("8..7..6..5..4..3..2..1.." for 2 bars of 4/4; big number = beatsLeft, small line = "bar X of N"); it does not seek - playback resumes at the current step; tempo changes mid-count re-pace the remaining beats.
- F4 accepted: `recorder.start()` at 736 still fires before the wrapper - the take window includes the pre-roll (note-event recorder; no audible click is recorded since D33 moved the click off the tap).
- New `src/components/CountInOverlay.tsx`: fixed, pointer-events-none, centered, `z-40` (above the z-30 header, below the z-50 modal/drawer layer - a modal opening during count-in stays usable); huge mono number + bar subline; `role="status" aria-live="assertive"` (screen-reader count-down is the P1 REQ-PRAC-11 win); mounted in App iff `countIn.active`.
- Confidence: HIGH (the wrapper is the whole blast radius; grep-verified all seven start-intent sites + three stop-only sites).

### D36: MetronomeControls = popover anchored in PracticeHeader (CLEAN file - the click's home surface).

Decision: extend PracticeHeader with a small "gear" button beside the existing Click toggle (same row, same token styling), toggling a `<details>`-free absolute-positioned popover (`z-40`, closes on Escape + outside click + toggle-off) rendering the NEW `src/components/MetronomeControls.tsx`:
- Controls: volume range 0-100 (label "Click volume" + hint "independent of playback volume"); preset select (Beep/Click/Shaker); subdivision segmented buttons 1/2/3/4 with beat tooltip ("1 = quarter (current), 2 = split the beat, 3 = triplet, 4 = sixteenth; clamps to the grid in compound meters"); accent beat chips - one toggle per `beatsPerMeasureFor(timeSignature)` (4/6/7/11/16 chips, re-derived live when meter changes; chip 1..N, aria-pressed); count-in bars segmented 0/1/2.
- Props: `{ config: MetronomeConfig; timeSignature: TimeSignature; onChange: (next: MetronomeConfig) => void }` - pure presentational; App owns state via useSessionStore; PracticeHeader gains two props (`metronomeConfig`, `onMetronomeConfigChange`) plus the existing `timeSignature` it already receives.
- Rejected: mounting in PlaySessionRail (its metronome UI was deliberately REMOVED at dfd2be3 - rail 73-76 comment; do not resurrect); mounting as a global drawer (the drawer is for concepts, PRD 9.5; settings drawer is a different P1 not in this slice).
- Confidence: HIGH.

### D37: Annotation surfaces live in EtudeViews (host verified); drawer state owned locally; toggle is local UI state.

Decision: EtudeViews gains (all inside the existing section, no new App wiring beyond nothing - it already receives `etude`):
- "Notes" toggle button in the tab row (aria-pressed, default ON) -> hides BOTH margin chips and the About list (REQ-PED-7). Local `useState` - a per-session reading preference, not a persisted taste (unlike metronome: this is view state, the PRD does not mandate persistence; documented).
- Margin-note strip: below the active tab's view, one row per annotation that has a bar-resolvable target: `chord{bar}` -> bar; `progression{fromBar,toBar}` -> "bars a-b"; `melody` -> "melody". Rendered as chips: `[m3-4] ii-V-I` (label + target prefix). Chip click -> `setDrawerConceptId(annotation.conceptId)` when non-null (REQ-PED-5 P0); annotations with null conceptId render as static text (no dead click target). The active bar's chips get a subtle brand-border highlight (uses the existing `activeBar` prop - live by construction, ADR-011 render-time rule honored, no subscriptions).
- "About this etude" panel: `<details>` (default CLOSED, house pattern from the composer Advanced fold) inside the section: title line (style/key/bars/difficulty/seed echo - reuses etude fields, no new data path) + the full annotation list in margin-note style (label bold + text, hairline separators, `t-serif`-ish small text per the workbook house style). Each entry with a conceptId gets a "What is <title>?" link button -> opens the drawer.
- ConceptDrawer state: local `useState<string | null>` inside EtudeViews; the drawer is fixed-position (renders over everything regardless of the host's layout). When OTHER surfaces (Compose/Explore, later slices) need it, lift to a global slot then - premature now (two consumers would be speculative).
- REQ-PED-4 scope honesty: this slice ships the ETUDE portion (margin notes + About panel). The Compose "under chords" and Explore "idea card body" portions of the P0 remain open - listed in NOT-doing + traceability, NOT silently dropped.
- Confidence: HIGH.

### D38: ConceptDrawer = ModalShell variant (right-slide); PED-12/PED-13 deferred.

Decision: `src/components/ConceptDrawer.tsx`, props `{ conceptId: string; onClose: () => void }`:
- Built on ModalShell (`labelledBy`, `onDismiss=onClose`, `backdropClassName="bg-black/50"`, `className` = right-anchored card: `fixed right-0 top-0 h-full w-full max-w-md rounded-none border-y-0 border-r-0` + slide-in via a CSS keyframe in index.css (`@keyframes drawer-in { from { transform: translateX(100%) } }`, honor prefers-reduced-motion - the block at index.css:124 already exists to extend). Focus trap, Escape, focus restore, aria-modal: FREE from ModalShell - do NOT reimplement.
- Content: `getConcept(conceptId)` (null -> render nothing, defensive; registry resolution is test-pinned upstream so this is a pure guard, no console noise). Header: title + category badge (category -> color token map, non-color-coded text label present); definition; body split on `"\n\n"` -> paragraphs; references "label - URL" -> split on the LAST " - " -> anchor `rel="noopener noreferrer"` (all 8 shipped concepts have references: null - the code path is still tested with a fixture); related: chips -> `getConcept(relatedId)` -> in-drawer navigation via local state (`const [shown, setShown] = useState(conceptId)`; reset on prop change via the key-prop pattern: host renders `<ConceptDrawer key={conceptId} ...>`).
- Deferred (P1, honest): REQ-PED-12 global header search (needs a search surface + header real-estate decision - its own slice); REQ-PED-13 "Hear an example" (needs a numeral->audio path: exampleNumerals are grammar tokens requiring key context + the generator's chord spelling - real work, adjacent to TD-034's audio deferral) and "Send to Explore" (needs the Idea pipeline for concept kinds - Idea is chord-kind today). The drawer body reserves a footer slot comment marking where PED-13 lands.
- Confidence: HIGH.

### D39: REQ-PED-6 (right-click chord symbol -> drawer) = DEFER.

Decision: defer with rationale. (a) The chord-symbol surfaces a player would right-click are LiveScoreDisplay (DIRTY - off-limits) and LeadSheet/rail strip (bar-click already owns the rail strip's hit target with Idea minting at App 2294-2311 - overloading right-click there risks the bar-click contract). (b) The P0 path (annotation click -> drawer, REQ-PED-5) fully ships in this slice; PED-6 is a discoverability nicety on top. (c) A clean implementation wants a `conceptIdForBar(path, bar)` helper reading etude annotations by bar - trivial ONCE the dirty-11 land and the live score can host a contextmenu handler. Recorded as a follow-up (new TD candidate: TD-037 "PED-6 right-click chord -> ConceptDrawer; blocked on dirty-11 LiveScoreDisplay").
- Confidence: HIGH.

### D40: Print = global `@media print` block in index.css + `print-area`/`print-hide` classes + WYSIWYG print button in EtudeViews.

Decision (REQ-ETU-32 P1, browser-print path per the literal requirement - NOT the jsPDF alternative):
- `src/index.css` (CLEAN, 187 lines) gains a trailing `@media print` block - the ONLY place print CSS lives (component-scoped Tailwind cannot express "hide the rest of the app" without touching the DIRTY chrome components; a global stylesheet is the clean, zero-collision home):
  - `body * { visibility: hidden }` + `.print-area, .print-area * { visibility: visible }` + `.print-area { position: absolute; left: 0; top: 0; width: 100% }` - the visibility pattern (NOT display:none) avoids fighting the flex/grid app layout; the app's fixed/sticky header, sidebars, keyboard, and IdeaBar all vanish WITHOUT a single component edit.
  - `.print-hide { display: none !important }` on in-area controls (tab buttons, Notes toggle, print button, drawer trigger chrome).
  - Light-token flip in ONE rule: `.print-area { --color-bg-1: #ffffff; --color-bg-2: #f4f4f5; --color-text-1: #18181b; --color-text-2: #3f3f46; --color-text-3: #71717a; --color-border: #a1a1aa; }` - every Tailwind `var()`-driven class inside EtudeViews (bg-[color:var(--color-bg-1)] etc.) re-resolves to print-safe values; the piano roll's hardcoded Okabe-Ito fills and abcjs's black-on-transparent SVG both print correctly on white (Okabe-Ito was chosen for CVD - it is also print-safe).
  - `@page { margin: 14mm }` + a `print-color-adjust: exact` line on `.print-area svg` so lane tints survive grayscale-ish printers.
- EtudeViews section gains `className="... print-area"`; its toolbar row gains `print-hide`; NEW "Print" button: `() => { try { window.print(); } catch { /* jsdom/no-op */ } }` - WYSIWYG (prints the ACTIVE tab: staff is the notation-first default players print; roll prints too since both are SVG - no forced tab switch, no lazy-load race, no print-after-Suspense timing machinery; documented).
- Scope: etude views ONLY (the REQ lives under the etude section). Masterclass/lead-sheet print is out of scope; the classes are generic so a later slice can tag more roots.
- Confidence: HIGH.

### D41: TD-035 - per-site verdicts (audit complete; ONE must-fix, the rest document or App-side).

| Site | Etude-path behavior | Verdict |
|---|---|---|
| App.tsx 532-552 handleCoComposeAccept | CORRUPTING: writes 4 consecutive steps (`activeBar*4 + s`) = FOUR DIFFERENT etude bars from one accept; `activeBar = floor(step/4)` also lags 4x | FIX (App-side, this slice): gate the CoComposePanel mount (App 2048-2051 IIFE) behind `!isEtudePath` - the same render-time pattern as the EtudeViews gate (`path.id === etudePathId(activeEtude)`; import etudePathId - already imported at App 178). Co-compose editing on generated etudes is a product decision (the 4-step write model is legacy-path-shaped); a correct single-step accept needs the alternative->step semantics revisited - out of slice scope. Panel hidden => accept handler unreachable => corruption impossible. Documented in NOT-doing + a one-line comment at the gate. |
| App.tsx 2049 CoComposePanel seed/barIndex | feeds the wrong bar into the suggestion seed | FIXED by the same gate (component unmounted for etude paths). |
| App.tsx 3872 melody-lane activeBar | label + edit key lag 4x; edits land in melodyByStep | DOCUMENT-SAFE: melodyByStep has NO audio consumer (F-audit: grep-verified - MelodyLane display only), so a mis-keyed edit is invisible-but-harmless; the lane is legacy-path tooling. Gate NOT applied (the lane is also a manual sketch pad; hiding it is a product call). Comment added at 3872 pointing at TD-035. |
| PlaySessionRail.tsx 577 currentBar (+ shift-click loop range UI) | bar label lags 4x; range-set UI invites F3's broken math | DOCUMENT (clean file but the fix must match the HANDLER's bar->step model - fixing only the rail label creates an inconsistency; see F3 row). |
| App.tsx 1365-1373 loop math in onMeasureStart (F3 - NEW finding) | sub-range loop window lands 4x late on etude paths (steps = bars); whole-path loop unaffected | USER-DECISION FLAG. The handler is the W2-sacred contract this slice is forbidden to alter; a correct fix (steps-per-path-bar aware conversion, detectable via `path.steps.length % etude.bars === 0` or an explicit path-shape field) needs its own transport slice + property tests. Recommend: interim UI note in the loop tooltip OR ship the rail gate in a follow-up. NOT touched here. Recorded in Risks + HANDOFF concerns. |
| InspectPanel.tsx 89 | label-only lag | DOCUMENT (DIRTY file, off-limits; fix rides the dirty-11 landing). |
| LiveScoreDisplay.tsx 94 / 521 | 94: meter-aware `stepsPerBar(ts)` but still assumes steps-per-bar >= beats; etude paths (1 step/bar) highlight lags; 521: hardcoded `/4` label | DOCUMENT (DIRTY, off-limits; the etude's OWN roll/staff views are the correct etude surfaces - the live score is secondary for generated paths; fix = accept an `activeBarOverride` prop when dirty-11 land). |
- Confidence: HIGH (every site opened and read this round; the one corrupting site gets a zero-risk App-side gate).

### D42: TD-034 (etude melody AUDIO) - FORMAL DEFERRAL.

Decision: defer; do NOT ship the "minimal" melodyByStep-on-accept subsample. Rationale: the audit found melodyByStep has NO playback consumer anywhere in src (D41 row 3; TD-034's own text confirms "chords play, melody does not") - seeding it on accept would write data into a dead store: zero user value, nonzero key-shape risk (the lane's 4-slots-per-bar vs the etude's 8-eighth-slot grid would silently mismatch MelodyLane's `length === STEPS_PER_BAR` guard at App 3919). Real etude melody audio needs a step-synced note scheduler inside the grid (rhythmEngine currently exposes NO per-step callback to the audio layer - adding one touches the W2 contract) or playbackClock-beat-driven scheduling (the clock's rAF `beat`/`step` detail exists but is a wall-clock approximation that can drift from the setInterval grid - a melody on top of it would phase against the click). Either is a dedicated slice with its own timing contract. Recorded: TD-034 stays Open with this verdict appended; NOT-doing lists it.
- Confidence: HIGH.

### D43: Drive-bys - TD-036a (ship), TD-033e (ship).

- TD-036a: docs/MODES.md line 1 `# Modes (PRD-001 Phases 1-2)` -> `# Modes (PRD-001 Phases 1-3)` (Phase 3 ships etude mode surfaces; the body already describes all three modes). One-line docs edit.
- TD-033e: e2e/etude-composer.spec.ts `FIRST_PATH_TITLE` hardcoded -> `import { ALL_PATHS } from "../src/lib/paths"` (verify the exact export name at implementation - the title lives at src/lib/paths.ts:92) and derive `const FIRST_PATH_TITLE = ALL_PATHS[0].title`. Drift-gated by construction; playwright transpiles the TS import; zero CI cost. If the import crosses a config boundary that breaks the e2e runner, fall back to a comment pin + record TD-033e still-open (the fallback must be a one-line note in the spec, not silence).
- TD-033 a-d: untouched (out of slice scope, per the register's own scoping).
- Confidence: HIGH.

### D44: e2e - ONE count-in leg ships; the metronome config itself stays unit-covered.

Decision: new `e2e/count-in.spec.ts`, one test, ~25 s: fresh boot -> default path -> open Click-settings popover -> set count-in = 1 bar -> press Play -> assert the CountInOverlay appears with a DECREASING number BEFORE the transport enters playing state (the overlay is the discriminator: without the feature, playing starts immediately and no overlay exists) -> assert overlay disappears and the rail/header show playing. Uses `data-testid="countin-overlay"` + `data-beats-left`. Honest cost: +1 page load + ~20 s real-time counting at default tempo (one bar of 4 beats ~ 3 s at 80 BPM + load) - the suite currently runs 2 specs; this makes 3, still well under a minute of added CI. Justification: the count-in is a TIMING feature (pre-roll sequencing across three effects) - jsdom cannot assert "clicks fired before the grid started"; the DOM-state sequence is the only end-to-end proof. Volume/preset/accents/subdivision are pure-logic (T1/T2) + manual-audio - NO further e2e legs (honest: audio output is untestable in CI; adding more would be theater).
- Confidence: MEDIUM-HIGH (timing assertions need generous waits; mitigation in Risks).

---

## 3. Component / module API sketches

```ts
// src/lib/metronomePatterns.ts  (pure; node-tested; imports ONLY src/lib/rhythm types)
export type MetronomePreset = "beep" | "click" | "shaker";
export type MetronomeSubdivision = 1 | 2 | 3 | 4;
export interface MetronomeConfig { volume: number; preset: MetronomePreset;
  subdivision: MetronomeSubdivision; accentBeats: readonly number[]; countInBars: 0 | 1 | 2; }
export const DEFAULT_METRONOME_CONFIG: MetronomeConfig;      // {80,"beep",1,[0],0}
export function normalizeMetronomeConfig(raw: unknown): MetronomeConfig;
export function stepsPerBeatFor(ts: TimeSignature): number;  // 2 | 4
export function beatsPerMeasureFor(ts: TimeSignature): number;
export type ClickAction = { kind: "none" } | { kind: "click"; high: boolean }
  | { kind: "triplet"; high: boolean; secPerBeat: number };
export function clickActionFor(step: number, ts: TimeSignature,
  subdivision: MetronomeSubdivision, accentBeats: readonly number[], secPerBeat: number): ClickAction;
export function legacyClickEquivalent(step: number, ts: TimeSignature): boolean; // test oracle

// src/lib/countIn.ts  (pure)
export function countInBeats(bars: number, beatsPerBar: number): number[];   // [total..1]
export function countInDurationMs(bars: number, beatsPerBar: number, tempo: number): number;

// src/lib/rhythm.ts  (EDITED - additive)
class RhythmEngine {
  setMetronomePattern(subdivision: MetronomeSubdivision, accentBeats: readonly number[]): void;
  // playStep: gate unchanged -> clickActionFor -> switch(kind)
}

// src/lib/audio.ts  (EDITED - additive)
class AudioEngine {
  setMetronomeVolume(v01: number): void;   // metronomeGain -> compressor (bypasses masterGain)
  getMetronomeVolume(): number;
  setMetronomePreset(p: MetronomePreset): void;
  playMetronomeClick(high: boolean): void;                       // UNCHANGED single-arg contract
  scheduleMetronomeClick(high: boolean, delaySec: number): void; // WebAudio-time triplet clicks
}

// src/hooks/useCountIn.ts
export interface UseCountInResult { active: boolean; beatsLeft: number; start: () => void; cancel: () => void; }
export function useCountIn(opts: {
  bars: number; beatsPerBar: number; tempo: number;
  onBeat: (beatsLeft: number, isDownbeat: boolean) => void;
  onComplete: () => void;
}): UseCountInResult;

// src/App.tsx  (EDITED - wiring only)
const requestPlayState: Dispatch<SetStateAction<boolean>>; // count-in gate in front of setIsPlayingAuto

// src/components/MetronomeControls.tsx
export interface MetronomeControlsProps {
  config: MetronomeConfig; timeSignature: TimeSignature;
  onChange: (next: MetronomeConfig) => void;
}

// src/components/CountInOverlay.tsx
export interface CountInOverlayProps { beatsLeft: number; beatsPerBar: number; totalBars: number; }
// root: data-testid="countin-overlay" data-beats-left={beatsLeft} role="status" aria-live="assertive"

// src/components/PracticeHeader.tsx  (EDITED - additive props)
interface PracticeHeaderProps { /* existing */
  metronomeConfig: MetronomeConfig; onMetronomeConfigChange: (next: MetronomeConfig) => void; }

// src/components/ConceptDrawer.tsx
export interface ConceptDrawerProps { conceptId: string; onClose: () => void; } // host uses key={conceptId}

// src/components/EtudeViews.tsx  (EDITED - additive, no prop changes)
// + local: notesOn (default true), drawerConceptId (string | null)
// + margin chip strip + About <details> panel + "Notes" toggle + "Print" button; section gains print-area

// src/lib/storage.ts  (EDITED)
K.metronomeConfig = "synesthesia_metronomeConfig"; // + STORAGE_KEYS entry, since "1"

// src/hooks/useSessionStore.ts  (EDITED)
// + metronomeConfig / setMetronomeConfig (loadJSON+normalize; storageSet effect)
// + FIX F2: storageSet(K.metronomeOn, ...) effect
```

Data flow (count-in scenario, the slice's spine):

```
user flips countInBars=1 in popover -> useSessionStore.metronomeConfig -> localStorage
user presses Play (header/Space/rail/mobile/MIDI)
  -> requestPlayState(true): countInBars>0 && !running -> useCountIn.start()
     each beat tick: audioEngine.playMetronomeClick(downbeat?) [preset+volume honored via bus]
                     setCountInState(beatsLeft) -> CountInOverlay renders "3.. 2.. 1.."
     onComplete: setIsPlayingAuto(true) -> EXISTING effect 1411: rhythmEngine.start() + playbackClock.start()
  -> grid, onMeasureStart, cycle-12, backing, chords: byte-identical to today.
pause pressed during count-in -> cancel() -> stays idle, nothing started.
```

---

## 4. Exact file plan (dirty-collision check per file)

NEW files (none can collide - they do not exist):

| File | Role | ~LOC |
|---|---|---|
| src/lib/metronomePatterns.ts | config types + normalize + click math (D32/D34) | 110 |
| src/lib/metronomePatterns.test.ts | T1/T2 (node) | 140 |
| src/lib/countIn.ts | pure count sequence (D35) | 30 |
| src/lib/countIn.test.ts | T3 (node) | 40 |
| src/hooks/useCountIn.ts | timer hook (D35) | 70 |
| src/components/MetronomeControls.tsx | popover controls (D36) | 180 |
| src/components/MetronomeControls.test.tsx | T6 (jsdom via glob) | 110 |
| src/components/CountInOverlay.tsx | visible countdown (REQ-PRAC-11) | 45 |
| src/components/ConceptDrawer.tsx | ModalShell drawer (D38) | 120 |
| src/components/ConceptDrawer.test.tsx | T7 (jsdom via glob) | 90 |
| e2e/count-in.spec.ts | T10 (D44) | 70 |

EDITED files (all CLEAN - verified against `git status` dirty-11: ChordInspector, CoComposePanel, FormPlanner, FormTemplatePicker, InspectPanel, LiveScoreDisplay, MelodyToolbar, PathCatalog, PracticeSessionPlayer, PracticeSetBrowser, StylePackPicker - none appear below):

| File | Edit | Dirty? |
|---|---|---|
| src/lib/audio.ts | compressor field + metronomeGain bus + setMetronomeVolume/Preset + scheduleMetronomeClick + preset synthesis (D33); playMetronomeClick single-arg contract preserved | CLEAN |
| src/lib/rhythm.ts | setMetronomePattern + playStep consumes clickActionFor; defaults bit-identical; grid/onMeasureStart UNTOUCHED (D34) | CLEAN |
| src/lib/storage.ts | K.metronomeConfig + registry entry (D32) | CLEAN |
| src/hooks/useSessionStore.ts | metronomeConfig state + persist effect; F2 metronomeOn persist effect (D32) | CLEAN |
| src/App.tsx | config sync effects (pattern->rhythm, volume/preset->audio); requestPlayState wrapper + 7 start-intent-site rewires (header/Space/Audition/commit/follower + MobileCommandBar & rail pass-throughs); useCountIn + onBeat click firing; CountInOverlay mount; PracticeHeader new props; CoComposePanel etude-path gate (D41); TD-035 comment at 3872 | CLEAN |
| src/components/PracticeHeader.tsx | gear button + popover mount + 2 props (D36) | CLEAN |
| src/components/EtudeViews.tsx | Notes toggle, margin chips, About details, Print button, ConceptDrawer state, print-area/print-hide classes (D37/D40) | CLEAN |
| src/index.css | trailing @media print block + drawer-in keyframe (+ reduced-motion guard) (D38/D40) | CLEAN |
| src/components/EtudeViews.test.tsx | extend: T8 annotation cases (file exists, CLEAN) | CLEAN |
| docs/MODES.md | TD-036a title line (D43) | docs, clean |
| e2e/etude-composer.spec.ts | TD-033e FIRST_PATH_TITLE derives from paths.ts export (D43) | e2e, clean |
| docs/PHASE-3-SLICE3.md | this document | n/a |

NOT touched (hard): the 11 dirty components, tests/** (it( stays 362 - FROZEN; tests/rhythm.test.ts is the canary for D34), engine/** (purity floor 21 unchanged), src/lib/etude.ts, src/lib/generator.ts, src/lib/studies.ts, src/state/sessionStore.ts (D32 rejects it), src/lib/paths.ts (read-only import for TD-033e), README.md, SPEC.md, AGENTS.md, .kai/, vitest.config.ts (glob auto-registers the three new .test.tsx - VERIFY in checklist step 8, add explicit entries only if the glob surprises), vite configs, package.json (zero new deps).

---

## 5. Test plan

T1 metronomePatterns legacy-equivalence (node, THE safety pin): for all 5 TimeSignatures x every step 0..stepsPerMeasure-1, `clickActionFor(step, ts, 1, [0], secPerBeat)` yields `click(high = step===0)` exactly where the OLD playStep predicate fired (step 0 high; 6/8,7/8: step%2===0 weak; else step%4===0 weak) and `none` elsewhere - full-table oracle `legacyClickEquivalent`; plus `new RhythmEngine()` defaults equal config defaults.
T2 metronomePatterns behavior (node): subdivision 2/4 periods per meter incl. compound clamp (6/8 s=4 === s=2 === every step); s=3 emits `triplet` iff step is a beat boundary, `none` elsewhere, secPerBeat passthrough; accents: high iff beatIndex in accentBeats (empty -> all weak; [0,2] in 4/4 -> steps 0 and 8 high); normalizeMetronomeConfig: garbage JSON (NaN volume, preset "kazoo", subdivision 7, accentBeats [-1, 99, "x"], countInBars 5, null input) -> clamped/filtered defaults; beatsPerMeasureFor table pin (4,6,7,11,16).
T3 countIn (node): countInBeats(1,4) === [4,3,2,1]; (2,4) length 8, ends 1; (0,4) === []; countInDurationMs(2,4,80) === 2*4*60000/80.
T4 storage registry drift (existing src/lib/storage.test.ts covers automatically once the K + STORAGE_KEYS entries land - run it).
T5 useSessionStore (extend src/hooks/useSessionStore.test.ts if cheap - else manual): config hydrate/normalize + metronomeOn write path exists (F2 regression pin: after setMetronomeOn(true), localStorage reads "1").
T6 MetronomeControls (jsdom): all five control groups render; volume range min/max; preset select options = 3; subdivision buttons 4 with aria-pressed; accent chips count === beatsPerMeasureFor(timeSignature) and toggle emits next config; count-in 0/1/2; onChange payloads are complete MetronomeConfig objects.
T7 ConceptDrawer (jsdom): renders title/category/definition/body paragraphs for a REAL registry concept ("ii-v-i"); null conceptId-miss (id "nope") renders nothing; related chip click switches content (key-prop pattern); Escape delegates to onClose (ModalShell wiring present); no console.*.
T8 EtudeViews extensions (jsdom, edit existing file): fixture etude with 3 annotations (chord/progression/melody, one null-concept): chips render with bar prefixes; "Notes" toggle hides chips + About (aria-pressed); chip click with conceptId opens drawer (role=dialog visible); About details lists all annotation texts; print button present with print-hide ancestor; section carries print-area class.
T9 CountInOverlay (jsdom, tiny): renders beatsLeft + data-testid + aria-live; (fold into T6 file if preferred - keep it its own file for clarity).
T10 e2e count-in (D44): sequence per D44; discriminative against "no count-in" (overlay absent today).
Manual audio smoke (not CI): npm run dev:vite -> set click vol 100 / master vol 0 -> click audible, chords silent (REQ-PRAC-2 proof); preset x3 audible difference; 6/8 + s=3 triplet spacing; count-in 2 bars then Play; toggle during count-in cancels; reload persists all prefs (incl. metronomeOn - F2).
Existing pins that MUST stay green untouched: tests/rhythm.test.ts (T1 is its mirror), tests/count-tunes (40), tests/pathBriefing (12), tests/ it( = 362 (zero tests/ edits), no-debug-logs, check:paths 36/36, check-links. Expected vitest total: 1447 + ~55-70 new passing; skipped 1; failed 2 (CSS-WIP only).

---

## 6. Ordered implementation checklist

1. [ ] Pure core first: src/lib/metronomePatterns.ts + countIn.ts + T1/T2/T3. `npx vitest run src/lib` green before touching engines. Commit: `feat(practice): pure metronome pattern + count-in math with legacy-equivalence pin`.
2. [ ] audio.ts metronome bus + presets + scheduleMetronomeClick (D33). Lint + full `npm test` (audio is spy-covered only; no new failures). Commit: `feat(audio): independent metronome gain bus + click presets + WebAudio-scheduled triplet`.
3. [ ] rhythm.ts setMetronomePattern + playStep rewire (D34). `npx vitest run tests/rhythm` MUST stay green (frozen). Commit: `feat(practice): subdivision + per-beat accents ride the 16th grid; default pattern bit-identical`.
4. [ ] storage.ts key + registry; useSessionStore config state + F2 metronomeOn persist fix + T4/T5. Commit: `fix(practice): persist metronome prefs (metronomeOn had a read with no write) + MetronomeConfig registry key`.
5. [ ] useCountIn hook + CountInOverlay + App requestPlayState rewiring (all seven start-intent sites - five call sites switch to the functional `requestPlayState((p) => !p)` / literal-true form, two prop pass-throughs swap to the wrapper; grep `setIsPlayingAuto(` to prove none missed) + App config sync effects. Manual smoke: count-in before grid, cancel, persistence. Commit: `feat(practice): count-in pre-roll gate upstream of the transport (REQ-PRAC-10/11)`.
6. [ ] PracticeHeader gear + MetronomeControls popover + T6 (+T9). Commit: `feat(ui): click settings popover - volume, preset, subdivision, accents, count-in (REQ-PRAC-1)`.
7. [ ] ConceptDrawer (+ index.css keyframe) + T7; EtudeViews annotations/toggle/About/print + print CSS block + T8; CoComposePanel etude-path gate + TD-035 comments (D41). Commit: `feat(pedagogy): etude annotations surfaces + Concept drawer + print stylesheet (REQ-PED-4-etude/5/7, REQ-ETU-32)`.
8. [ ] Drive-bys: MODES.md title, TD-033e e2e import (D43). Verify T5-T9 ran under the jsdom PROJECT (vitest output shows project name; the `src/components/**/*.test.tsx` glob should catch all three - add explicit JSDOM_FILES entries ONLY if it surprises). Commit: `docs+chore: TD-036a modes title, TD-033e e2e path-title drift gate`.
9. [ ] e2e/count-in.spec.ts; `npm run build` then `npx playwright test e2e/count-in.spec.ts` (D44). Commit: `test(e2e): count-in pre-roll browser leg`.
10. [ ] Full gates: `npm run lint` -> `npm test` (1447 + new; the 2 CSS-WIP failures unchanged; tests/ it( still 362) -> `npm run build` (BOTH configs) -> `node assets/check-links.cjs` -> `npm run check:paths` (36/36) -> `npm run test:e2e` (3 specs).
11. [ ] Docs: CHANGELOG.md entry ("Metronome volume/presets/accents/subdivision + count-in; etude annotations with a Concept drawer; print-ready etude views"); append the TD-034 deferral verdict + TD-035 per-site table results to the tech-debt register ONLY via the kai pipeline (not this slice's file list - .kai is off-limits here; note it in the PR body for @engineering-team).

### Explicit NOT-doing (slice 3)

- NO engine/ edits (purity floor 21 stands; annotation display is UI-only).
- NO changes to: stepsPerMeasure table, setInterval grid, onMeasureStart timing/semantics, cycle-12 math, loop math inside the sacred handler (F3 -> USER-DECISION flag), metronomeEnabled default.
- NO REQ-PED-6 right-click (D39 deferral), NO REQ-PED-12 global search, NO REQ-PED-13 hear-an-example/send-to-explore drawer actions (D38 deferral), NO Compose-under-chords / Explore-idea-card annotation surfaces (rest of REQ-PED-4 P0 - flagged in traceability, needs the dirty-11 Compose surfaces).
- NO TD-034 melody audio (D42 - dead-store finding makes the "minimal" version pointless; real playback needs its own timing slice).
- NO zustand sessionStore edits (D32).
- NO triplet on the JS grid (WebAudio scheduling only - D34).
- NO print for non-etude surfaces (D40 scope).
- NO A/B compare (REQ-PRAC-22), tempo ramp (REQ-PRAC-30s), latency calibration (REQ-PRAC-40s), pause-mode (REQ-PRAC-21), session model (REQ-PRAC-60s) - all P1 practice items OUTSIDE this slice's stated scope (PRD 8.6 "practice P0s + count-in" per ADR-014 slice map).
- NO edits to the dirty-11, tests/**, README/SPEC/AGENTS/.kai; NO new npm deps; NO console.*; NO `any`.

---

## 7. Risks

| Risk | P | I | Mitigation |
|---|---|---|---|
| Frozen tests/rhythm.test.ts breaks on a second playMetronomeClick arg | M | H | D34 hard rule: single-arg on the "click" branch; T1 oracle runs the exact spy path; checklist step 3 runs tests/rhythm before commit |
| playStep rewire subtly shifts the default pattern (e.g. 11/4 edge) | L | H | T1 is EXHAUSTIVE over all 5 meters x all steps; defaults in rhythm.ts mirror DEFAULT_METRONOME_CONFIG |
| requestPlayState misses an intent site -> count-in skipped (or double-start) | M | M | grep `setIsPlayingAuto(` at step 5 - the audit enumerates all 10 sites (7 start-capable + 3 stop-only); the 3 stop-only sites intentionally stay raw; e2e T10 proves the header path end-to-end |
| Click bus routing change breaks recordings | L | L | Documented in D33 (click leaves the master tap by design); AudioRecorder note-event path untouched; manual smoke includes a take |
| Triplet WebAudio scheduling drifts against the visual grid | M | L | Inherent to any setInterval host (the grid itself jitters); spacing within a beat is sample-accurate; UI labels it "triplet"; no visual element claims triplet resolution |
| Count-in overlay z-40 collides with a popover (z-40) mid-count | L | L | Popover closes on Play (focus leaves it); overlay is pointer-events-none anyway |
| EtudeViews gains too much (chips + About + drawer + print) -> 250-line component | M | L | Acceptable (still half the repo median); chip list extracted to a local subcomponent in the same file if it reads poorly |
| Print CSS visibility pattern leaks app background on some browsers | M | L | `body { background: #fff }` inside the print block; WYSIWYG scope keeps the printed subtree small; manual print-preview check in step 10 (Chrome + Safari) |
| F3 sub-range loop on etude paths stays broken this slice | M | M | USER-DECISION flag (D41 + CONCERNS): whole-path loop works; the wrong-window behavior predates this slice and is NOT worsened by it; recommend a transport follow-up slice OR a rail-side disable of range-set for etude paths as a fast-follow |
| e2e count-in flakiness (real-time waits) | M | L | data-beats-left attribute assertions with expect.poll + generous timeout (house pattern from etude-composer spec); the assertion is DOM-state, not audio |
| PHASE-2-01 live-gate violation | - | - | New render-time gates only (CoCompose gate, chip activeBar highlight via existing prop) - no subscriptions added; count-in state is local hook state, not a store |
| PHASE-3-03 StrictMode one-shot | - | - | No new boot effects: config sync effects are idempotent engine setters; useCountIn is gesture-driven with full cleanup; double-invoke safe by construction |
| Snapshot discipline | L | H | PHASE-2-02 stands: fresh per-round FILE-COPY snapshots, never `git checkout --`/`reset` |

## 8. Traceability

REQ-PRAC-1 (P0) -> D32/D34/D36 (toggle exists; volume/preset/accents/subdivision/count-in-bars ship; subdivision 3 via scheduled triplets) | REQ-PRAC-2 (P0) -> D33 metronome bus | REQ-PRAC-10 (P0) -> D35 pre-roll gate ("before ANY playback starts" - upstream of grid+backing+chords by construction) | REQ-PRAC-11 (P1) -> CountInOverlay visible countdown | REQ-PED-4 (P0, ETUDE PORTION) -> D37 margin notes + About panel; Compose/Explore portions EXPLICITLY OPEN (flagged, not silently dropped) | REQ-PED-5 (P0) -> chip -> ConceptDrawer (D38) | REQ-PED-6 (P1) -> DEFERRED D39 (TD-037 candidate) | REQ-PED-7 (P1) -> Notes toggle (D37) | REQ-ETU-32 (P1) -> D40 | REQ-PED-12/13 (P1) -> deferred D38 | TD-035 -> D41 per-site verdicts (1 fix-by-gate, 1 comment-safe, 4 documented, 1 USER-DECISION) | TD-034 -> D42 formal deferral (dead-store evidence) | TD-036a/TD-033e -> D43 | ADR-014 slice map -> this document | ADR-011 live-gate + ADR-007 dirty -> honored by construction (no new gates/dirty paths) | Inherited shipped-but-inert: engine annotations stay data-only for Compose/Explore until their host surfaces are clean.

**USER-DECISION ITEMS for @engineering-team (do not block the slice; do not silently resolve):**
1. F3: sub-range loop bar->step math on 1-step-per-bar etude paths (sacred handler) - fix in a dedicated transport slice, or disable range-setting UI for etude paths in a fast-follow? Recommendation: fast-follow UI gate (rail is CLEAN; ~10 lines; no handler risk).
2. TD-034: confirm formal deferral (D42) - the "minimal" option was disproven by audit (no melodyByStep consumer); real melody audio needs a step-synced scheduler contract.

---

## 9. HANDOFF_TO_DEVELOPER

```yaml
from: "@architect"
to: "@developer"
timestamp: "2026-09-23"
design_doc: docs/PHASE-3-SLICE3.md   # authority for every decision below

deliverables:
  - name: architecture_design (docs/PHASE-3-SLICE3.md)
    status: complete
    sections: [re-audit F1-F4 + 18 anchors, D32-D44, API sketches, file plan, T1-T10, checklist, risks]
  - name: adr_candidates
    status: for-kai-pipeline
    notes: "ADR-016 candidate: metronome bus bypasses masterGain (recording-tap consequence).
            ADR-017 candidate: count-in rides a pre-roll gate, NOT the transport grid.
            Append TD-034 verdict + TD-035 per-site results + TD-037 (PED-6) to the register via kai."

constraints:
  - "tests/rhythm.test.ts FROZEN: playMetronomeClick stays single-arg on the default path (T1 mirror)."
  - "Zero edits: engine/**, tests/**, dirty-11, sessionStore.ts, paths.ts, README/SPEC/AGENTS/.kai."
  - "Grid contract immutable: stepsPerMeasure table, setInterval, onMeasureStart timing, cycle-12, loop math."
  - "Gates in order: lint -> test (expect 1447 + ~60, 1 skipped, 2 CSS-WIP fails only) -> build x2 ->
     check-links (362) -> check:paths 36/36 -> e2e 3 specs."
  - "ASCII, no console.*, no any, relative imports; new .test.tsx auto-register via the JSDOM glob (verify)."

decisions_made:
  - { id: D32, what: "prefs in legacy localStorage registry (NOT zustand); +F2 metronomeOn persist fix", confidence: HIGH }
  - { id: D33, what: "metronomeGain -> compressor bus; presets + scheduleMetronomeClick in audio.ts", confidence: HIGH }
  - { id: D34, what: "subdivision/accents via pure clickActionFor; triplet via WebAudio scheduling; defaults bit-identical", confidence: HIGH }
  - { id: D35, what: "count-in = pre-roll gate (requestPlayState wrapper) upstream of isPlayingAuto", confidence: HIGH }
  - { id: D36, what: "MetronomeControls popover in PracticeHeader (clean)", confidence: HIGH }
  - { id: D37, what: "annotations + About + toggle in EtudeViews; drawer state local", confidence: HIGH }
  - { id: D38, what: "ConceptDrawer on ModalShell; PED-12/13 deferred", confidence: HIGH }
  - { id: D39, what: "PED-6 right-click deferred (dirty hosts)", confidence: HIGH }
  - { id: D40, what: "global @media print + print-area + WYSIWYG print button", confidence: HIGH }
  - { id: D41, what: "TD-035: CoCompose gated (corrupting site); 5 sites documented; F3 USER-DECISION", confidence: HIGH }
  - { id: D42, what: "TD-034 formally deferred - melodyByStep has NO audio consumer (audit-proven)", confidence: HIGH }
  - { id: D43, what: "TD-036a + TD-033e ship", confidence: HIGH }
  - { id: D44, what: "one e2e leg (count-in), ~20s CI, honest audio limits stated", confidence: MEDIUM-HIGH }

implementation_notes:
  - "Checklist order is load-bearing: pure math (T1 oracle) BEFORE rhythm.ts, engine edits BEFORE App wiring."
  - "At step 5 grep 'setIsPlayingAuto(' - exactly 4 raw sites may remain (all STOP-only: 1059, 1376, 3295 + the hook's internal onComplete)."
  - "metronomeGain fallback `?? masterGain` keeps pre-init click behavior unchanged (no ctx => no-op guard already exists)."
  - "EtudeViews drawer must render with key={conceptId} so related-navigation resets scroll + state."
  - "window.print() in a try/catch - jsdom has no print; never assert the call in unit tests."
  - "Pitfall: do NOT 'fix' the loop math in the onMeasureStart handler even though F3 is tempting - USER-DECISION."

estimated_effort:
  implementation_hours: 14
  testing_hours: 7
  documentation_hours: 1

concerns:
  - "F3 sub-range-loop-on-etude-paths remains open pending orchestrator decision (recommend the ~10-line rail gate fast-follow)."
  - "REQ-PED-4 is P0 but only its Etude portion can ship clean this slice; Compose/Explore annotation hosts are dirty-11 files - flag for Phase 3 acceptance review."

progress:
  phases_completed: 6/6   # reception, analysis, requirements mapping, design, roadmap, risk
  retries: 0
  quality_gates_passed: 6/6
  audit_trail:
    - { phase: "re-audit", verified_at: "HEAD 7135064", key_reads: "rhythm.ts full, audio.ts click+chain, App.tsx 1300-1500/2270-2345/3826-3960, tests/rhythm.test.ts full, useSessionStore persist block, storage registry, etudeEngine adapter, pedagogy types/concepts, ModalShell, PracticeHeader, e2e spec + config, index.css, PRD 8.5/8.6/9.5, PHASE-3-SLICE2 conventions, TD-033..036 register" }
    - { phase: "findings", new: [F1-frozen-arg-pin, F2-metronomeOn-no-write, F3-loop-math-etude, F4-recorder-preroll] }
```

**End of design.**
