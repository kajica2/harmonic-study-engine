# PRD-001 Phase 7 - Practice Mechanics Deepening (Design + Slices)

Status: DESIGN ONLY (research + architecture, no implementation in this doc).
Baseline: HEAD f566242, suite 2360 passed / 1 skipped / 0 failed (182 files),
CI green, tree clean. Decisions numbered D110+ (Phase 6 ended at D107).
Design authority for: REQ-PRAC-20..22, 30..33, 40..42, 50..54, 60..62,
and the F3 transport fix (orchestrator-decided into this slice, was
USER-DECISION open since ADR-016).

Slices: S1 = F3 transport truth (fully designed here). S2 = pause + A/B +
tempo ramp (sketched to prove unblocking). S3 = latency + played-correctly
+ sessions (sketched). Strict dependency: S2 after S1; S3 after S2
(the latency wizard may parallelize with S2 once S1 lands).

---

## 0. RECON - what already ships (do not rebuild)

| PRD item | Verdict | Evidence (file:line) |
|---|---|---|
| REQ-PRAC-1/2 metronome + independent volume | SHIPPED (Phase 3 S3) | `src/components/MetronomeControls.tsx`; pure math `src/lib/metronomePatterns.ts:29-40` (MetronomeConfig); bus `src/lib/audio.ts` (metronomeGain); engine sink `src/lib/rhythm.ts:43-56`; App sync `src/App.tsx:1528-1551`; persist `K.metronomeConfig` `src/lib/storage.ts:45` |
| REQ-PRAC-3 click continues during A/B pauses | GREENFIELD (constraint on S2; see D115 - holds by construction once windows gate chords only) | click path `src/lib/rhythm.ts:152-195` is independent of chord/backing surfaces |
| REQ-PRAC-10/11 count-in | SHIPPED | `src/lib/countIn.ts`, `src/hooks/useCountIn.ts`, `src/components/CountInOverlay.tsx`; gate `requestPlayState` `src/App.tsx:519-537` (MUST NOT be touched - see constraints) |
| REQ-PRAC-20 section loop | PARTIAL - BROKEN (this is F3) | rail shift-click `src/components/PlaySessionRail.tsx:735-747`; handler loop math `src/App.tsx:1567-1578` (`loopStartBar * 4` - the bug); persistence `src/hooks/useSessionStore.ts:416-433` (legacy keys `synesthesia_loopStartBar/EndBar`) |
| REQ-PRAC-21 pause mode (N play / M rest) | GREENFIELD | none |
| REQ-PRAC-22 A/B compare | GREENFIELD | none |
| REQ-PRAC-30..33 tempo ramp | GREENFIELD | none; tempo sink exists: `rhythmEngine.setTempo` `src/lib/rhythm.ts:104-110` (restarts interval - see S2 note) |
| REQ-PRAC-40..42 latency calibration | GREENFIELD, but the CONSUMER seam already ships | `engine/ear-training/check.ts:100-131` `dictationTimingOk` already accepts `latencyMs` (tolerance floor 120ms) and NOBODY passes it - the wizard feeds this |
| REQ-PRAC-50..54 played-correctly | GREENFIELD, but ALL infrastructure ships | `src/lib/midiIn.ts` (singleton, note on/off, channel 1-16, `timestamp` = `msg.timeStamp`, window CustomEvent "midin", RT clock passthrough); init `src/hooks/useMidiDevices.ts:25-26`; second fan-out `src/lib/midiOut.ts:11-18` (`onNoteOn(midi, vel, channel)`); pattern to copy: `src/hooks/useGuideToneTrail.ts:57-67` (ref-captured chord, per-note classify, begin/end/reset run API); pc classifier precedent `src/lib/guideTones.ts` (`classifyGuideTone`) |
| REQ-PRAC-60..62 session model | PARTIAL - a DIFFERENT concept exists | `PracticeSession` (set-runner flavor) `src/lib/paths.ts:1466-1475`; persistence `src/lib/practiceStore.ts` (key `synesthesia_practice_sessions`, cap 50); runner `src/components/PracticeSessionPlayer.tsx` (clock-driven, see F3 blast item 14). REQ-PRAC-60's session (etude+ramp+loop+AB+attempts) is NEW - do not extend the set-runner type (D119) |
| Phase 7 line "Web MIDI input" | SHIPPED | midiIn + midiOut + device picker `src/components/MidiInPicker.tsx` + DAW clock follower `src/lib/midiClock.ts` (App wiring `src/App.tsx:538-591`) |
| Phase 7 line "on-screen piano" | PARTIAL - VISUAL ONLY | `src/components/PianoKeyboard.tsx` is a synesthesia LAYER DISPLAY (chord/sound/bass); its only onClick is layer-toggle (`:195`). No note input. REQ-IO-4 input surface NOT shipped |
| Phase 7 line "computer keyboard" | NOT SHIPPED | `src/hooks/useKeyDown.ts` = mode shortcuts (1/2/3) + transpose brackets only. The REQ-IO-5 mapping `A W S E D F T G Y H U J K` appears nowhere |
| Adjacent: REQ-PED-40 practice log | SHIPPED (Phase 6) - REUSE, DON'T FORK | `engine/pedagogy/log.ts` (pure) + `src/lib/pedagogyLog.ts` (adapter, `K.pedagogyLog = "pedagogy.log"`). Attempts from ramp/detection append here (D120) |
| Adjacent: performanceLog (takes) | SHIPPED, separate concept | `src/lib/performanceLog.ts` (`hse.performance.log.v1`) = recorded takes; not sessions, not the pedagogy log. Leave alone |

Key already-true facts this design leans on:

- `src/lib/formPeriod.ts:2-8` already declares the audio truth verbatim:
  "one HarmonicStep is one BAR of rendered audio"; WAV export is honest.
- `formLen = detectFormPeriod(path.steps)` is already computed in App
  (`src/App.tsx:823`) for the cycle-12 predicate.
- The cycle-12 advance `next % formLen === 0`
  (`src/lib/keyCycle.ts:36-42`, handler call `src/App.tsx:1594-1606`) is
  in STEP units on both sides - verified UNAFFECTED by F3.
- The rail's beat-pulse is the only strip consumer of `playbackClock`
  (`PlaySessionRail.tsx:603,862`); bar highlighting already runs off
  `activeStepIndex` (transport truth). The clock's `step` field has
  exactly ONE functional consumer: `PracticeSessionPlayer` (see item 14).

