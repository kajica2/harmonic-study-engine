# PRD-001 Phase 7 Slice 2 - Pause Mode, A/B Compare, Tempo Ramp

Status: DESIGN ONLY (research + architecture, no implementation in this doc).
Baseline: HEAD 33ee287, suite 2389 passed / 1 skipped / 0 failed (185 files,
re-run verified this session, 21.7s), e2e 23 tests, tests/ it-count 362
(verified), tree scans 52 engine sources (purity floor 51). CI green.
Parent: docs/PHASE-7-PRACTICE.md (D110..D120; S1 F3 SHIPPED at fd4b383 +
33ee287). This doc fleshes out the S2 sketch (parent section 4) and is the
design authority for REQ-PRAC-21, REQ-PRAC-22, REQ-PRAC-3 (verification),
REQ-PRAC-30..33. Decisions numbered D121+ (parent ended at D120).

Scope discipline: S3 (latency REQ-PRAC-40..42, detection REQ-PRAC-50..54,
sessions REQ-PRAC-60..62) stays OUT. The ramp OUTCOME seam is designed so
S3 plugs in with ZERO ramp-machine changes (D121).

---

## 0. RE-AUDIT (post-F3, strings verified at HEAD 33ee287)

| # | Site | Verified state | S2 relevance |
|---|---|---|---|
| 1 | `src/App.tsx:1561-1627` onMeasureStart handler | EXACTLY two S1 hunks: window math `:1572-1587` (windowStepRange call), reanchor `:1602` (one line). Ref write `:1597-1598`, cycle-12 call `:1607-1619`, bind/detach `:1621-1626`, deps `[path.steps.length, loopStartBar, loopEndBar, formLen, keyCycleActive]` | Scheduler call is the ONLY new hunk (D123); everything else byte-untouched |
| 2 | `engine/practice/windows.ts` (80 lines) | BarWindow, clampWindow, windowStepRange, barOfStep, totalFormBars. Header comment says "S2/S3 extend THIS module" | SUPERSEDED by D123: windows.ts stays GEOMETRY ONLY, unchanged; the scheduler is a new file duty.ts (see fork 3 rationale) |
| 3 | `engine/practice/windows.test.ts` (125 lines, 14 its) | Pure pins: wrap, clamp, identity, F3 regression class | Byte-untouched; duty.test.ts adds the scheduler pins |
| 4 | Chord effect `src/App.tsx:1040-1137` | deps `[currentChordNotes, arpNotes, arpType, arpRate, arpGate, tempo]`; currentChordNotes useMemo `:903-936` yields a NEW array identity every bar (activeStepIndex dep + Array.from) -> effect re-runs per bar | Rest gate = early-return at `:1041` + windowPhase in deps (belt + suspenders), D128 gate map |
| 5 | Backing schedule `src/App.tsx:1688-1714` | rAF tick -> stepIdx from clock (reanchor makes it follow the transport step), `beatInBar < 0.1` gate, scheduleAhead(path.steps, stepIdx+1, stepIdx, startSec, secPerBar) | NO edit: rest silence rides the BUS, not the schedule (D128) |
| 6 | `src/lib/backingEngine.ts:247-273` scheduleAhead | stepsAhead=4, internal `scheduledSteps` cursor (ignores baseStepIdx once running); NO internal bpm - secPerBar is a PARAMETER from App's tempo state; buses drumBus/bassBus/pianoBus, setLevels mutes via gain 0 | Rest mute = third gain factor (D128); lookahead makes per-bar schedule skipping IMPOSSIBLE (bars are pre-scheduled 4 deep) - bus gain is the only correct gate |
| 7 | `src/lib/rhythm.ts:104-110` setTempo | stop()+start() while running: grid re-anchors at step 0, playStep(0) fires immediately (one extra downbeat click at call time) | Ramp applies via the EXISTING [tempo] sync effect `:1520-1521` (slider-equivalent path, D124); flam tail is the documented TD-038a class |
| 8 | `src/lib/rhythm.ts:127-134,152-195` | onMeasureStart fires at currentStep===0 inside the interval; playStep click path IMMUTABLE | REQ-PRAC-3 proof: S2 diffs must not touch rhythm.ts (byte-diff protocol section 4) |
| 9 | `src/lib/playbackClock.ts` | secPerBarGrid `:42-44`, stepOfElapsed `:52-60`, setTempo `:88-90` (bpm only, re-derives per frame), reanchor `:148-156`, pathDurationSec `:183-189` | BPM change mid-loop: secPerBar re-derives next frame; per-bar reanchor bounds visual drift to < 1 bar. S1 pinned tempo 120->240 (playbackClock.test.ts); ramp steps are smaller deltas |
| 10 | `src/components/PracticeHeader.tsx:147-170,310-334` | Metronome gear popover precedent: local open state, document keydown/mousedown listeners mounted only while open, z-40, Escape closes | Mechanics gear popover copies this pattern EXACTLY (D127) |
| 11 | `src/components/PlaySessionRail.tsx:589-594,737-801` | formLen prop; totalBars/currentBar via windows.ts; shift-click sets ONE window via setLoopBar `:755-768`; loop band overlay `:789-801`; cells `title="Bar N ..."` | A/B capture reads loopStartBar/loopEndBar (no new rail gesture); rail gains data-phase/data-window attributes (D127) |
| 12 | `src/state/sessionStore.ts` | zustand 5 LIBRARY, persist envelope v4 (CURRENT_SESSION_VERSION=4 `:69`); partialize `:560-570`; migrate -> engine/migrations runner | "no v5" = no ENVELOPE bump. D126 rides the D73/D85 optional-field pattern |
| 13 | `engine/migrations/runner.ts` + `index.ts` | up() steps spread `...base` - unknown keys PRESERVED; runner validates chain only, never strips fields | A new top-level persisted field survives v4 payloads with zero migration (verified - D126 precondition) |
| 14 | `src/hooks/useSessionStore.ts:414-431` + `src/lib/storage.ts:41-42` | loopStartBar/loopEndBar = legacy useState + `synesthesia_loop*` keys; metronomeConfig = K.metronomeConfig blob + normalizeMetronomeConfig hydrate guard (`src/lib/metronomePatterns.ts:53+`) | Loop-window precedent stays GRANDFATHERED (no migration); new configs follow the metronomeConfig NORMALIZE pattern inside zustand (D126) |
| 15 | `src/lib/keyCycle.ts:36-42` + call `src/App.tsx:1607-1619` | shouldAdvanceKeyCycle pure; subLoopActive currently = useLoop | S2 widens subLoopActive to "any active windowed mode"; keyCycle.ts itself UNTOUCHED |
| 16 | Count-in gate `src/App.tsx:471-540` | requestPlayState + useCountIn; isPlayingAuto stays FALSE during pre-roll | IMMUTABLE; duty counter resets on the isPlayingAuto TRUE edge, so bar 1 after count-in is always a PLAY bar (D122) |
| 17 | Keyboard: App handler `:1139-1282` + `src/hooks/useKeyDown.ts` + `tests/keyboard-shortcuts.test.ts` (FROZEN) | Bound: Esc, ?, 1/2/3, [ ], Shift+brackets, arrows, Space, M, Comma(-5), Period(+5). The frozen test checks BOTH directions between its hardcoded HANDLED_KEYS list and the cheatsheet SHORTCUTS array | TRAP: adding any chip to KeyboardShortcutsCheatsheet.tsx FAILS the frozen reverse check (HANDLED_KEYS is frozen). S2 adds ZERO global shortcuts (D127) |
| 18 | Runner `src/components/PracticeSessionPlayer.tsx:230-248` + App `:748-751,3339-3346` | Clock subscription writes onStepChange -> setActiveStepIndex WHILE the handler also advances it (dual-writer race). Gate var: `activePracticeSet !== null` | D125 guard: mechanics never engage while activePracticeSet != null |
| 19 | TD register `.kai/tech-debt/register.md:42` | TD-036 register line is DOCS debt (MODES.md title); the parent doc reuses "TD-036" for the runner race | NAMING COLLISION - flag; the race gets a fresh id (TD-052) at ship time (D125) |
| 20 | `src/lib/practiceHeader.ts:37-45` formatBarReadout | S1 additive helper (formLen, stepIndex, chordName) | Reused as-is by the header; ramp chip formatter lives in src/lib/practiceMechanics.ts |
| 21 | Melody lane | `src/App.tsx:4171-4174` comment + grep: melodyByStep has NO audio playback consumer (display only); audio.ts `:265` melodyMuted gates the HD-soundfont path of playNote | Chord effect + backing bus are the ONLY two audio surfaces to gate (D128 proof) |
| 22 | Baselines | suite 2389/1/0 (185 files) re-run green; e2e 23 (grep test( across e2e/*.spec.ts); tests/ it( = 362 (grep verified); purity floor 51 / tree 52; check-links gates persona/tune counts (no S2 numbers move) | New pins per section 9 |

---

## 1. THE EIGHT FORKS - DECISIONS

### D121 (fork 1): ramp outcome semantics = HYBRID with an abstract event seam

The ramp state machine consumes `RampEvent`s. It NEVER knows who produced
them. S2 wires the source to manual buttons; S3 wires the source to
detection on `passCompleted` - the machine, its pins, and its UI chip do
not change.

- Rejected (b) rep-count-only: REQ-PRAC-31 (decrease on consecutive
  failures) is P1. A deterministic ladder with no failure signal cannot
  ship REQ-31 in S2 at all. (b) is silently (a) with the failure path
  deferred - not acceptable for a P1.
- Rejected pure (a) without a seam: a machine reading button state would
  be rewritten in S3. (c) keeps S3 a WIRING change, not a rewrite.

S2 source: "Made it" / "Missed it" buttons in the mechanics panel + ramp
chip. EACH CLICK IS ONE REP OUTCOME (a rated pass). No pending-rating
state, no unrated-pass ambiguity: the user rates what they just played.
The scheduler's `passCompleted` signal ships in S2 (duty.ts) and is
CONSUMED ONLY as a rep indicator (chip pulse) - S3's detector auto-emits
`{kind:"rep", success}` on passCompleted, replacing the buttons as the
source while the buttons remain as a manual override.

```
S2:  [button click] --+
                     +--> RampEvent --> rampNext(state, config, e) --> bpm apply
S3:  [detection on passCompleted] --+
```

### D122 (fork 2): window math on the F3 foundation

PAUSE MODE reuses the existing span concept - it does NOT own a window:

```
span(pause) = loop window (legacy loopStartBar/loopEndBar) if set,
              else the FORM [0, formLen)
```

The rail shift-click gesture keeps setting ONE window (unchanged). Pause
is a DUTY CYCLE over that span: `phase = (counter % (N+M)) < N ? play :
rest`, where counter = handler firings since play-start. Bar 1 after the
count-in is ALWAYS a play bar (counter starts at 0; dutyIndex 0 < N).
The transport NEVER stops during rest (the drill is resting IN TIME):
activeStepIndex keeps advancing, the playhead keeps moving, the metronome
keeps clicking; chord + backing audio are gated (D128). Pause over the
whole-path case spans the FORM, not the padded repeat (a 32-bar standard
padded x3 rests on tune bars, not on pad artifacts - honest, pinned).

A/B OWNS two windows, in the new zustand field (D126):
`practiceMechanics.ab = { a: BarWindow, b: BarWindow, swapBars: number }`.

- UX: the panel's "Capture A" / "Capture B" buttons SNAPSHOT the current
  rail selection (loopStartBar/loopEndBar) into the respective slot.
  No new rail gesture (shift-click stays single-window; a modifier
  variant would collide with the frozen keyboard/gesture surface and is
  undiscoverable). Numeric steppers in the panel are the secondary edit
  path. Capture-into-slot is one gesture per window and mirrors how the
  loop band already works.
- `activeWindow = floor(counter / swapBars) % 2 === 0 ? a : b`; on a slot
  change the transport JUMPS to the new window's fromStep (bar-aligned,
  fires inside the handler - never mid-bar).
- swapBars default 4, range 1..32. swapBars SHORTER than a window means
  mid-window jumps (that is the configurable interval, PRD-legal);
  LONGER means a window repeats within a segment. Both pinned.
- A and B MAY overlap each other - comparing overlapping variants is a
  legitimate use. No disjointness constraint.
- Form-boundary: clampWindow on config WRITE and again at scheduler READ
  (formLen changes when the user switches paths; persisted AB windows are
  app-global like the loop windows, clamped to the ACTIVE form - worst
  case a narrowed window, never a crash). Same semantics as S1 blast #22.

Mode exclusivity: off | loop | pause | ab is ONE selector (the drills are
separate PRD items; pause-with-AB is not requested). The RAMP is
ORTHOGONAL: rampEnabled rides any mode (rep = pass of the active span;
in ab, passCompleted fires on each slot change - each A segment and each
B segment is a rep of the CURRENT window, which is the musically honest
reading of A/B ramping).

### D123 (fork 3): the sacred handler - one pure scheduler, one new hunk

Deviation from the parent sketch (which said "windows.ts grows a
scheduler"): windows.ts stays SHIPPED and BYTE-UNTOUCHED (its 14 pins are
S1's regression floor; a geometry module and a per-firing scheduler are
different concerns). New files:

- `engine/practice/duty.ts` - the pure next-measure state function.
- `engine/practice/ramp.ts` - the pure tempo ladder.

Purity floor: 51 -> 53 (two new sources; tree scans 54). Both import only
relative engine paths (duty.ts imports BarWindow types from ./windows).

Scheduler API (full sketch in section 2):

```
advanceTransport({ prevStep, barCounter, formLen, totalSteps,
                   mode: "loop"|"pause"|"ab", loop, pause, ab })
  -> { nextStep, phase, activeWindow, dutyIndex, passCompleted,
       spanFromStep, spanToStep }
```

Handler surgery (App.tsx `:1561-1627`) - the ONLY new hunk:

```ts
const prev = activeStepIndexRef.current;
const mechanics = mechanicsActiveRef.current;   // mode !== "off" && !runnerActive (D125)
let next: number;
let useLoopFallback = isLoopingRef.current && loopStartBar !== null;
if (mechanics) {
  const k = ++barCounterRef.current;            // firings since play-start
  const d = advanceTransport({
    prevStep: prev, barCounter: k, formLen, totalSteps: path.steps.length,
    mode: mechanicsModeRef.current, loop: loopWindowRef.current,
    pause: pauseCfgRef.current, ab: abCfgRef.current,
  });
  next = d.nextStep;
  windowPhaseRef.current = d.phase;
  abSlotRef.current = d.activeWindow;
  rampPassRef.current = d.passCompleted;        // S3 seam + chip pulse
  queueMicrotask(() => {                        // UI mirror, D13 discipline
    setWindowPhase(d.phase);
    setAbSlot(d.activeWindow);
    if (d.passCompleted) bumpRepIndicator();    // ramp chip pulse, no tempo math
  });
} else if (useLoopFallback) {
  // F3 branch - BYTE-IDENTICAL to shipped :1572-1587 (fallback while
  // runner active or mechanics off)
  ...
} else if (prev >= path.steps.length - 1) {     // BYTE-IDENTICAL :1588-1596
  ...
} else { next = prev + 1; }
activeStepIndexRef.current = next;              // BYTE-IDENTICAL :1597-1598
setActiveStepIndex(next);
playbackClock.reanchor(next);                   // BYTE-IDENTICAL :1602
if (shouldAdvanceKeyCycle({ ..., subLoopActive: mechanics ? true : useLoopFallback })) ...
```

- The mechanics branch REPLACES the legacy branch only while engaged;
  with mode "off" (or runner active) the handler is byte-identical to
  today's behavior. The scheduler's mode "loop" output is PINNED
  equivalent to the shipped F3 branch for exhaustive (prev, k, window)
  sweeps (duty.test equivalence pin) - so routing loop through the
  scheduler is behavior-preserving by test, not by argument.
- cycle-12: `subLoopActive` widens to "any windowed mode" (pause/ab wrap
  at arbitrary offsets exactly like loop). keyCycle.ts UNTOUCHED. In mode
  "off" the expression value is identical to today.
- Handler effect deps GAIN the mechanics config slice (rebind-on-change
  is the existing supported pattern, detach hunk `:1622-1626` byte-
  identical).
- Config reads inside the handler go through REFS (D13 sync-access
  discipline); the zustand value lands in refs via a sync effect.
- Byte-diff proof protocol: section 4.

onMeasureStart firing, cycle-12 predicate, count-in gate, metronome
playStep path, reanchor line: IMMUTABLE, same discipline as S1.

### D124 (fork 4): tempo mid-flight

Ramp NEVER calls rhythmEngine.setTempo directly. It writes the ONE tempo
source of truth through the existing store setter (the slider path):

```
rampNext(...) -> bpm changed? -> queueMicrotask(() => setTempo(newBpm))
  -> existing effect [tempo] -> rhythmEngine.setTempo  (App:1520-1521)
  -> existing effect [tempo] -> playbackClock.setTempo (App:1644-1646)
  -> existing effect [tempo] -> storageSet(K.tempo)    (App:1718-1723)
```

Verified consequences (all are the SHIPPED, S1-pinned slider behavior -
ramp adds no new mechanism):

1. rhythmEngine.setTempo restarts the interval (stop+start): the 16th
   grid re-anchors at step 0 and one downbeat click fires immediately
   (rhythm.ts:104-110 + start()'s playStep(0)). Mid-bar manual clicks
   therefore truncate the current bar - IDENTICAL to dragging the tempo
   slider during playback (accepted UX; the double-click flam is the
   documented TD-038a accepted-tail class, not new). S3 auto-events fire
   at pass boundaries where the restart lands clean (parent 4.4 note).
2. playbackClock re-derives secPerBarGrid/pathDurationSec from the new
   bpm on the next frame (setTempo stores bpm only); the per-bar
   reanchor(next) call bounds any visual phase error to < 1 bar. S1
   pinned the 120->240 double jump; ramp deltas are smaller and ride the
   same law.
3. Backing engine: NO internal bpm (audit #6) - secPerBar flows from
   App's tempo state per scheduleAhead call; the rAF subscription effect
   has tempo in deps. Backing follows tempo automatically.
4. Count-in pacing reads tempo live (useCountIn deps) - unchanged.
5. Manual tempo takeover during an active ramp: an effect on [tempo]
   compares against rampState.bpm; a mismatch NOT produced by the ramp
   dispatches `{kind:"reseed", bpm: tempo}` - the ladder continues from
   the user's tempo, reps reset. The equality check breaks the echo loop
   (ramp's own setTempo lands tempo === state.bpm -> no reseed). Pinned.

### D125 (fork 5): TD-036 dual-writer race - out of scope WITH a guard

The runner (PracticeSessionPlayer) and the handler are dual writers of
activeStepIndex (existing; parent blast #14). S2's rep/duty/AB math
assumes ONE writer per measure boundary, so mechanics MUST NOT engage
under the runner:

- Guard: `mechanicsActiveRef = mode !== "off" && activePracticeSet ===
  null` (ref synced from App state `:748-751`, read in the handler - zero
  dep changes). Runner active -> handler falls through to the byte-
  identical legacy branches; duty/ramp code paths never execute.
- The mechanics panel renders DISABLED (aria-disabled + title "Not
  available during a set session") while activePracticeSet != null. The
  runner surface does not mount the header chips.
- No minimal fix now: the race fix is TD-039 dual-clock territory;
  touching the runner violates parent instruction "resist the urge to fix
  its race".
- REGISTER HYGIENE (audit #19): the parent doc calls the race TD-036, but
  the register's TD-036 line is docs debt. At ship time Kai records the
  race as TD-052 (practice: runner/handler dual-writer) so the guard has
  a citable id; do NOT overload TD-036.

### D126 (fork 6): state placement - per feature class

| Class | Data | Home | Precedent |
|---|---|---|---|
| CONFIG TASTE (survives reload, cross-session): mode selector, pause N/M, AB windows + swapBars, ramp config + rampEnabled | ONE optional top-level field `practiceMechanics?: PracticeMechanicsConfig` in the zustand store (src/state/sessionStore.ts) | D73/D85 verbatim: NO envelope v5, NO migration step. Verified precondition (audit #13): the migration chain spreads unknown keys through; zustand's shallow merge applies initial defaults at read when the persisted payload lacks the field. partialize GAINS the key. normalizePracticeMechanics(raw) hydrate guard mirrors normalizeMetronomeConfig (audit #14) | D73/D85/D32 |
| SESSION STATE (live run, dies with the run): barCounter, windowPhase, abSlot, ramp run state (bpm/repsAtBpm/streaks/phase) | refs in App + React mirrors via queueMicrotask (D13); NOT persisted | loop position itself is not persisted either (activeStepIndex is a transport mirror, not taste). A reload restarts drills from bar 1 - honest | D13 |
| LOOP WINDOW (grandfathered) | stays legacy `synesthesia_loop*` useState store | DO NOT migrate: keys are byte-frozen adjacent surface, semantics already re-pinned by S1 (#22). pause reads it as its span; ab capture snapshots it | S1 #22 |
| RECORDS (completed sessions/attempts) | S3 (K.completedSessions) - out of scope | parent D114/D119 | - |

Why zustand and not K.* for the new configs: the loop-window precedent is
a transport-adjacent legacy island; the pedagogy K.* precedent is for
RECORDS (logs, sessions), not taste. The closest shipped analog to
"practice config taste" is metronomeConfig (normalize-guarded blob) - and
D114 already ruled that mechanics config rides zustand as one optional
field. New keys in storage.ts: NONE for S2 (no K.* additions; the field
lives inside the existing K.session envelope).

Types + normalize live in `src/lib/practiceMechanics.ts` (pure, node-
tested) - NOT engine/ (config plumbing, not musical math; mirrors
metronomePatterns.ts placement). Engine keeps duty.ts/ramp.ts (the
math).

### D127 (fork 7): UI - one gear popover, two chips, zero new keys

Placement: the rail transport row is already crowded (audit: metronome
gear, count-in live in PracticeHeader; rail carries loop/transpose/
persona). The mechanics UI rides the PracticeHeader gear-popover
precedent (D36, audit #10):

- New gear button beside the click gear: "Drills" (Settings icon
  variant, data-testid="mechanics-settings-toggle", aria-expanded),
  opening `PracticeMechanicsPanel` in a z-40 popover (same open/close
  machinery: local visibility state, document listeners mounted only
  while open, Escape + outside-click close). Panel is pure
  presentational: props config + onChange(next-complete-object) per
  section (MetronomeControls contract).
- Panel sections:
  1. Mode: segmented Off / Loop / Pause / A-B.
  2. Pause: playBars stepper 1..16, restBars stepper 1..16.
  3. A/B: "Capture A" / "Capture B" (snapshot current rail selection;
     disabled + explanatory title when no window is set), window readouts
     "A: bars 5-8", swapBars stepper 1..32.
  4. Ramp: enable checkbox; start/target/step/reps/threshold inputs
     (clamped 30..240 bpm per slider bounds); "Made it" / "Missed it"
     buttons; "Reset".
- Always-visible live surfaces (REQ-PRAC-32):
  - Ramp chip in the header readout row (left region, NOT the button
    row): `RAMP 96 -> 102 (+6)  rep 2/4  S3/F1` - current bpm, target,
    step, reps at bpm, success/fail streak. role="status"
    aria-live="polite", data-testid="ramp-chip". Rendered only when
    rampEnabled.
  - Phase badge beside the readout when mode=pause: "PLAY"/"REST"
    (data-testid="phase-badge", data-phase mirror). REST is glyph+text
    (never color-only, PRD 9.8).
- Rail DOM hooks (e2e + a11y):
  - Strip container gains `data-phase="play|rest"` (pause mode; else
    "play").
  - Cells inside the A window get `data-window="a"`, B window
    `data-window="b"`, overlap `data-window="ab"`; the ACTIVE slot's band
    renders (A reuses the existing brass loop band; B uses the brand
    tint) plus corner letter glyphs "A"/"B" (redundancy).
  - No changes to shift-click math or the loop band when mode is off/loop.
- Keyboard audit (fork 7): occupied globally - Esc, ?, 1/2/3, [ ],
  Shift+[ ], arrows, Space, M, Comma, Period (audit #17). FREE letters
  exist, BUT S2 adds ZERO new global shortcuts: the frozen
  tests/keyboard-shortcuts.test.ts reverse-check fails any new
  cheatsheet chip, and undocumented global keys violate the consistency
  policy. All mechanics actions are real buttons/inputs (Tab/Enter
  reachable, aria-pressed states). Ramp +/- rides existing Comma/Period
  through the reseed guard (D124.5) - documented in the panel copy, not
  in the cheatsheet.
- Mobile: out of scope (MobileCommandBar keeps loop toggle only;
  documented limitation, same class as the metronome gear's desktop-first
  surface).

### D128 (REQ-PRAC-3 verification + the audio gate map)

The click keeps running during pause/AB rests BY CONSTRUCTION:

```
metronome: rhythm.playStep -> audioEngine.playMetronomeClick (metronomeGain bus)
chords:    App chord effect (stopAll + early-return on phase === "rest")
backing:   backingEngine.setRestMuted(true) -> drum/bass/piano BUS GAINS x0
```

- rhythm.ts: ZERO DIFF (byte-diff protocol item 1). The new gates sit at
  the chord effect and a new gain flag - never at playStep. The click bus
  (audio.ts metronomeGain, D33) is independent of the backing buses
  (AGENTS.md: muting the click does not mute the backing; the converse -
  resting the backing does not mute the click - holds by the same bus
  topology).
- WHY BUS MUTE AND NOT SCHEDULE SKIP (audit #6): scheduleAhead schedules
  4 bars AHEAD via an internal cursor; at rest start the rest bar's beats
  are ALREADY scheduled in WebAudio time. Skipping the per-bar
  scheduleAhead call would silence FOUR bars later (wrong bar) and desync
  the cursor. Bus gain applies live to everything routed through,
  including pre-scheduled events: exact bar-boundary silence. Hard gate
  cuts sustains mid-decay at the boundary - that IS the rest.
- Chord effect: early-return at `:1041` after stopAll (audio + midiOut +
  recorder see nothing - takes record honest rests). The effect already
  re-runs every bar (new currentChordNotes identity, audit #4); windowPhase
  is ALSO added to the deps so a phase flip at a same-chord repeat still
  re-runs (belt + suspenders).
- backingEngine.setRestMuted(on): one flag + gain recompute, same shape
  as setLevels mutes; start()/stop() unaffected; scheduledSteps cursor
  keeps walking (backing resumes in-phase with the transport at rest end
  because the clock reanchor keeps stepIdx aligned - D113).
- KNOWN PRE-EXISTING GAP (documented, NOT fixed by S2): the backing
  scheduledSteps cursor ignores window wraps (audit #6), so during a
  SUB-WINDOW loop/pause/ab the backing's chord CONTENT (bass/piano notes)
  walks the full path while the groove timing stays honest. Beat-style
  output is unaffected. Register as TD-053 at ship time. Rest muting
  works correctly regardless (bus level, content-agnostic).

---

## 2. ENGINE API SKETCHES

### engine/practice/duty.ts (new, pure)

```ts
import type { BarWindow } from "./windows";

export type MechanicsMode = "off" | "loop" | "pause" | "ab";
export type DutyPhase = "play" | "rest";
export type AbSlot = "a" | "b";

export interface PauseConfig { playBars: number; restBars: number }   // >= 1
export interface AbConfig { a: BarWindow; b: BarWindow; swapBars: number } // swapBars >= 1

export interface TransportInput {
  prevStep: number;        // activeStepIndexRef.current
  barCounter: number;      // handler firings since play-start (>= 1 at first call)
  formLen: number;
  totalSteps: number;      // padded path length
  mode: Exclude<MechanicsMode, "off">;
  loop: BarWindow | null;  // legacy window; null = whole-form span
  pause: PauseConfig | null;
  ab: AbConfig | null;
}

export interface TransportDecision {
  nextStep: number;
  phase: DutyPhase;        // "play" for loop/ab
  activeWindow: AbSlot | null;   // ab only
  dutyIndex: number;       // pause only: barCounter % (N+M)
  passCompleted: boolean;  // wrapped to span head (loop/pause) or slot change (ab)
  spanFromStep: number;    // effective clamped span (UI band + S3)
  spanToStep: number;
}

export function advanceTransport(d: TransportInput): TransportDecision;
```

Laws (each pinned in duty.test.ts):

1. CONTAINMENT: nextStep always in [spanFromStep, spanToStep).
2. LOOP EQUIVALENCE: for mode "loop", output equals the shipped F3 branch
   for exhaustive (prev, k, window) sweeps - the test re-implements the
   shipped 6 lines as the reference oracle.
3. PAUSE DUTY EXACTNESS: over any 10k-bar sweep with span >= 1, every
   (N+M)-cycle has exactly N play bars then M rest bars; dutyIndex 0 is
   play; no off-by-one at cycle boundaries (N=1, M=1, N=16, M=16 corners).
4. AB ALTERNATION: slot flips every swapBars firings, period 2*swapBars;
   slot-change fires passCompleted; nextStep jumps to the new window head.
5. PASS: passCompleted iff (loop/pause) prev at span tail wrapping to
   head; iff (ab) slot change. Never two in one firing.
6. SPAN: pause span = loop window ?? [0, formLen) (FORM, not padded
   totalSteps); ab windows clampWindow'd; degenerate configs (null cfg
   for an engaged mode) fall back to loop-law behavior, never crash.
7. PURE: no clock, no rng, no Date; integer-guarded (safeInt pattern from
   windows.ts reused via local helper - engine-internal duplication is
   cheaper than widening windows.ts's exports).

### engine/practice/ramp.ts (new, pure)

```ts
export interface RampConfig {
  startBpm: number; targetBpm: number; stepBpm: number;
  repsPerStep: number; failThreshold: number;
}
export interface RampState {
  bpm: number; repsAtBpm: number;
  successStreak: number; failStreak: number;
  phase: "climb" | "complete";
}
export type RampEvent =
  | { kind: "rep"; success: boolean }   // S2: manual; S3: detection (D121)
  | { kind: "reseed"; bpm: number }     // manual tempo takeover (D124.5)
  | { kind: "reset" };                  // engage/disengage

export function initialRampState(c: RampConfig): RampState;
export function rampNext(s: RampState, c: RampConfig, e: RampEvent): RampState;
```

Laws (each pinned in ramp.test.ts):

1. CLIMB: success -> repsAtBpm++, successStreak++, failStreak=0; at
   repsPerStep -> bpm = min(bpm + stepBpm, targetBpm), repsAtBpm = 0.
2. DROP: failure -> failStreak++, successStreak=0; at failThreshold ->
   bpm = max(bpm - stepBpm, startBpm), failStreak = 0, repsAtBpm = 0.
   CONSECUTIVE is literal: one success resets failStreak (interleaving
   pin).
3. COMPLETE: phase "complete" iff a CLIMB step lands bpm === targetBpm
   (REQ-PRAC-33; min-clamp makes a non-dividing gap land EXACTLY).
   reseed to target does NOT complete (ladder-only, pinned).
4. CLAMPS: bpm never below startBpm, never above targetBpm.
5. RESEED: bpm = clamp(e.bpm, startBpm, targetBpm); counters reset;
   phase back to "climb" unless already complete... NO: reseed always
   yields "climb" (a takeover invalidates completion) - pinned.
6. VALID CONFIG: normalizeRampConfig rejects startBpm >= targetBpm
   (returns null = ramp disabled), clamps bpm into [30,240], floors
   stepBpm/repsPerStep/failThreshold at 1.
7. MATRIX SWEEP: repsPerStep=1, failThreshold=1, stepBpm > gap,
   start=target-1 corner cases - deterministic, no rng needed.

### src/lib/practiceMechanics.ts (new, pure, node-tested)

```ts
export interface PracticeMechanicsConfig {
  mode: MechanicsMode;                    // default "off"
  pause: PauseConfig;                     // default { playBars: 4, restBars: 4 }
  ab: AbConfig;                           // default a={0,7} b={8,15} swapBars=4
  ramp: RampConfig;                       // default {90,150,4,2,2}
  rampEnabled: boolean;                   // default false
}
export const DEFAULT_MECHANICS: PracticeMechanicsConfig;
export function normalizePracticeMechanics(raw: unknown): PracticeMechanicsConfig;
export function formatRampChip(s: RampState, c: RampConfig): string;
// "RAMP 96 -> 102 (+6)  rep 2/4  S3/F1" ; complete -> "RAMP 102 - TARGET"
```

normalize = total-shape guard (every field type-checked + range-clamped,
corrupt -> default), mirroring normalizeMetronomeConfig's contract: ANY
stored JSON resolves to a valid config.

### src/state/sessionStore.ts (edit)

```ts
interface MechanicsSlice {
  practiceMechanics: PracticeMechanicsConfig;
  setPracticeMechanics: (patch: Partial<PracticeMechanicsConfig>) => void;
}
// initial state: normalizePracticeMechanics(undefined) (defaults)
// partialize GAINS practiceMechanics
// NO CURRENT_SESSION_VERSION change, NO migration step (D126)
```

### Component props (sketch)

```ts
interface PracticeMechanicsPanelProps {
  config: PracticeMechanicsConfig;
  rampState: RampState | null;        // live mirror; null = ramp not engaged
  loopSelection: { from: number; to: number } | null;  // for Capture buttons
  formLen: number;
  disabled: boolean;                  // runner active (D125)
  onConfigChange: (next: PracticeMechanicsConfig) => void;
  onRepOutcome: (success: boolean) => void;   // D121 manual source
  onRampReset: () => void;
}
```

---

## 3. DATA FLOW (the three drills, one firing)

```
count-in (untouched) -> isPlayingAuto TRUE -> barCounterRef=0, phase="play"
  [rhythmEngine interval]
  on each bar boundary (onMeasureStart firing, unchanged):
    handler -> advanceTransport -> {nextStep, phase, slot, passCompleted}
      -> ref writes + setActiveStepIndex (existing lines, byte-identical)
      -> playbackClock.reanchor(next) (existing line, byte-identical)
      -> cycle-12 (subLoopActive widened)
      -> queued microtask: UI mirrors (phase badge, chip, rail attrs)
  chord effect (per bar): phase rest -> stopAll + return (no notes)
  backingEngine.setRestMuted(phase === "rest")   [bus gains]
  metronome: playStep -> UNTOUCHED -> keeps clicking (REQ-PRAC-3)
  [ramp] Made it/Missed it click -> rampNext -> bpm delta?
      -> queueMicrotask setTempo(bpm) -> existing tempo effects (D124)
```

---

## 4. BYTE-DIFF PROOF PROTOCOL (mandatory in the dev report)

Same discipline as S1. The developer's report MUST contain:

1. `git diff --name-only` shows NO `src/lib/rhythm.ts`, NO `src/lib/countIn.ts`,
   NO `src/hooks/useCountIn.ts`, NO `src/lib/keyCycle.ts`, NO
   `engine/practice/windows.ts`, NO `engine/practice/windows.test.ts`,
   NO `tests/**`.
2. `git diff -U0 src/App.tsx` hunk inventory, each hunk classified as one
   of: (a) new mechanics branch inside the handler; (b) chord-effect
   early-return + deps line; (c) new effects/refs block; (d) header/rail
   props; (e) imports. The following line ranges must appear UNCHANGED in
   the diff context: `:471-540` (count-in gate), `:1588-1598` (non-loop
   branches + ref writes), `:1602` (reanchor), `:1621-1627` (bind/detach
   shape), `:1520-1521` (setTempo sync). The cycle-12 call block shows
   exactly one changed expression: `subLoopActive`.
3. `git diff --name-only -- tests/` EMPTY; `grep -c "it(" tests/**` == 362.
4. Handler firing-count contract: duty.test equivalence pin #2 (loop
   law) + the runner guard means mode "off" behavior is byte-identical
   AND value-identical.

---

## 5. EXACT FILE PLAN (E edit / N new / C comment-only)

```
N engine/practice/duty.ts                    pure scheduler (section 2)
N engine/practice/duty.test.ts               laws 1-7 (node env, colocated)
N engine/practice/ramp.ts                    pure ladder (section 2)
N engine/practice/ramp.test.ts               laws 1-7 + matrix sweep
E engine/purity.test.ts                      floor 51 -> 53 (comment cites D123)
N src/lib/practiceMechanics.ts               types + DEFAULT + normalize + chip fmt
N src/lib/practiceMechanics.test.ts          hydrate guards (node env)
E src/state/sessionStore.ts                  MechanicsSlice: optional field, action,
                                             partialize (NO v5, D126)
E src/state/sessionStore.test.ts             field roundtrip + defaults-at-read
E src/App.tsx                                refs (barCounter, windowPhase, abSlot,
                                             mechanics cfg, runner guard, ramp state),
                                             handler branch, chord gate, rest-mute
                                             effect, ramp wiring + reseed guard,
                                             header/rail props, chips state mirrors
E src/lib/backingEngine.ts                   setRestMuted(on) + gain recompute
E src/lib/backingEngine.test.ts (if exists; else colocated new pins)  rest-mute gain law
N src/components/PracticeMechanicsPanel.tsx  pure presentational (D127)
N src/components/PracticeMechanicsPanel.test.tsx  jsdom - ADD to JSDOM_FILES
E vitest.config.ts                           JSDOM_FILES += panel test (AGENTS gotcha)
E src/components/PracticeHeader.tsx          Drills gear + popover + ramp chip +
                                             phase badge (props-forwarded)
E src/components/PlaySessionRail.tsx         data-phase container attr, data-window
                                             cell attrs + A/B bands + glyphs
N e2e/practice-pause.spec.ts                 leg 1 (section 6)
N e2e/practice-ab.spec.ts                     leg 2
N e2e/practice-ramp.spec.ts                   leg 3 (deterministic, x2 tests)
E docs/PRACTICE-MECHANICS.md                 pause/AB/ramp sections; gear map updated
```

NOT touched: tests/**, engine/practice/windows.ts(+test), rhythm.ts,
countIn/useCountIn, keyCycle.ts, MobileCommandBar, PracticeSessionPlayer,
loopWav/WAV, README/SPEC/AGENTS, .kai (Kai-only).

---

## 6. TEST PLAN

Unit (node env unless noted):

- duty.test.ts (~20 its):
  - equivalence pin: mode "loop" == shipped F3 oracle (exhaustive prev x
    window sweep over formLen 4..16).
  - containment property: 1k seeded configs (mulberry32 from
    engine/core/rng.ts - injected, never Math.random) assert nextStep in
    span for 200-bar walks each.
  - pause exactness: 10k-bar sweep, every cycle N play / M rest; corners
    N=1/M=1, N=1/M=16, N=16/M=1; dutyIndex continuity; first bar play.
  - AB alternation: period 2*swapBars; swap at k=swapBars lands B head;
    passCompleted on slot change only; overlapping A/B windows pinned.
  - passCompleted law per mode incl. single-bar windows (span of 1:
    every bar is a pass).
  - span law: pause with loop=null spans [0, formLen) NOT [0, totalSteps)
    (padded-path pin: formLen 32, totalSteps 96 -> never rests on a pad
    repeat beyond the form).
  - degenerate guards: null cfg for engaged mode, formLen 0/NaN,
    reversed windows (clampWindow swap), barCounter 0/negative.
- ramp.test.ts (~16 its): laws 1-7 above; config-matrix sweep incl.
  stepBpm not dividing the gap (lands exactly on target via min-clamp),
  repsPerStep=1, failThreshold=1, interleaved success resets failStreak,
  reseed-always-climb, reset idempotence.
- practiceMechanics.test.ts (~10 its): normalizePracticeMechanics on
  garbage (null, {}, arrays, string fields, out-of-range, NaN) -> valid
  config; defaults shape; formatRampChip strings (incl. complete).
- sessionStore.test.ts (jsdom, +3 its): boot without the field ->
  defaults; setPracticeMechanics patch-merges (partial); persist envelope
  version STILL 4 after write (the no-v5 pin).
- PracticeMechanicsPanel.test.tsx (jsdom, ~6 its): mode segmented emits
  complete config; capture buttons emit windows from loopSelection and
  are disabled without one; Made it/Missed it emit onRepOutcome(true/
  false); disabled prop blocks interaction; ramp form clamps on emit.
- backingEngine rest-mute pin: setRestMuted(true) -> bus gain 0; false +
  levels -> level restored (spy on gain setValueAtTime or the existing
  test seam - follow backingTrack.test.ts precedent).

Suite math: 2389 + ~55 new -> expect ~2444 / 1 skipped / 0 failed. The
GATE is literal: ZERO failures, tests/ untouched, it( 362.

e2e (build first; TD-CI-E2E-FLAKE discipline: poll asserts, generous
budgets, no exact-frame):

- practice-pause.spec.ts (1 test, 240 BPM): boot path formLen 16; open
  Drills; mode Pause; N=2 M=2 via steppers; Play. Assert within 12 s:
  (a) strip container data-phase shows "rest" AND "play" at least twice
  each; (b) while data-phase="rest", the Position bar number ADVANCES
  (transport honesty - playhead moves during rest); (c) metronome
  structural leg: rhythm.ts zero-diff is the proof, not the DOM - the
  spec asserts the toggle stays engaged and playback never halts
  (Position advances past a full N+M cycle).
- practice-ab.spec.ts (1 test, 240 BPM): shift-click bars 5-8, Capture
  A; shift-click bars 9-12, Capture B; swapBars=2; mode A/B; Play. Poll:
  active cell bar stays within 5..8 for the first segment, then within
  9..12; data-window attribute on the container alternates "a"/"b"
  (text/attr based, never color). Budget 12 s; discriminative because the
  legacy app has no data-window attribute at all.
- practice-ramp.spec.ts (2 tests, NO playback - fully deterministic):
  (1) enable ramp 90->102 step 6 reps 2 threshold 2; chip shows 90;
  click "Made it" x2 -> chip 96; "Missed it" x2 -> chip 90; "Made it" x2
  more -> 96 -> 102 -> chip shows TARGET (REQ-33 visible state; session
  marking is S3). (2) reseed: with ramp engaged, move the tempo slider
  -> chip bpm follows the manual tempo (reseeded), reps reset.
  23 -> 26 e2e tests (or 27 if pause splits).

---

## 7. IMPLEMENTATION ROADMAP (ordered, atomic)

1. [ ] duty.ts + duty.test.ts (incl. F3 equivalence oracle) - 6h - deps: none
2. [ ] ramp.ts + ramp.test.ts + practiceMechanics.ts(+test) - 5h - deps: none
3. [ ] purity floor 51->53; npm test green - 0.5h - deps: 1,2
4. [ ] sessionStore MechanicsSlice + test (no v5) - 1.5h - deps: 2
5. [ ] backingEngine.setRestMuted + pin - 1h - deps: none
6. [ ] App wiring: refs, handler branch, chord gate, rest-mute effect,
       ramp events + reseed guard, runner guard - 8h - deps: 1,3,4,5
7. [ ] PracticeMechanicsPanel(+test, JSDOM_FILES) + PracticeHeader gear/
       chips + rail data attrs - 6h - deps: 4,6
8. [ ] e2e x3 specs (write pause + ramp first; ab after 7) - 4h - deps: 6,7
9. [ ] docs/PRACTICE-MECHANICS.md sections + release notes - 1h - deps: 7
10.[ ] full gate run + byte-diff proof in dev report - 1.5h - deps: all

Total: ~34h (parent estimate 24-32, +2h for the bus-gate + equivalence
oracle - within band's upper edge).

---

## 8. CHECKLIST (gate order; CI mirrors)

1. [ ] `npm run lint` (tsc --noEmit)
2. [ ] `npm test` -> ~2444 / 1 skipped / 0 FAILED; `git diff --name-only -- tests/` empty
3. [ ] `npm run build` (RNN first, then main - both pass)
4. [ ] `node assets/check-links.cjs` -> it( 362, persona/tune counts unmoved
5. [ ] `npm run check:paths` -> 36/36 OK (no data touched)
6. [ ] `npm run test:e2e` after build: 23 -> 26/27 green
7. [ ] engine/purity.test.ts floor raised ONLY with duty.ts + ramp.ts
8. [ ] Byte-diff proof per section 4 attached to the dev report
9. [ ] Manual smoke: click audible through a rest; REST badge; A/B band
       glyphs + attrs; ramp chip climbs/drops/reseeds; count-in still
       pre-rolls every surface; cycle-12 advances 3x over a 96-step
       padded path in mode "off" and 0x under pause/ab
10.[ ] TD register (Kai): TD-052 runner dual-writer (guard cited),
       TD-053 backing content ignores window wraps (pre-existing,
       surfaced by D128), S2 slice record
11.[ ] No console.log/info/debug in new src; no any; ASCII docs

---

## 9. RISKS

| Risk | P | I | Mitigation |
|---|---|---|---|
| Chord-effect gate misses a re-run when phase flips at a same-chord bar | low | med | windowPhase ADDED to the effect deps (belt beyond the per-bar identity change, audit #4); pause e2e leg asserts silence-state DOM hooks |
| setTempo restart flam on manual ramp clicks mid-bar | med | low | existing slider-equivalent path (D124); TD-038a accepted-tail class; S3 auto-events land at pass boundaries |
| Backing chord content vs window mismatch during sub-window pause/AB (pre-existing) | high | low | documented D128 + TD-053; rest muting is content-agnostic (bus); beat groove honest |
| e2e timing flake on pause/ab legs | med | med | 240 BPM compression + poll asserts + 12 s budgets; ramp leg fully deterministic (no playback) |
| zustand field clobber cross-tab (PHASE-4-01 class) | low | med | shallow-merge defaults at read; writes are user-gesture-driven; no-v5 pin tested |
| AB persisted windows vs shorter form after path switch | med | low | clampWindow at scheduler read (law 6); release note |
| Handler edit touches the sacred site | low | HIGH | one additive branch; legacy path byte-identical; equivalence pin #2; section 4 protocol; S1 F3 e2e leg guards loop law |
| Panel DOM test forgotten in JSDOM_FILES (Vitest 5 ignores per-file env comments) | med | low | file plan step 7 names vitest.config.ts edit; AGENTS.md gotcha cited; CI would fail loudly (jsdom missing) |
| Runner engaged while mechanics engaged | low | med | D125 guard (ref) + disabled panel; runner e2e specs unchanged |
| Ramp completion state confusion (reseed vs ladder) | low | low | law 5 pinned (reseed never completes; always-climb); chip copy explicit |

---

## 10. RELEASE NOTES (S2)

1. Pause mode: play N bars, rest M bars over the loop window (or the
   whole form); the click and the playhead keep running during rests.
2. A/B compare: capture two windows from the rail selection, alternate
   every K bars; the active window band is marked A/B in the strip.
3. Tempo ramp: ladder with start/target/step/reps/failure threshold;
   rate reps with Made it / Missed it (S3 replaces the buttons with
   automatic detection - the ladder is unchanged); the ramp chip shows
   bpm, reps and streaks live; reaching the target marks the ramp
   COMPLETE (session bookkeeping arrives with S3).
4. Tempo changes mid-playback behave exactly like the tempo slider
   (grid re-anchor; brief click overlap is the documented accepted tail).
5. Drills are unavailable while a practice-set runner session is active.

---

## 11. HANDOFF

```yaml
HANDOFF_TO_DEVELOPER:
  from: "@architect"
  to: "@developer (via @engineering-team)"
  timestamp: "2026-09-27"
  deliverables:
    - name: "docs/PHASE-7-S2-MECHANICS.md"
      status: complete
      sections: re-audit(22 sites), D121..D128 (8 forks + REQ-3 proof),
        engine APIs, handler surgery, byte-diff protocol, file plan,
        test plan, roadmap, checklist, risks, release notes
  constraints:
    - "tests/** byte-frozen; 2389/1/0 -> ~2444/1/0, ZERO failures, it( stays 362"
    - "IMMUTABLE: onMeasureStart firing, cycle-12 predicate (keyCycle.ts), count-in gate, metronome playStep path, reanchor line; rhythm.ts zero diff"
    - "engine/practice/windows.ts(+test) byte-untouched (deviation from parent sketch - D123)"
    - "no zustand envelope v5, no migration step (D126)"
    - "zero new global keyboard shortcuts (frozen keyboard-shortcuts.test.ts reverse check)"
    - "no new K.* storage keys (config rides the existing K.session envelope)"
  decisions_made:
    - { id: D121, what: "ramp = abstract RampEvent machine; S2 manual buttons, S3 detection replaces the SOURCE only", confidence: HIGH }
    - { id: D122, what: "pause = duty over loop-window-or-form span; AB owns two windows, capture-button UX, clamp on write AND read", confidence: HIGH }
    - { id: D123, what: "new engine/practice/duty.ts scheduler (windows.ts stays geometry); handler gains exactly one branch; loop routed through scheduler under an equivalence pin", confidence: HIGH }
    - { id: D124, what: "ramp tempo applies via the existing store-tempo path (slider-equivalent); reseed guard for manual takeover", confidence: HIGH }
    - { id: D125, what: "runner race out-of-scope WITH ref guard + disabled panel; race registered as TD-052 (parent's TD-036 label collides with the register)", confidence: HIGH }
    - { id: D126, what: "config taste = zustand optional field (no v5); live run state = refs+mirrors (D13); loop windows grandfathered", confidence: HIGH }
    - { id: D127, what: "Drills gear popover in PracticeHeader (D36 pattern) + ramp/phase chips + rail data attrs; no new keys; mobile out of scope", confidence: HIGH }
    - { id: D128, what: "REQ-PRAC-3 by construction: gates at chord effect (early-return) + backing BUS rest-mute; schedule-skip rejected (4-bar lookahead)", confidence: HIGH }
  implementation_notes:
    - "write duty.test equivalence pin #2 FIRST (red until the scheduler matches the shipped F3 branch) - it is the handler-safety net"
    - "barCounter resets on the isPlayingAuto TRUE edge only (pause keeps position, parent D113); phase initial = play"
    - "subLoopActive widens to mechanics-mode !== off; in mode off the value is identical to today - do not touch keyCycle.ts"
    - "backingEngine.setRestMuted must compose with setLevels mutes (gain = muted || rest ? 0 : level)"
    - "chord-effect early-return runs AFTER stopAll + midiOut.stopAll + setActiveMidis([]) so rests are silent AND honest in takes"
    - "panel emits COMPLETE config objects (MetronomeControls contract); App owns normalize-at-read"
    - "JSDOM_FILES edit for the panel test is a hard gate item (Vitest 5 ignores per-file env comments)"
  progress:
    phases_completed: 5/5
    retries: 0
    quality_gates_passed: 5/5
    audit_notes: "baseline re-verified live (2389/1/0, 185 files); it( 362; e2e 23; purity floor 51"
  estimated_effort:
    implementation_hours: 26-30
    testing_hours: 8
    documentation_hours: 2
  risks_top3:
    - "sacred handler (mitigated: additive branch + equivalence pin + byte-diff protocol)"
    - "e2e timing flake on pause/ab (mitigated: poll asserts, deterministic ramp leg)"
    - "backing content vs sub-window pre-existing mismatch (documented TD-053, rest gate unaffected)"
  open_for_orchestrator:
    - "D123 deviates from the parent sketch (windows.ts grows -> duty.ts new file): justified by pin stability + concern split; ratify or redirect before step 1"
    - "TD-052/TD-053 ids to be claimed in .kai register at ship time (Kai-only file)"
```

**Version:** 1.2.2 | **Phase:** 7 S2 design | **Depends on:** S1 (fd4b383, 33ee287) | **Next:** S3
