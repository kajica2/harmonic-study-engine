# PRD-001 Phase 7 Slice 4 - Input Surfaces: On-Screen Piano + Computer Keyboard

> POST-SHIP: read section 14 (ERRATA) before reusing any premise below - this doc predates ship; Kai rulings and shipped deviations D-1..D-11 are recorded there.

Status: DESIGN ONLY (research + architecture, no implementation in this doc).
Baseline: HEAD 77188f5 (kai record) / 0edbb9d (S3 feature), suite 2598 passed /
1 skipped / 0 failed (198 files, verified live this session), e2e 30 tests /
13 specs (verified), tests/ it( = 362 (verified + check-links green),
purity floor 56 (engine/purity.test.ts:73; tree scans 57, verified),
check:paths 36/36 OK (verified), check-links all counts match (verified).
Parent: docs/PHASE-7-PRACTICE.md (D110..D120). S1/S2/S3 SHIPPED
(docs/PHASE-7-S1-TRANSPORT.md, PHASE-7-S2-MECHANICS.md,
PHASE-7-S3-DETECTION.md - S3 ended at D136).
Design authority for: REQ-IO-4 (P0, on-screen piano fallback), REQ-IO-5
(P1, computer-keyboard mapping `A W S E D F T G Y H U J K`), REQ-IO-6
(P0, touch-friendly), the D134 parked keyboard-calibration question
(orchestrator ruling: scheduled as S4), and the TD-057 ear-training
onset-source adjudication.
Decisions numbered D137+ (S3 ended at D136).

PARENT-STANCE AMENDMENT (up front, justified as D144): the parent doc
(PHASE-7-PRACTICE.md ~:405) parked REQ-IO-4/5/6 with the claim
"PianoKeyboard needs press handlers; the AWSED mapping needs a new
classifyNoteKey in useKeyDown.ts - they are NOT detection surfaces and
are NOT pulled into Phase 7 scope". The re-audit (section 0 #1) shows
the first half of that premise is FALSE in shipped code: the press
handlers exist and are wired to audio. The orchestrator scheduled this
slice; the amendment stands on evidence, not preference.

---

## 0. RE-AUDIT (claims vs SHIPPED code at 0edbb9d, read this session - S3-001 law)

Every claim below was verified by opening the actual file. Design-doc
claims from S2/S3/parent were NOT trusted.

| # | Claim (source) | file:line evidence | VERDICT | S4 relevance |
|---|---|---|---|---|
| 1 | "PianoKeyboard needs press handlers" (PHASE-7-PRACTICE.md ~:405) | `src/components/PianoKeyboard.tsx:105-122` (keyAccess: Space/Enter play, keyup/blur release), `:275-285` white keys onMouseDown/onMouseUp/onMouseLeave/onTouchStart/onTouchEnd, `:346-356` black keys same; WIRED at `src/App.tsx:4964-4977` (onPlayNote -> audioEngine.playNote + midiOut.playNote + recorder.recordNoteOn + setActiveMidis; onStopNote mirrors) | **FALSE - handlers shipped and wired.** The on-screen piano already PLAYS audio. What it does NOT do: dispatch "midin", so the detector/wizard never see its notes. The gap is the SEAM, not the surface | Reframes REQ-IO-4: the missing piece is feeding an existing input surface into the note pipeline, not building a piano from scratch. Feeds D140 (new component vs extend) |
| 2 | The "midin" window CustomEvent is the note pipeline seam (S3 D135.1) | Dispatched at `src/lib/midiIn.ts:167` for every hardware note (`detail = MidiInEvent {note, velocity, type, channel, inputId, inputName, timestamp}` :30-38, :149-157; timestamp = msg.timeStamp ?? performance.now() :156). Consumers: `src/hooks/usePlayedCorrectly.ts:325`, `src/components/LatencyWizard.tsx:257`, `src/components/MidiInPicker.tsx:64` | **TRUE** - three live consumers, all via `window.addEventListener("midin", ...)` | THE integration point. Any S4 source that dispatches this event feeds detector + wizard + picker with ZERO consumer-side plumbing (D137) |
| 3 | "AWSED mapping collides with existing bindings" (task concern; parent flagged) | Global handler `src/App.tsx:1238-1376` binds: Escape (:1251), ? / Shift+/ (:1294), 1/2/3 (:1309-1321), [ ] via classifyTransposeKey e.code (:1328, `src/hooks/useKeyDown.ts:44-45`), arrows (:1340-1355), Space (:1356), m/M (:1363), e.code Comma/Period (:1367-1374). Other keydown sites: PracticeHeader Escape-only popovers (:249, :276), ComposeSurface Cmd/Ctrl+Z (modifier-required, :544-553), ModalShell Escape/Tab (:77-113), ModeSelector arrows (:101-102), element-scoped Enter/Delete/arrows (MelodyLane :95-105, ChordInspector :337, inputs). EarTrainingPanel + EtudeComposerPanel: NO key bindings (grep-verified) | **FALSE for A W S E D F T G Y H U J K - none are bound anywhere.** Only letter bound globally: M. Z and X (octave-shift candidates) are also free (ComposeSurface's undo requires meta/ctrl) | The full 13-key mapping + Z/X octave keys can ship collision-free. Guard order + typing guard + modifier guard still mandatory (PHASE-1-01, D139) |
| 4 | REQ-PRAC-54 gate = Web MIDI API presence (S3 D135.4) | `src/hooks/usePlayedCorrectly.ts:104-108` (`midiInAvailable(): typeof nav.requestMIDIAccess === "function"`), `:117` (`unavailable = !midiInAvailable()`); panel toggle `disabled={... || detectionUnavailable}` (`PracticeMechanicsPanel.tsx:455`); honest copy verbatim at `:473-475`: "Requires Web MIDI input - this browser has no Web MIDI API, so detection cannot arm. Drills, ramp and manual rating work unchanged."; forwarded App :2874 | **TRUE** - API-presence gate, exact copy located | D138 widens the gate to "any note source" and REPLACES this copy (verbatim obligation in section 7) |
| 5 | practiceMechanics rides the v4 envelope, defaults-at-read (S2 D126 / S3 D132 lineage) | `src/state/sessionStore.ts:84` (`CURRENT_SESSION_VERSION = 4`), :28-37 (v4 comment), partialize persists the WHOLE object (:631), hydrate normalize (:614-616); `src/lib/practiceMechanics.ts:145-163` (detect sub-field defaults at read - the exact pattern S4 copies) | **TRUE** | New `noteInput` sub-field rides the SAME field: NO v5, NO new K key, NO sessionStore.ts edit, NO migration (D143) |
| 6 | LatencyRecord shape + normalize (S3 D134) | `src/lib/practiceLatency.ts:22-31` (`{version:1, inputLatencyMs, outputLatencyMs, source:"midi"|"manual", calibratedAtMs, deviceName}`), normalize :37-54 (REJECTS the record unless inputLatencyMs is finite 0..500 AND source is midi|manual), single-sum law `compensationOf` :79-82 | **TRUE** - and the normalize is a HARD REQUIREMENT on both fields | A fallback-only calibration (no MIDI ever) cannot express itself today. D141 widens the record (inputLatencyMs -> number | null, + fallback fields) with defaults-at-read; legacy records unaffected |
| 7 | Wizard pairs "midin" taps to clicks, greedy-nearest within +/- half beat (S3 D134) | `src/components/LatencyWizard.tsx:216-246` (onMidin: noteon-only :218, integer note :219, bass exclusion :220-221, timestamp :222-225, best-pair search :227-236, `if (bestIdx === -1) return` :237); gate `gateOk = hasMidiApi && hasDevice` :122; mounted in PracticeHeader :630-639 | **TRUE** | A keyboard/screen tap dispatched as "midin" pairs with ZERO roll-mechanics changes; only the gate + a source filter change (D141) |
| 8 | Ear-training answers are choice/text, no onset capture (S3 audit #11, TD-057) | `src/components/EarTrainingPanel.tsx:321-329` (choice buttons onClick=handleSubmit), `:336-359` (token buttons + text input); NO keydown listeners in the file (grep-verified); `engine/ear-training/check.ts:102-112` dictationTimingOk unchanged | **TRUE** - doubly dead seam confirmed at HEAD | D142: S4's tapped-note onset is a PERFORMANCE onset; dictation wants a SUNG onset vs slot. Category error persists -> seam stays unwired, TD-057 stays open with refined wording |
| 9 | bassMidiChannel default + range (channel-sentinel safety) | `src/App.tsx:541-543` (`usePersistedState<number>({key:"bassMidiChannel", defaultValue: 2})`); picker select offers 1..16 (App :2760-2785 region); hook exclusion `detail.channel === bass` (usePlayedCorrectly.ts:291-292), wizard exclusion same law (LatencyWizard.tsx:220-221) | **TRUE** - the user-selectable bass channel is ALWAYS 1..16 | Synthetic events on channel 0 are NEVER bass-excluded by either consumer, no consumer change needed for exclusion (D137's sentinel) |
| 10 | Cheatsheet <-> handler consistency test is FROZEN and bidirectional | `tests/keyboard-shortcuts.test.ts:102-104` (reverse check: EVERY key chip in `SHORTCUTS` must exist in the test's HARDCODED `HANDLED_KEYS` :26-37); the test does NOT parse App.tsx (static mirror, header comment :7-15); D14 precedent comment in `src/components/KeyboardShortcutsCheatsheet.tsx:58-63` ("Shift , . cannot appear as chips without editing tests/, which is off-limits") + footer-prose solution at :152-155 | **TRUE - adding A/W/S/... chips to SHORTCUTS BREAKS THE FROZEN TEST.** Adding handler branches does NOT (the test never reads code) | D143: the mapping is documented via footer prose + key chips ON THE PIANO ITSELF, never as SHORTCUTS entries |
| 11 | JSDOM_FILES: the components glob auto-covers new component tests | `vitest.config.ts:14` (`"src/components/**/*.test.tsx"` in JSDOM_FILES); explicit entries needed for hooks/lib DOM tests (:18-38) | **TRUE** | `NoteInputPiano.test.tsx` needs NO config edit; `useNoteInput.test.ts` + `noteInputBus.test.ts` DO (section 6) |
| 12 | kbRange (display piano range) is legacy-hook state | `src/hooks/useSessionStore.ts:408-409` (`useState(() => loadJSON("synesthesia_kbRange", {from: 36, to: 72}))`); K.kbRange registry `src/lib/storage.ts:40, :116` | **TRUE** - legacy hook, NOT the zustand store | The INPUT piano does NOT ride kbRange (different purpose, different persistence): rootOctave rides practiceMechanics.noteInput (D143). kbRange UNTOUCHED |
| 13 | App has a ready study-surface predicate + modal flags | `src/App.tsx:477-479` (`storeModeForGate === null || storeModeForGate === "etude"` - the documented study-surface contract :470-476); the five blocking modals are App state (showImportExport/showLeadSheet/showChordInspector/showRecordingModal/showCheatsheet, all read in the Escape branch :1251-1275); wizardOpen lives in PracticeHeader (:295) | **TRUE** | The activation gate composes from EXISTING App state - no new flags, no lifted wizard state (D139) |
| 14 | isTypingTarget is local, not shared | `src/components/ComposeSurface.tsx:114` (module-local function); App's handler has its own inline predicate (:1242-1247) | **TRUE** - no shared util exists | useNoteInput duplicates the 4-line predicate with a pin (duty.ts safeInt precedent: "cheaper than widening exports") |
| 15 | Purity floor / engine scan | `engine/purity.test.ts:73` (`MIN_SCANNED_FILES = 56`); `find engine -name "*.ts" ! -name "*.test.ts"` = 57 | **TRUE** | S4 adds ZERO engine source files (detect.ts is EDITED additively) -> floor STAYS 56. Raising it without new files is banned |
| 16 | REQ-IO-1 device list shipped | `src/components/MidiInPicker.tsx:103-119` (select over inputs), `src/hooks/useMidiDevices.ts:38-42` (onInputsChange) | **TRUE** | DO-NOT: no device-list work in S4 |

---

## 1. REQUIREMENTS -> COMPONENTS MAP

| REQ | Priority | Component(s) | Law |
|---|---|---|---|
| IO-4 on-screen piano fallback | P0 | `NoteInputPiano.tsx` (new input surface) + `noteInputBus.ts` (midin dispatch) + detector/wizard consume unchanged | Feeds the SAME seam as MIDI; the synesthesia PianoKeyboard stays a display (purpose split, D140) |
| IO-5 computer-keyboard mapping | P1 | `classifyNoteKey` in `useKeyDown.ts` (pure) + `useNoteInput.ts` (global listener, guards) + `noteInputBus.ts` | A W S E D F T G Y H U J K = root..root+12 by e.code; Z/X octave; opt-in toggle; study view only (D139) |
| IO-6 touch-friendly piano | P0 | `NoteInputPiano.tsx` | Pointer events, white key min 44px wide x 56px tall, horizontal scroll on narrow screens, no hover-only affordance (D140) |
| PRAC-54 (AMENDED) | P1 | `usePlayedCorrectly.ts` gate + `PracticeMechanicsPanel.tsx` copy | Arm iff MIDI API OR note-input enabled; exact honest copy (D138) |
| PRAC-40 (EXTENDED) | P1 | `LatencyWizard.tsx` source selector + `practiceLatency.ts` record widening | Per-source calibration: MIDI number and keyboard/touch number coexist; one shared outputLatencyMs (D141) |
| TD-057 adjudication | - | none | Ear-training seam stays OUT (D142) |
| PHASE-1-02 affordance law | - | Panel toggle + piano key chips + cheatsheet footer | Every shipped affordance functional or disabled-with-honest-tooltip; mapping discoverable on the surface itself (D143) |

---

## 2. FORK DECISIONS

### D137 (fork 1): note-source architecture = SAME "midin" seam, source-tagged, channel-0 sentinel

DECISION: every S4 input surface (computer keyboard, on-screen input
piano, wizard-embedded piano) emits through ONE new emitter,
`src/lib/noteInputBus.ts`, which dispatches the window "midin"
CustomEvent with the shipped `MidiInEvent` detail shape
(midiIn.ts:30-38 - audit #2). No parallel path, no new event name.

Evidence for "same seam" (all shipped consumers, read this session):
- `usePlayedCorrectly.ts:325` subscribes to window "midin" and reads
  ONLY `{type, note, channel, timestamp}` (:287-299) - a synthetic
  event flows through the identical buffer/bass/timestamp guards.
- `LatencyWizard.tsx:257` subscribes to the same event and pairs
  greedy-nearest (:227-240) - a synthetic tap pairs with zero
  roll-mechanics change.
- `MidiInPicker.tsx:64` shows note activity for ANY midin event -
  keyboard taps briefly light the IN chip (a music-note glyph +
  "C4 v100 - ch0"). Kept:
  the chip is an activity indicator, and `ch0` honestly says
  synthetic (section 0 #9).
- S3 D135.1 (ratified by the shipped e2e): "midin" is the ONLY
  e2e-injectable seam. A parallel path would fork the e2e story and
  break the "one seam to rule them all" property the S3 positive leg
  depends on.

REJECTED alternatives:
- (a) Parallel `hseNoteIn` event + consumer fan-in: every consumer
  grows a second subscription and a merge law (ordering, dedup);
  e2e gains a second seam for no benefit. Rejected: strictly more
  code, strictly more risk, zero new capability.
- (b) Push notes through `midiIn.onMidin` (in-process list): not
  injectable from `page.evaluate` (closure list - S3 audit #1), and
  midiIn is a hardware singleton; teaching it a synthetic-injection
  API pollutes the Web MIDI boundary. Rejected on testability.

SOURCE TAGGING (the one addition the seam needs): synthetic events
carry `inputId: "hse-keyboard" | "hse-screen"` and
`inputName: "Computer keyboard" | "On-screen piano"`. Consumers that
must distinguish (the detector's per-source compensation, the
wizard's mode filter) check `isHseInputId()` from the bus - a single
exported predicate, one law, pinned. Hardware events keep real
inputIds (midiIn.ts:154-155) and can never collide: Web MIDI source
ids are implementation strings, never "hse-*".

CHANNEL SENTINEL: synthetic events use `channel: 0` - OUTSIDE the
human 1..16 convention (midiIn.ts:11 documents channel as 1-16; the
bass picker offers only 1..16, audit #9). Consequence: the shipped
bass-exclusion (`detail.channel === bass`) can NEVER drop a synthetic
note, in either consumer, with zero consumer changes. Velocity: 100
on noteon, 0 on noteoff (midiIn's own noteon law is velocity > 0,
:146 - synthetic noteons satisfy it). Timestamp:
`performance.now()` at dispatch - the same domain as hardware
timestamps and boundary anchors (midiIn.ts:156).

### D138 (fork 2): detection integration = WIDEN the arm gate to any note source; exact copy replaces the MIDI-only text

The question: REQ-PRAC-54 says "Requires Web MIDI input; unavailable
without" (docs/PRD-001.md:566). If keyboard/piano notes feed the
detector, does the honest-unavailable copy change?

DECISION: YES - detection arms iff (Web MIDI API present) OR (note
input enabled). The fallback surfaces feed played-correctly detection
through the D137 seam. Justification:
1. REQ-IO-4/5 are P0/P1 requirements of the SAME PRD, and they exist
   precisely to answer "what happens when Web MIDI is unavailable"
   (PRD:585-586). A detector that ignores the PRD's own fallback
   inputs makes REQ-IO-4/5 second-class decoration. The coherent
   reading of the PRD is: detection requires a NOTE SOURCE; Web MIDI
   is one source; the fallback surfaces are the others.
2. The parent's "they are NOT detection surfaces" stance (amended by
   D144) rested on the stale premise that the piano had no press
   handlers at all (audit #1 FALSE). The surfaces exist; the seam is
   three lines of dispatch. Keeping them OUT of detection would ship
   a piano that plays audio the detector could see but deliberately
   won't - the least honest option.
3. UX: the laptop-only user (no MIDI, the majority) gets real
   fallback value: on-screen/keyboard practice scored against the
   guide-tone grid. MIDI-gated detection would make S4 a
   no-op-for-most-users slice.

PRD TEXT DEVIATION (flagged, not hidden): REQ-PRAC-54's literal
"unavailable without [Web MIDI]" is superseded for the arm gate. The
deviation is PRD-internal-consistent (IO-4/5 win over PRAC-54's
pre-fallback wording) and lands in the release notes + an
open_for_orchestrator item to erratum the PRD line. docs/PRD-001.md
is NOT edited by this slice (PRD ownership = orchestrator).

GATE MECHANICS (shipped code touched, minimal):
- `usePlayedCorrectly.ts` gains args
  `fallbackInputEnabled: boolean` (the note-input toggle) and
  returns `sawFallback: boolean` (first hse-* note-on ever observed,
  one-shot setState - the shipped hasDevice pattern :300-303).
  `unavailable` becomes `!midiInAvailable() && !fallbackInputEnabled`
  (:117 edit - the ONLY gate line changed).
- `hasDevice` (the hardware status signal, :300-303) flips ONLY for
  non-hse events: `if (!isHseInputId(detail.inputId) && ...)`.
  Without this, a keyboard tap would silence the "connect a MIDI
  input" status line and lie about hardware.
- Panel toggle disable law (`PracticeMechanicsPanel.tsx:455`) rides
  `detectionUnavailable` unchanged - the value it receives is now
  the widened one. Zero panel logic change for the gate itself.

EXACT COPY (verbatim obligations; ASCII; replaces the shipped
:473-475 and :485 strings - full block in section 7.2):
- UNAVAILABLE (no API, note-input off): "Needs a note source - this
  browser has no Web MIDI API and keyboard / piano input is off.
  Turn on Keyboard / piano input above to arm detection with the
  computer keyboard and on-screen piano."
- ARMED, fallback-only, nothing played yet: "No MIDI input -
  detection will score your computer keyboard and on-screen piano."
- ARMED, fallback-only, fallback notes observed: "Scoring
  keyboard / piano input - MIDI hardware stays welcome (hot-plug
  just works)."
- ARMED, API present, no device, no fallback notes: the shipped
  :485 string stays byte-identical ("connect a MIDI input -
  detection is live but silent. Hot-plugging just works.").

What does NOT change: the matcher math, the grid, the buckets, the
pass verdict, the ramp routing, the overlay. A synthetic note is
indistinguishable from a hardware note to `matchPhrase` except by
the compensation stamp (D141).

### D139 (fork 3): keyboard mapping = pure classifyNoteKey + opt-in armed listener; zero collisions (audited)

MAPPING (REQ-IO-5 literal, position-based by `e.code` - the shipped
D14 law "NEVER e.key" because layouts shift; `useKeyDown.ts:27-31`
precedent):

| code | KeyA | KeyW | KeyS | KeyE | KeyD | KeyF | KeyT | KeyG | KeyY | KeyH | KeyU | KeyJ | KeyK |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| semitones from root | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |

13 keys = exactly one octave + root. Octave shift: KeyZ (-1),
KeyX (+1) - both verified free (audit #3; ComposeSurface's undo is
modifier-gated Cmd/Ctrl+Z only, :544-553).

COLLISION AUDIT (fork-3 requirement, every keydown site read this
session - section 0 #3): none of A W S E D F T G Y H U J K Z X is
bound today. The mapping ships without stealing ANY existing app
binding or browser shortcut. The only bound letter in the app is M
(melody mute, App:1363) - deliberately NOT in the mapping.

GUARD ORDER (PHASE-1-01, non-negotiable, pinned):
1. Typing guard FIRST: input/textarea/select/contentEditable ->
   return (the shipped predicate inline at App:1242-1247; duplicated
   4 lines in the hook - audit #14, no shared util exists, duty.ts
   precedent).
2. Modifier guard BEFORE any key branch: `metaKey || ctrlKey ||
   altKey` -> return (mirrors classifyTransposeKey:43 and the
   shipped :1308 law). Shift is NOT guarded: shift-while-playing is
   physically common on a QWERTY piano and no mapping key uses shift
   semantics (unlike the brackets' octave modifier - D14).
3. `e.repeat` -> return (auto-repeat would machine-gun note-ons at
   ~30/s; MIDI has no repeat concept, this is keyboard-specific).
4. THEN classify by e.code.

ACTIVATION GATE (the "always-on hijack" regression the task warns
about): the mapping is NOT always-on. It is armed iff ALL of:
- `storeModeForGate === null || === "etude"` (the study surface -
  the shipped predicate at App:477-479, audit #13; the on-screen
  input piano only exists there too),
- `practiceMechanics.noteInput.enabled` (opt-in toggle, default
  OFF - a user who never turns it on keeps byte-identical behavior;
  this is the anti-regression law),
- no blocking modal open (App's five flags: showImportExport,
  showLeadSheet, showChordInspector, showRecordingModal,
  showCheatsheet - all existing App state, audit #13).
The LatencyWizard is the ONE modal that does NOT disarm the
keyboard: it is a note-input CONSUMER in fallback mode (D141), and
its own source filter (section 0 #7) keeps the two calibration modes
honest. The five blocking modals keep the shipped Escape/close
behavior untouched.

WHY OPT-IN over auto-arm (alternatives rejected):
- (a) Always-on in study view: every stray F/G/H press plays audio
  for users who never asked for it; "M is bound, F is not" is a
  muscle-memory change to a shipped app - a regression class this
  repo treats as release-blocking. Rejected.
- (b) Auto-arm iff detection enabled + no MIDI device (pure PRD
  "fallback" reading): invisible coupling - the user cannot explain
  why keys sometimes play and sometimes don't; and it denies the
  surface to users who want to jam without detection. Rejected:
  explicit beats magical.
- (c) CHOSEN: one honest toggle in the Drills panel ("Keyboard /
  piano input"), persisted, default off, with the mapping hint text
  beside it. PHASE-1-02 satisfied: the affordance is the toggle,
  the keys, and the chips on the piano - all functional.

OCTAVE CONTROL (fork-3 sub-question: needed? where? persisted?):
YES - the 13-key span covers one octave; trumpet guide-tone ranges
sit above C4 for many paths. Root octave lives in
`practiceMechanics.noteInput.rootOctave` (2..5, default 4 -> root
MIDI 60 = C4; rootMidi = (rootOctave + 1) * 12; the K key tops at
C5=84, inside every voicing range). Affordances: visible "-"/"+"
buttons on the input piano (keyboard-free users; focusable,
aria-labeled) AND Z/X keys (power users). Persisted via the
practiceMechanics envelope (D143) - survives reload, defaults at
read for legacy payloads. WHY NOT the existing [ ] keys: they are
bound to GLOBAL TRANSPOSE (App:1328-1338) - reusing them would
conflate "shift the key of the song" with "shift my keyboard
octave", two different intents. Rejected.

KEY-UP / LOST-FOCUS: keyup -> noteoff (track held codes in a ref
set; unknown-keyup safety: only stop notes we started). window blur
-> release all held (stuck-note guard - the shipped keyAccess blur
law, PianoKeyboard.tsx:121, same doctrine).

### D140 (fork 4): on-screen surface = NEW `NoteInputPiano` component; the synesthesia PianoKeyboard stays a display, byte-untouched

DECISION: a new, purpose-built input surface, not an edit to the
370-line layer display. Evidence-based rejection of extension:
- PianoKeyboard.tsx is a SYNESTHESIA LAYER DISPLAY (chord/sound/bass
  ring stacks, :24-53, :229-256) whose press handlers feed audio +
  the recorder (App:4964-4977). Adding midin dispatch + key-letter
  chips + an octave control + touch-target sizing to it entangles
  two purposes in one component and puts the always-visible
  synesthesia display (used by e2e specs + the Record flow) at
  regression risk for an opt-in feature.
- Repo pattern (task + history): new components over editing
  display surfaces - S2 shipped PracticeMechanicsPanel NEW, S3
  shipped LatencyWizard NEW, both alongside existing UI.
- The geometry duplication is ~60 lines of white/black key math -
  cheaper than entanglement (duty.ts safeInt precedent).
- The display piano's clicks deliberately DO NOT dispatch midin
  (DO-NOT list): clicking the synesthesia display is playing/
  auditioning, not practicing-with-feedback. If the user wants
  scored input they use the input piano. One surface, one purpose,
  honest tooltips.

REQ-IO-6 TOUCH LAW (all pinned in NoteInputPiano.test.tsx + e2e
geometry leg; accessibility-expert will check):
- Pointer events ONLY (pointerdown/pointerup/pointercancel +
  lostpointercapture) - no mouse+touch duplication (the shipped
  display piano uses separate onMouse*/onTouch* pairs, :275-285;
  the input piano does not repeat that); `touch-action: none` on
  the key strip (CSS `touch-none`, the shipped class at :222).
- `setPointerCapture` on down so a slide-off still gets its up
  (no stuck notes); NO glissando (drag-across does not retrigger -
  decision, documented: gliss is a display effect, not a practice
  input; a future slice can add it).
- Min target: white keys >= 44px wide x 56px tall (WCAG 2.5.5 / the
  repo's honest-target law). 2 octaves = 14 white keys x 44 =
  616px minimum strip width; on narrower viewports the strip
  SCROLLS HORIZONTALLY (`overflow-x-auto`, snap-free, keyboard-
  reachable via the same focusable buttons) - shrinking below
  44px is BANNED, scrolling is the escape valve.
- No hover-only affordance: pressed state = `data-note-down="1"`
  attr + fill change (idle white -> `surface-2` + brand ring,
  existing tokens; NO new colors; Okabe-Ito stays reserved for
  detection verdicts so input feedback never conflates with
  scoring). Note-name label + key-letter chip always visible.
- A11y: each key is a `role="button"` `tabIndex=0` element with
  `aria-label="Play C4, keyboard key A"`; Space/Enter on a focused
  key plays (the shipped keyAccess pattern, PianoKeyboard.tsx:109-
  120 - reuse the LAW, not the file); the strip is
  `role="group" aria-label="Note input piano"`.

MOUNTING (placement question answered):
1. Study view: inside the existing piano card (App :4960-4984),
   ABOVE the synesthesia PianoKeyboard, rendered IFF
   `noteInput.enabled` (the toggle). Compact: 2 octaves from the
   root (root..root+24), h-24 (96px > 56px min). The first 13 keys
   carry the mapping letter chips (A W S E D F T G Y H U J K);
   the rest render plain. Octave "-"/"+" buttons flank the strip
   with the current root label ("Root C4").
2. LatencyWizard fallback mode: the SAME component, `compact` prop
   (root..root+12, 13 keys, letter chips), embedded in the roll
   screen - touch users can calibrate with their thumb; pointer
   taps emit through the bus and pair with the wizard's existing
   midin listener (zero new listener code).
3. NOT mounted: compose/etude-composer/explore/ear-training
   surfaces (DO-NOT list - each is a separate input integration,
   REQ-IO-3 territory, out of scope).

### D141 (fork 5): latency calibration = per-source offsets; LatencyRecord widened with defaults-at-read (no new K key)

The D134 cut premise (S3:404-406): "a keyboard-tap calibration
measures a path nothing in the app compares against". S4 resolves
the premise: keyboard/screen taps DO flow into detection (D138), so
the calibration is load-bearing. The orchestrator ruling (S3
open_for_orchestrator line 1113: "ratify the cut or schedule a
keyboard-input calibration as S4") lands here: calibration is
SCHEDULED and SHIPPED as this fork.

HONESTY ANALYSIS (why one shared number is a lie): a hardware MIDI
tap arrives via USB/BT + the MIDI stack (midiIn timestamp =
msg.timeStamp, hardware receive time); a keydown tap arrives via the
OS key-event pipeline; a touch tap arrives via the compositor +
input pipeline (typically the slowest and most variable). The
audible click path (browser output latency) is SHARED by all three
(same speakers, same ctx) - the INPUT paths differ. One
inputLatencyMs cannot compensate three paths; applying the MIDI
number to a keyboard tap is fake compensation (the exact dishonesty
class D134 rejected).

DECISION - storage shape (rides the EXISTING `practice.latency`
record; NO new K key; version stays 1; defaults-at-read):

```ts
export interface LatencyRecord {
  version: 1;
  /** MIDI-path input latency. S4: null = never calibrated via
   *  MIDI/manual-MIDI (a fallback-only record is legal). */
  inputLatencyMs: number | null;
  /** Browser output latency at LAST calibration (any source) -
   *  shared by all paths (same speakers). */
  outputLatencyMs: number;
  /** Discriminator for inputLatencyMs; IGNORED when it is null
   *  (a fallback-only save keeps source: "manual" - harmless). */
  source: "midi" | "manual";
  calibratedAtMs: number;   // last calibration time (any source)
  deviceName: string | null;
  /** S4 (D141): keyboard/touch tap path. null = uncalibrated
   *  (legacy records lack the keys -> normalize to null). */
  fallbackInputLatencyMs: number | null;
  fallbackCalibratedAtMs: number | null;
}
```

normalize law changes (practiceLatency.ts:37-54): `inputLatencyMs`
accepts finite 0..500 OR null; the two fallback fields accept
finite 0..500 OR null OR ABSENT (-> null). A legacy v1 record (all
fields present, no fallback keys) round-trips UNCHANGED - the no-
v5/migration-free law (audit #5 pattern). Two compensation getters,
each the single-sum law for its source:
`compensationOf(r)` = r.inputLatencyMs != null ? compensationMs(
r.inputLatencyMs, r.outputLatencyMs) : 0  (behavior for existing
records: IDENTICAL to shipped) and
`compensationOfFallback(r)` = r.fallbackInputLatencyMs != null ?
compensationMs(r.fallbackInputLatencyMs, r.outputLatencyMs) : 0.
Uncalibrated fallback = 0 (symmetric with MIDI-uncaibrated:
"uncalibrated runs uncompensated", the shipped panel law :606).

WIZARD (LatencyWizard.tsx, additive state machine change):
- New prop `noteInputEnabled: boolean`; new local state
  `tapSource: "midi" | "fallback"`.
- Source selector (two chips, `data-testid="wizard-source-midi"` /
  `"wizard-source-fallback"`) renders iff (gateOk ||
  noteInputEnabled); MIDI chip disabled (aria-disabled + honest
  title "no MIDI device - connect one or calibrate the keyboard")
  when !gateOk; fallback chip hidden when !noteInputEnabled.
  Default: gateOk ? "midi" : "fallback".
- Gate: fallback mode needs NO MIDI (the roll is driven by taps on
  the embedded piano / the computer keyboard - D139's wizard
  exception keeps the global listener live while the modal is up).
- onMidin SOURCE FILTER (one condition at the top of :216-246,
  pinned): mode "midi" ignores `isHseInputId(detail.inputId)`
  events (a stray keyboard tap can never poison a MIDI
  calibration); mode "fallback" accepts ONLY hse-* events.
- Fallback result/save: same median-minus-output math (the engine
  functions are source-agnostic - arrays in, number out); writes
  `fallbackInputLatencyMs` + `fallbackCalibratedAtMs` (merge with
  the existing record via loadLatency(); never clobber the MIDI
  fields). Manual entry in fallback mode writes the fallback pair
  (source stays "manual" semantics per field). deviceName for a
  fallback median: "Computer keyboard" / "On-screen piano" from the
  event's inputName (the wizard already captures tapNameRef,
  :241-243 - reuse).
- HONESTY COPY (fallback result screen): "Keyboard and touch taps
  share one calibration number - measure with the surface you will
  play on. The gap between the two is typically smaller than the
  timing tolerance." (True, and it says WHICH truth.)

DETECTOR (usePlayedCorrectly.ts, per-note compensation):
- New arg `fallbackCompensationMs: number | null`.
- On an hse-* event the buffered note carries the override:
  `{note, atMs, compensationMs: fallbackCompensationMs ?? 0}`;
  hardware notes carry none (engine uses the global value).
- Engine `PerformedNote` gains the optional field (additive, pure):

```ts
export interface PerformedNote {
  note: number;
  atMs: number;
  /** S4 (D141): per-note compensation override (ms). Present =
   *  subtract THIS instead of the global latencyCompensationMs
   *  (keyboard/touch taps carry their own measured path).
   *  undefined = use the global value. */
  compensationMs?: number;
}
```
  Law 4 amends to `compensated = atMs - (n.compensationMs ??
  latencyCompensationMs)` - a one-expression change in matchPhrase's
  compensation step, pinned by a borderline-flip test mirroring the
  shipped S3 load-bearing pin (the same tap matches under one
  source's number and misses under the other's).
- MIXED-SOURCE LAW (documented, not engineered around): a user who
  plays BOTH MIDI and keyboard in one pass gets per-note-correct
  compensation automatically - this is WHY the override is per-note
  instead of a global "active source" mode. No new store state.

### D142 (fork 6-sub): TD-057 ear-training dictation seam = stays OUT of S4

The task asks whether S4's input could be the "onset-capture input
source" TD-057 awaits (.kai/tech-debt/register.md:73). Adjudication:
NO, and the reasoning is about what "onset" MEANS:
- `dictationTimingOk(onsetErrorMs, slotMs, latencyMs)`
  (engine/ear-training/check.ts:102-112, unchanged) compares the
  onset of a PERFORMED note against a musical slot - it wants a
  student SINGING/PLAYING into a time window.
- Ear-training answers today are choice buttons + text tokens
  (audit #8: EarTrainingPanel.tsx:321-359). The click time of a
  multiple-choice answer is REACTION TIME to a decision, not a
  musical onset; feeding it through dictationTimingOk would score
  "how fast did you click" as "how well did you sing" - a category
  error, and the seam's second death (S3 audit #11) unchanged.
- S4's taps ARE performance onsets, but they enter a DIFFERENT
  comparison (the detection grid / the wizard's click train). The
  dictation flow has no click-train to compare against; wiring it
  would require a new sung/tapped-dictation ANSWER MODE (a feature,
  not a seam), which is out of every current REQ.
DECISION: seam stays reserved; TD-057 remains Open with refined
wording (Kai register edit, not this doc's): "ear-training timing
seam awaits a DICTATION-side onset source (sung-note capture or a
tap-in-time answer mode); S4's keyboard/piano inputs are
performance sources for detection/wizard and are NOT dictation
answers." No src/engine change.

### D143 (fork 3/6-documentation): config + storage + documentation shapes (no v5, no new K keys, frozen-test-safe)

CONFIG (rides the existing zustand field, the shipped defaults-at-
read law - audit #5):
```ts
// src/lib/practiceMechanics.ts ADDITION:
export interface NoteInputConfig {
  /** Opt-in arming of the keyboard mapping + input piano
   *  (REQ-IO-4/5). Default OFF: no letter ever sounds without the
   *  user turning this on (D139 anti-regression law). */
  enabled: boolean;
  /** Root octave for the A-W-S-E mapping, 2..5 (root MIDI =
   *  (rootOctave + 1) * 12; default 4 = C4 = 60). Persisted. */
  rootOctave: number;
}
// PracticeMechanicsConfig gains `noteInput: NoteInputConfig`;
// DEFAULT_MECHANICS gains { enabled: false, rootOctave: 4 };
// normalizePracticeMechanics defaults the MISSING sub-field at read
// (the detect-slice pattern, practiceMechanics.ts:145-163);
// structuredCloneDefault gains the copy. sessionStore.ts: ZERO
// EDITS (partialize already persists the whole object, audit #5).
```
STORAGE: zero new K keys. noteInput rides `hse.session` (v4
envelope, untouched); the fallback latency fields ride the existing
`practice.latency` record (D141). storage.ts: ZERO edits.

DOCUMENTATION LAW (PHASE-1-02 + the frozen-pin discovery, audit
#10): the mapping must be discoverable, but `SHORTCUTS` chips for
A/W/S/... would BREAK the frozen `tests/keyboard-shortcuts.test.ts`
reverse check (:102-104 - every chip must appear in the test's
hardcoded HANDLED_KEYS, which cannot be edited). The D14 precedent
ships the answer: the cheatsheet FOOTER prose (the editable,
un-pinned zone, :152-155) gains one sentence, and the piano surface
itself carries the letter chips (the primary affordance - the user
sees "A" on the key they're told to press):
- Footer addition (ASCII, appended to the existing footer line):
  "Piano keys (study view, when Keyboard / piano input is on):
  A W S E D F T G Y H U J K play one octave from the root;
  Z / X shift the octave."
- Panel note-input section carries the same hint text inline.
The new keydown behavior lives in a SEPARATE listener (useNoteInput),
NOT the App handler - the frozen test never reads code (static
mirror, its own header :7-15), and the cheatsheet's own comment
records this exact class of constraint. No test edits, no pin moves.

### D144 (parent-stance reversal, numbered per the task rule): REQ-IO-4/5/6 ARE pulled into Phase 7 as Slice 4

The parent (docs/PHASE-7-PRACTICE.md ~:405) parked the input
surfaces: "they are NOT detection surfaces and are NOT pulled into
Phase 7 scope; flagged in risks." REVERSED, with evidence:
1. The stated premise is stale: "PianoKeyboard needs press
   handlers" - FALSE, they shipped and are wired (audit #1). The
   remaining gap (seam into the note pipeline) is ~40 lines of
   emitter code riding a shipped event contract (D137), not the
   construction project the parent imagined.
2. The PRD's own Phase 7 rollout line (docs/PRD-001.md:974-980)
   lists "Web MIDI input + on-screen piano + computer keyboard"
   INSIDE Phase 7 - the parent parked what the PRD scheduled.
3. The orchestrator ruled: S4 is scheduled (task brief), and the
   S3 open item ("ratify the cut or schedule a keyboard-input
   calibration as S4") is resolved by D141 shipping that
   calibration.
4. S3's detection is source-AGNOSTIC by construction (D121
   lineage) - feeding it the fallback sources costs one gate line
   (D138) and one engine field (D141). Parking it further would
   leave REQ-IO-4/5 (P0/P1) permanently unshipped while the
   cheapest possible integration sits idle.
Confidence: HIGH (every leg stands on file:line evidence above).

---

## 3. ENGINE / API TYPE DEFINITIONS (copyable)

### 3.1 src/hooks/useKeyDown.ts ADDITION (pure, DOM-free - the parent's own proposed seam, now specified)

```ts
/** S4 (REQ-IO-5, D139): computer-keyboard note mapping. PURE, no DOM
 *  reads beyond the event fields; matched by e.code (physical
 *  position, the D14 law - NEVER e.key). */
export type NoteKeyAction =
  | { kind: "note"; semitones: number }   // 0..12 from the root
  | { kind: "octave"; delta: 1 | -1 };    // Z down, X up

/** A W S E D F T G Y H U J K = 0..12 semitones (one octave + root). */
export const NOTE_KEY_SEMITONES_BY_CODE: Readonly<Record<string, number>> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6,
  KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12,
};

/** Returns null when meta/ctrl/alt is held (PHASE-1-01 guard FIRST,
 *  before any key branch - same law as classifyTransposeKey:43),
 *  when the code is unmapped, or on non-key input. Shift is
 *  DELIBERATELY not guarded (D139): no mapping key uses shift
 *  semantics and shift-while-playing is physically common. */
export function classifyNoteKey(
  e: Pick<KeyboardEvent, "code" | "metaKey" | "ctrlKey" | "altKey">,
): NoteKeyAction | null;
```

### 3.2 src/lib/noteInputBus.ts (new, tiny, jsdom-tested)

```ts
/** S4 (D137): the synthetic note source. Dispatches the SAME window
 *  "midin" CustomEvent midiIn dispatches for hardware (midiIn.ts:167,
 *  detail shape midiIn.ts:30-38) so every shipped consumer -
 *  detector, wizard, IN picker - sees fallback input with zero
 *  plumbing. NO audio here: audio/recorder/visual state stay with
 *  the callers (App wiring, wizard) - this module owns ONLY the
 *  event contract. */
export type NoteInputSource = "keyboard" | "screen";

/** inputId sentinels (D137): "hse-keyboard" | "hse-screen". */
export function hseInputId(source: NoteInputSource): string;
export function isHseInputId(inputId: string | undefined): boolean;

/** Dispatch one synthetic note event. Laws (pinned):
 *  - detail.channel is ALWAYS 0 (never bass-excluded, audit #9);
 *  - velocity 100 on noteon, 0 on noteoff;
 *  - timestamp = performance.now() (the hardware domain, midiIn:156);
 *  - inputName "Computer keyboard" | "On-screen piano";
 *  - NEVER throws when window/CustomEvent are absent (midiIn's own
 *    try/catch philosophy, midiIn.ts:166-171). */
export function emitNoteInput(midi: number, down: boolean,
                              source: NoteInputSource): void;
```

### 3.3 src/hooks/useNoteInput.ts (new, thin adapter - wiring only)

```ts
/** S4 (D139): the global computer-keyboard note listener. Mounted
 *  ONCE in App; armed iff `enabled` (study surface + toggle + no
 *  blocking modal - the CALLER composes that, the hook just obeys).
 *  Guard order is law (PHASE-1-01): typing guard -> modifier guard
 *  (inside classifyNoteKey) -> e.repeat guard -> classify. */
export interface UseNoteInputArgs {
  enabled: boolean;
  rootOctave: number;                       // 2..5 (persisted)
  /** Play/stop audio + recorder + live-note visuals (App-owned;
   *  the hook never imports audioEngine). */
  onNote: (midi: number, down: boolean) => void;
  onOctaveShift: (delta: 1 | -1) => void;   // Z / X
}
export function useNoteInput(args: UseNoteInputArgs): void;
```
Internals (all pinned behaviors): keydown -> guards ->
classifyNoteKey -> note: `onNote(rootMidi + semitones, true)` +
`emitNoteInput(..., "keyboard")` (the CALLER's onNote does audio;
the hook dispatches the bus event - one emit site per surface);
octave: `onOctaveShift(delta)`; keyup -> noteoff ONLY for codes the
hook started (ref Set); window blur -> release all; repeat-guarded;
StrictMode: add/removeEventListener exact inverses; zero setState
in the hook (it owns no state - the octave lives in the store).
`preventDefault()` on handled keys ONLY (never on unhandled - the
existing handler's fall-through behavior is byte-preserved).

### 3.4 src/components/NoteInputPiano.tsx (new, presentational)

```ts
/** S4 (REQ-IO-4/6, D140): the touch-friendly input piano. Pointer
 *  events ONLY; min 44x56px white keys; horizontal scroll on narrow
 *  viewports (shrinking is BANNED); letter chips on the first 13
 *  keys when `keyLabels` is provided; NO hover-only affordance. */
export interface NoteInputPianoProps {
  rootMidi: number;                 // (rootOctave + 1) * 12
  octaves?: number;                 // default 2 (study), 1 (wizard)
  keyLabels?: Record<number, string>; // midi -> "A".. (ASCII chips)
  /** Down AND up arrive here; the PARENT decides (App callback /
   *  wizard callback) - this component owns no audio, no bus. */
  onNote: (midi: number, down: boolean) => void;
  onOctaveShift?: (delta: 1 | -1) => void;  // renders +/- when set
  compact?: boolean;                // wizard variant
}
```
DOM contract (section 7.1): `data-testid="note-input-piano"`, per
key `data-note={midi}` `data-note-down={"1"|absent}`
`data-key-label`, `role="button"`, `aria-label="Play C4, keyboard
key A"`, focusable, Space/Enter play law (the shipped keyAccess
pattern).

### 3.5 engine/practice/detect.ts ADDITION (additive, purity kept - ZERO imports)

```ts
export interface PerformedNote {
  note: number;
  atMs: number;
  /** S4 (D141): per-note compensation override (ms); undefined =
   *  use the global latencyCompensationMs. */
  compensationMs?: number;
}
```
Law 4 (amended, pinned): `compensated = atMs - (n.compensationMs ??
latencyCompensationMs)`. Everything else in detect.ts is byte-
identical. No engine file is ADDED -> purity floor stays 56
(audit #15).

### 3.6 src/lib/practiceLatency.ts WIDENING (D141)

```ts
export interface LatencyRecord {
  version: 1;
  inputLatencyMs: number | null;            // S4: null = uncalibrated MIDI
  outputLatencyMs: number;
  source: "midi" | "manual";                // discriminator for the MIDI field
  calibratedAtMs: number;
  deviceName: string | null;
  fallbackInputLatencyMs: number | null;    // S4: keyboard/touch path
  fallbackCalibratedAtMs: number | null;    // S4
}
export function compensationOf(r: LatencyRecord | null): number;
            // MIDI field; null/absent -> 0 (shipped behavior unchanged)
export function compensationOfFallback(r: LatencyRecord | null): number;
            // fallback field; null/absent -> 0 (symmetric honesty law)
```
normalize: legacy records (no fallback keys, numeric inputLatencyMs)
round-trip byte-equal; garbage fallback -> null (never a fake 0);
version stays 1 (defaults-at-read, no migration, no v5).

### 3.7 src/hooks/usePlayedCorrectly.ts ADDITIONS (thin)

```ts
// args gains:
  fallbackInputEnabled: boolean;    // the note-input toggle (D138 gate half 2)
  fallbackCompensationMs: number | null;  // compensationOfFallback(record)
// return gains:
  sawFallback: boolean;             // first hse-* note-on ever observed
// changed lines (exact):
  unavailable = !midiInAvailable() && !fallbackInputEnabled;   // :117 edit
  hasDevice flips ONLY for !isHseInputId(detail.inputId);      // :300-303 edit
  hse notes push {note, atMs, compensationMs: fb ?? 0};        // buffer push edit
```
Bass exclusion: UNCHANGED (channel 0 sentinel can never match a
1..16 bass setting - audit #9; no code needed).

---

## 4. DATA FLOW (one fallback note, end to end)

```
KEYBOARD PATH                                    SCREEN PATH
study view + noteInput.enabled                   NoteInputPiano pointerdown
+ no blocking modal + not typing                 (study card or wizard roll)
  keydown "a" (e.code KeyA)                       + setPointerCapture
  -> meta/ctrl/alt? no -> e.repeat? no
  -> classifyNoteKey -> {note, 0}
  -> App onNote(60, true)                        -> parent onNote(60, true)
     audioEngine.playNote + midiOut.playNote        (same trio; wizard: audio
     + recorder.recordNoteOn + activeMidis          + click bus only, no take)
  -> emitNoteInput(60, true, "keyboard")         -> emitNoteInput(60, true, "screen")
     detail {note:60, velocity:100, type:"noteon", channel:0,
             inputId:"hse-*", timestamp:performance.now()}
        |
        +--> MidiInPicker (:64): IN chip flashes note activity "C4 v100 - ch0" (honest sentinel)
        +--> LatencyWizard (:257): fallback mode accepts hse-* only; midi mode
        |    ignores them (D141 filter) -> greedy pair -> median -> fallback fields
        +--> usePlayedCorrectly (:325): buffer push {note, atMs,
             compensationMs: fallbackComp ?? 0}  [hse]  |  {note, atMs} [hw]
             ... boundary flush (UNCHANGED rAF/D129 law) ->
             matchPhrase: compensated = atMs - (comp ?? global)   [D141 law 4]
             -> per-bar overlay / verdict / ramp auto-rep  [ALL UNCHANGED]
keyup / blur / pointerup / pointercancel -> noteoff (symmetric release)
[detection NEVER writes transport - TD-052 pin byte-untouched]
```

---

## 5. EXACT FILE PLAN (E edit / N new; complete manifest for directory staging - GIT-001)

```
E src/hooks/useKeyDown.ts               classifyNoteKey + NOTE_KEY_SEMITONES_BY_CODE (3.1)
E src/hooks/useKeyDown.test.ts          ~10 its (file ALREADY in JSDOM_FILES :20)
N src/lib/noteInputBus.ts               emitNoteInput + isHseInputId (3.2)
N src/lib/noteInputBus.test.ts          jsdom: detail-shape/sentinel/no-throw (JSDOM_FILES)
N src/hooks/useNoteInput.ts             global listener + guard stack (3.3)
N src/hooks/useNoteInput.test.ts        jsdom: guards/emit/release/blur (JSDOM_FILES)
N src/components/NoteInputPiano.tsx     input surface, pointer events (3.4)
N src/components/NoteInputPiano.test.tsx jsdom: press/chips/a11y/octave (AUTO-GLOB :14, no config edit)
E engine/practice/detect.ts             PerformedNote.compensationMs? + law 4 (3.5) - ONLY
E engine/practice/detect.test.ts        +3 its (override/borderline/undefined-default)
E src/hooks/usePlayedCorrectly.ts       gate line + hasDevice hw-only + sawFallback + hse stamp (3.7)
E src/hooks/usePlayedCorrectly.test.ts  +4 its
E src/lib/practiceLatency.ts            record widening + compensationOfFallback (3.6)
E src/lib/practiceLatency.test.ts       +6 its (legacy roundtrip = the no-migration pin)
E src/lib/practiceMechanics.ts          noteInput slice + normalize + default (D143)
E src/lib/practiceMechanics.test.ts     +3 its (missing-key default = the no-v5 pin; octave clamp)
E src/components/LatencyWizard.tsx      source selector + filter + embedded piano + fallback save merge
E src/components/LatencyWizard.test.tsx +6 its
E src/components/PracticeMechanicsPanel.tsx   note-input section + D138 copy + two latency rows
E src/components/PracticeMechanicsPanel.test.tsx +5 its
E src/components/PracticeHeader.tsx     forward noteInput props to panel + wizard (existing pass-through pattern :2855-2887)
E src/components/KeyboardShortcutsCheatsheet.tsx FOOTER PROSE ONLY (D143 - NO SHORTCUTS chips, frozen pin)
E src/App.tsx                           useNoteInput mount, handleNoteInput callback (audio trio + bus),
                                        modal/study gate flags (existing state), NoteInputPiano section,
                                        detection args (fallbackInputEnabled/fallbackCompensationMs),
                                        wizard/panel prop pass-through. ~100-120 lines, ZERO handler hunks
E vitest.config.ts                      JSDOM_FILES += noteInputBus.test.ts, useNoteInput.test.ts
N e2e/practice-inputs.spec.ts           4 legs (section 8.2)
E docs/PRACTICE-MECHANICS.md            S4 input-surfaces section
E docs/TERMINOLOGY.md                   "note source" / "fallback input" / hse-* sentinel law
```

NOT touched (hard): `tests/**` (byte-frozen; the it( 362 gate),
`src/components/PianoKeyboard.tsx` (display stays display - D140),
`src/lib/midiIn.ts` / `midiOut.ts` (the seam is consumed, never
widened in-place), `src/state/sessionStore.ts` (noteInput rides
partialize - audit #5), `src/lib/storage.ts` (zero new keys - D143),
`src/App.tsx:1238-1380` the sacred handler (ZERO new hunks - the
note keyboard is a SEPARATE listener), `engine/practice/{duty,ramp,
windows,session,latency}.ts`, rhythm/backing/playbackClock, the
guideTone family, `engine/ear-training/**` (D142), EarTrainingPanel,
Compose/Explore/Etude surfaces, README/SPEC/AGENTS (no pinned number
moves), `.kai` (Kai-only).

---

## 6. TEST PLAN

### 6.1 Unit (node env unless noted; colocated; suite 2598 -> ~2644 / 1 skipped / 0 failed)

- useKeyDown.test.ts (+10): classifyNoteKey - every mapped code
  returns its semitone (table-driven, 13 its collapsed to 2);
  meta/ctrl/alt -> null BEFORE key match (the PHASE-1-01 pin -
  assert a metaKey+KeyA returns null); shift PASSES (D139); unmapped
  -> null; KeyZ/KeyX octave; e.key NEVER consulted (fixture with
  mismatched key/code).
- noteInputBus.test.ts (jsdom, ~6): detail shape EXACTLY matches the
  midiIn.ts header contract (field-by-field pin - the anti-drift law
  vs audit #2's shape); channel 0; velocity 100/0; inputId prefix;
  isHseInputId(undefined) -> false; no-throw without CustomEvent.
- useNoteInput.test.ts (jsdom, ~10): armed iff enabled (listener
  add/remove counts); typing guard (dispatch on an input target ->
  no emit); modifier guard (metaKey -> no emit, no preventDefault);
  e.repeat -> single noteon; keydown/keyup pairing (noteoff only for
  started notes); blur releases all; octave action calls
  onOctaveShift, NOT onNote; handled key preventDefault, unhandled
  key untouched.
- NoteInputPiano.test.tsx (jsdom, ~8): pointerdown/up emit (capture
  + release); pointercancel = release; letter chips render; octave
  buttons render iff callback; aria-labels; data-note-down toggles;
  Space/Enter on focused key plays; NO onMouse*/onTouchStart handlers
  present (pointer-only law - grep the element props).
- detect.test.ts (+3): compensationMs override flips a borderline
  tap matched->missed when the override differs from the global
  (the D141 load-bearing pin, mirrors the S3 law-4 pin); undefined
  override == global behavior byte-identical (regression pin);
  override 0 respected (NOT treated as absent - the ?? law).
- practiceLatency.test.ts (+6): legacy record (no fallback keys)
  normalizes with fallback null (the no-migration pin); inputLatencyMs
  null accepted; garbage fallback -> null never 0;
  compensationOfFallback(null record)=0, (uncalibrated)=0,
  (calibrated)=input+output clamp law; save/load roundtrip with both
  fields.
- practiceMechanics.test.ts (+3): missing noteInput key -> default
  {false, 4} (the no-v5 pin); octave garbage -> clamped 2..5;
  enabled non-boolean -> false.
- usePlayedCorrectly.test.ts (+4): hse-* event flows into the buffer
  WITH compensationMs stamped; hardware event flows WITHOUT override
  (deep-equal pin); hasDevice stays false on hse-only, sawFallback
  true; unavailable false when fallbackInputEnabled && no API (the
  D138 gate pin).
- LatencyWizard.test.tsx (+6): source selector renders iff
  (gateOk || noteInputEnabled); fallback mode pairs synthetic hse
  midin events (fake-timer roll - the shipped pattern); MIDI mode
  IGNORES hse-* (the poison-guard pin); fallback save merges (MIDI
  fields survive); manual entry in fallback writes fallback fields;
  embedded piano present in fallback roll.
- PracticeMechanicsPanel.test.tsx (+5): note-input toggle emits
  complete config; D138 copy states (unavailable-with-fallback text,
  fallback-silent text, hw text byte-identical); two latency rows
  render (MIDI + keyboard/piano, uncalibrated honest zeros);
  detect-toggle enabled when fallback on + no API (the widened gate).
- sessionStore.test.ts (+1): noteInput survives persist roundtrip,
  envelope STILL v4 (the no-v5 store pin).

### 6.2 e2e boundary (Playwright; 30 -> 34 tests, 13 -> 14 specs)

Real keyboard/touch in headless Chromium: FULLY POSSIBLE (unlike
MIDI - `page.keyboard.press` dispatches trusted keydown/keyup). The
positive legs therefore drive the REAL app path end-to-end (user key
-> app listener -> bus -> detector), not injection - strictly
stronger than S3's seam injection.

e2e/practice-inputs.spec.ts, 4 legs:
1. KEYBOARD -> DETECTION (positive, real transport): boot -> open
   Drills -> enable note-input toggle -> enable detection -> Play at
   240 BPM -> `page.keyboard.down("a")`/`up` on a ~120ms cadence
   (KeyA = root = pc 0 = expected in bar 1 of the boot path - the
   S3 spec's pinned boot facts) -> `expect.poll` summary
   `data-notes-hit >= 1` AND some cell shows `data-match`.
   DISCRIMINATIVE BREAK-GUARD: on the pre-S4 build the toggle does
   not exist (locator timeout) AND KeyA is inert -> leg FAILS.
   (Flake law: monotonic counters only, 15s budgets, no per-bar
   attribution - the shipped TD-CI-E2E-FLAKE discipline.)
2. ON-SCREEN PIANO (positive + geometry): enable note-input ->
   `note-input-piano` visible -> pointer-tap a key (locator
   `.click()` = trusted pointer events) -> notes-hit moves (same
   poll). THEN assert white-key boundingBox width >= 44 && height >=
   56 (REQ-IO-6, deterministic layout math - not a timing assert).
   FAILS pre-S4 (no such surface).
3. PERSISTENCE + GUARD (deterministic): enable toggle, shift octave
   +1 -> reload -> toggle still on, root label shifted (envelope
   roundtrip). Then Cmd+A (Meta held) while playing -> the piano's
   `data-note-down` never appears and notes-hit does NOT move
   (modifier guard proven in a REAL browser, not just unit).
   FAILS pre-S4.
4. WIZARD FALLBACK (no MIDI device - headless default): open
   Calibrate -> source "Keyboard / piano" selectable -> roll screen
   shows the embedded piano -> manual fallback entry 37ms -> Save ->
   reload -> panel shows the "Keyboard/piano: 37 ms" row AND the
   MIDI row still reads uncalibrated (merge law). ZERO timing
   involved (the median-of-16 math is unit-pinned with fake timers -
   e2e never races a click train). FAILS pre-S4 (no source selector).

### 6.3 Manual checklist (truths no bot can prove)

- [ ] Real laptop keyboard, phone (touch), and tablet: tap latency
      feels immediate; no stuck notes after app-switch (blur release).
- [ ] MIDI + keyboard MIXED session: both score, each with its own
      calibrated offset (play a deliberately-late keyboard note vs an
      on-time MIDI note - the buckets separate them).
- [ ] Cmd/Ctrl/Alt + A/W/S everywhere: browser tab-switch/select-all
      unaffected; typing in ANY field (explore seed, compose charts,
      wizard ms entry) never sounds a note.
- [ ] Detection off + note-input on: piano plays audio, IN chip
      flashes, nothing scores (source vs detector independence).
- [ ] Loopback rig (midiOut -> controller -> midiIn): documented
      double-count edge (section 9 risk row) - verify behavior is
      at worst a doubled note-on, never a crash.
- [ ] Existing bindings regression: M still mutes, Space still
      toggles, [ ] still transpose, , . still tempo, 1/2/3 still
      switch modes - with note-input ENABLED (collision audit re-
      checked by hand).

---

## 7. INTERFACE CONTRACTS

### 7.1 DOM / testids (e2e + a11y)
- Panel: `noteinput-toggle` (checkbox), `noteinput-hint` (mapping
  text), existing `detect-toggle`/`detect-unavailable`/
  `detect-status` ids kept.
- Piano: `note-input-piano` (group), `note-key-<midi>` per key
  (`data-note`, `data-note-down`, `data-key-label`),
  `noteinput-octave-down` / `noteinput-octave-up` (aria-labeled
  buttons, ASCII "-"/"+"), `noteinput-root-label` ("Root C4").
- Wizard: `wizard-source-midi` / `wizard-source-fallback` (chips,
  aria-pressed), `wizard-piano` (embedded NoteInputPiano instance),
  existing ids kept.
- Panel latency rows: `latency-record` (existing id kept - the MIDI
  row), `latency-record-fallback` (new).

### 7.2 Copy (VERBATIM obligations, ASCII)
- Panel unavailable (replaces PracticeMechanicsPanel.tsx:473-475):
  "Needs a note source - this browser has no Web MIDI API and
  keyboard / piano input is off. Turn on Keyboard / piano input
  above to arm detection with the computer keyboard and on-screen
  piano."
- Panel status, armed fallback-only, nothing played:
  "No MIDI input - detection will score your computer keyboard and
  on-screen piano."
- Panel status, fallback notes observed:
  "Scoring keyboard / piano input - MIDI hardware stays welcome
  (hot-plug just works)."
- Panel status, API-no-device: SHIPPED string byte-identical
  (:485-486).
- Note-input section hint: "Keys A W S E D F T G Y H U J K play one
  octave from the root; Z / X shift the octave. The on-screen piano
  works with touch."
- Wizard fallback roll: "Tap the piano below (or type the A-W-S-E
  mapping) on every click."
- Wizard fallback honesty: "Keyboard and touch taps share one
  calibration number - measure with the surface you will play on.
  The gap between the two is typically smaller than the timing
  tolerance."
- Panel fallback latency row: "Keyboard/piano: 37 ms - calibrated
  1d ago" / "Keyboard/piano: uncalibrated - keyboard notes run
  uncompensated (0 ms)".
- Cheatsheet footer (appended sentence, D143): "Piano keys (study
  view, when Keyboard / piano input is on): A W S E D F T G Y H U J K
  play one octave from the root; Z / X shift the octave."

### 7.3 Terminology (docs/TERMINOLOGY.md addition, verbatim intent)
"NOTE SOURCE: anything that feeds the window 'midin' seam - Web MIDI
hardware (inputId = device id) or fallback input (inputId =
'hse-keyboard' / 'hse-screen', channel 0 sentinel). FALLBACK INPUT:
the computer-keyboard mapping + on-screen NoteInputPiano (REQ-IO-4/5).
The synesthesia PianoKeyboard is a DISPLAY + audition surface, not a
note source (D140)."

---

## 8. IMPLEMENTATION ROADMAP (ordered, atomic)

1. [ ] useKeyDown.ts classifyNoteKey + test (+10 its) - 1.5h - deps: none
2. [ ] noteInputBus.ts + test (JSDOM_FILES += it) - 2h - deps: none
3. [ ] practiceMechanics noteInput slice + normalize + tests (+3) - 1.5h - deps: none
4. [ ] practiceLatency widening + compensationOfFallback + tests (+6) - 2h - deps: none
5. [ ] detect.ts compensationMs? + law 4 + tests (+3); purity floor UNCHANGED - 1.5h - deps: none
6. [ ] useNoteInput.ts + test (JSDOM_FILES += it) - 3h - deps: 1,2
7. [ ] NoteInputPiano.tsx + test (auto-glob) - 4h - deps: 2
8. [ ] usePlayedCorrectly widenings (gate/hasDevice/sawFallback/stamp) + tests (+4) - 2.5h - deps: 4,5
9. [ ] App wiring: hook mount + gate flags + handleNoteInput trio + piano section + detection args - 3h - deps: 3,6,7,8
10.[ ] Panel: note-input section + D138 copy + latency rows + tests (+5) - 3h - deps: 3,4,8
11.[ ] Wizard: source selector + filter + embedded piano + fallback save merge + tests (+6) - 3.5h - deps: 2,4,7
12.[ ] Header prop pass-through + cheatsheet footer + PracticeHeader test touch - 1h - deps: 10,11
13.[ ] e2e practice-inputs.spec.ts (4 legs) + break-guard run on pre-S4 build - 3h - deps: 9,10,11
14.[ ] docs (PRACTICE-MECHANICS, TERMINOLOGY) + release notes + full gate order - 1.5h - deps: all

Total: ~32h (implementation ~21h, tests ~9h incl. e2e, docs ~1.5h;
S3's 46.5h was 15 REQs - S4 is 3 REQs + 1 adjudicated calibration
fork, so this is the right order of magnitude).

---

## 9. RISKS

| Risk | P | I | Mitigation |
|---|---|---|---|
| Frozen cheatsheet reverse-pin broken by a new chip (audit #10) | med | high | D143: SHORTCUTS array FROZEN BY LAW - footer prose only; checklist item asserts the array is byte-identical (`git diff` on the array region) |
| Letter-key regression class (a future binding collides with the mapping) | low | med | collision table (section 0 #3) + useNoteInput guard pins + manual regression list 6.3; mapping lives in ONE table (NOTE_KEY_SEMITONES_BY_CODE) |
| Keyboard auto-repeat storm (30 noteons/s poisoning the buffer) | med | med | e.repeat guard (unit-pinned); BUFFER_CAP 512 already shipped (usePlayedCorrectly:96) |
| Stuck notes (keyup lost to window switch / modal steal) | med | low | blur-release + pointercancel/lostpointercapture + the shipped keyAccess doctrine; pinned in both tests |
| MIDI-loopback double-count (midiOut.playNote -> controller -> midiIn hardware event for a keyboard-initiated note) | low | low | documented edge (manual item 6.3); mitigation option left open: drop midiOut from the fallback trio (orchestrator call - open item) |
| hasDevice/sawFallback confusion regressions (status line lies) | med | low | hw-only hasDevice pin + sawFallback one-shot (mirrors the shipped pattern); panel copy tests cover all four states |
| Fallback-only record breaks a legacy consumer reading inputLatencyMs as number | low | med | TS widening forces tsc to flag every read (lint gate); compensationOf null-guard shipped same commit; panel row guards null explicitly |
| e2e keyboard-cadence flake (leg 1) | med | med | pigeonhole law from S3 (120ms cadence vs 240ms window), monotonic counters, 15s budgets; if flaky, leg 1 degrades to leg 2's pointer-tap path (same seam, slower cadence tolerance) - documented fallback, not a silent skip |
| Touch targets fail on real phones (44px law vs 2-octave strip) | low | med | horizontal scroll (never shrink); geometry asserted in e2e leg 2; manual 6.3 |
| App.tsx grows again (~5128 lines; S4 adds ~110) | high | med | all logic in hook/lib/component; App gains wiring only; sacred handler byte-identical (checklist grep) |
| Wizard fallback roll flaky under CI timers (fake-timer only) | low | low | median path is UNIT-only (fake timers, LatencyWizard.test); e2e leg 4 is manual-entry deterministic |
| Detection armed via fallback but user expects MIDI-only scoring (keyboard "cheating") | low | low | explicit opt-in toggle + honest status copy names the source; per-source compensation keeps timing honest (D141) |

---

## 10. DO-NOT LIST (fork 6: scope boundary, decided not drifted)

- NO MIDI device-list work (REQ-IO-1 SHIPPED - audit #16).
- NO note-capture utility (the hook buffer IS it - S3 audit #14).
- NO compose / etude-input / Explore-chord / ear-training MIDI
  integrations (REQ-IO-3's remaining list - each is its own slice;
  S4's seam makes them cheap later, that is the point).
- NO ear-training dictationTimingOk wiring (D142 - TD-057 stays open).
- NO edits to PianoKeyboard.tsx, sessionStore.ts, storage.ts,
  midiIn.ts, tests/**, README/SPEC/AGENTS; no count-pin moves
  (tunesCount 40, curatedBriefingCount 12, it( 362, persona counts).
- NO SHORTCUTS chips for the new keys (frozen reverse pin - D143).
- NO new engine source files, NO purity-floor raise (56 stays -
  audit #15); NO new K.* keys (D143).
- NO zustand v5, NO envelope version bump, NO migration step.
- NO glissando / velocity-curve / aftertouch / sustain-pedal
  semantics (onset-only matching is the shipped law).
- NO spacebar-as-note (Space is playback toggle, App:1356 - the
  D134 spacebar idea stays dead; the mapping is AWSED only).
- NO PRD file edits (orchestrator owns docs/PRD-001.md; the
  REQ-PRAC-54 erratum is an open item).

---

## 11. CHECKLIST (gate order; CI mirrors)

1. [ ] `npm run lint` (tsc - the LatencyRecord null-widening must flag every read)
2. [ ] `npm test` -> ~2644 / 1 skipped / 0 FAILED; `git diff --name-only -- tests/` EMPTY; it( stays 362
3. [ ] `npm run build` (RNN config first, then main - both pass)
4. [ ] `node assets/check-links.cjs` -> 362 frontend + 29 backend; persona/tune counts unmoved
5. [ ] `npm run check:paths` -> 36/36 OK (no path data touched)
6. [ ] `npm run test:e2e` after build: 30 -> 34 green
7. [ ] BREAK-GUARD: stash the diff, run leg 1 + leg 2 on the pre-S4
      build -> both FAIL (toggle absent); restore -> both green
8. [ ] Purity: `engine/purity.test.ts` floor STAYS 56 (no new engine
      files); detect.ts diff is additive-only (one optional field,
      one ?? expression)
9. [ ] Sacred-handler byte-proof: `git diff src/App.tsx` shows ZERO
      changes in the :1238-1380 handler region
10.[ ] Frozen-cheatsheet proof: the `SHORTCUTS` array region of
      KeyboardShortcutsCheatsheet.tsx is byte-identical (footer div
      may change); `npm test` proves tests/keyboard-shortcuts green
11.[ ] JSDOM_FILES gained EXACTLY: noteInputBus.test.ts,
      useNoteInput.test.ts (NoteInputPiano.test.tsx is auto-globbed)
12.[ ] No console.log/info/debug in new src; no any; ASCII in all new
      code strings + copy (grep the diff for non-ASCII - PM-2026-009-004)
13.[ ] StrictMode audit: useNoteInput + bus + wizard listeners each
      have exact inverses; held-notes Set per-mount, never module-level
14.[ ] TD-052 read-only re-pin: usePlayedCorrectly diff adds NO
      transport writes (the grep gate from S3 section 9 item 8, re-run)
15.[ ] Kai register: TD-057 wording refined (D142); loopback edge
      noted; PRD REQ-PRAC-54 erratum tracked

---

## 12. RELEASE NOTES (S4)

1. Computer-keyboard playing: turn on "Keyboard / piano input" in
   the Drills panel and the home-row keys A W S E D F T G Y H U J K
   play one octave from a movable root (Z / X shift octaves,
   persisted). No MIDI interface needed.
2. On-screen input piano: a touch-friendly piano appears above the
   color keyboard in the study view (44px+ targets, works with a
   finger or a mouse) - and inside the calibration wizard.
3. Detection now accepts fallback input: with no Web MIDI in your
   browser, played-correctly scoring arms from the keyboard/piano
   instead (the old "requires Web MIDI" notice explains the new
   option). MIDI stays first-class when present.
4. Latency calibration per input: the wizard can now measure your
   keyboard/touch tap path separately from a MIDI controller
   (keyboard calibration is now meaningful - keyboard notes feed
   detection). Both numbers persist side by side; uncalibrated
   sources run uncompensated, honestly.
5. The colorful synesthesia keyboard is unchanged - it is a display
   and audition surface; the new input piano is the practice-input
   surface. Two keys, two purposes.

---

## 13. HANDOFF

```yaml
HANDOFF_TO_DEVELOPER:
  from: "@architect"
  to: "@developer (via @engineering-team)"
  timestamp: "2026-09-28"
  deliverables:
    - name: "docs/PHASE-7-S4-INPUTS.md"
      status: complete
      sections: re-audit (16 sites, shipped-code verified, 3 parent/task
        claims found FALSE), D137..D144 (6 crux forks + TD-057
        adjudication + parent-stance reversal), type definitions
        (classifyNoteKey / noteInputBus / useNoteInput / NoteInputPiano /
        detect + latency widenings), data flow, file plan, test plan
        (unit + 4 real-input e2e legs with break-guard), checklist,
        risks, DO-NOT, release notes
  constraints:
    - "tests/** byte-frozen; 2598/1/0 -> ~2644/1/0 ZERO failures; it( stays 362; SHORTCUTS array byte-identical (frozen reverse pin, audit #10)"
    - "sacred handler (App.tsx:1238-1380): ZERO new hunks - the note keyboard is a SEPARATE listener (useNoteInput)"
    - "engine purity: NO new engine files (floor stays 56); detect.ts edit is additive-only (PerformedNote.compensationMs? + one ?? expression)"
    - "no zustand v5: noteInput rides the existing practiceMechanics field (defaults-at-read); LatencyRecord widens in place (version stays 1); ZERO new K keys"
    - "new DOM test files in JSDOM_FILES: noteInputBus.test.ts + useNoteInput.test.ts ONLY (components glob auto-covers NoteInputPiano.test.tsx)"
    - "PHASE-1-01: typing guard -> modifier guard (before any key branch) -> e.repeat guard -> classify by e.code; pinned by unit tests + e2e leg 3"
    - "REQ-IO-6: pointer events only, white keys >= 44x56px, horizontal scroll (shrinking BANNED), no hover-only affordance"
    - "no console.log/info/debug in src; no any; ASCII code strings; pressed-key feedback uses existing tokens (Okabe-Ito stays reserved for detection verdicts)"
    - "IMMUTABLE: PianoKeyboard.tsx, midiIn.ts, sessionStore.ts, storage.ts, rhythm/clock/guideTone family, tests/**, README/SPEC count pins"
  decisions_made:
    - { id: D137, what: "note-source architecture: SAME window 'midin' seam (3 shipped consumers verified at file:line; the only e2e-injectable seam), synthetic events tagged inputId hse-keyboard/hse-screen + channel-0 sentinel (never bass-excluded), velocity 100, timestamp performance.now(); parallel path REJECTED (forks consumers + e2e for zero gain)", confidence: HIGH }
    - { id: D138, what: "detection integration: fallback input FEEDS played-correctly scoring; arm gate widens to (Web MIDI API) OR (note-input enabled) - one line (:117); REQ-PRAC-54 literal text superseded by PRD-internal REQ-IO-4/5 (erratum flagged); exact 4-state copy specified; hasDevice stays hardware-only, new sawFallback signal", confidence: HIGH }
    - { id: D139, what: "keyboard mapping: pure classifyNoteKey (e.code, modifier guard first, shift NOT guarded), A..K = 0..12 semitones, Z/X octave; OPT-IN toggle (default off = zero regression), armed only on the study surface with no blocking modal (existing App flags); collision audit: all 15 keys free in shipped code; octave persisted in practiceMechanics.noteInput.rootOctave (2..5, default C4)", confidence: HIGH }
    - { id: D140, what: "on-screen surface: NEW NoteInputPiano (the synesthesia PianoKeyboard stays a byte-identical display - its press handlers already exist and play audio but deliberately never dispatch midin); pointer-events-only, 44x56 min targets, horizontal scroll, letter chips, +/- octave buttons; mounts in the study piano card (iff enabled) + the wizard roll (compact)", confidence: HIGH }
    - { id: D141, what: "latency: per-source calibration shipped (D134's cut premise dissolved by D138); LatencyRecord widened in place (inputLatencyMs -> number|null, + fallbackInputLatencyMs/fallbackCalibratedAtMs, defaults-at-read, version stays 1); engine PerformedNote.compensationMs? override (mixed MIDI+keyboard passes are per-note correct); wizard source selector + hse-* filter (MIDI mode poison-proof); uncalibrated fallback = 0 (symmetric honesty)", confidence: HIGH }
    - { id: D142, what: "TD-057 ear-training seam stays OUT: dictation answers are choice/text (verified EarTrainingPanel:321-359); a tap is a performance onset, dictation wants a sung onset vs slot - category error; TD-057 stays open with refined wording", confidence: HIGH }
    - { id: D143, what: "documentation + storage shapes: no new K keys; mapping documented via cheatsheet FOOTER prose + on-key chips (the frozen tests/keyboard-shortcuts.test.ts reverse check BANS SHORTCUTS chips - the D14 precedent); config rides practiceMechanics (no v5)", confidence: HIGH }
    - { id: D144, what: "parent-stance reversal: PHASE-7-PRACTICE's 'NOT pulled into Phase 7 scope' parking is amended - its premise ('PianoKeyboard needs press handlers') is FALSE in shipped code (handlers at PianoKeyboard.tsx:105-122/275-285/346-356, wired App:4964-4977), the PRD's own Phase 7 line schedules these surfaces, and the orchestrator ruled S4", confidence: HIGH }
  implementation_notes:
    - "write the classifyNoteKey modifier-guard pin FIRST (PHASE-1-01): metaKey+KeyA must return null BEFORE any key branch - the whole slice's safety law"
    - "the SHORTCUTS array is a trap: tests/keyboard-shortcuts.test.ts:102-104 reverse-checks every chip against a FROZEN hardcoded list - footer prose only (audit #10)"
    - "channel 0 is load-bearing: it is what lets the detector/wizard bass exclusion stay byte-identical (audit #9) - never 'normalize' a synthetic event to channel 1"
    - "LatencyRecord null-widening: tsc will flag reads - compensationOf, the panel row (:604-606), the wizard save merge; fix all in the SAME commit as the type change"
    - "wizard fallback save MERGES with the existing record (loadLatency first) - a fallback calibration must never clobber MIDI fields and vice versa (pinned by a test)"
    - "e2e leg 1 drives REAL key events (page.keyboard) - this is the first positive leg that tests the app's own listener, not seam injection; keep the pigeonhole cadence law (120ms vs 240ms window, monotonic counters only)"
    - "useNoteInput owns NO state (octave writes go through the store callback) and calls preventDefault ONLY on handled keys - unhandled keydown must fall through byte-identically to today's behavior"
    - "the App handleNoteInput callback duplicates the existing piano trio (App:4964-4977) - do NOT refactor the display piano's call site to share it (DO-NOT: PianoKeyboard region stays byte-identical)"
  estimated_effort:
    implementation_hours: 21-25
    testing_hours: 8-10
    documentation_hours: 1.5
  progress:
    phases_completed: 5/5
    retries: 0
    quality_gates_passed: 5/5
    audit_notes: "baseline verified live (2598/1/0 198 files; e2e 30/13; it( 362; purity floor 56/tree 57; check:paths 36/36; check-links green); 3 claims found FALSE against shipped code: parent's 'PianoKeyboard needs press handlers' (audit #1), 'AWSED collides with existing bindings' (audit #3), and the task-brief's 'only onClick = layer-toggle' framing (press handlers wired); S3 seams re-verified at file:line, not from the S3 doc (S3-001)"
  risks_top3:
    - "frozen cheatsheet reverse pin broken by a SHORTCUTS chip -> CI red (mitigated: D143 footer-prose law + checklist byte-proof item 10)"
    - "keyboard auto-repeat / stuck-note storm (mitigated: e.repeat + blur/pointercancel release laws pinned in useNoteInput + NoteInputPiano tests)"
    - "fallback-only LatencyRecord read as number by a legacy consumer (mitigated: tsc null-widening flags every read in the lint gate; null-guard shipped in the same commit)"
  open_for_orchestrator:
    - "REQ-PRAC-54 erratum: detection now arms from fallback input (D138) - PRD line 566 'Requires Web MIDI input; unavailable without' needs an editorial update (docs/PRD-001.md is orchestrator-owned; this slice did not touch it)"
    - "MIDI loopback edge: a keyboard note sent through midiOut to a hardware controller can echo back as a hardware note-on (double-count). Options: (a) accept + document (current design), (b) drop midiOut.playNote from the fallback trio (keyboard stops driving external gear). Architect recommends (a) for S4; ruling wanted"
    - "D144 parent-stance reversal ratification: PHASE-7-PRACTICE ~:405 parking amended with evidence (stale premise + PRD Phase 7 line + orchestrator S4 ruling) - ratify so the docs stop contradicting each other"
    - "effort ~32h sits well under S3's 46.5h - if the orchestrator wants REQ-IO-3's next integration (etude input via the now-cheap seam) bundled, say so BEFORE step 1; this design deliberately does not"
```

**Version:** 1.2.2 | **Phase:** 7 S4 design | **Depends on:** S1 (fd4b383), S2 (3cf5d6d), S3 (0edbb9d) | **Closes:** REQ-IO-4, REQ-IO-5, REQ-IO-6, D134 keyboard-calibration adjudication | **Keeps open:** TD-057 (refined wording, D142)

---

## 14. ERRATA (post-ship, Kai rulings + dev deviations)

Appended by @docs at ship time. Sections 0-13 are the design as
written at 0edbb9d - kept byte-unchanged as history. This section is
the authoritative delta between design and shipped code; read it
before reusing any premise above.

### 14.1 ORCHESTRATOR RULING (b): the fallback path emits NO midiOut.playNote - CLOSED

Sec 9 risk row "MIDI-loopback double-count" + sec 13
open_for_orchestrator item 2 (the architect recommended (a) accept +
document; the ruling went the other way): the fallback trio DROPS
midiOut.playNote. Shipped `handleNoteInput` (src/App.tsx) =
audioEngine.playNote/stopNote + recorder.recordNoteOn/Off +
setActiveMidis + the noteInputBus emit - NO midiOut. Keyboard notes
never echo to external gear (consistent with hardware MIDI input
notes, which never echoed either); the display piano keeps driving
gear, byte-untouched. AMENDED as a consequence: the sec 4 data-flow
"audioEngine.playNote + midiOut.playNote + recorder + activeMidis
(same trio)" line and the sec 13 implementation_notes item "the App
handleNoteInput callback duplicates the existing piano trio" - the
shipped trio is the display trio MINUS midiOut.

### 14.2 D134 keyboard-calibration adjudication - RATIFIED

The orchestrator ruling (S3 open item: "ratify the cut or schedule a
keyboard-input calibration as S4") landed as SCHEDULED: per-source
calibration ships as D141 (wizard source selector, widened record,
per-note compensationMs override, merge-on-save both directions).

### 14.3 REQ-PRAC-54 erratum - APPLIED

docs/PRD-001.md REQ-PRAC-54 now carries the D138 erratum ("the gate
widened - with no Web MIDI API the detector arms from the fallback
input surfaces (REQ-IO-4/5, keyboard + on-screen piano); without
either, the honest-unavailable state stands"). The design flagged,
the orchestrator edited - PRD-ownership law honored.

### 14.4 D144 parent reversal - RATIFIED

docs/PHASE-7-PRACTICE.md (~:405) now carries the pointer erratum
"(Superseded by Phase 7 Slice 4, D144 - ratified)". The docs no
longer contradict each other.

### 14.5 Count correction

Sec 6.1 / sec 11 item 2 estimated "~2644". The sec 6.1 per-file pin
allocations sum to +62 its: 2598 + 62 = **2660 final / 1 skipped /
0 failed** (201 files, verified live at ship; net +62 = 63 added - 1
retargeted copy-pin, D-6 below). e2e landed as estimated: 30 -> **34
tests / 14 specs** (sec 6.2). it( in tests/ stayed 362
(tests/** byte-untouched); purity floor stayed 56; check-links
counts unmoved.

### 14.6 Shipped deviations D-1..D-11 (dev report; statuses per Kai)

| ID | Deviation (design -> shipped) | Status |
|---|---|---|
| D-1 | Sec 0 audit #4 premise FALSE in shipped code (S3-001 class): with the widened gate, `!detectionUnavailable` no longer implies API presence, so the shipped `hasMidiApi={!detectionUnavailable}` derivation (PracticeHeader:633) would LIE. Fixed: `midiInAvailable()` exported from usePlayedCorrectly as the SINGLE source; App threads `detectionHasMidiApi` to panel + wizard | ACCEPTED |
| D-2 | `noteKeyChipsForRoot()` added to useKeyDown.ts (not in the 3.1/5 sketches): letter chips derive from the ONE mapping table, so the chip a user sees IS the key the classifier fires | ACCEPTED |
| D-3 | Fallback saves keep the MIDI row's calibratedAtMs/deviceName/source when MIDI is calibrated (the D141 record comment said calibratedAtMs = "last calibration time (any source)") - the MIDI row's staleness label stays honest after a keyboard save | ACCEPTED |
| D-4 | Guard order shipped as typing -> modifier -> repeat -> classify, with a defense-in-depth modifier RE-check inside classifyNoteKey (3.3 placed the modifier guard inside the classifier only) | ACCEPTED |
| D-5 | Panel MIDI row gained a third state, "MIDI: uncalibrated - MIDI notes run uncompensated (0 ms)", for fallback-only records (not in the 7.2 verbatim copy list) | ACCEPTED |
| D-6 | One colocated copy-pin updated for the D138 copy (PracticeMechanicsPanel.test.tsx REQ-PRAC-54 test retargeted); tests/** untouched | ACCEPTED |
| D-7 | Manual fallback save zeroes outputLatencyMs (consistent with shipped S3 manual semantics: the typed number IS the compensation, single-sum law) | NOTED |
| D-8 | Wizard fallback mode renders the embedded piano + Start on the gate/arming screens (design specified the roll screen only) - touch users can try taps before the click train | NOTED |
| D-9 | useNoteInput defensive extras: rootOctave re-clamped 2..5 inside the hook (normalize already clamps) and held notes released on effect cleanup, beyond the blur-release law | NOTED |
| D-10 | No header test existed to touch (sec 5 file plan / roadmap step 12 assumed a PracticeHeader test edit; none ships) - nothing to update | NOTED |
| D-11 | `isHseInputId` is exact-match on the two sentinel strings (sec 6.1 said "inputId prefix") - a prefix test would accept "hse-anything" | ACCEPTED |

D-1/D-4/D-6/D-7/D-10/D-11 are verbatim from the ship review;
D-2/D-3/D-5/D-8/D-9 were reconstructed by @docs from the shipped
staged diff (IDs follow the dev report's gaps - exact pairing per
Kai's copy). All eleven verified against the staged files at ship;
none contradicts a ratified decision.