---

## 1. F3 - THE TRANSPORT FIX (S1)

### 1.1 Forensics: who is beat-granular, who is bar-granular

Transport contract (audio truth): `rhythmEngine` fires `onMeasureStart`
once per BAR (`src/lib/rhythm.ts:127-134` - internal 16th-grid counter
wraps at `stepsPerMeasure`, callback fires at grid step 0). The App
handler advances `activeStepIndex` by exactly +1 per firing
(`src/App.tsx:1586`). Therefore, for EVERY path regardless of meter:

    1 path step = 1 bar of audio.  (always, no exceptions)

Per-producer data audit:

| Producer | Authored granularity | Consequence |
|---|---|---|
| RAW_PATHS curated (`src/lib/paths.ts`) | 1 step/bar (distinct chord per step, b1..b32 descriptions; W2-001 forensics) | plays correctly; strip/loop math lies (assumes 4/bar) |
| STUDIES_PATHS (`src/lib/studies.ts`, generated) | 1 step/bar; 32-bar standards padded x3 = 96 steps | same |
| CONCEPT_PATHS (`src/lib/conceptPaths.ts`) | 1 step/bar | same |
| Etude paths (`src/lib/etudeEngine.ts:117-155`) | 1 step/bar, WHOLE-PASS padding (`steps % bars === 0`) | same; `etudeActiveBarFor` (`:203-213`) already honest |
| generator.ts user paths | 1 step/bar (one push per chord) | same |
| COMPOSER_PATHS / SECTION_PATHS (`src/lib/composerPathSeed.ts:64-77`, `composerSectionSeed.ts`) | 4 steps/bar (`Array(STEPS_PER_BAR).fill(step)`) | pre-existing bug: transport plays each intended bar as 4 bars (4x slow). F3 does NOT fix audio (that is a data-gen fix, TD-049); F3 makes the DISPLAY honest about what the audio does |

So: NO runtime path is beat-granular in the way the loop math assumes.
The `paths.ts:50-53` header ("Each HarmonicStep is one BEAT") is the
labeling fiction; `check:paths` `bars = steps/4` is that fiction codified
as a CI gate. Confirmed safe to collapse the WINDOW math to 1:1.

Consequence today (the user-visible bug): selecting "bars 5-8" in the
rail sets `loopStartBar=4, loopEndBar=7` (strip-cell indices), the handler
turns them into steps 16..31, and the audio loops 16 bars. A 4-bar
selection plays 16 bars.

### 1.2 The model: form-relative 1:1 windows (D110)

Introduce ONE derived unit for all user-facing bar numbers:

    formLen = detectFormPeriod(path.steps)        // already computed, App.tsx:823
    bar b (0-based, 0 <= b < formLen)  <-->  step b   // identity map, first pass
    window [a..c] inclusive bars       <-->  steps [a .. c+1)
    display bar of step s              = (s % formLen) + 1
    display total                      = formLen

Why form-relative, not absolute steps: a 32-bar standard padded to 96
steps must show 32 strip cells (form x3), not 96 (three copies of the
same bar are noise), and "loop bars 5-8" must mean the tune's bars 5-8.
For non-repeating paths `formLen === steps.length` and the model
degenerates to plain 1:1 - no special case. Etudes: `formLen ===
etude.bars` exactly (whole-pass padding). Bounds: clamp saved loop
indices to `formLen - 1` (today's clamp to `totalBars - 1` already exists
at `src/App.tsx:1575` - keep the shape, change the unit).

### 1.3 The handler fix (the sacred site, minimal diff)

`src/App.tsx:1558-1614`. ONLY the `useLoop` branch changes:

```ts
// BEFORE (lines 1570-1575):
const totalBars = Math.ceil(path.steps.length / 4);
const fromStep = loopStartBar! * 4;
const toStep =
  (Math.min(loopEndBar ?? totalBars - 1, totalBars - 1) + 1) * 4;

// AFTER:
// F3 (D110): audio truth is 1 step = 1 bar (see docs/PHASE-7-PRACTICE.md
// section 1.1). Bars are form-relative; within the first pass the map is
// the identity. formLen comes from detectFormPeriod (same value the
// cycle-12 predicate uses). The *4 was the legacy labeling fiction.
const totalBars = Math.max(1, formLen);            // formLen is in deps already
const fromStep = Math.min(loopStartBar!, totalBars - 1);
const toStep = Math.min(loopEndBar ?? totalBars - 1, totalBars - 1) + 1;
```

The wrap lines below (`if (prev + 1 >= toStep) ...`) stay byte-identical.
The non-loop branches, the once-per-measure contract, the StrictMode
ref-write pattern (D13), the cycle-12 `shouldAdvanceKeyCycle` call, the
`queueMicrotask` store dispatch, the detach-on-rebind: ALL UNTOUCHED.
The whole-path loop (`prev >= steps.length - 1 -> 0`) keeps looping the
PADDED cycle (existing behavior, documented in etude description text;
not F3 scope).

### 1.4 Blast radius - complete site table

Legend: FIX = behavior changes to honest; KEEP = stays fiction-by-design
(commented); N/A = verified unaffected.

