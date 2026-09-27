# PRD-001 Phase 7 Slice 3 - Latency Calibration, Played-Correctly Detection, Practice Sessions

Status: DESIGN ONLY (research + architecture, no implementation in this doc).
Baseline: HEAD 13006cf, suite 2473 passed / 1 skipped / 0 failed, e2e 27/27,
CI green, tree clean. Purity floor 53 (tree scans 54). tests/ it-count 362
(verified this session).
Parent: docs/PHASE-7-PRACTICE.md (D110..D120; S1 + S2 SHIPPED).
S2 authority: docs/PHASE-7-S2-MECHANICS.md (D121..D128) - the seams this
slice consumes were built there and are re-verified against SHIPPED code
(S2's doc is design; the code at 13006cf is the truth - audit below).
Design authority for: REQ-PRAC-40..42, REQ-PRAC-50..54, REQ-PRAC-60..62,
REQ-PRAC-33 (completion marking, deferred by S2), and the coherent
EXTENSION of the shipped REQ-PED-40/42 practice log (Phase 6).
Decisions numbered D129+ (S2 ended at D128).

Naming note (orchestrator task vs parent sketch): the parent called the
matcher `engine/practice/match.ts`. THIS doc and the task standardize on
`engine/practice/detect.ts` (the task is the newer authority; "detect"
also names the whole slice, not just the math). D-deviation recorded in
D130. Everything else keeps the parent's D117/D118/D119/D120 lineage.

---

## 0. RE-AUDIT (strings verified at HEAD 13006cf, shipped code)

| # | Site | Verified state | S3 relevance |
|---|---|---|---|
| 1 | `src/lib/midiIn.ts` | Singleton. `onMidin(cb) -> off` (internal listener list, :182-187) AND window CustomEvent "midin" dispatch (:167) - BOTH fire per note. Event detail: `{note, velocity, type: "noteon"|"noteoff", channel 1-16, inputId, inputName, timestamp}` where `timestamp = msg.timeStamp ?? performance.now()` (:156) - DOMHighResTimeStamp, SAME time base as the App's `performance.now()` boundary stamps. noteon requires velocity > 0 (:146). Selected-input filter (:144); RT clock passthrough separate (:109-136). `inputs` list + `onInputsChange` (:189) - REQ-IO-1 device list SHIPPED (`MidiInPicker.tsx` consumes the window event) | THE performed-note source. CRITICAL TESTABILITY FACT: `onMidin` listeners are NOT reachable from `page.evaluate` (in-process closure list); the window "midin" CustomEvent IS injectable from outside. The detector MUST subscribe via `window.addEventListener("midin", ...)` - identical data, and it is what makes the positive e2e leg possible (section 8) |
| 2 | `src/lib/midiOut.ts` | Second fan-out: `onNoteOn(midi, vel, channel)` - NO TIMESTAMP (:93-100, the cb args drop `event.timeStamp`). Separate `requestMIDIAccess()` call from midiIn (own MIDIAccess instance) | PROVES the guide-tone trail CANNOT be the timing matcher - it never sees a timestamp. Reuse verdict input (fork 2) |
| 3 | `src/hooks/useGuideToneTrail.ts` + `src/lib/guideToneTrail.ts` + `tests/guideToneTrail.test.ts` (FROZEN) | The existing played-vs-expected machinery: per note-on, `classifyGuideTone(midi, currentChordNotes)` -> role tally `{totalNotes, guideHits, chordToneHits, offNotes}`. Denominator = PLAYED notes ("what share of your notes landed on a guide tone"). No timing, no per-bar attribution, NO MISSED concept (silence is invisible - only note-ons are counted). Bass-channel exclusion via `bassChannelRef` (:58-62). begin/end/reset run API | NOT 80% of REQ-PRAC-50/51/52 - a DIFFERENT metric with a different denominator. REQ-51's `missedNotes` (expected notes never played) and the timing tolerance are STRUCTURALLY ABSENT. Frozen test file = byte-locked anyway. What IS reusable: the subscription/begin/end/reset SHAPE, the pc convention (`((n % 12) + 12) % 12`), and the live per-note chip (GuideToneFeedback) which stays the immediate-feedback surface. See D130 |
| 4 | `src/lib/guideTones.ts` + `src/lib/gtTargets.ts` | `intervalToRole` (bass-relative semitone -> role; 3/4 = third, 10/11 = seventh) + `roleToGuideToneTarget` are the shipped guide-tone LAWS. `gtTargetsForPath`: ONE target per STEP (post-F3), `hasGuideTone` false for empty-note steps. Both live in src/ (engine cannot import them - purity allowlist) | The expected-grid builder re-derives the SAME interval law. Engine copy (purity) + a cross-check pin in src against `intervalToRole` (D130 law 4) - precedent: duty.ts safeInt duplication "cheaper than widening exports" (S2 law 7) |
| 5 | `engine/practice/duty.ts` (SHIPPED) | `advanceTransport -> {nextStep, phase, activeWindow, dutyIndex, passCompleted, spanFromStep, spanToStep}`. `passCompleted` law 5: wrap-to-head (loop/pause) or slot-change (ab) | The pass boundary the detector aggregates per. Consumed via the App mirror - see D132 |
| 6 | `engine/practice/ramp.ts` (SHIPPED) | `RampEvent = {kind:"rep", success} | {kind:"reseed", bpm} | {kind:"reset"}` (ramp.ts:55-62). Source-agnostic by construction (D121). Law 3: phase "complete" iff a CLIMB step lands on targetBpm | EVENT SHAPE VERIFIED against the S3 auto-feed need - `{kind:"rep", success: boolean}` is exactly what the detector emits. ZERO ramp-machine changes (D132) |
| 7 | `src/App.tsx:1751-1856` handler (SHIPPED) | Mechanics branch: `rampPassRef.current = d.passCompleted` (:1786, the S3 seam), microtask mirrors `setWindowPhase/setAbSlot/setRepPulse` (:1787-1793). `repPulse` state exists (:417) and is already forwarded to header/panel (:2477) | The detector's pass trigger = the `repPulse` prop edge. NO new handler hunk in S3 (D132) - the handler stays byte-identical |
| 8 | `src/App.tsx:1652-1660` play-start edge | `isPlayingAuto` TRUE edge resets barCounter/phase/slot | Session start + detector reset ride the SAME edge (additive effect, section 5) |
| 9 | `src/lib/playbackClock.ts` | `subscribe(cb)` (:171) - in-process tick listeners; `reanchor(step)` (:148) called from the handler EVERY bar, so tick `timeSec` grid is phase-locked to the transport at each boundary; rAF tick = one dispatch per frame | Boundary OBSERVER (fork 1, D129): the detector subscribes and stamps `performance.now()` at the tick where the step flips. NOT a transport writer (TD-052) |
| 10 | `src/lib/rhythm.ts:127-134` | Interval callback: `playStep(currentStep)` fires the click SYNCHRONOUSLY at `ctx.currentTime`, THEN `onMeasureStart()` runs in the SAME callback when step wraps to 0 | THE jitter-absorption proof for D129: the audible click and the handler's `performance.now()` move together - any setInterval lateness shifts BOTH, so a boundary-anchored comparison never blames the user for the app's clock |
| 11 | `engine/ear-training/check.ts:102-112` | `dictationTimingOk(onsetErrorMs, slotMs, latencyMs)` - tolerance floor 120ms, `max(120, 0.15*slot)`. grep-verified: NO src/ consumer computes `onsetErrorMs` or passes `latencyMs` - dictation answers are TEXT (typed/sung, no onset capture). The seam is DOUBLY DEAD | D134 decision input: wiring the wizard into this seam would feed a MIDI-tap-path number into a text-answer comparison = fake compensation. NOT wired (section 3 fork 6) |
| 12 | `engine/pedagogy/log.ts:20` + `src/lib/pedagogyLog.ts:25` | `PracticeEntry.mode: "etude"|"compose"|"explore"|"ear"`; the adapter's `isEntry` HARD-PINS the 4-value union. `outcome: "correct"|"incorrect"|"partial"` (partial EXISTS). Cap 500. NO tests/ pin on pedagogy (grep-verified: zero matches for "pedagogy" in tests/); colocated `log.test.ts`/`pedagogyLog.test.ts` use mode "ear" only - additive widening is safe | D136: widen the union with `"practice"` (engine + adapter guard + registry shape string). `partial` maps naturally to a detection verdict band. ONE log, extended not forked |
| 13 | `src/lib/performanceLog.ts` + `src/components/RecentTakesPanel.tsx` | Takes = RECORDED AUDIO takes (`hse.performance.log.v1`, cap 50, `recordTake` rep-count, guide-tone accuracy diff row). Written from the rail's Record flow (App :2683-2726). `transitionsHit/Missed` fields ride the FROZEN-pinned trail | Sessions vs takes = DISJOINT concepts (D133): take = one recorded performance artifact; session = one continuous practice BLOCK with drill config + attempts. No foreign key, no shared store; both timeline-link only through pedagogy.log. The takes panel is NOT reused for sessions (different grain, different lifecycle) |
| 14 | `src/lib/paths.ts:1466` + `src/lib/practiceStore.ts` + `src/components/PracticeSessionPlayer.tsx` | The set-runner `PracticeSession` type + `synesthesia_practice_sessions` (cap 50) + clock-driven runner. NAMING COLLISION with REQ-PRAC-60's session | D133: new type `SessionRecordV1`, new key `practice.sessions`, new adapter `practiceSessions.ts` (plural file, different from `practiceStore.ts`). Legacy trio UNTOUCHED (D119). Terminology table in section 6.4 |
| 15 | `src/lib/practiceMechanics.ts` (SHIPPED) | `PracticeMechanicsConfig {mode, pause, ab, ramp, rampEnabled}` + total-shape normalize + chip formatter. zustand optional field, no v5 | Detection config EXTENDS this object with one `detect` sub-field (normalize handles the missing-key default at read - same no-v5 law, D126 lineage) |
| 16 | `src/components/PlaySessionRail.tsx:764-899` | Cell overlay vocabulary: loop band (brass gradient), A/B bands + corner letter glyphs, marker accent edge, hint badge; container `data-phase`/`data-window` attrs; `data-testid="rail-strip"` | The match overlay is the 5th layer, SAME pattern: `data-match` attr + corner glyph + tint band. Okabe-Ito palette SHIPPED at `EtudePianoRoll.tsx:30-34` (`#009E73` bluish-green, `#D55E00` vermillion) - reuse the constants |
| 17 | `src/components/GuideToneFeedback.tsx` | Live per-note chip (setState per note-on, 1.2s decay) - the SHIPPED immediate-feedback surface, already storm-tested at note rate | Stays the per-note live surface. The detector adds NO new per-note setState (boundary-batched only - hard constraint honored; see D131) |
| 18 | `src/hooks/useMidiDevices.ts` | `midiIn.init()` + `midiOut.init()` on first keydown/mousedown; `midiInputs`/`selectedMidiInId` state returned | Wizard consumes the existing `midiInputs` list (no new permission flow - REQ-IO-1 shipped). Permission gesture = the Calibrate click itself |
| 19 | `src/lib/storage.ts` | K registry + `STORAGE_KEYS` meta; `src/lib/storage.test.ts` asserts every K key has a registry entry (colocated, editable) | +2 keys: `practiceLatency: "practice.latency"`, `completedSessions: "practice.sessions"` (PRD-literals, D107 dotted-namespace convention) + registry rows |
| 20 | `engine/purity.test.ts` | Floor 53, tree scans 54. Banned: Math.random/Date.now/new Date/performance.now/console; imports relative-only, NO engine->src crossing | +3 engine sources (detect, latency, session) -> floor 53 -> 56. All three: ZERO imports (plain structural types; timestamps are INPUTS). The expected-grid builder CANNOT live in engine (consumes HarmonicPath from src/lib/paths.ts) -> `src/lib/practiceExpected.ts` (pure, node-tested) |
| 21 | Baselines | 2473/1/0; e2e 27 (13 specs); it( 362; check-links gates persona/tune counts (S3 moves NONE); check:paths 36/36 (no data touched) | New pins per section 8 |

---

## 1. REQUIREMENTS -> COMPONENTS MAP

| REQ | Component(s) | Law |
|---|---|---|
| PRAC-40 wizard | `src/components/LatencyWizard.tsx` + `engine/practice/latency.ts` (median/clamp) + `src/lib/practiceLatency.ts` (adapter) | MIDI-gated calibration flow; manual entry always available |
| PRAC-41 persist | `K.practiceLatency = "practice.latency"` | `{version, inputLatencyMs, outputLatencyMs, source, calibratedAtMs, deviceName}` |
| PRAC-42 subtract | `engine/practice/detect.ts` param `latencyCompensationMs` | canonical equation D134.5: compensated = tap - input - output (input ALWAYS subtracted = PRD literal; output subtracted because the anchor is emission time - the PRD mandates STORING it precisely so it can be used) |
| PRAC-50 compare | `detect.ts matchPhrase` + `src/lib/practiceExpected.ts buildExpectedGrid` | pc-equality (octave-agnostic) + timing window per bar |
| PRAC-51 four buckets | `PhraseMatch {matchedFraction, wrongNotes, missedNotes, extraNotes}` | total, deterministic bucket law D130.3 |
| PRAC-52 feedback | rail cell overlay + `data-match` + glyphs (D131) | Okabe-Ito + shape/text redundancy (PRD 9.8 - red/green NEVER alone) |
| PRAC-53 summary | `PhraseSummaryCard` section in the Drills panel | notes hit, avg signed offset, accuracy % |
| PRAC-54 MIDI-required | hook `unavailableReason` when `requestMIDIAccess` absent | honest unavailable state; API-presence gate (D135.4) |
| PRAC-60 bundle | `engine/practice/session.ts SessionRecordV1` | etude refId + metronome snapshot + tempo ramp + loop/AB windows + attempts |
| PRAC-61 persist | `src/lib/practiceSessions.ts` cap 50, `K.completedSessions` | summarize-then-fold raw attempts |
| PRAC-62 summary | `summarizeSession` -> panel card | max tempo, total time, notes hit |
| PRAC-33 complete | App effect on `rampState.phase === "complete"` | marks the open session completed + persists + shows summary |
| PED-40/42 extend | `appendAttempt` dual-write seam (D120 landing) | mode union widened with "practice"; outcome maps correct/partial/incorrect |

---

## 2. FORK DECISIONS

### D129 (fork 1): phase alignment = BOUNDARY-ANCHORED, rAF-observed; NO within-bar interpolation needed

The problem: performed notes carry `performance.now()`-domain timestamps
(midiIn `msg.timeStamp`); expected notes live on the transport grid.
What is the canonical audio time of an expected note at (bar, slot)?

DECISION: the expected-onset anchor is the WALL TIME at which the bar's
audio was EMITTED, observed as `performance.now()` at the playbackClock
tick where the transport step flips. Three candidate models were
evaluated against shipped code:

- (a) handler-stamped boundaries (measure-boundary `performance.now()`
  read INSIDE onMeasureStart): exact, but requires a NEW hunk in the
  sacred handler (a timestamp write is not transport-state mutation,
  yet every handler edit is the highest-risk class in this repo -
  S1/S2 each spent exactly one hunk there). REJECTED for (c) only on
  risk grounds; the numerical difference is <= 1 frame.
- (b) playbackClock tick positions: the clock is rAF-driven, re-anchored
  EVERY bar by the shipped `reanchor(next)` line (audit #9) - elapsed
  seconds are phase-locked to the transport step at each boundary.
- (c) CHOSEN: hybrid = boundary-anchored via (b)'s observer. The hook
  subscribes to `playbackClock.subscribe`, detects the step flip, and
  stamps `performance.now()` at that tick. Zero handler edits; the
  detector is a pure READ-ONLY consumer (TD-052 hard requirement,
  section 4.5).

Why this absorbs the app's own clock error - the decisive fact
(audit #10): the metronome click fires SYNCHRONOUSLY inside the SAME
setInterval callback that runs the handler (`playStep(0)` then
`onMeasureStart()`), both at `ctx.currentTime`. So the audible event and
the boundary anchor MOVE TOGETHER with any interval lateness: a 60ms GC
spike delays the click AND the anchor by the same 60ms, and the user's
compensated tap offset is UNCHANGED. Boundary anchoring makes
setInterval jitter a NON-ISSUE by construction (this is the ADR-016
"beat boundary carries jitter" problem dissolved, not tolerated).

Within-bar interpolation is NOT needed: the expected-onset semantics
(D130) put every expected note at its BAR START (chord attack). No
expected onset lives mid-bar, so no mid-bar grid arithmetic exists to
drift. (A future beat-slot etude expectation would use
`boundaryMs + slotSec * 1000` with `secPerBarGrid` - the same law the
audio interval uses - and the residual interval drift within one bar is
the documented budget below.)

Jitter budget, quantified at 120 BPM 4/4 (bar = 2000 ms, 16th = 125 ms):

| Source | Bound | Direction |
|---|---|---|
| setInterval lateness (click + anchor) | absorbed | ~0 (they move together) |
| rAF observation lag (boundary stamped at next frame) | [0, 16.7] ms, mean ~8 | anchor late -> user reads EARLY by <= 17 ms |
| chord-stab vs click lag (React commit -> chord effect -> playNote) | 16-50 ms | only for users tracking the stab, reads LATE |
| calibration residual (median-of-16 SEM, drift between calibrations) | +/- 10-25 ms | both |
| Web MIDI event timestamp (USB/ble MIDIAccess receive time) | 1-5 ms | absorbed by calibration |
| WORST-CASE APP-SIDE COMPOSITE | ~ 83 ms | < the 120 ms tolerance floor |

Tolerance law: `toleranceMs` default 120 (ear-training floor precedent,
audit #11), user range 60..300, engine floor 60. At the max tolerance
300 ms, windows around consecutive bar starts NEVER overlap: the
shortest bar at BPM_MAX 240 (4/4) is 1000 ms > 2 * 300 ms. Pinned law
(detect.ts law 7). Under pathological long-task stalls (> 200 ms) the
rAF boundary itself can slip one frame group - detection degrades
GRACEFULLY toward extra/missed on that bar only; documented, not
engineered around (TD-039 territory).

Guard (tab hide): on `visibilitychange` -> hidden, the hook DROPS the
note buffer and skips the next boundary (rAF freezes while hidden; on
return the stale anchor would mis-blame every note). Pinned in the hook
design (section 5).

### D130 (fork 2): expected-note semantics + the guide-tone reuse verdict

REUSE VERDICT (the work-halving question, answered with evidence):
useGuideToneTrail is NOT 80% of REQ-PRAC-50/51/52. It answers "what
share of the notes you PLAYED landed on a guide tone" (denominator =
performed). REQ-51 demands "what share of the notes the bar EXPECTED
did you hit, plus wrong/missed/extra" (denominator = expected) - which
requires (i) missed-note detection = silence as a signal (the trail
never sees silence), (ii) timing tolerance (the trail's source,
midiOut, DISCARDS timestamps - audit #2), (iii) per-bar attribution
(the trail is a flat run tally). Plus `tests/guideToneTrail.test.ts` is
FROZEN - the type/accumulator is byte-locked. What the audit DOES
salvage (~40% of the surface work): the begin/end/reset + ref-capture
subscription SHAPE, the `((n % 12) + 12) % 12` pc convention, the
bass-channel exclusion pattern, the intervalToRole LAW (re-derived in
engine, pinned cross-check), and the shipped live chip (stays the
per-note immediate surface - no new live feedback component needed).
The two systems COEXIST: trail tally in the header (unchanged), match
overlay on the strip (new). No parallel matcher over guide tones: ONE
new matcher, one metric each, both visible.

EXPECTED-GRID SEMANTICS per context (built by
`src/lib/practiceExpected.ts`, consumed as plain data by the engine):

- Every form bar gets ONE expected slot at the bar start. Kind:
  - "target": the bar's sounding chord HAS guide tones (3rd/7th pcs by
    the shipped bass-relative interval law) -> expected pcs = the
    guide-tone set. This is the app's own practice doctrine (GtCoverage
    row, guide-tone chip) - detection scores the SAME thing the UI
    teaches. Curated paths, studies, concept paths, generated etudes:
    ALL are chord-voicing paths (1 step = 1 bar), so ONE law covers
    them. The etude MELODY lane is NOT expected - it is display-only
    with no audio consumer (S2 audit #21); scoring notes the app never
    plays audibly would blame the user for invisible content.
  - "free": chord present but NO guide tones (sus/power voicings -
    `hasGuideTone false`, consistent with the shipped coverage row) ->
    unscored: notes there match nothing and are penalized nowhere;
    the bar is EXCLUDED from matchedFraction's denominator.
  - "rest": the bar's step has EMPTY notes (rest bars) OR the pause
    duty phase is "rest" -> expected = NOTHING; any note is an
    EXTRA (playing during a rest is a real practice signal - the
    task's explicit design case). Rest-phase extras do NOT enter the
    missed/wrong math (there is no pitch expectation in silence);
    they count as `extraNotes` and hurt accuracy via the denominator-
    free penalty law below.
- Bars OUTSIDE the active span (loop/AB unselected regions): NOT in
  the grid at all (unscored - the user is not practicing them).
- Expected pcs come from the SOUNDING notes (`optimizedStepsNotes`,
  the same array the rail renders) so transpose/persona voicing are
  already baked in - no re-derivation, no drift.

  ERRATUM (fix round, 2026-09-27): `optimizedStepsNotes` is
  voice-leading-only in shipped code - the transpose/voicing/drift
  transform is NOT baked into it. The sounding-note array that bakes
  them in is `exportNotesOverride` (the WAV-export mirror). The
  implementation correctly consumes the latter (deviation reported
  in the step-7 completion notes).

BUCKET LAW (total + deterministic; detect.ts pins each branch):
per bar, per expected pc (multiplicity 1 - expected is a SET):
- matched  = performed note, compensated onset within [start - tol,
  start + tol], pc equals an UNMATCHED expected pc; nearest-neighbor
  greedy on |offset| (ties -> earlier note).
- missed   = expected pc with no matched pair.
- wrong    = performed note INSIDE a target bar whose pc is NOT in the
  bar's expected set (a PITCH error).
- extra    = performed note whose pc IS expected but already matched
  (multiplicity overflow) OR is correctly-pitched but OUTSIDE the
  timing window (a TIMING error, right note wrong time) OR lands in a
  rest bar (a DISCIPLINE error). The three flavors share the bucket
  (PRD names four buckets, not seven) and are sub-counted honestly:
  `extraNotes` + `restNotes` (rest extras are reported separately for
  the summary copy: "N notes during rests").
- free bars: notes unscored (no bucket).

Aggregates: `matchedFraction = sum(matched) / sum(expected over target
bars)` (0 when denominator 0 - NEVER NaN); `accuracyPct = matched /
(matched + missed + wrong + extra)` (all-bucket share; rest extras
DO hurt it - correct: playing over rests is inaccurate practice).
`avgOffsetMs` = SIGNED mean of (compensated - boundary) over matched
pairs (negative = early); `avgAbsOffsetMs` also returned (signed means
can cancel - honesty).

Naming: engine file `detect.ts` (task authority; parent said match.ts -
deviation recorded in the header).

### D131 (fork 3): visual surface = rail strip cells (the 5th overlay layer), Okabe-Ito + glyph redundancy; NOT LiveScoreDisplay, NOT the trail dots

- Bar-strip cells (PlaySessionRail PerformStage): each cell gains
  `data-match="matched|missed|wrong|mixed|rest-extra"` (absent when
  detection is off/unarmed or the bar is unscored) + a corner glyph
  (bottom-right, opposite the A/B letter): matched "v" glyph via the
  existing check convention, wrong "X", missed = dim + "-", rest-extra
  "!". Tint band: matched = #009E73 @ 14% (the shipped EtudePianoRoll
  chordLane constant), wrong = #D55E00 @ 22% WITH a 600 ms flash
  animation (CSS keyframe, `prefers-reduced-motion: reduce` -> static
  border instead of flash), missed = existing dim (opacity .55, no
  new color). Mixed bar (matched + wrong) -> wrong wins the tint
  (errors are the actionable signal), `data-match="mixed"` honest.
- PRD 9.8 COLORBLIND LAW: red/green is the FORBIDDEN default pairing
  and is NEVER the sole channel here - every state carries a data
  attribute (e2e + SR), a glyph (shape), and a text summary (the
  panel). Okabe-Ito was chosen precisely because it survives deuteran
  protan types; the repo already standardized on it (audit #16).
- LiveScoreDisplay: REJECTED (abcjs highlight mapping = TD-038
  adjacency, largest-diff trap, and the score is a 4-bar window - the
  strip is the whole-form surface players watch in drills).
- Guide-trail dots: REJECTED (frozen semantics; the chip stays live).
- Post-phrase summary (REQ-53): a Detection section INSIDE the Drills
  popover (PracticeMechanicsPanel) - `role="status" aria-live="polite"`
  card: "Pass N - 7/8 notes (88%) | avg +23 ms late | 1 wrong | 1
  rest". Panel placement = where practice config already lives; no new
  modal (ModalShell is reserved for the wizard). The chip row in
  PracticeHeader gains a compact accuracy readout when detection is
  armed (same region as the ramp chip; ASCII text).
- Update cadence: the overlay + summary re-render ONCE PER BAR
  boundary (the batched mirror - hard constraint). Live per-note
  immediacy rides the EXISTING GuideToneFeedback chip (audit #17) -
  zero new per-note setState.

### D132 (fork 4): ramp integration = auto-rep on the repPulse edge; manual buttons DISABLED while armed; REQ-33 completion lands on the ramp phase mirror

The S2 seam was verified against shipped code (audit #6/#7): the ramp
consumes `{kind:"rep", success}` from ANY source. S3 wiring:

- App effect on `[repPulse]` (the shipped passCompleted mirror, edge-
  triggered): if detection armed AND a pass verdict is ready ->
  `handleRepOutcome(success)` - the EXISTING callback (App :1706),
  zero new ramp paths. The verdict = phrase `matchedFraction >=
  detect.passThreshold` (default 0.8, range 0.5..1.0). Timing does NOT
  gate the verdict (tolerance already gates matching; double-punishing
  off-beat-but-present playing is bad pedagogy).
- Manual Made-it/Missed-it: COEXIST by mode, not by merge - while
  detection is armed (enabled + MIDI API present), the manual buttons
  render `aria-disabled` with title "Detection is rating your reps -
  turn it off to rate manually". Rationale: the machine is source-
  agnostic but DOUBLE EVENTS from two sources at one boundary would
  corrupt the ladder; disabling is the honest, deterministic rule.
  Detection off -> S2 behavior byte-identical.

  ERRATUM (fix round, 2026-09-27): the disable law is refined to
  canAutoRate = armed + mode !== "off" + the built grid has at least
  one target bar. Armed-but-unable-to-rate (mode "off" never pulses
  the rep seam; an all-free grid never verdicts per the no-verdict
  law below) keeps the manual buttons LIVE - the ramp can never
  soft-lock. The risk-row-5 notice ("no targets in this form") ships
  with this refinement.
- REQ-PRAC-33: App effect on `rampState.phase === "complete"` AND a
  session open -> `markSessionCompleted()` (D133) -> persist + summary
  card + pedagogy.log attempt entry. The ramp itself is UNTOUCHED
  (law 3 already produces the phase; the chip already shows TARGET).
  A subsequent ramp re-engage resets (existing engage effect) and a new
  session may open.
- No-verdict pass (zero expected notes in the pass - all-free grid):
  NO rep event (the ladder is untouched; silence about nothing).
  Pinned.

### D133 (fork 5): session lifecycle = explicit-context blocks; `SessionRecordV1`; cap 50 + attempt fold; summary in-panel; sessions vs takes DISJOINT by design

NAMING (collision handled): REQ-PRAC-60's concept ships as
`SessionRecordV1` (engine/practice/session.ts), adapter
`src/lib/practiceSessions.ts`, key `K.completedSessions =
"practice.sessions"`. The set-runner trio (`PracticeSession` in
paths.ts, `practiceStore.ts`, `PracticeSessionPlayer.tsx`) is
UNTOUCHED (D119) - different key, different type, different UI tab.
Terminology (docs/TERMINOLOGY.md edit): PRACTICE SESSION (this slice)
= one continuous drill block + attempts; SET-RUNNER SESSION (legacy) =
one run through a practice SET playlist; TAKE = one recorded audio
performance (performanceLog). The runner guard (D125) keeps them from
overlapping at runtime.

LIFECYCLE (decided, not deferred):
- START: on the `isPlayingAuto` TRUE edge (post count-in) IFF a
  practice context is engaged: `mode !== "off" || rampEnabled ||
  detect.enabled`. Bare audition play does NOT open a session (no
  spam; documented in release notes). One open session max.
- END (first that fires):
  1. Stop/pause edge (`isPlayingAuto` FALSE) with elapsed >=
     MIN_SESSION_SEC (20s) -> completed-and-stored; elapsed < 20s ->
     DISCARDED (noise filter, honest).
  2. Path switch (refId changes) -> end + persist, new session may
     open on next play.
  3. Ramp target reached (REQ-33, D132) -> marked completed IMMEDIATELY
     but the block stays OPEN until rule 1/2 (the user often keeps
     playing; the record is stamped `rampCompleted: true` at the mark
     and re-persisted on close - single record, two writes, cap-safe).
  4. Tab unload: NOT persisted (in-memory dies; sessions are practice
     blocks, not a crash journal - documented limitation).
- A PAUSE splits sessions by rule 1 (a session = one continuous play
  block; the summary grain is the block). Deliberate: a resume-timer
  grace adds a clock to pure code for marginal UX.
- ATTEMPT = one pass of the active span (the duty `passCompleted`
  boundary) carrying: `{atMs, bpm, phaseKind: "play"|"a"|"b"|"full",
  source: "detect"|"manual", success, matchedFraction|null,
  avgOffsetMs|null}`. Manual Made-it/Missed-it clicks OUTSIDE a pass
  (detection off, S2 mode) are ALSO attempts (D121: each click is one
  rep outcome) with `matchedFraction: null`.
- PERSISTENCE: `K.completedSessions` cap 50 sessions (performanceLog
  precedent), each session keeps the LAST 50 RAW attempts + running
  aggregates (`attemptsTotal, successes, notesHit, totalPlaySec,
  maxTempoBpm`) - summarize-then-drop-raw so a heavy session cannot
  blow the localStorage quota. Corrupt -> [] shape-guarded read.
- SUMMARY SURFACE (REQ-62): end-of-session card in the Drills panel
  (max tempo, total time, notes hit, accuracy, ramp-completed badge) +
  a "Recent sessions" list (last 5, adapter load, relative-time labels
  via the performanceLog `formatRelativeTime` precedent). NOT the
  takes panel (different concept, audit #13), NOT a modal.
- SESSION SNAPSHOT (REQ-60 bundle): refId (path id), meter, tempoStart/
  maxTempoBpm, metronome config snapshot (K.metronomeConfig shape),
  windows `{loop?, pause?, ab?, ramp?}` (the config AT start), ramp
  ladder + completion flag. Etude association = refId (an etude IS a
  path) - no new entity.

### D134 (fork 6): latency wizard mechanics + the canonical compensation equation + ear-training seam NOT wired

STATE MACHINE (LatencyWizard.tsx, ModalShell):
`idle -> gate -> arming -> rolling -> result -> saved`
- gate: requires `typeof navigator.requestMIDIAccess === "function"`
  AND `midiIn.inputs.length > 0` (a DEVICE, not just the API -
  calibrating with nothing to tap is theater; the parent's D117
  spacebar SECONDARY source is CUT for S3 - see scope below). Without
  a device: honest "Connect a MIDI input to calibrate" + the manual
  entry field (always available - the escape hatch and the e2e leg).
- arming: shows the click count (default 16, range 8..32) + uses the
  CURRENT tempo; "Start" begins.
- rolling: fires K clicks at the current beat period through
  `audioEngine.playMetronomeClick` (the SAME metronomeGain bus as
  practice - the latency path being measured IS the path being used),
  recording `emissionWallMs = performance.now()` per click in the
  adapter (engine never reads a clock). The FIRST noteon (bass channel
  excluded, velocity > 0 by midiIn law) within +/- half a beat after
  each click pairs with it. Escape / 8s idle aborts.
- result: `inputLatencyMs = clamp(median(rawOffsets) -
  outputLatencyMs, 0, 500)` where `rawOffset_i = tap_i - click_i`;
  `outputLatencyMs = ctx.outputLatency ?? ctx.baseLatency ?? 0`
  (Chrome reports outputLatency; Firefox/Safari baseLatency only).
  Median (not mean) = outlier rejection (parent D117). Fewer than 8
  valid pairs -> "not enough taps" retry (NEVER a silent 0).
- MANUAL OVERRIDE: numeric entry 0..500 ms on the result screen and in
  the panel's Detection section; `source: "midi" | "manual"`.
- HONESTY LIMITS (panel copy, verbatim obligation): browser-reported
  output latency EXCLUDES Bluetooth/USB/display-audio buffering
  (S2-recon ADR note); calibration is per audio path - recalibrate
  when switching headphones/speakers; `deviceName` + `calibratedAtMs`
  are stored and SHOWN next to the number ("calibrated 3d ago via
  LPK88") so staleness is visible.

CANONICAL COMPENSATION EQUATION (the fork-1 pairing, stated once):
`compensatedTap = tapEventMs - inputLatencyMs - outputLatencyMs`
against `expectedOnsetMs = boundary emission wall time` (D129).
Derivation (pinned as a latency.test law): a perfectly-timed tap
arrives at `E + output + midiPath + bias`; the wizard stores
`input = median(rawOffsets) - output = midiPath + bias`; subtracting
both leaves EXACTLY 0 error for a perfect tap. REQ-PRAC-42's literal
"subtract inputLatencyMs from ALL timing comparisons" holds (it always
is); subtracting the STORED outputLatencyMs too is the point of
storing it (REQ-PRAC-41). The engine matcher sees ONE number:
`latencyCompensationMs = input + output` (computed by the hook adapter
from the stored record; the engine stays calibration-agnostic and the
math is testable in isolation).
SCOPE CUTS (decided, not drifted):
- Spacebar tap source: CUT. The wizard's whole reason is the MIDI tap
  path that detection eats (REQ-PRAC-54 lineage); a keyboard-tap
  calibration measures a path nothing in the app compares against.
- EAR-TRAINING WIRING: NOT wired. Audit #11: `dictationTimingOk`'s
  `latencyMs` seam is dead twice over - no consumer computes
  `onsetErrorMs` (dictation answers are TEXT). Passing a MIDI-tap-path
  number into a text-answer comparison is fake compensation. The seam
  stays reserved for a future onset-capture input surface (TD register:
  "ear-training timing seam awaits an onset source"). This is the
  honest answer to the task's "wire it? scope creep" question.

### D135 (fork 7): MIDI plumbing = window-event subscription, read-only consumer, boundary-batched

1. SOURCE: `window.addEventListener("midin", ...)` (NOT
   `midiIn.onMidin`): identical data (midiIn dispatches both paths,
   audit #1), carries `timestamp`, reaches listeners for a device
   hot-plugged after mount (midiIn re-binds on statechange), AND is
   the ONLY injectable-from-outside seam (the positive e2e leg depends
   on this - section 8). Precedent: MidiInPicker already consumes the
   window event.
2. CHANNEL FILTER: skip `bassMidiChannel` note-ons (the shipped
   useGuideToneTrail exclusion, same prop, same law). Note-offs
   ignored (onset-only matching). Velocity: no gate (midiIn already
   drops velocity 0; EWI breath-noise gating = future TD, not S3).
3. CAPTURE BUFFER (REQ-IO-2 "MidiNote[] from a performance"): NO
   existing capture utility ships; the hook's ref buffer IS it -
   `{note, atMs}[]` appended per event (O(1), no render), drained at
   each boundary flush. No separate module (a buffer with one
   consumer does not get an API).
4. ARM GATE (REQ-PRAC-54): `unavailable = typeof
   navigator.requestMIDIAccess !== "function"` (Firefox without the
   extension, old Safari) -> panel renders the honest "requires Web
   MIDI input" state. API-present-but-no-device -> ARMED with a status
   line "connect a MIDI input - detection is live but silent" (a
   hot-plug then just works; and headless Chromium e2e lands here,
   which is what makes the positive leg possible - section 8. The
   PRD's "unavailable without" refers to Web MIDI, and the API IS
   Web MIDI; a device is an input to an armed detector, not a
   prerequisite for the surface to exist. This nuance is documented
   in the panel copy).
5. TD-052 READ-ONLY PIN (hard): the detector/hook NEVER writes
   transport state: no `setActiveStepIndex`, no `setIsPlayingAuto`,
   no `setTempo`, no rhythm/backing/clock mutation, no chord-effect
   interference. Its outputs are (a) a props/callback stream into App
   and (b) DOM data attributes. Architectural pin: the hook's props
   are all READ-ONLY values + exactly two callbacks (`onPassVerdict`,
   owned by App's existing ramp path). A `grep` gate in the dev
   report: the hook file contains zero occurrences of the setter
   names; the chord-gate ordering (TD-054b) is byte-untouched.
6. PERF (20 notes/s storm law): per-event work = one ref push + one
   numeric compare. State mirrors (overlay + summary) fire ONCE per
   bar boundary. `repPulse`-edge verdict dispatch = once per pass.
   D13 lineage honored: batched mirrors, zero per-note renders.
7. StrictMode: subscription effect idempotent with cleanup (the
   add/removeEventListener pair is its own inverse); buffer refs
   re-created per mount, never module-level.

### D136 (fork: REQ-PED-40/42 coherence): practice log EXTENDED - mode "practice", one appendAttempt seam

- `engine/pedagogy/log.ts`: `mode` union widens to
  `"etude" | "compose" | "explore" | "ear" | "practice"` (additive;
  no frozen pin - audit #12; colocated log.test.ts gains a "practice"
  roundtrip it).
- `src/lib/pedagogyLog.ts`: `isEntry` gains the literal (the guard is
  the fork-risk - a widened union with a pinned guard silently drops
  entries; the colocated test covers it).
- `src/lib/storage.ts`: registry `shape` string for `pedagogy.log`
  updated to the 5-mode union.
- OUTCOME MAPPING (the coherence law, one place): detection verdict ->
  `success + matchedFraction >= 0.99 -> "correct"; success (or fraction
  >= passThreshold) -> "partial"; failure -> "incorrect"`; manual
  rating -> success ? "correct" : "incorrect" (no fraction known).
  `partial` EXISTS in the shipped union - the mapping lands on it
  honestly (rolling-accuracy math already weighs partial 0.5).
- ONE SEAM (D120 landing): `appendAttempt(sessionDraft, attempt)` in
  `src/lib/practiceSessions.ts` dual-writes: push into the open
  session's attempts + `pedagogyLog.appendLog({atMs, mode: "practice",
  refId, outcome, durationSec: passLengthSec, conceptId: null})`.
  Ramp/pause/AB/detection NEVER touch pedagogyLog directly. minutesPerDay
  gets real practice minutes for free (the Phase 6 heatmap was built
  for exactly this).

---

## 3. ENGINE API SKETCHES

### 3.1 engine/practice/detect.ts (new, pure, ZERO imports)

```ts
/** Plain-data inputs: the grid is BUILT by src/lib/practiceExpected.ts
 *  (HarmonicPath lives in src - engine cannot import it). Timestamps
 *  are INPUTS; the engine never reads a clock (purity law). */

export type ExpectedKind = "target" | "free" | "rest";

export interface ExpectedBar {
  /** Form-bar index (0-based, 1 step = 1 bar truth). */
  bar: number;
  kind: ExpectedKind;
  /** Pitch classes (0..11) expected at the bar start; empty for
   *  "free"/"rest". Multiplicity 1 (a SET). */
  pcs: readonly number[];
}

export interface PerformedNote {
  /** MIDI note number (pc = ((n % 12) + 12) % 12). */
  note: number;
  /** Event timestamp, performance.now domain (midiIn msg.timeStamp). */
  atMs: number;
}

export interface BarMatch {
  bar: number;
  kind: ExpectedKind;
  /** barStart WALL ms (the D129 boundary anchor). */
  startMs: number;
  matched: number;                      // distinct expected pcs matched
  matchedPcs: readonly number[];        // for the overlay + summary
  missedPcs: readonly number[];
  wrongPcs: readonly number[];          // pitch errors (target bars)
  extraPcs: readonly number[];          // overflow + late-right-note
  restExtras: number;                   // notes played during this rest
  /** Signed mean over matched pairs (compensated - startMs). */
  avgOffsetMs: number | null;
}

export interface PhraseMatch {
  bars: readonly BarMatch[];
  matched: number;
  expectedTotal: number;                // target bars' pc count
  matchedFraction: number;              // 0 when expectedTotal 0 (NEVER NaN)
  accuracyPct: number;                  // matched/(matched+missed+wrong+extra+restExtras)
  wrongNotes: readonly number[];        // aggregated pcs (note numbers, not pcs? -> pcs; see law 6)
  missedNotes: readonly number[];
  extraNotes: readonly number[];
  avgOffsetMs: number | null;           // signed, over all matched pairs
  avgAbsOffsetMs: number | null;
}

export interface MatchInput {
  expected: readonly ExpectedBar[];     // the pass's bars, ascending bar
  /** Boundary wall-ms per expected bar: SAME ORDER as expected. */
  boundariesMs: readonly number[];
  performed: readonly PerformedNote[];  // the pass's buffered notes
  toleranceMs: number;                  // engine floor 60
  latencyCompensationMs: number;        // D134 equation (input + output)
}

export function matchPhrase(input: MatchInput): PhraseMatch;

/** Pure helper, separately pinned: the ONE bar-assignment law. */
export function assignBar(
  compensatedAtMs: number,
  boundariesMs: readonly number[],
  toleranceMs: number,
): { bar: number; inWindow: boolean } | null; // null = outside the phrase
```

Laws (each pinned in detect.test.ts):
1. PC EQUALITY: octave-agnostic; `((n % 12) + 12) % 12` (the shipped
   convention). Negative/NaN notes -> unscored (integer-guarded).
2. WINDOW: match iff compensated in [start - tol, start + tol];
   +/- 1ms either side of the boundary flips inclusion (boundary pin).
   Greedy NEAREST per expected pc; a note can match at most one pc.
3. BUCKET TOTALITY: every performed note inside the phrase lands in
   exactly ONE bucket (matched | wrong | extra | rest-extra) and every
   expected pc lands in matched or missed. Free bars -> no buckets.
   Property sweep: random grids x notes (injected Rng from
   engine/core/rng.ts in the TEST - the module itself imports nothing)
   assert conservation: matched + wrong + extra + restExtras ==
   notes-in-scored-bars; matched + missed == expectedTotal.
4. LATENCY: compensated = atMs - latencyCompensationMs BEFORE any
   comparison (REQ-PRAC-42 literal); a borderline tap (raw OUT,
   compensated IN) matches ONLY when compensation > 0 - the pin that
   makes the subtraction load-bearing, plus the D134 perfect-tap
   zero-residual derivation as a worked example.
5. EMPTY GUARDS: expectedTotal 0 -> matchedFraction 0 (never NaN);
   empty performed -> all missed, avgOffset null; zero-length arrays
   everywhere -> total zero result, no throw.
6. AGGREGATES: `wrongNotes/missedNotes/extraNotes` are PITCH-CLASS
   arrays (sorted, de-duped) - the PRD's buckets; per-bar detail keeps
   counts. accuracyPct denominator includes restExtras (D130 law).
7. NO-OVERLAP: tol <= 300 and consecutive boundaries >= 1000ms apart
   (240bpm 4/4 floor) -> a note is assigned to at most one bar;
   assignBar picks the NEAREST window on a pathological config
   (boundaries closer than 2*tol) and the pin documents the tie-break.
8. PURE + DETERMINISTIC: no clock/rng/Date/console; same inputs ->
   deep-equal outputs (idempotence pin).
9. BOUNDARY MISMATCH: expected.length !== boundariesMs.length ->
   match over the shared prefix, remainder unscored (never crash -
   hydrate-guard philosophy).

### 3.2 engine/practice/latency.ts (new, pure, ZERO imports)

```ts
/** Arrays in, number out - timestamps are INPUTS. */
export function medianOffset(
  clicksMs: readonly number[],
  tapsMs: readonly number[],
): number | null;              // null when fewer than minPairs pairs
export function clampInputLatency(
  rawMedianMs: number,
  outputLatencyMs: number,
): number;                      // clamp(median - output, 0, 500)
export function compensationMs(
  inputLatencyMs: number,
  outputLatencyMs: number,
): number;                      // the D134 sum, clamped 0..800
export const OUTPUT_LATENCY_MAX = 500;
export const MIN_TAP_PAIRS = 8;
```

Laws: median rejects outliers (11 tight + 1 wild -> wild ignored);
even-count median = mean of middle two; fewer than MIN_TAP_PAIRS ->
null (NEVER 0 - honesty law); clamp bounds pinned at 0 and 500;
compensation composes and clamps; NaN/garbage inputs -> null/0-safe.

### 3.3 engine/practice/session.ts (new, pure, ZERO imports)

```ts
export interface AttemptV1 {
  atMs: number;
  bpm: number;
  phaseKind: "play" | "rest" | "a" | "b" | "full";
  source: "detect" | "manual";
  success: boolean;
  matchedFraction: number | null;   // null = manual/no grid
  avgOffsetMs: number | null;
}

export interface SessionRecordV1 {
  version: 1;
  startedAtMs: number;
  endedAtMs: number | null;         // null = open (in-memory only)
  rampCompleted: boolean;           // REQ-PRAC-33 mark
  refId: string;                    // path/etude id
  meter: string;
  tempoStartBpm: number;
  maxTempoBpm: number;
  metronome: unknown;               // K.metronomeConfig snapshot (opaque here)
  windows: {
    loop?: { fromBar: number; toBar: number };
    pause?: { playBars: number; restBars: number };
    ab?: { a: { fromBar: number; toBar: number }; b: { fromBar: number; toBar: number }; swapBars: number };
    ramp?: { startBpm: number; targetBpm: number; stepBpm: number; repsPerStep: number; failThreshold: number };
  };
  attempts: AttemptV1[];            // last 50 raw (fold law below)
  aggregates: {
    attemptsTotal: number;
    successes: number;
    notesHit: number;               // detection only; 0 without
    totalPlaySec: number;
  };
}

export function openSession(seed: SessionSeed): SessionRecordV1;
export function foldAttempt(s: SessionRecordV1, a: AttemptV1): SessionRecordV1;
export function closeSession(s: SessionRecordV1, endedAtMs: number): SessionRecordV1;
export function summarizeSession(s: SessionRecordV1): {
  maxTempoBpm: number; totalSec: number; attemptsMade: number;
  successes: number; accuracyPct: number | null; notesHit: number;
  rampCompleted: boolean;
};
export const MIN_SESSION_SEC = 20;
export const ATTEMPT_RAW_CAP = 50;
export function isSessionWorthSaving(s: SessionRecordV1): boolean;
```

Laws: fold keeps raw attempts <= 50 (oldest dropped) while aggregates
keep counting (summarize-then-drop-raw, QUOTA law); notesHit only
accumulates from non-null fractions x expected (adapter passes the
count - engine math stays total); closeSession before MIN_SESSION_SEC
-> isSessionWorthSaving false; summarize is a PURE derivation (never
stored); rampCompleted latches once true; deep-freeze philosophy via
copy-on-fold (no input mutation).

### 3.4 src/lib/practiceExpected.ts (new, pure, node-tested; src/ NOT engine - consumes HarmonicPath)

```ts
import type { HarmonicPath } from "./paths";
/** soundingNotes[b] = optimizedStepsNotes[b] (the rail's own array). */
export function buildExpectedGrid(
  formLen: number,
  soundingNotes: readonly number[][],
  span: { fromBar: number; toBar: number } | null,   // active window; null = whole form
  restBars: ReadonlySet<number>,                     // pause-phase rest bars in the span
): ExpectedBar[];
/** The guide-tone pc law, intervalToRole-equivalent (3/4 -> third,
 *  10/11 -> seventh), re-derived for src-side purity of engine. */
export function guideTonePcs(notes: readonly number[]): number[];
```

CROSS-CHECK PIN (the anti-drift law): for every RAW_PATHS +
STUDIES_PATHS + CONCEPT_PATHS path, `guideTonePcs(step.notes)` is
non-empty IFF `gtTargetsForPath(path)[step].hasGuideTone`, and every
returned pc classifies via `classifyGuideTone` to role third|seventh.
This pins the engine copy against the shipped src law (audit #4) -
the duplication is SAFE because it is TESTED against the oracle.

### 3.5 src/hooks/usePlayedCorrectly.ts (new, thin adapter - wiring only)

```ts
interface UsePlayedCorrectly {
  enabled: boolean;                 // detect.enabled config
  unavailable: boolean;             // no Web MIDI API (REQ-PRAC-54)
  hasDevice: boolean;               // status line only (D135.4)
  perBar: readonly BarMatch[];      // state mirror, updated at boundaries
  phrase: PhraseMatch | null;       // last completed pass
  flushNow(): void;                 // boundary evaluation (clock tick + tests + pause)
  resetRun(): void;                 // play-start edge
}
export function usePlayedCorrectly(args: {
  enabled: boolean;
  grid: ExpectedBar[];              // built by App (practiceExpected)
  tempo: number;
  latencyCompensationMs: number;    // from practiceLatency record
  toleranceMs: number;
  bassMidiChannel: number | null;   // exclusion precedent
  isPlayingAuto: boolean;
  onPass: (m: PhraseMatch) => void; // verdict routing lives in App (D132)
}): UsePlayedCorrectly;
```

Internals (all pinned behaviors): window "midin" listener pushes
`{note, atMs: detail.timestamp}` (bass channel skipped);
playbackClock.subscribe watches the step flip -> flushNow() with
`performance.now()` as the boundary stamp; buffer drained per flush
(notes older than 2 bars dropped - late-arrival guard); visibility
hidden -> buffer drop + skip next boundary; NO setState per note
(mirrors at boundaries only); cleanup functions exact inverses
(StrictMode).

### 3.6 config + adapters

```ts
// practiceMechanics.ts EXTENSION (no-v5 law holds: normalize defaults
// the missing sub-field at read):
detect: { enabled: boolean; toleranceMs: number; passThreshold: number }
// defaults: { enabled: false, toleranceMs: 120, passThreshold: 0.8 }
// ranges: toleranceMs 60..300 int; passThreshold 0.5..1.0.

// src/lib/practiceLatency.ts (new adapter, performanceLog pattern):
K.practiceLatency = "practice.latency"
interface LatencyRecord { version: 1; inputLatencyMs: number;
  outputLatencyMs: number; source: "midi" | "manual";
  calibratedAtMs: number; deviceName: string | null }
loadLatency(): LatencyRecord | null   // corrupt -> null (never 0)
saveLatency(r): void
compensationOf(r: LatencyRecord | null): number  // 0 when uncalibrated

// src/lib/practiceSessions.ts (new adapter):
K.completedSessions = "practice.sessions"  // cap 50, SESSION_CAP
loadSessions(): SessionRecordV1[]          // shape-guarded, corrupt -> []
appendSession(s): void
appendAttempt(draft, a): void              // THE dual-write seam (D136)
markRampCompleted(): void                  // REQ-33 -> aggregates + log entry
```

---

## 4. DATA FLOW (one pass, end to end)

```
count-in (IMMUTABLE) -> isPlayingAuto TRUE
  -> App: openSession seed (context engaged? D133) + detector.resetRun()
  [rhythm interval, UNTOUCHED]
  each bar boundary (handler, byte-identical to S2):
    click fires (ctx.currentTime) + onMeasureStart + reanchor(next)
    -> playbackClock rAF tick observes step flip
      -> hook.flushNow(): boundaryMs = performance.now()
        -> drained buffer + grid slice -> matchPhrase (PURE)
        -> perBar mirror setState (ONE per bar) + rail data-match attrs
  passCompleted (handler seam) -> setRepPulse (shipped mirror)
    -> App effect [repPulse]: detector phrase verdict ready?
      -> matchedFraction >= passThreshold -> handleRepOutcome(success)
         [DETECTION ARMED]                        [existing ramp path]
      -> appendAttempt(session, attempt)
         -> session.attempts (fold)  +  pedagogy.log entry (mode "practice")
  ramp phase -> "complete" (ladder law 3, UNTOUCHED)
    -> App effect: markRampCompleted() (REQ-33) -> summary card
  stop/pause edge (>= 20s) -> closeSession -> appendSession (cap 50)
  [detection NEVER writes transport - TD-052 read-only pin]
```

---

## 5. EXACT FILE PLAN (E edit / N new / C comment-only)

```
N engine/practice/detect.ts               matcher math (3.1)
N engine/practice/detect.test.ts          laws 1-9 + conservation sweep
N engine/practice/latency.ts              median/clamp (3.2)
N engine/practice/latency.test.ts         laws incl. honesty (null != 0)
N engine/practice/session.ts              SessionRecordV1 + fold/summarize (3.3)
N engine/practice/session.test.ts         lifecycle laws + quota fold
E engine/purity.test.ts                   floor 53 -> 56 (comment cites D130)
E engine/pedagogy/log.ts                  mode union += "practice" (D136)
E engine/pedagogy/log.test.ts             "practice" roundtrip (colocated)
N src/lib/practiceExpected.ts             grid builder + guideTonePcs (3.4)
N src/lib/practiceExpected.test.ts        gtTargets/classifyGuideTone CROSS-CHECK pins
N src/lib/practiceLatency.ts(+test)       adapter + normalize (3.6)
N src/lib/practiceSessions.ts(+test)      adapter + appendAttempt seam (3.6)
E src/lib/pedagogyLog.ts                  isEntry union += "practice" (D136)
E src/lib/pedagogyLog.test.ts             widened-guard pin (colocated)
E src/lib/storage.ts                      K.practiceLatency + K.completedSessions + registry
E src/lib/practiceMechanics.ts            detect sub-field + normalize + defaults (3.6)
E src/lib/practiceMechanics.test.ts       detect normalize garbage -> defaults; missing sub-field (no-v5 pin)
E src/state/sessionStore.ts               (detect rides practiceMechanics - NO new field, NO v5)
N src/hooks/usePlayedCorrectly.ts         thin adapter (3.5)
N src/hooks/usePlayedCorrectly.test.ts    jsdom: synthetic "midin" + flushNow + reset (JSDOM_FILES)
N src/components/LatencyWizard.tsx        ModalShell state machine (D134)
N src/components/LatencyWizard.test.tsx   jsdom: gate/manual-entry/persist (JSDOM_FILES)
E src/components/PracticeMechanicsPanel.tsx      Detection section (toggle, tolerance, threshold,
                                                 summary card, sessions list, Calibrate button,
                                                 manual buttons disabled while armed)
E src/components/PracticeMechanicsPanel.test.tsx section pins (colocated)
E src/components/PlaySessionRail.tsx             data-match cells + glyphs + flash layer
E src/components/PracticeHeader.tsx              accuracy chip (armed only) + wizard mount
E src/App.tsx                                    hook wiring, grid memo, verdict routing
                                                 (repPulse effect), session lifecycle effects,
                                                 REQ-33 completion effect, latency record state
E src/index.css (or the styles home)             hse-match-flash keyframe + reduced-motion rule
E vitest.config.ts                               JSDOM_FILES += 3 new DOM test files
N e2e/practice-detection.spec.ts                 3 legs (section 8)
E docs/PRACTICE-MECHANICS.md                     S3 sections (detection, wizard, sessions)
E docs/TERMINOLOGY.md                            session/take/set-runner naming law (D133)
```

NOT touched: tests/** (byte-frozen), engine/practice/{windows,duty,ramp}.ts
(+ tests), rhythm.ts, countIn/useCountIn, keyCycle.ts, guideTones.ts,
guideToneTrail.ts, gtTargets.ts, useGuideToneTrail.ts (frozen-pinned
trail family), midiIn.ts, midiOut.ts, playbackClock.ts, PracticeSession-
Player.tsx, performanceLog.ts, RecentTakesPanel.tsx, README/SPEC/AGENTS,
.kai (Kai-only). The sacred handler: ZERO new hunks (D132 rides the
shipped repPulse mirror).

---

## 6. INTERFACE CONTRACTS FOR THE DEVELOPER

### 6.1 Rail DOM contract (e2e + a11y)
- Container `rail-strip`: gains `data-detect="on|off"`.
- Cell: `data-match="matched|missed|wrong|mixed|rest-extra"` (absent =
  unscored/off). Glyph span bottom-right. `title` text states the
  counts (screen-reader + hover parity).

### 6.2 Panel test ids
`detect-toggle`, `detect-tolerance`, `detect-threshold`,
`detect-summary` (role=status), `latency-calibrate-btn`,
`latency-manual-input`, `session-summary`, `sessions-list`,
`made-it`/`missed-it` (existing ids; gain disabled state when armed).

### 6.3 Wizard ids
`latency-wizard` (dialog), `wizard-gate`, `wizard-start`,
`wizard-result`, `wizard-save`, `wizard-input-ms`.

### 6.4 Terminology (docs/TERMINOLOGY.md addition, verbatim intent)
"PRACTICE SESSION (REQ-PRAC-60, this slice): one continuous practice
block bundling drill config + attempts; stored under practice.sessions.
SET-RUNNER SESSION (legacy): one run of a practice SET playlist
(synesthesia_practice_sessions). TAKE: one recorded audio performance
(hse.performance.log.v1). Three concepts, three keys, no foreign keys."

---

## 7. IMPLEMENTATION ROADMAP (ordered, atomic)

1. [x] detect.ts + detect.test.ts (all 9 laws) - 6h - deps: none
2. [x] latency.ts + test; session.ts + test; purity floor 53->56 - 4h - deps: none
3. [x] practiceExpected.ts + cross-check pins (guideTonePcs vs the shipped oracle) - 3h - deps: 1
4. [x] storage keys + practiceLatency.ts(+test) + practiceSessions.ts(+test) +
    pedagogy union widening (log.ts, pedagogyLog.ts, tests) - 4h - deps: 2
5. [x] practiceMechanics detect slice + normalize + store test - 2h - deps: none
6. [x] usePlayedCorrectly.ts(+test, JSDOM_FILES): subscription, buffer,
    boundary flush, visibility guard - 6h - deps: 1,3,5
7. [x] App wiring: grid memo, hook, repPulse verdict routing, session
    lifecycle effects, REQ-33 completion, latency state - 6h - deps: 4,6
8. [x] Rail overlay layer + CSS flash/reduced-motion + header chip - 4h - deps: 6,7
9. [x] Panel Detection section + summary card + sessions list + manual-
    button disable law; LatencyWizard(+tests) - 6h - deps: 5,7
10.[x] e2e practice-detection.spec.ts (3 legs) - 3h - deps: 8,9
11.[x] docs (PRACTICE-MECHANICS, TERMINOLOGY) + release notes - 1h - deps: all
12.[ ] full gate run + read-only grep proof + byte-diff proof - 1.5h - deps: all

Total: ~46.5h (parent estimate 32-44; the overrun is the wizard +
session adapter + 3 new DOM test files - within reason for 15 REQs;
flagged in risks as an estimate, not a commitment).

---

## 8. TEST PLAN

### 8.1 Unit (node env unless noted; colocated; suite 2473 -> ~2560/1/0)

- detect.test.ts (~22 its): laws 1-9. Conservation property sweep
  (injected mulberry32, 2k random grids x note streams: bucket sums
  conserved, no NaN, matchedFraction in [0,1]). The PHASE-3-01 NEGATIVE
  FIXTURE: two performances differing ONLY in one pc -> wrongNotes
  differ, all else equal. Latency-compensation math pins: borderline
  tap flips matched->missed when compensation removed (the load-
  bearing pin for REQ-PRAC-42).
- latency.test.ts (~8 its): median outlier/even-count; null-when-
  sparse (never 0); clamp 0/500; compensation composition; garbage
  guards.
- session.test.ts (~14 its): open/fold/close/summarize laws; 400-
  attempt fold keeps raw <= 50 + exact aggregates (quota law); worth-
  saving boundary (19.9s no / 20s yes); rampCompleted latch; no input
  mutation (frozen-object fixture).
- practiceExpected.test.ts (~8 its): kinds (target/free/rest), span
  slicing, restBars set attribution, and the CROSS-CHECK oracle pin
  over all curated paths (guideTonePcs <-> gtTargetsForPath +
  classifyGuideTone agreement - the anti-drift law).
- practiceLatency.test.ts (~6 its): normalize garbage -> null; round-
  trip; compensationOf(null) === 0.
- practiceSessions.test.ts (~8 its): cap-50 prune; corrupt -> [];
  shape-guard REJECTS legacy synesthesia_practice_sessions rows
  (different schema - D119 pin); appendAttempt dual-write (session +
  log) with a localStorage spy.
- pedagogy log.test.ts +2, pedagogyLog.test.ts +2: "practice" mode
  roundtrip + guard acceptance (the D136 fork-risk cover).
- practiceMechanics.test.ts +4: detect sub-field defaults-at-read
  (missing key = legacy payload, the no-v5 pin), range clamps.
- usePlayedCorrectly.test.ts (jsdom, ~6 its): synthetic "midin"
  CustomEvents + explicit flushNow() (NO running clock - the flush API
  is the seam): buffer drains once per flush; bass-channel exclusion;
  resetRun; unsubscribe symmetry (StrictMode double-mount); visibility
  drop.
- LatencyWizard.test.tsx (jsdom, ~6 its): gate renders without device;
  manual entry -> saveLatency roundtrip; median result display; abort
  cleanup (no leaked intervals); Escape closes.
- PracticeMechanicsPanel.test.tsx +5: toggle emits complete config;
  manual buttons aria-disabled while detect.enabled && !unavailable;
  summary card renders PhraseMatch fixture; sessions list renders.
- sessionStore.test.ts +1: detect slice survives persist roundtrip
  (envelope STILL v4).

### 8.2 e2e boundary (THE honest-MIDI question, answered)

Real MIDI in headless Chromium: IMPOSSIBLE (no devices). The design
makes the positive leg possible WITHOUT faking the app: the detector
consumes the window "midin" CustomEvent (D135.1) - the SAME event
midiIn dispatches for real devices - so `page.evaluate(() =>
window.dispatchEvent(new CustomEvent("midin", { detail: {...
timestamp: performance.now() }})))` drives the identical code path.
This is injection at a SHIPPED seam (midiIn.ts:167), not a test-only
hook. e2e/practice-detection.spec.ts, 3 legs:

1. NEGATIVE (REQ-PRAC-54): `addInitScript` deletes
   navigator.requestMIDIAccess -> open Drills -> detection section
   shows the unavailable state (data-testid + text). Discriminative:
   the section does not exist pre-S3.
2. POSITIVE (synthetic, real transport): boot -> enable detection ->
   Play at 240 BPM (bar = 1s) -> inject a note-on stream (one pc,
   every ~120ms, 10s) -> `expect.poll` the summary `data-notes-hit`
   attribute reaches >= 1 AND some cell shows data-match (matched or
   wrong - both prove the loop ran; the exact kind is phase-dependent
   and deliberately NOT asserted - timing-flake law). Then inject a
   pc absent from the boot path's chords -> wrong/extra counters move.
3. WIZARD (no device): open Calibrate -> gate state visible -> manual
   entry 42ms -> Save -> reload -> panel shows "42 ms (manual)"
   (persistence leg, no timing at all - deterministic).

Tolerance/latency MATH is pinned at unit level (8.1); e2e asserts
existence + monotonic counters only. Budgets: poll 15s, 240 BPM
compression, zero exact-frame asserts (TD-CI-E2E-FLAKE discipline).
e2e 27 -> 30.

### 8.3 Manual checklist (audio-path truths no bot can prove)

- [ ] Real MIDI device: play guide tones on chord changes -> strip
      greens; play nothing -> misses dim; wrong pc -> vermillion flash.
- [ ] Wizard with real device: 16 taps -> median lands within +/- 20ms
      of feel; recalibrate over Bluetooth headphones -> inputLatency
      shifts visibly (the honesty-limit copy is TRUE).
- [ ] Detection armed + ramp running: reps auto-rate; Made-it buttons
      visibly disabled; detection off -> they return (S2 behavior).
- [ ] Ramp to target while a session is open -> TARGET + session
      summary card + practice.sessions entry + pedagogy.log "practice"
      row (DevTools localStorage inspection).
- [ ] Rest discipline: pause mode 2/2, play during a rest -> rest
      cells show "!" + summary counts rest notes.
- [ ] Metronome click still audible through rests (REQ-PRAC-3, S2
      regression), count-in still pre-rolls, cycle-12 unchanged.
- [ ] Recording a take DURING a detection session: both logs written,
      no interference (takes stay honest - D133 disjointness).

---

## 9. CHECKLIST (gate order; CI mirrors)

1. [ ] `npm run lint` (tsc --noEmit)
2. [ ] `npm test` -> ~2560 / 1 skipped / 0 FAILED; `git diff --name-only -- tests/` EMPTY; it( 362
3. [ ] `npm run build` (RNN config first, then main - both pass)
4. [ ] `node assets/check-links.cjs` -> 362; persona/tune counts unmoved (S3 adds NO gated numbers)
5. [ ] `npm run check:paths` -> 36/36 OK (no path data touched)
6. [ ] `npm run test:e2e` after build: 27 -> 30 green
7. [ ] `engine/purity.test.ts` floor 53 -> 56 raised ONLY with detect/latency/session.ts
8. [ ] TD-052 read-only proof: `grep -nE "setActiveStepIndex|setIsPlayingAuto|setTempo|rhythmEngine|backingEngine|playbackClock\.(start|stop|reanchor|setTempo)" src/hooks/usePlayedCorrectly.ts` -> EMPTY (subscribe-only; the clock appears ONLY as `.subscribe`)
9. [ ] Byte-diff proof: handler region (`src/App.tsx` advanceTransport hunk) shows ZERO changes vs 13006cf; rhythm.ts / windows.ts / duty.ts / ramp.ts / playbackClock.ts / guideTone family / midiIn.ts / midiOut.ts NOT in `git diff --name-only`
10.[ ] JSDOM_FILES gained exactly: usePlayedCorrectly.test.ts, LatencyWizard.test.tsx (panel test already listed)
11.[ ] No console.log/info/debug in new src; no any; ASCII in this doc and all new code strings (glyphs: reuse the shipped "v"/check convention ONLY where an existing component already ships it - strip overlay uses ASCII letters X/-/! per D131)
12.[ ] New effects StrictMode-audited: every addEventListener has its exact inverse in cleanup; buffer refs per-mount, never module-level
13.[ ] TD register (Kai): "ear-training timing seam awaits onset source" (D134 cut), wizard-per-audio-path staleness note, session unload-gap (D133.4)

---

## 10. RISKS

| Risk | P | I | Mitigation |
|---|---|---|---|
| Synthetic-e2e drift: midiIn's dispatch shape changes and the injected detail no longer matches | low | med | e2e builds the detail object from the SAME documented shape (midiIn.ts header); unit pin `midiIn.test.ts` (colocated) already guards the dispatcher; a shape change fails the colocated test first |
| App.tsx grows again (~4700 lines; S3 adds ~250) | high | med | all logic lives in engine/src-lib/hook; App gains ONLY wiring effects (the shipped pattern); no new handler hunks |
| rAF boundary lag biases detection ~8ms late-anchor | med | low | absorbed 15x by the 120ms floor (D129 budget); documented direction |
| User tracks the chord STAB not the click (reads ~30ms late) | med | low | inside tolerance; calibration is per-user and absorbs systematic bias |
| Detection enabled but grid empty (all-free path) -> silence | low | low | D132 no-verdict law (ladder untouched); panel shows "no targets in this form" |
| 20-notes/s storm tempting per-note renders | med | high | boundary-only mirror law (D135.6) + hook tests assert setState count; GuideToneFeedback already owns the live channel |
| zustand detect slice clobbers cross-tab (PHASE-4-01 class) | low | med | defaults-at-read normalize (shipped pattern), +1 store test |
| Practice.sessions quota blowup (long sessions) | low | med | attempt fold cap 50 + aggregates (D133); session cap 50 |
| pedagogy union widened but adapter guard forgotten -> silent entry drops | low | high | THE fork-risk of D136: isEntry pin added in the SAME commit (8.1); appendAttempt dual-write test with a spy |
| Naming confusion: sessions vs set-runner vs takes in future code | med | low | TERMINOLOGY.md law (6.4) + D119 key/type separation + shape-guard rejects cross-schema rows (tested) |
| e2e positive leg flake (timing of injections vs boundaries) | med | med | monotonic-counter asserts ONLY (>= 1), never exact per-bar attribution; 240 BPM compression; 15s budgets |
| Wizard measures a different audio path than practice uses (BT headphones swapped later) | med | low | honesty copy + deviceName/date display (D134); recalibrate guidance |
| Latency compensation double-subtraction if a future consumer also subtracts | low | med | the engine takes ONE `latencyCompensationMs` param; the SUM is computed in exactly one place (`compensationOf`) - law pinned in practiceLatency.test |
| Detection blames the app for GC stalls > 200ms on one bar | low | low | buffer-drop + skip-boundary guard covers hide; in-page stalls degrade one bar only, documented |

---

## 11. RELEASE NOTES (S3)

1. Latency calibration: a "Calibrate" wizard plays 16 clicks, listens
   for your MIDI taps, and stores the offset - detection timing now
   subtracts it automatically (works with manual entry too).
2. Played-correctly detection (requires a MIDI input + Web MIDI
   browser): bars light green (guide tones hit), dim (missed), or
   flash vermillion (wrong notes); playing during rests is counted.
   Every state also carries a letter glyph and text summary (color
   blind safe). A post-pass summary shows notes hit, average timing
   offset, and accuracy.
3. Tempo ramp now rates itself from detection when armed (the Made-it/
   Missed-it buttons return when detection is off). Reaching the ramp
   target marks the practice session completed.
4. Practice sessions: playing with any drill/ramp/detection engaged
   records a session (config snapshot + attempts + max tempo); the
   last 50 are listed in the Drills panel with an end-of-session
   summary. Sessions also feed the practice log (heatmap minutes now
   include real practice time).
5. Sessions are NOT takes: takes stay recorded-audio artifacts;
   sessions are practice-block logs.

---

## 12. HANDOFF

```yaml
HANDOFF_TO_DEVELOPER:
  from: "@architect"
  to: "@developer (via @engineering-team)"
  timestamp: "2026-09-27"
  deliverables:
    - name: "docs/PHASE-7-S3-DETECTION.md"
      status: complete
      sections: re-audit(21 sites, shipped-code verified), D129..D136
        (7 crux forks + PED-log coherence), engine APIs (detect/latency/
        session), expected-grid builder + cross-check law, hook contract,
        rail DOM contract, file plan, test plan (unit + honest e2e MIDI
        boundary), roadmap, checklist, risks, release notes
  constraints:
    - "tests/** byte-frozen; 2473/1/0 -> ~2560/1/0 ZERO failures; it( stays 362"
    - "sacred handler: ZERO new hunks - detection rides the shipped repPulse mirror + playbackClock.subscribe (read-only)"
    - "IMMUTABLE: rhythm.ts, windows.ts, duty.ts(+equivalence pins), ramp.ts, count-in gate, cycle-12, reanchor line, chord-gate ordering (TD-054b), guideTone family (frozen-pinned)"
    - "TD-052 HARD: detector is a read-only transport consumer - grep gate item 8 in section 9"
    - "engine purity: detect.ts/latency.ts/session.ts ZERO imports, timestamps are INPUTS; floor 53 -> 56"
    - "no zustand v5; detect config rides the existing practiceMechanics field (defaults-at-read)"
    - "new DOM test files MUST be added to JSDOM_FILES in vitest.config.ts (Vitest 5 ignores per-file env comments)"
    - "no console.log/info/debug in src; no any; ASCII code strings; Okabe-Ito + glyph redundancy for ALL match states"
  decisions_made:
    - { id: D129, what: "phase alignment: boundary-anchored via rAF-observed step flips (click+anchor move together -> interval jitter absorbed); no within-bar interpolation (expected onsets are bar starts); tol floor 120ms, app-side worst-case ~83ms quantified at 120bpm", confidence: HIGH }
    - { id: D130, what: "guide-tone reuse verdict: ~40% (pattern/conventions/chip), NOT the tally - new pure matcher; expected = per-bar guide-tone pcs (target/free/rest kinds), sounding notes as source; bucket law total + deterministic; file named detect.ts (parent said match.ts - task authority)", confidence: HIGH }
    - { id: D131, what: "visual surface = rail strip cells (5th overlay layer, data-match + glyph + Okabe-Ito tint + reduced-motion-safe flash); summary card in the Drills panel; LiveScoreDisplay REJECTED", confidence: HIGH }
    - { id: D132, what: "ramp auto-rep via repPulse edge -> handleRepOutcome (zero machine change, D121 seam VERIFIED against shipped ramp.ts); manual buttons disabled while armed (no double-events); REQ-33 marks the open session on phase complete", confidence: HIGH }
    - { id: D133, what: "SessionRecordV1 (naming collision resolved vs set-runner PracticeSession); session = continuous play block with engaged context; start on play edge, end on stop/path-switch/20s-min; cap 50 sessions + 50 raw attempts folded into aggregates; summary in-panel; sessions vs takes DISJOINT, no FK", confidence: HIGH }
    - { id: D134, what: "wizard: MIDI-device-gated calibration, median-of-16 minus browser outputLatency, manual entry always available; canonical equation compensated = tap - input - output (perfect tap = zero residual, pinned); ear-training latencyMs seam NOT wired (doubly dead: no onset source exists) - spacebar source CUT", confidence: HIGH }
    - { id: D135, what: "MIDI plumbing: window 'midin' CustomEvent subscription (the ONLY e2e-injectable seam; identical data), bass-channel exclusion precedent, boundary-batched mirrors (zero per-note setState), API-presence gate for armability, hot-plug works", confidence: HIGH }
    - { id: D136, what: "pedagogy.log EXTENDED not forked: mode union += 'practice' (engine + isEntry guard + registry string, same commit), outcome mapping correct/partial/incorrect onto the shipped union, ONE appendAttempt dual-write seam (D120 landing)", confidence: HIGH }
  implementation_notes:
    - "write detect.test law 4 (latency-compensation borderline flip) FIRST - it is the REQ-PRAC-42 load-bearing pin"
    - "the practiceExpected cross-check pin (guideTonePcs vs gtTargetsForPath + classifyGuideTone over ALL curated paths) is the anti-drift gate for the engine law copy - do not skip it"
    - "flushNow() on the hook is not a test smell: it is the pause-time evaluation seam AND the jsdom seam - the hook test never starts a clock"
    - "repPulse edge detection: compare against a lastPulseRef (the counter starts at 0 and StrictMode double-fires effects - ref-guard per D13)"
    - "session metronome snapshot: store the K.metronomeConfig blob verbatim (opaque in engine; normalize at render)"
    - "e2e positive leg asserts MONOTONIC counters only (data-notes-hit >= 1); per-bar attribution is unit-pinned, never e2e-timed"
    - "visibilitychange buffer-drop guard: without it, a tab switch mid-drill poisons the next bar's stats (rAF freezes, performance.now does not)"
    - "the wizard's clicks must go through audioEngine.playMetronomeClick (metronomeGain bus) - the measured path IS the practice path"
    - "appendAttempt lives in practiceSessions.ts and is the ONLY writer that touches both stores; ramp/pause/detect code never imports pedagogyLog"
  estimated_effort:
    implementation_hours: 38-46
    testing_hours: 8-10
    documentation_hours: 2
  progress:
    phases_completed: 5/5
    retries: 0
    quality_gates_passed: 5/5
    audit_notes: "baseline verified live (2473/1/0; e2e 27; it( 362; purity floor 53/tree 54); S2 seams re-verified against SHIPPED code, not the S2 design doc (ramp event shape + repPulse mirror + duty passCompleted all confirmed)"
  risks_top3:
    - "pedagogy isEntry forgotten on widening -> silent log drops (mitigated: same-commit pin + dual-write spy test)"
    - "per-note render temptation under real MIDI rates (mitigated: boundary-only mirror law + hook setState-count test)"
    - "e2e positive-leg flake (mitigated: monotonic-counter asserts, 240 BPM, 15s budgets; math is unit-pinned)"
  open_for_orchestrator:
    - "D130 naming: engine file detect.ts deviates from the parent sketch's match.ts (task authority assumed) - ratify or redirect before step 1"
    - "D134 scope cut: spacebar tap source + ear-training seam wiring CUT from S3 (honesty argument in D134) - the parent D117 listed Space as SECONDARY; ratify the cut or schedule a keyboard-input calibration as S4"
    - "D132 manual-button DISABLED-while-armed is one reading of 'coexist'; the alternative (last-writer-wins, both live) risks double-rated reps - ratify the disable law"
    - "effort 38-46h exceeds the parent's 32-44 band upper edge by ~2h (wizard + 3 DOM test files) - flag, not a commitment"
```

**Version:** 1.2.2 | **Phase:** 7 S3 design | **Depends on:** S1 (fd4b383), S2 (3cf5d6d) | **Closes:** REQ-PRAC-33 marking (S2 deferral)