| # | Site | Today | Action |
|---|---|---|---|
| 1 | `src/App.tsx:1567-1578` handler loop math | `*4` windows | FIX (1.3) |
| 2 | `src/App.tsx:3720-3731` loop ToolChip label | `ceil(steps/4)` | FIX: `formLen` (needs `formLen` in scope - it is, `:823`) |
| 3 | `src/components/PlaySessionRail.tsx:584-585` `totalBars`/`currentBar` | `/4` model | FIX: receive `formLen: number` as a NEW PROP from App; `totalBars = formLen`; `currentBar = (activeStepIndex % formLen) + 1`. Delete the TD-035/D41 comment block (`:576-583`) - it described exactly this pair-fix |
| 4 | `PlaySessionRail.tsx:669-688` Position line + progressbar | "Bar floor(s/4)+1 / ceil(n/4) - Step s+1 / n" | FIX: "Bar {currentBar} / {formLen}"; drop the "Step" segment (now redundant with Bar); progressbar aria stays step-based (honest: step position within the padded track) with a title explaining padded repeats |
| 5 | `PlaySessionRail.tsx:718-719` strip cells | `ceil(n/4)` cells, `stepIdx = barIdx*4` | FIX: `formLen` cells, `stepIdx = barIdx` (1:1) |
| 6 | `PlaySessionRail.tsx:735-752` click / shift-click | sets cell idx + `setActiveStepIndex(barIdx*4)` | FIX: `setActiveStepIndex(barIdx)`; loop values are form-bar indices (same numbers, new meaning) |
| 7 | `PlaySessionRail.tsx:591-598` GtCoverageRow length guard | `gtTargets.length !== totalBars` warns | FIX with #8; guard compares against `formLen` |
| 8 | `src/lib/gtTargets.ts:41-55` (`gtTargetsForPath`) | groups `STEPS_PER_BAR` steps per bar | FIX: one target per STEP over full steps; rail consumes `targets.slice(0, formLen)` (first pass = form). Audit other consumers (catalog "x/y bars have guide tones" text) in-PR; update comment `:43` that cites `formatChordReadout` convention |
| 9 | `src/lib/theory.ts:402-430` `deriveBehavioralMarkers` | `ceil(n/4)` cells via `slice(b*4, b*4+4)` | FIX (JUSTIFIED theory.ts edit - F3 requires it: marker array MUST align with strip cells or every cell mislabels). Per-step: bass/pcs from `steps[b]` alone; array length = `steps.length`; rail indexes `markers[barIdx]` (cell < formLen <= steps). Update `src/lib/theory.test.ts:275+` pins (colocated - allowed) |
| 10 | `src/components/LiveScoreDisplay.tsx:89-128` window math + abc | `stepsPerBar(ts)` per-bar grouping; each step rendered as one quarter; barline every 4 steps | FIX: accept `formLen` prop; `activeBar = activeStepIndex % formLen`; window = 4 form bars. abc rendering fix WITHOUT touching abcjs layout code: expand each window step into 4 identical quarter-note events + one barline per step - i.e. route the non-sliced branch through the SAME beat-cell machinery the sliced persona mode already uses (`slicePathForRepeat` semantics: "same chord four times per bar"). Result: score shows each bar's chord held a full bar = audio truth. Keep `M:4/4` hardcode (`:135`) - meter-agnostic notation is TD-038, do NOT explode scope. Sliced branch: unchanged (already honest) |
| 11 | `src/lib/playbackClock.ts:131` `pathDurationSec` | `steps * 4 * 60/bpm` | FIX: `steps * secPerBarGrid` where `secPerBarGrid = rhythmEngine.getStepsPerMeasure() / 4 * (60/bpm)` - same formula the audio interval uses (`rhythm.ts:121,133`), so 4/4 output is byte-identical and compound meters stop lying about period |
| 12 | `src/lib/playbackClock.ts:147` `stepFloat` | `bars * 4` (step advances 4x per bar) | FIX: `stepFloat = elapsedSec / secPerBarGrid` (1 step per bar); `step = floor(stepFloat) % pathStepCount`. The `* 4` comment "16ths/bar" was the fiction |
| 13 | `playbackClock` phase anchor | none (rAF wall-time vs setInterval drift) | FIX (minimal seam, D113): add `reanchor(step: number)` - sets `startMs` so wall-time grid aligns with the transport's step at call time; App's handler calls `playbackClock.reanchor(next)` after computing `next` (one line, inside the existing handler, fires once per bar). Full dual-clock retirement stays TD-039. The `beat` field's compound-meter wobble stays TD-038 |
| 14 | `src/components/PracticeSessionPlayer.tsx` | drives `onStepChange` from `clock.step` (was 4 steps/bar = 4x too fast); its `startBar/endBar` slice (`:60-69`) already treats steps as bars | NO EDIT - the clock fix (#11/#12) makes it advance 1 step/bar automatically; its slice math becomes CONSISTENT with the transport (it was written against the honest model). Pre-existing race (handler + player both write `activeStepIndex` while the practice tab runs) = TD-036, not worsened by S1 |
| 15 | `src/lib/sheetMusicExport.ts:116,121` PDF "Bars:" / "Active bar:" | `/4` | FIX: import `detectFormPeriod`; `Bars: formLen`; `Active bar: activeStepIndex % formLen + 1`. Update colocated `sheetMusicExport.test.ts` |
| 16 | `src/App.tsx:1675-1697` backing schedule-ahead | `stepIdx = floor(timeSec/secPerBar)` already 1:1 (honest); `barInLoop` arg = `floor(stepIdx/4)` | KEEP-COSMETIC: `barInLoop` is a DEAD parameter (`backingEngine.ts:250` - accepted, never read). Pass `stepIdx` + comment "barInLoop unused"; do NOT touch `secPerBar = (60/tempo)*4` (4/4-correct; compound fix rides TD-038) |
| 17 | `src/App.tsx:646,2288,4148` + `melodyByStep` 4-step arrays | `/4` sites | KEEP - TD-035 remainder. These are BEAT-granular MELODY AUTHORING surfaces (a step's melody lane is 4 authored beats), not window math. Collapsing them changes authoring semantics. TD-035 stays open, narrowed to "melody-lane /4 sites" |
| 18 | `scripts/check-path-bars.ts` | prints `bars = steps/4`, gate 24..64 | FIX-LABELS ONLY: keep the math and constants byte-identical (36/36 OK must not move); print "steps" as the primary unit and add header comment: "policy = step-count gate (96..256 steps), NOT bar truth - bars are 1:1 with steps (F3, D111)". Optionally also print `formLen` per path (informational) |
| 19 | `src/lib/paths.ts:50-75` header + `STEPS_PER_BAR`/`MIN/MAX_PATH_BARS` | comment asserts "1 step = 1 BEAT" | FIX-COMMENT ONLY (D111): rewrite the block to state the F3 truth and name the constants a LEGACY STEP-COUNT POLICY (`STEPS_PER_BAR` stays: padPath policy, composer seeds, sliced visuals, melody lanes all consume it). NO constant renames, NO padPath change, NO data change |
| 20 | `src/lib/theory.ts` `stepsPerBar` import sites + `src/lib/loopWav.ts:214-224` `stepsPerBar()` | helper table 4/6/7/11/16 | KEEP: legitimate real-time-seconds-per-bar helper for WAV (`barSeconds = beatsPerBar * secPerBeat`). The frozen canary `tests/stepsPerBar.test.ts` pins the TABLE only (helper untouched -> stays green). Its HEADER COMMENT asserts the consumer fiction - tests/ is FROZEN, do not edit; note the drift in TD-035 |
| 21 | `tests/practiceHeader.test.ts` (FROZEN) pins `formatChordReadout` / `currentBarNumber` (`src/lib/practiceHeader.ts:36-66`, uses `stepsPerBar`) | "Bar 1/4" for 16 steps | KEEP-AS-DEAD (D112): frozen tests forbid changing these functions. ADD new helper `formatBarReadout(formLen, stepIndex, chordName)` in `practiceHeader.ts` (additive - frozen file never imports it); switch `src/components/PracticeHeader.tsx:134` to the new helper. Old helpers remain exported + pinned + unused by the app. Removal = TD-050 after the tests/ freeze lifts (renumbered: TD-040 was already live as the Phase 3 generator minor-mode defect) |
| 22 | `src/hooks/useSessionStore.ts:416-433` loop persistence | raw indices, legacy keys | KEEP keys/values; semantics shift (old "cell 20" = step 80 -> now step 20). Values always in range (`oldMax < steps.length <= formLen?` - cell indices were < ceil(n/4) <= n, and formLen <= n; clamp #1 absorbs outliers). No migration; RELEASE NOTE |
| 23 | `src/components/MobileCommandBar.tsx` | loop toggle only, no bar math | N/A - verified |
| 24 | WAV export (`loopWav.ts:430-487` uses `formLen * secPerBar`) | already 1 step = 1 bar | N/A - verified honest (`formPeriod.ts` header). The task's question "detectFormPeriod works on steps - unaffected?" -> YES, unaffected |
| 25 | cycle-12 (`keyCycle.ts:42` `next % formLen === 0`) | step units both sides | N/A - verified survives F3 (formLen is steps; `next` is steps) |
| 26 | count-in gate (`requestPlayState` `App.tsx:519-537`) | upstream of transport | N/A - MUST STAY UNTOUCHED (constraint) |

### 1.5 User-visible behavior changes (RELEASE NOTES - mandatory)

1. Section loops finally play the selected bars. A 4-bar selection loops
   4 bars (was 16). Practicing "bars 5-8" now means bars 5-8.
2. The bar strip and Position line show TRUE form bars (a 32-bar standard
   shows 32 cells; it showed 24 = ceil(96/4) legacy cells).
3. Loop ranges saved by older builds refer to different bars under the
   corrected mapping - re-pick once after updating.
4. Etude surfaces: section looping on generated etudes now works
   (closes the "Not yet" carve-out in `docs/PRACTICE-MECHANICS.md:191-196`
   and the ETUDE-COMPOSER note; ADR-016's open F3 decision is CLOSED).
5. Practice-set sessions (Practice tab) advance one bar per bar (was 4
   steps per bar - the runner was playing 4x too fast).

### 1.6 S1 pure-math home (seeds S2)

New `engine/practice/windows.ts` (pure, no clock, no DOM - ADR-003):

```ts
export interface BarWindow { fromBar: number; toBar: number } // inclusive, form bars, 0-based
/** Clamp + normalize a user window to the form. */
export function clampWindow(w: BarWindow, formLen: number): BarWindow;
/** Window -> half-open step range (identity map within first pass). */
export function windowStepRange(w: BarWindow, formLen: number): { fromStep: number; toStep: number };
/** The one honest bar<->step law. */
export function barOfStep(step: number, formLen: number): number; // ((step % formLen) + formLen) % formLen
export function totalFormBars(formLen: number): number;           // max(1, formLen)
```

The App handler uses `windowStepRange` (1.3 becomes a two-line call), the
rail uses `barOfStep` + `totalFormBars`. S2/S3 extend this same module
(pause/AB window selection) - S1's helpers are its foundation, so the
file ships once and grows.

---

## 2. CLOCK STRATEGY (D113) - answer to "which clock for A/B swap / ramp reps"

There are three time sources: (a) `rhythmEngine` setInterval 16th grid -
fires `onMeasureStart` once per bar, drives AUDIO truth (chord changes
via handler -> React -> chord effect at `App.tsx:1037`);
(b) `playbackClock` rAF wall-time - drives VISUALS only (rail beat pulse
`PlaySessionRail.tsx:862`, tick badge) plus the legacy PracticeSessionPlayer;
(c) optional DAW MIDI clock follower (`midiClock.ts`) - only re-tempos
(a) via `setTempo`.

Decision: ALL Phase 7 mechanics state (window counter, A/B swap, pause
duty cycle, ramp rep counting) is driven from `onMeasureStart` - source
(a). Rationale: it is the only source with the once-per-bar contract that
matches the musical unit every PRD feature counts in, it is where the
audio actually changes, and it already owns the sacred handler where
window selection must happen anyway. The rAF clock is demoted to
animation-only; its step math is fixed in S1 (#11/#12) and phase-anchored
per bar (#13) so the visual playhead stops drifting across bar lines.
No rewrite, no unification (that is TD-039 - the rAF/interval split is
load-bearing for 60fps visuals).

Bar counter: the handler increments a ref (`barCounterRef`) once per
firing; every pure reducer takes `barCounter` as a parameter (engine
stays clock-free - ADR-003). Reset on play-start, not on pause (pause
keeps position, matching the loop model).

---

## 3. STATE PLACEMENT (D114)

| State | Where | Precedent |
|---|---|---|
| Practice-mechanics CONFIG (pause N/M, AB windows + swap, ramp cfg) | zustand `sessionStore` v4 as ONE optional field `practiceMechanics?: { pause?: ...; ab?: ...; ramp?: ... }` - persisted via existing partialize, NO version bump (missing field defaults at read) | D73/D57 verbatim ("widen WITHOUT a v5") |
| LIVE run state (barCounter, current window phase, ramp current bpm/reps/streaks) | refs inside App (sync access inside the sacred handler - `activeStepIndexRef` pattern) + a React state mirror for UI render, written via the same queued-microtask discipline as the cycle-12 dispatch | D13 |
| Latency calibration | localStorage `K.practiceLatency = "practice.latency"` (PRD literal; Phase 6 `pedagogy.*` precedent = dotted namespace, no `hse.` prefix) + registry meta entry + shape guard | D107 pattern |
| Completed sessions + attempts | localStorage `K.completedSessions = "practice.sessions"` (PRD literal) via adapter `src/lib/practiceSessions.ts`; legacy `synesthesia_practice_sessions` (set-runner) untouched, different key, different type (D119) | performanceLog/pedagogyLog |
| Ramp/pause/AB attempt events | append to BOTH: session.attempts (S3) and `pedagogyLog.appendLog({ mode: "etude", refId: pathId, outcome, durationSec })` - one `appendAttempt()` seam, never fork the log (D120) | Phase 6 |

Note on the task's "hse. prefix convention": the shipped registry mixes
`synesthesia_*` (legacy), `hse.*` (versioned), and `pedagogy.*` (Phase 6,
PRD-literal). Phase 6's D107 chose PRD-literal dotted namespaces for new
learning-state keys; practice follows practice.

---

## 4. S2 SKETCH - pause, A/B, tempo ramp (proves S1 unblocks)

### 4.1 One scheduler for all three modes

`engine/practice/windows.ts` grows a pure step function; the handler body
becomes (pseudo):

```ts
const d = advanceWindowedTransport({
  prevStep: activeStepIndexRef.current,
  barCounter: barCounterRef.current,
  formLen, totalSteps: path.steps.length,
  mode,           // "off" | "loop" | "pause" | "ab"
  loop, pause, ab, // configs, already clamped
});
// d.nextStep -> setActiveStepIndex (existing ref-write path)
// d.phase   -> "play" | "rest" | "a" | "b" | "full" (ref + UI mirror)
// d.windowPassCompleted -> ramp.repEvent candidate (4.3)
```

Invariants (property-tested): `nextStep` always inside the active window;
`onMeasureStart` still fires once/bar (unchanged - the handler is still
the only caller); pause/AB never touch `rhythmEngine` (D115 - the click
keeps running because gating happens at the CHORD effect + backing
schedule, never at `playStep`; REQ-PRAC-3 holds by construction);
sub-loop suppression of cycle-12 extends to pause/AB (`subLoopActive:
mode !== "off"`).

### 4.2 Pause mode (REQ-PRAC-21)

Duty cycle on the bar counter: `phase = (counter % (N+M)) < N ? play : rest`.
During rest: chord effect (`App.tsx:1037`) early-returns (new ref
`windowPhaseRef`), `backingEngine` schedule-ahead skips, metronome +
playhead keep moving, strip shows a REST state (glyph + dim - colorblind
rule 9.8). Transport does NOT stop (the point is resting IN TIME).

### 4.3 A/B (REQ-PRAC-22)

Two windows A, B (each a `BarWindow`); swap every `swapBars` bars
(configurable; default = one full pass of the active window).
`activeWindow = floor(counter / swapBars) % 2 === 0 ? A : B`. The
`nextStep` wrap uses the active window's `windowStepRange`. Strip renders
the active window band (A/B tint + `data-window="a|b"` attribute - the
e2e hook, never color alone).

### 4.4 Ramp (REQ-PRAC-30..33)

`engine/practice/ramp.ts` - pure state machine, no clock, no rng needed:

```ts
interface RampConfig { startBpm; targetBpm; stepBpm; repsPerStep; failThreshold }
interface RampState { bpm; repsDone; successStreak; failStreak; phase: "climb" | "complete" }
type RampEvent = { kind: "rep"; success: boolean } | { kind: "reset" };
function rampNext(s: RampState, c: RampConfig, e: RampEvent): RampState;
```

A "rep" = one completed pass of the active window (`windowPassCompleted`
from 4.1, or manual button press - D116: outcome source is manual in S2,
detection auto-feeds in S3; the ramp never assumes detection exists).
Success: `repsDone++`; at `repsPerStep` -> `bpm = min(bpm+stepBpm,
targetBpm)`, reset counters; `bpm === targetBpm` after a step ->
`phase: "complete"` (REQ-33 marks session complete - S3 session hook).
Failure: `failStreak++`; at `failThreshold` -> `bpm = max(bpm-stepBpm,
startBpm)`, `failStreak = 0`, `repsDone = 0`.
Tempo apply: `setTempo(ramp.bpm)` - NOTE `rhythmEngine.setTempo` restarts
the interval (`rhythm.ts:104-110`), i.e. the bar grid re-anchors at the
NEXT grid step 0; ramp changes tempo at window boundaries by design, so
the restart lands clean. Visible state (REQ-32): a compact ramp chip in
the practice header strip: `bpm / reps x/N / streak`.

### 4.5 UI + config surface

New `src/components/PracticeMechanicsPanel.tsx` (gear-popover pattern of
`MetronomeControls.tsx`, mounted from `PracticeHeader`): mode selector
(off/loop/pause/AB), N/M steppers, A/B window pickers (pre-fill from
current loop), ramp form (start/target/step/reps/threshold). Config ->
zustand field; panel state local. `vitest.config.ts` JSDOM_FILES: panel
is a component test candidate ONLY if it touches DOM in tests - pure
props tests run in node; remember the gotcha when adding any `.test.tsx`.

---

## 5. S3 SKETCH - latency, detection, sessions

### 5.1 Latency wizard (REQ-PRAC-40..42, D117)

Modal (`ModalShell` pattern) "Calibrate":
1. Reads `audioEngine.getCtx()`; `outputLatencyMs = ctx.outputLatency ??
   ctx.baseLatency ?? 0` (Chrome reports `outputLatency`; Firefox/Safari
   give `baseLatency` only - HONESTY LIMIT: neither includes Bluetooth /
   USB / display-audio buffering; the wizard states this and offers a
   manual override slider 0..200ms).
2. Plays K clicks (default 16) at the current tempo through the
   metronome bus (reuses `audioEngine.playMetronomeClick` - the SAME
   latency path as practice).
3. Taps: PRIMARY = MIDI note-on via `midiIn.onMidin` (the latency that
   matters is the one REQ-50 comparisons eat); SECONDARY = Space keydown
   (`performance.now()`), selectable, stored in `source: "midi" | "key"`.
4. `inputLatencyMs = clamp(median(rawOffsets) - outputLatencyMs, 0, 500)`
   where `rawOffset = tapAtMs - clickScheduledAtMs`. Median, not mean
   (outlier taps). All math pure: `engine/practice/latency.ts`
   (`medianOffset(clicks[], taps[], outputMs)` - arrays in, no clock).
5. Persist `{ inputLatencyMs, outputLatencyMs, source, calibratedAt }`
   under `K.practiceLatency`.
Consumers (REQ-42): detection matcher (5.2) subtracts `inputLatencyMs`;
ear-training dictation timing finally passes `latencyMs` into the
existing `dictationTimingOk` seam (engine seam already shipped - recon
table). Space taps in the wizard when NO MIDI device exists measure the
keyboard path only - still useful for ear training; labeled as such.

### 5.2 Played-correctly detection (REQ-PRAC-50..54, D118)

`engine/practice/match.ts` (pure):

```ts
interface ExpectedBar { barIndex: number; pitchClasses: readonly number[] } // notes % 12
interface PerformedNote { note: number; atMs: number }
interface PhraseMatch {
  matchedFraction: number;      // matched / expected (0 when expected empty)
  wrongNotes: number[];         // performed pcs not in expected window set
  missedNotes: number[];        // expected pcs with no performed match
  extraNotes: number[];         // performed beyond expectation multiplicity
  avgOffsetMs: number | null;   // mean(performedOnTime - barStartMs), compensated
  perBar: readonly BarMatch[];  // for strip feedback
}
function matchPhrase(input: {
  expected: readonly ExpectedBar[];
  performed: readonly PerformedNote[];
  windowStartMs: number; windowEndMs: number;
  toleranceMs: number;          // default 120 (ear-training floor precedent)
  inputLatencyMs: number;       // REQ-42: subtracted BEFORE comparison
}): PhraseMatch;
```

Model: expected onset = bar start (chord sustains; pc-equality, octave-
agnostic - reuses the `n % 12` convention from `guideTones.ts` /
`theory.ts` markers; `pitchClassOfToken` is for chord TOKEN strings and
does NOT fit MIDI numbers - use `note % 12`, keep both, no forced reuse).
Performed note compensated `atMs - inputLatencyMs`; assigned to bar if
inside `[barStart - tol, barEnd + tol]`; greedy nearest-match per
expected pc; a performed note matching nothing -> wrong/extra (wrong =
pc absent from the bar's expected set; extra = pc present but surplus
multiplicity). Deterministic -> no Rng needed (documented, so the
purity guard's rng rule is satisfied vacuously).

Hook `src/hooks/usePlayedCorrectly.ts` - shape-copied from
`useGuideToneTrail.ts` (midiIn subscription once, ref-captured expected
bars, begin/end/reset run API). Feed: active window's expected bars
(S1/S2 windows), bar boundaries stamped from the handler via a
`nowMs`-parameterized event (adapter reads `performance.now()` - engine
never does). Feedback: strip cell state overlay (matched = green #009E73,
missed = dim, wrong = vermillion #D55E00 flash - Okabe-Ito, already the
roll's palette; PLUS glyph redundancy per PRD 9.8) and a post-phrase
summary card (REQ-53: notes hit, avg offset, accuracy %).
REQ-54 HOLDS (D118): detection requires `midiIn`; without Web MIDI the
panel renders an honest "unavailable - connect a MIDI input" state.
On-screen piano + computer keyboard are INPUT surfaces (REQ-IO-4/5,
separate unshipped work: PianoKeyboard needs press handlers; the
AWSED mapping needs a new `classifyNoteKey` in `useKeyDown.ts`) - they
are NOT detection surfaces and are NOT pulled into Phase 7 scope;
flagged in risks.

### 5.3 PracticeSession (REQ-PRAC-60..62)

`engine/practice/session.ts`:

```ts
interface PracticeAttemptV1 { atMs: number; window: "play"|"rest"|"a"|"b"|"full"; outcome: "success"|"failure"; bpm: number; accuracy?: number }
interface PracticeSessionV1 {
  version: 1; startedAtMs: number; endedAtMs: number;
  refId: string;            // pathId (etude/catalog id)
  meter: string; tempoStartBpm: number; maxTempoBpm: number;
  metronome: { volume: number; preset: string; subdivision: number; accentBeats: number[]; countInBars: number }; // snapshot of K.metronomeConfig shape
  windows: { loop?: BarWindow; pause?: PauseConfig; ab?: AbConfig; ramp?: RampConfig };
  attempts: PracticeAttemptV1[];
  notesHit?: number;        // from detection runs only (S3)
}
function summarizeSession(s: PracticeSessionV1): { maxTempoBpm; totalSec; attemptsMade; successes; accuracyPct | null }
```

Adapter `src/lib/practiceSessions.ts`: `appendSession` (cap 50, corrupt
-> [], shape-guarded read - performanceLog precedent), key
`K.completedSessions = "practice.sessions"` + registry entry. Session
lifecycle: started on first play intent after config engages (or etude
open - decide in S3 PR: simplest = explicit "Start session" in the
mechanics panel), ended on Stop/complete; ramp `phase: "complete"`
auto-marks (REQ-33). End-of-session summary card (REQ-62) renders
`summarizeSession`. `appendAttempt` dual-writes pedagogy.log (D120).

---

## 6. FILE PLAN

S1 (edits marked E, new N, comment-only C):

```
E src/App.tsx                       handler math (#1.3), loop label (#2),
                                    formLen prop -> rail + LiveScore, reanchor
                                    call, backing arg cosmetic (#16)
E src/components/PlaySessionRail.tsx  formLen prop, cells, Position,
                                    shift-click, gt guard (#3-#7)
E src/components/PracticeHeader.tsx   switch to formatBarReadout (#21)
E src/lib/practiceHeader.ts         + formatBarReadout (additive)
E src/lib/gtTargets.ts              per-step targets (#8)
E src/lib/theory.ts                 deriveBehavioralMarkers per-step (#9)
E src/components/LiveScoreDisplay.tsx formLen window + beat-cell routing (#10)
E src/lib/playbackClock.ts          duration + stepFloat + reanchor (#11-13)
E src/lib/sheetMusicExport.ts       formLen bars (#15)
E src/lib/paths.ts                  header comment rewrite (#19, C)
E scripts/check-path-bars.ts        labels + comment (#18)
N engine/practice/windows.ts        pure bar<->step law (1.6)
N engine/practice/windows.test.ts   pins + properties
E engine/purity.test.ts             floor 50 -> 51 (tree scans 52)
E src/lib/theory.test.ts            marker pins (colocated)
E src/lib/sheetMusicExport.test.ts  bars pins (colocated)
E src/components/GtCoverageRow.test.tsx count pins (colocated)
E docs/PRACTICE-MECHANICS.md        remove "Not yet" loop carve-out; F3 note
N e2e/practice-loop-window.spec.ts  F3 regression leg (section 7)
```

S2: `E engine/practice/windows.ts` (scheduler), `N engine/practice/ramp.ts(+test)`,
`E src/App.tsx` (barCounterRef, mode wiring, chord-effect gate),
`N src/components/PracticeMechanicsPanel.tsx(+test)`, `E src/state/sessionStore.ts`
(practiceMechanics optional field + defaults, NO v5), `E src/components/PracticeHeader.tsx`
(ramp chip), `N e2e/practice-ab.spec.ts`, `N e2e/practice-ramp.spec.ts`.

S3: `N engine/practice/latency.ts(+test)`, `N engine/practice/match.ts(+test)`,
`N engine/practice/session.ts(+test)`, `N src/lib/practiceSessions.ts(+test)`,
`N src/lib/practiceLatency.ts(+test)`, `E src/lib/storage.ts` (2 K keys +
registry), `N src/components/LatencyWizard.tsx`, `N src/hooks/usePlayedCorrectly.ts`,
`E src/components/PlaySessionRail.tsx` (match overlay cells), `E src/App.tsx`
(wiring), `E src/components/EarTrainingPanel.tsx` (pass latencyMs),
`N e2e/practice-detection.spec.ts`, `E vitest.config.ts` (JSDOM_FILES if
any new DOM test file).

---

## 7. TEST PLAN

Frozen-suite contract: `tests/**` byte-identical (no edits, no additions);
`it(` count stays 362 (check-links); 2360/1/0 preserved; the two
canaries that CONSTRAIN this design: `tests/stepsPerBar.test.ts` (helper
table - untouched) and `tests/practiceHeader.test.ts` (dead-pinned
helpers - untouched, additive bypass D112).

Unit (node env, colocated):

- `engine/practice/windows.test.ts`: barOfStep wrap (incl. negative/NaN-
  guard); windowStepRange identity within first pass + clamp
  (`toBar >= formLen -> clamp`, `from > to -> normalize swap`); pause
  duty-cycle property (10k-bar sweep: exactly N play / M rest, no
  off-by-one at cycle boundary); AB alternation property (swap period =
  swapBars * 2 windows); containment property (nextStep inside active
  window's step range for 1k random-ish seeded configs - inject Rng from
  `engine/core/rng.ts`, no Math.random).
- `engine/practice/ramp.test.ts`: climb after repsPerStep successes;
  drop after failThreshold CONSECUTIVE failures (interleaved success
  resets failStreak); clamp at startBpm/targetBpm; complete iff target
  reached; config-matrix sweep (start<target, step not dividing the
  gap -> lands exactly on target via min-clamp; repsPerStep=1;
  failThreshold=1).
- `engine/practice/match.test.ts`: perfect phrase -> matchedFraction 1,
  empties; octave-shifted performance matches (pc equality); missed /
  wrong / extra separation; tolerance boundary (+/-1ms either side of
  tol flips inclusion); latency compensation shifts a borderline tap into
  range; empty-expected guard (fraction 0, no div-by-zero); NEGATIVE
  fixture per PHASE-3-01 (a performance differing ONLY in one pc).
- `engine/practice/latency.test.ts`: median outlier rejection; clamp
  bounds; zero-tap-input -> null (never 0 - honesty).
- `engine/practice/session.test.ts` + adapters: cap-50 prune, corrupt ->
  [], shape-guard rejects legacy `synesthesia_practice_sessions` rows
  (different schema - D119).
- `playbackClock` step math: extract the two formulas as pure helpers
  (`secPerBarGrid`, `stepOfElapsed`) + pins (4/4 unchanged values;
  6/8 = 3 quarter-seconds; step advances 1/bar).
- `src/lib/theory.test.ts` (edit): markers array length == steps.length;
  frozenBass compares consecutive STEPS not 4-step groups.
- `GtCoverageRow.test.tsx` (edit): cell count == formLen for a padded
  fixture.

e2e (Playwright, dist on :4173 - build first):

- `practice-loop-window.spec.ts` - THE F3 REGRESSION LEG: load, pick a
  known padded path, set tempo slider to 240 (bar = 1s), shift-click
  strip cells 5 and 8, press Play; `expect.poll` the Position text:
  reaches "Bar 8" then returns to "Bar 5" within <= 6s, and NEVER shows
  a bar > 8 while the loop is armed (old code reaches 16+ -> fails).
  Second assertion: strip cell count == formLen (e.g. a 16-cell etude).
  Timing-flake mitigation per TD-CI-E2E-FLAKE: generous windows, poll
  with timeout, no exact-frame asserts.
- `practice-ab.spec.ts`: `data-window` attribute alternates after
  swapBars (text-based, not color).
- `practice-ramp.spec.ts`: manual-outcome buttons are deterministic -
  click "Made it" repsPerStep times -> BPM label += stepBpm; "Missed" x
  failThreshold -> BPM -= stepBpm.
- `practice-detection.spec.ts`: no-MIDI environment (Chromium headless
  has no MIDI inputs) -> detection panel shows the honest unavailable
  state (REQ-PRAC-54 negative leg). Positive detection legs stay unit-
  level (synthetic "midin" CustomEvents in a jsdom hook test - add file
  to JSDOM_FILES).

---

## 8. CHECKLIST (gate order; CI mirrors)

1. [ ] `npm run lint` (tsc --noEmit)
2. [ ] `npm test` -> 2360 + new colocated, 1 skipped, 0 failed; `tests/`
      untouched (`git diff --name-only -- tests/` empty)
3. [ ] `npm run build` (RNN config first, then main - both pass)
4. [ ] `node assets/check-links.cjs` -> 362 it-count, persona/tune counts
      unchanged (no README/SPEC number moves in S1; S3 may add session
      copy - keep numbers out of gated files or update in lockstep)
5. [ ] `npm run check:paths` -> 36/36 OK (math untouched; labels only)
6. [ ] `npm run test:e2e` after build (15 specs -> +1 S1, +2 S2, +1 S3)
7. [ ] `engine/purity.test.ts` floor raised ONLY with the real new files
8. [ ] Manual: etude section loop plays the picked bars; click audible
      during pause rest; count-in still pre-rolls every start surface;
      cycle-12 still advances once per form pass (watch key badge over a
      full 96-step padded path: 3 advances)
9. [ ] `docs/PRACTICE-MECHANICS.md` "Not yet" bullet removed; release
      notes section 1.5 copied to CHANGELOG at ship time
10. [ ] TD register: TD-035 narrowed (melody-lane remainder), TD-036
      practice-player race (TD-036 is live and correct), TD-049
      composer-seed 4x-slow data gen (drafted as TD-037 - that id is
      live as the Phase 6 dormant drawer refs), TD-038 meter-aware
      notation + beat pulse, TD-039 dual-clock unification, TD-050
      remove dead fiction-pinned helpers when the tests/ freeze lifts
      (drafted as TD-040 - that id is live as the Phase 3 generator
      minor-mode defect)

Standing constraints honored: no `console.log/info/debug` in src (warn/
error only), no `any` in new code, ASCII in this doc, engine purity
(no clock/DOM/Math.random; params-in), App.tsx edits stay additive to
the existing effect shapes.

---

## 9. RISKS

| Risk | P | I | Mitigation |
|---|---|---|---|
| LiveScoreDisplay rework (#10) is the largest diff in S1; abcjs highlight mapping could regress | med | med | Route through the ALREADY-SHIPPED beat-cell path (sliced mode) instead of new abc syntax; manual check + print path unchanged; fallback: ship window fix first, quarter-expansion second commit within S1 |
| Strip cell count grows (24 -> 32 typical; worst case non-repeating 256) | med | low | formLen caps at the real form; overflow scroller exists; density polish (form-aware zoom) explicitly deferred |
| Timing-based e2e flake (known TD-CI-E2E-FLAKE) | med | med | poll-based asserts, generous windows, 240 BPM compresses the F3 leg to ~6s; leg fails loudly only on the 4x regression class (old code CANNOT pass) |
| Saved loop ranges silently mean different bars post-update | high | low | release note; clamp guards range; one re-pick resets it |
| Composer-seed paths now visibly "wrong" (4 cells per intended bar) | low | low | honest display of actual audio; TD-049 fixes the data side; note in docs |
| Handler edit touches the sacred site | low | HIGH | diff is 4 lines inside the `useLoop` branch only; once-per-bar contract, cycle-12 predicate, count-in gate, StrictMode ref pattern all byte-untouched; e2e F3 leg + existing cycle-12/count-in specs guard |
| zustand `practiceMechanics` field clobbers cross-tab state (PHASE-4-01 class) | low | med | field-wise merge already the store's boot pattern; config writes are user-gesture-driven |
| Detection without MIDI tempts scope creep (piano/keyboard as "input") | med | med | D118 holds the PRD line; REQ-IO-4/5 input surfaces remain their own future slice |
| `rhythmEngine.setTempo` restart mid-ramp | low | low | ramp only changes BPM at window boundaries (reps), where a grid re-anchor is inaudible; documented in S2 |

---

## 10. HANDOFF

```yaml
HANDOFF_TO_DEVELOPER:
  from: "@architect"
  to: "@developer (via @engineering-team)"
  timestamp: "2026-09-24"
  deliverables:
    - name: "docs/PHASE-7-PRACTICE.md"
      status: complete
      sections: recon-table, F3-design(26-site blast table), decisions
        D110-D120, S2/S3 sketches, file plan, test plan, checklist, risks
  constraints:
    - "tests/** byte-frozen; 2360/1/0 must survive every commit"
    - "sacred handler: ONLY the useLoop branch's 4 math lines change in S1"
    - "count-in gate + metronome playStep path untouchable (D115)"
    - "check:paths math byte-identical (labels/comment only)"
    - "theory.ts edit justified by F3 marker alignment (D-item #9)"
  decisions_made:
    - { id: D110, what: "form-relative 1:1 bar<->step windows", confidence: HIGH }
    - { id: D111, what: "check:paths/padPath/STEPS_PER_BAR stay as step-count policy, commented", confidence: HIGH }
    - { id: D112, what: "additive formatBarReadout; fiction-pinned helpers kept dead-green", confidence: HIGH }
    - { id: D113, what: "onMeasureStart is the only mechanics clock; playbackClock visual-only + reanchor", confidence: HIGH }
    - { id: D114, what: "config in zustand v4 optional field (no v5); live state refs; records in K-registry", confidence: HIGH }
    - { id: D115, what: "metronome survives all window gating by construction", confidence: HIGH }
    - { id: D116, what: "ramp outcome = manual events in S2; detection auto-feeds in S3", confidence: MED }
    - { id: D117, what: "latency: MIDI-tap primary, Space secondary, browser-reported output minus honest limits", confidence: MED }
    - { id: D118, what: "detection requires Web MIDI; piano/keyboard are input surfaces only", confidence: HIGH }
    - { id: D119, what: "new practice.sessions model; legacy set-runner untouched", confidence: HIGH }
    - { id: D120, what: "attempts dual-write sessions + pedagogy.log, one seam", confidence: HIGH }
  implementation_notes:
    - "S1 first, ship green, then S2, then S3 - S2/S3 have ZERO window math of their own, they call engine/practice/windows.ts"
    - "formLen is already in App scope (:823) - pass it down, do not recompute per component"
    - "the F3 e2e leg is the release gate for this whole phase - write it FIRST (red until the handler fix lands)"
    - "watch the gtTargets consumer audit (item #8) - catalog copy may cite 'x/y bars' numbers that shift 4x"
    - "PracticeSessionPlayer needs no edit - resist the urge to 'fix' its race (TD-036)"
  estimated_effort:
    s1_hours: 28-40   # transport fix + 12 touchpoints + tests + e2e leg
    s2_hours: 24-32
    s3_hours: 32-44
    testing_hours: included_per_slice
  risks_top3:
    - "LiveScoreDisplay rework (mitigated via beat-cell reuse)"
    - "e2e timing flake (mitigated via poll asserts)"
    - "saved-loop semantics shift (release note)"
```

**Version:** 1.2.2 | **Phase:** 7 design | **Slices:** 3 (S1 F3 designed fully; S2/S3 unblocking sketches)
