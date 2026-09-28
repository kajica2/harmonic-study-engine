# Practice Mechanics (PRD-001 Phase 3 Slice 3 + Phase 7 S1/S2/S3)

The click got a real control panel. A gear button beside the
practice header's "Click" toggle opens the click settings popover:
an independent click volume, three click sounds, subdivision,
per-beat accents, and a count-in pre-roll. Slice 3 also added the
print path for the etude views and the Concept drawer that explains
an etude's margin annotations.

Phase 7 S2 (D121-D128) added the second gear: **Drills** -- pause
mode (play N bars, rest M bars), A/B compare (alternate two captured
windows), and the tempo ramp (a rep-rated ladder). The drills ride
the same honest transport F3 shipped: one step per bar, form-relative
windows, per-bar reanchor.

Phase 7 S3 (D129-D136) closed the loop with **feedback that listens**:
a latency calibration wizard, played-correctly detection (your MIDI
input is scored against what each bar expects, on the bar strip and
in a post-pass summary), and practice sessions that bundle the whole
block -- config, attempts, max tempo -- into a reviewable log.

None of this is etude-specific: the metronome and count-in ride the
shared transport, so they apply to every path -- curated standards,
masterclass tunes, and generated etudes alike. The annotation
surfaces that feed the drawer (the "Notes" toggle, margin chips, the
About panel) live on the etude views and are documented in
`docs/ETUDE-COMPOSER.md`.

User requirements traced here: REQ-PRAC-1 (settings), REQ-PRAC-2
(volume independence), REQ-PRAC-10/11 (count-in), REQ-PED-5 (concept
drawer), REQ-ETU-32 (print); Phase 7 S2: REQ-PRAC-21 (pause),
REQ-PRAC-22 (A/B), REQ-PRAC-3 (click-through rests, verified by
construction), REQ-PRAC-30..33 (ramp); Phase 7 S3: REQ-PRAC-40..42
(latency calibration), REQ-PRAC-50..54 (detection), REQ-PRAC-60..62
(sessions), REQ-PRAC-33 (completion marking). Design authority:
`docs/PHASE-3-SLICE3.md` (D32-D44),
`docs/PHASE-7-S2-MECHANICS.md` (D121-D128) and
`docs/PHASE-7-S3-DETECTION.md` (D129-D136).

## Where the controls live

The practice header (the region at the top of the Etude surface)
carries, left to right: the Start/Pause button, Tempo, Loop, the
**Click** toggle (mute/unmute the click -- off by default), the
**click-settings gear** (volume / sound / subdivision / accents /
count-in), the **Drills gear** (pause / A/B / ramp), then Backing,
Vol and Score. Both popovers close on Escape, on a click outside
them, or on the gear again. Everything you SET in them persists
across reloads -- a drill's live POSITION does not (the run state
dies with the run; see the ramp's honest restart). The ramp chip and
the PLAY/REST badge live in the readout row under the bar number --
always visible while a drill runs. The drills are unavailable during a
practice-set runner session (the panel renders disabled).

## The click settings popover

### Click volume -- independent of playback

The 0-100 slider (default 80) sets the click loudness on its own
audio bus. The header's "Vol" slider scales the chords and backing
track and **cannot touch the click**; the click slider cannot touch
the backing. You can run the playback at zero and still hear the
click (or the reverse) -- the two are fully independent.

One deliberate consequence: the click no longer appears in
recordings. It is a monitoring signal, not part of the take.

### Click sound -- three presets

| Preset | Character | Synthesis |
|---|---|---|
| `Beep (current)` | the round default click the app has always made | sine, 800 Hz accented / 400 Hz weak, 0.1 s decay |
| `Click (dry stick)` | short and hard, woodblock-like; cuts through without ringing | square wave, 1000 / 600 Hz, 0.03 s decay |
| `Shaker (soft)` | soft-attack "ts", easy on the ear for long sessions | white-noise burst through a band-pass, 6 kHz accented / 4 kHz weak, 0.06 s decay |

"Accented" means the beats you mark in the accent row below;
everything else sounds the weaker variant.

### Subdivision -- 1 / 2 / 3 / 4 clicks per beat

"Beat" is the meter's own beat: a quarter note in 4/4, 11/4 and
tintal; an eighth note in 6/8 and 7/8. The buttons carry tooltips
spelling this out.

| Setting | What you hear |
|---|---|
| `1` | one click per beat -- the default, what the metronome has always done |
| `2` | the beat split in half (eighth notes in 4/4) |
| `3` | a triplet: three clicks per beat. The first click lands on the beat and carries that beat's accent state; the two in-between clicks are always weak, scheduled inside the beat by the audio clock (sample-accurate) rather than by the visual grid |
| `4` | four clicks per beat (sixteenths in 4/4). In the compound meters (6/8, 7/8) the beat is only two grid steps wide, so `2` and `4` both clamp to every sixteenth step -- they sound identical there |

Setting `1` with the default accents reproduces the old click
pattern exactly (pinned by an exhaustive per-meter test oracle).

### Accents -- meter-derived chips

One chip per beat of the **active meter**: 4 chips in 4/4, 6 in 6/8,
7 in 7/8, 11 in 11/4, 16 in tintal. The row is labelled with the
meter (e.g. "Accent beats (6/8)"). A marked chip makes that beat
sound high (accented); unmarked beats sound weak. The default is
beat 1 only -- the classic downbeat accent. Selecting none is
allowed: every click sounds weak.

The chips follow the meter live. If you accent beat 12 in tintal and
switch back to 4/4, beats 5-12 simply have no effect there -- your
selection is remembered, not destroyed, so switching back restores
it.

### Count-in -- Off / 1 bar / 2 bars

Default `Off` (no pre-roll). See the next section for what happens
when you turn it on.

## Count-in

With count-in set to 1 or 2 bars, **every** play intent runs the
countdown first -- the header Start button, the `Space` key, the
rail's play, the mobile command bar, the "Auto" audition chip, and
a MIDI start from your DAW. The grid, backing track, chords, and
key-cycle all stay silent until the last tick; playback then starts
exactly where it would have without a count-in (no seeking). The
pre-roll runs upstream of the transport, so "plays before any
playback starts" is structural, not best-effort.

What the countdown looks and sounds like:

- It counts **beats, not bars**: one bar of 4/4 shows `4 3 2 1`;
  two bars show `8 7 6 5 4 3 2 1`. The big number is beats left,
  with a "bar X of N" subline under it.
- Each tick is a click through your chosen sound and volume;
  downbeats get the accented (high) variant.
- The pre-roll is a plain pulse: **subdivision is deliberately not
  applied to the count-in**. Its job is to establish the tempo, not
  to fill it -- subdivided pre-roll is a metronome-app anti-pattern.
- **The clicks sound even when the "Click" toggle is off.** Choosing
  1 or 2 bars IS the opt-in (consent semantics, D35): a silent
  count-in defeats the purpose. Set count-in back to Off for no
  pre-roll clicks.
- Tempo changes mid-count re-pace the remaining beats.
- The overlay is a live region (`role="status"`,
  `aria-live="assertive"`), so screen readers announce the
  countdown (the REQ-PRAC-11 win).

Cancelling: press Start/Space again **during** the countdown and it
cancels -- the second press resolves against "playing or counting",
so it reads as a stop. A MIDI transport stop cancels too, and so
does `Escape`: the global stop always routes through the gate, and
a stop must never leave a countdown running behind it.

Recording nuance: if you start a take with a count-in armed, the
take window includes the pre-roll beats. The recorder captures
note events, not audio, and the click left the recording tap anyway
-- no artifact in your recording.

## Section loop (F3 transport truth)

The transport fires once per BAR and advances exactly one path step
per firing, so **1 step = 1 bar of audio** for every path and every
meter. F3 (Phase 7 S1, D110 in `docs/PHASE-7-PRACTICE.md`) made every
user-facing bar number honest to that truth:

- Shift-click bars 5 and 8 in the bar strip and the loop plays bars
  5-8 -- four bars, not the sixteen the legacy `* 4` math played.
- The strip and Position line show TRUE form bars (a 32-bar standard
  padded to 96 steps renders 32 cells, not 24; the progress bar still
  tracks the padded step position).
- Etude section loops work (the "Not yet" carve-out above is closed;
  ADR-016's open F3 decision is resolved).
- Loop ranges saved by builds BEFORE F3 refer to different bars under
  the corrected mapping -- re-pick once after updating.
- The click is unaffected by window selection: metronome truth lives
  in `rhythmEngine.playStep`, which no window math ever gates.

## Pause mode (play N, rest M -- REQ-PRAC-21)

Pick **Pause** in the Drills panel and set the play/rest bar counts
(1..16 each; defaults 4 play / 4 rest). The drill runs a duty cycle
over the current span: the loop window if you set one (shift-click
two bars in the strip -- the window itself feeds the drill whether or
not the Loop toggle is on), otherwise the whole FORM -- a 32-bar
standard padded x3 rests on the tune's bars, never on a pad repeat.

The point of resting is resting **in time**:

- The transport NEVER stops during a rest. The playhead keeps moving,
  the metronome keeps clicking (this is REQ-PRAC-3 by construction --
  the click path in `rhythm.ts` is byte-frozen and the rest gate sits
  at the chord effect + the backing BUS gains, never at `playStep`).
- Chord + backing audio go silent for the M rest bars: the chord
  effect early-returns after stopAll (takes record honest rests) and
  the backing's drum/bass/piano bus gains drop to 0 at the exact bar
  boundary (a schedule-skip would silence FOUR bars later -- the
  lookahead pre-schedules -- so the bus gate is the only correct
  mechanism).
- Bar 1 after the count-in is ALWAYS a play bar. The badge beside the
  readout shows `>> PLAY` / `-- REST`, and the rail strip container
  mirrors the same state as `data-phase="play"/"rest"` (e2e + a11y
  read; "play" whenever pause is not engaged).

## A/B compare (REQ-PRAC-22)

Pick **A/B** in the Drills panel. Select bars in the strip
(shift-click two bars), press **Capture A**; select the variant
range, press **Capture B**; set the swap interval (1..32 bars).
Captured windows read back 1-based in the panel ("A: bars 5-8");
defaults are A bars 1-8, B bars 9-16, swap every 4. The transport
alternates the two windows, jumping to the new window's head on
every swap -- bar-aligned, never mid-bar.

- The active slot shows as `data-window` on the strip container, the
  cells inside each window carry `data-window="a"/"b"/"ab"`, the A
  band reuses the brass loop-band tint (the brand color), B rides a
  purple tint, and corner letter glyphs mark both (never color-only).
- A and B MAY overlap -- comparing overlapping variants is legal.
- Windows are clamped to the active form on save AND on every
  scheduler read: switch to a shorter path and a persisted window
  narrows, it never crashes.
- The loop band and shift-click math are UNCHANGED while the mode is
  Off/Loop.

## Tempo ramp (REQ-PRAC-30..33)

Enable the ramp in the Drills panel: start/target tempo, step, reps
per step, and the failure threshold (defaults 90 -> 150, step 4, 2
reps, 2 consecutive misses; start/target clamp 30..240 like the
slider). Rate what you just played with **Made it / Missed it** --
each click is one rep, and with detection OFF the ladder advances
ONLY on this self-report (S3's detection replaces the input when
armed; the machine itself is unchanged). Reach `repsPerStep`
successes and the ladder climbs one step (clamped to the target);
`failThreshold` CONSECUTIVE misses drop it one step (clamped to the
start); one success clears the miss streak. Landing on the target via
the ladder marks **TARGET** and completes the open practice session
(REQ-PRAC-33, shipped with S3).

- The live chip (`role="status"`) shows, while the ramp is engaged,
  `RAMP 96 -> 102 (+6)  rep 0/4  S4/F0`-style state (exact pinned
  format), flipping to `RAMP 102 - TARGET` on completion. The S and F
  streaks are never BOTH nonzero: a success clears the fail streak
  and vice versa.
- Tempo changes apply through the STORE setter -- exactly like
  dragging the slider mid-playback: the grid re-anchors at the bar
  head and the brief click overlap is the documented accepted tail
  (TD-038a class), not a new mechanism.
- Manual takeover: moving the slider (or Comma/Period) during an
  active ramp RESEEDS the ladder to your tempo and resets the reps.
  The ramp's own writes never reseed (the equality guard breaks the
  echo loop).
- The ladder is source-agnostic: S3's automatic detection feeds the
  SAME machine on the `passCompleted` seam -- the buttons stay as the
  manual source while detection is off, and are disabled while it is
  armed (never both rating one rep).
- Honest restart: the ladder POSITION is run state, not taste -- it
  is never persisted. A reload with the ramp enabled re-engages at
  `startBpm` and WRITES that tempo (your persisted slider value is
  overridden on purpose); the panel's Reset does the same thing
  mid-session.

## Latency calibration (REQ-PRAC-40..42)

The Detection section of the Drills panel carries a **Calibrate**
button. The wizard plays 16 clicks at your current tempo through the
SAME metronome bus practice uses (the path being measured is the path
you will be using), listens for your MIDI taps, and stores your input
latency: the MEDIAN tap-minus-click offset minus the browser-reported
output latency, clamped to 0..500 ms, with the device name and the
calibration time. Click count is adjustable (8..32). Fewer than 8
paired taps report "not enough taps" and retry -- never a silent 0.
Escape or 8 s of silence aborts the roll; no timers leak.

- The gate is honest: calibration needs the Web MIDI API AND at least
  one connected input (measuring with nothing to tap is theater).
  Without a device the wizard says "Connect a MIDI input to
  calibrate" and offers the manual field -- manual entry (0..500 ms,
  stored as source "manual") is ALWAYS available. With the S4
  note-input toggle on, the wizard additionally offers a
  **Keyboard / piano** source (see the input-surfaces section) that
  needs no MIDI at all.

## Input surfaces: keyboard + on-screen piano (REQ-IO-4/5/6, S4)

The **Keyboard / piano input** toggle in the Drills panel (default
OFF -- no letter ever sounds until you turn it on) arms two fallback
note sources on the study surface:

- Computer keyboard: A W S E D F T G Y H U J K play one octave from a
  movable root (position-based by physical key, layout-proof); Z / X
  shift the root octave (2..5, persisted). The mapping is a SEPARATE
  listener with the full guard stack (typing fields first,
  Cmd/Ctrl/Alt yield to the browser, no auto-repeat), armed only in
  the study view and never while a blocking modal is open (the
  calibration wizard is the one exception -- it is a note-input
  consumer).
- On-screen piano: a touch-friendly input surface (pointer events,
  44x56 px minimum white keys, horizontal scroll on narrow screens,
  letter chips on the mapped keys, "-"/"+" octave buttons) above the
  synesthesia display keyboard. The colorful display keyboard stays
  exactly what it was: a display + audition surface whose clicks
  deliberately never enter the practice pipeline.

Both sources emit through ONE seam -- the same window "midin" event
hardware MIDI dispatches, tagged inputId "hse-keyboard" /
"hse-screen" on the channel-0 sentinel (never bass-excluded). The
detector, the calibration wizard and the IN picker all see fallback
input with zero extra plumbing, and detection arms for laptop-only
users (REQ-PRAC-54 amended: any note source suffices). Fallback notes
play through the app's own synth but do NOT drive external MIDI gear
(no loopback echo; the display keyboard stays the gear-driver).

Per-source latency (D141): keyboard/touch taps travel a different
input path than a MIDI controller, so the wizard can calibrate them
SEPARATELY (source selector; the fallback roll is driven by tapping
the embedded compact piano or typing the mapping). Both numbers
coexist in one record -- a fallback save never clobbers the MIDI
number and vice versa -- and each note is compensated with ITS own
source's number (mixed MIDI + keyboard passes are per-note correct).
Uncalibrated sources run honestly uncompensated (0 ms), and the
panel shows both rows with their own staleness labels. Keyboard and
touch taps share ONE fallback number -- measure with the surface you
will play on. One honesty wrinkle: a manual (typed-number) save on
EITHER source stores output 0 (the typed number is then the whole
compensation), which also zeroes the SHARED outputLatencyMs -- so a
prior median calibration on the OTHER source loses the output
component of its compensation until it is re-measured.
- The canonical equation, stated once: a compensated tap is
  `tap - inputLatency - outputLatency`, compared against the bar
  boundary's emission time. A perfectly timed tap leaves exactly zero
  residual. The matcher sees ONE number (the sum, computed in exactly
  one place); the subtraction is what REQ-PRAC-42 stores the output
  latency for.
- Honesty limits (the panel says this verbatim): the browser-reported
  output latency EXCLUDES Bluetooth/USB/display-audio buffering;
  calibration is per audio path, so recalibrate when you switch
  headphones or speakers. The stored number is displayed with
  "calibrated X ago via <device>" so staleness is visible.

## Played-correctly detection (REQ-PRAC-50..54)

Arm **Played-correctly detection** in the Drills panel and play:
every bar of the active window is scored against what the bar
EXPECTS. The expectation is the app's own practice doctrine -- the
bar's guide tones (the 3rd and 7th of the sounding chord, bass-
relative), anchored at the bar's attack. Detection scores the same
thing the guide-tone chip and the coverage row teach; the sounding
voicing (transpose, persona, drift) is what is expected, so the
target is never a fiction the app does not play.

- Grid kinds per bar: **target** = the chord has guide tones; the
  expected set is those pitch classes. **free** = a chord with no
  3rd/7th (sus/power voicings) -- unscored, excluded from the
  denominator, your notes there are penalized nowhere. **rest** = an
  empty step or the pause mode's rest phase -- the expectation is
  SILENCE, and any note you play is a discipline error counted
  separately as rest notes.
- The bucket law (every note lands in exactly one bucket):
  **matched** = right pitch class inside the timing window;
  **missed** = an expected pitch class never played; **wrong** = a
  note whose pitch is not in the bar's expected set (a pitch error);
  **extra** = a duplicate of an already-matched note, a right note
  outside the window (a timing error), or a note during a rest.
  Accuracy counts rest notes against you -- playing over rests IS
  inaccurate practice.
- Tolerance: default 120 ms, adjustable 60..300. The window is
  anchored at the bar boundary where the click actually fired: the
  app's own scheduling jitter moves the click and the anchor TOGETHER,
  so you are never blamed for the app's clock (the boundary-anchored
  design, D129). At the max tolerance, consecutive bar windows never
  overlap at any supported tempo.
- Visual states on the bar strip (the 5th overlay layer): matched
  cells ride a bluish-green tint + a check glyph, wrong/mixed flash
  vermillion with an "X" (reduced-motion: static border, no flash),
  missed dim with a "-", rest notes mark "!". The palette is
  Okabe-Ito, and every state ALSO carries a data attribute and a
  counts-in-text hover/screen-reader title -- shape and text
  redundancy, never color alone (PRD 9.8).
- Auto-rep: with detection armed the tempo ramp rates itself at each
  pass boundary -- a pass is a "made it" when the share of expected
  notes hit reaches the panel's **Pass at** threshold (default 0.8,
  range 0.5..1.0; timing never gates the verdict, tolerance already
  did). The Made it / Missed it buttons are disabled while armed (the
  machine and the click can never double-rate one rep); turn
  detection off and they return, S2 behavior unchanged.
- Requirements (REQ-PRAC-54, AMENDED by S4 D138): detection arms for
  ANY note source -- a browser with the Web MIDI API OR the
  Keyboard / piano input toggle on. Without either, the panel shows
  the honest unavailable state and drills, ramp and manual rating
  work unchanged. With the API but no device connected, detection
  arms and stays silent ("connect a MIDI input"); hot-plugging a
  controller just works. Once a keyboard/piano note is observed the
  status line names the live source instead.
- Feedback surfaces: a post-pass summary card ("Pass 3 - 7/8 notes
  (88%) | avg +23 ms late | 1 wrong | 1 rest") and a compact header
  chip while armed. The summary and the strip update ONCE PER BAR
  boundary, never per note; the live per-note chip stays the
  immediate surface.

## Practice sessions (REQ-PRAC-60..62)

Playing with any drill, the ramp, or detection engaged records a
**practice session**: one continuous practice block bundling a config
snapshot (path, meter, windows, ramp ladder, metronome settings,
start tempo) and one attempt per pass (or per manual rating),
summarized when the block ends.

- Start: on the play edge, iff a practice context is engaged. Bare
  audition play (no drill, no ramp, no detection) never opens a
  session -- the log stays signal.
- End: on stop/pause or on switching paths. Blocks shorter than 20
  seconds are DISCARDED (a noise filter, stated honestly). Reaching
  the ramp target marks the open session completed immediately
  (REQ-PRAC-33); the record keeps playing and re-persists when the
  block actually closes.
- Caps: the last 50 sessions, each keeping the last 50 RAW attempts
  folded into running aggregates (attempts, successes, notes hit,
  total play time, max tempo) -- a marathon session cannot blow the
  storage quota.
- Surface: the Drills panel shows an end-of-session card (max tempo,
  total time, made count, accuracy, TARGET badge) and a recent-
  sessions list with relative times. Sessions also feed the pedagogy
  practice log (mode "practice"), so the Phase 6 heatmap minutes now
  include real practice time.
- Limitations, honestly: a tab unload mid-block is NOT persisted (a
  session is a practice block, not a crash journal); a pause splits
  sessions (the summary grain is the continuous block).
- Terminology: a session is NOT a take. A **take** is a recorded
  audio performance (the takes panel); a **set-runner session** is
  the legacy run through a practice-set playlist. Three concepts,
  three storage keys, no foreign keys -- the full law lives in
  `docs/TERMINOLOGY.md`.

## Print

The etude views section has a **Print** button (browser print, no
PDF library -- REQ-ETU-32). It is WYSIWYG: whatever tab you are
looking at is what prints.

- **Prints**: the active etude view (Staff or Piano roll), the
  margin-note chips (if Notes are on), and the "About this etude"
  panel content if you have it expanded.
- **Does not print**: the rest of the app -- the sticky header, the
  practice rail, side panels, the on-screen keyboard, the Idea bar
  -- plus the in-view controls (tab buttons, Notes, Print). Nothing
  else needs hiding; a global `@media print` block takes care of it
  via `print-area` / `print-hide` classes.
- **On paper**: the section flips to light tokens (white background,
  dark ink), SVGs keep their exact colors (the roll's Okabe-Ito
  palette and abcjs's black notation both print cleanly), and the
  page gets 14 mm margins.

Print scope is the etude views only today; the classes are generic
so later surfaces can opt in without new CSS.

## The Concept drawer

A short explainer panel that slides in from the right edge, built on
the app's shared modal shell.

Opening it:

- click a **margin-note chip** in the etude views (only chips tied
  to a pedagogy concept are clickable; the rest are plain text), or
- click a **"What is ...?"** link inside the "About this etude"
  panel.

Inside: a category badge (with a text label, never color alone), the
concept title, a one-line definition, the body in paragraphs, and
**Related concepts** chips that navigate in place (opening a related
concept resets the drawer's scroll). The footer (shipped with
Phase 6, REQ-PED-13) carries **"Hear an example"** (generated
exampleNumerals in C) and **"Send to Explore"** (seed carry); the
global header gained **Concept search** (REQ-PED-12) in the same
slice.

Closing it: the X button, `Escape`, or a click on the backdrop.
Focus returns to the chip or link that opened it (the shared
ModalShell handles the trap and the restore -- the drawer does not
reimplement it).

References: when a concept carries external references they render
as links that open in a new tab with `rel="noopener noreferrer"`
(the app never shares its window with the target). The ten
concepts shipped today carry no reference URLs yet -- the rendering
path exists for future registry entries.

## Not yet (honest carve-outs)

- **Right-click a chord symbol to open the drawer** (REQ-PED-6):
  shipped for the Compose host in Phase 6 (AnalysisCard chord cells
  via `useConceptPress`; bare cells prefill the global search); the
  Etude chord-symbol host stays deferred (TD-PED-6-REST).
- **Annotation surfaces on Explore**: REQ-PED-4 ships the Etude
  portion (margin chips, Phase 3 S3) and the Compose portion
  (analysis chips under the chart, Phase 4 S2); Explore's idea cards
  carry inline concept links but the margin-note/About-panel host is
  deferred.
- **Etude melody audio**: the generated melody is notation + roll
  only; playback is the chord backing (TD-034, formally deferred).
- **Drills under the runner**: pause/A/B/ramp NEVER engage while a
  practice-set runner session is active (the runner and the measure
  handler are dual writers of the step -- TD-052). The panel renders
  disabled there.
- **Backing chord content vs sub-window loops** (pre-existing,
  TD-053): the backing's scheduling cursor ignores window wraps, so
  during a SUB-window loop/pause/A-B the bass/piano CONTENT walks the
  full path while the groove timing stays honest. Rest muting is
  content-agnostic (bus level) and correct regardless.
- **Detection without any note source**: with neither the Web MIDI
  API nor the S4 keyboard/piano input enabled, the strip never scores
  and the summary stays at zero hits -- by construction (there is no
  honest way to detect notes the browser cannot hear). The S4
  fallback surfaces close most of that gap; manual rating covers
  the rest.
- **Session unload gap**: an open session is persisted when the block
  ENDS (stop / path switch); closing the tab mid-block loses it.
  Sessions are practice blocks, not a crash journal (D133.4).
- **Mobile**: the Drills gear is desktop-first (same class as the
  click gear); MobileCommandBar keeps the loop toggle only. The S4
  input piano IS touch-first (REQ-IO-6).
- **No new cheatsheet shortcut chips**: the S4 keyboard mapping is
  documented in the cheatsheet FOOTER prose + the piano's own key
  chips (the SHORTCUTS surface is frozen by a reverse-consistency
  pin); every drill control stays a real button/input.

## Where to look

- Design: `docs/PHASE-3-SLICE3.md` (D32-D44); F3 transport truth:
  `docs/PHASE-7-PRACTICE.md` (D110-D113)
- Popover UI: `src/components/MetronomeControls.tsx`; gear button +
  popover host: `src/components/PracticeHeader.tsx`
- Click math (pure): `src/lib/metronomePatterns.ts` -- the
  legacy-equivalence oracle lives in its test file
- Synthesis + independent click bus: `src/lib/audio.ts`
  (`metronomeGain -> compressor`, presets, `scheduleMetronomeClick`)
- Grid consumer: `src/lib/rhythm.ts` (`setMetronomePattern`; the
  16th grid itself is untouched)
- Bar<->step law (pure, F3): `engine/practice/windows.ts`
  (`barOfStep`, `windowStepRange`, `clampWindow`); design authority
  `docs/PHASE-7-PRACTICE.md` (D110-D113)
- Duty scheduler (pure, S2): `engine/practice/duty.ts`
  (`advanceTransport` - loop/pause/AB next-measure decisions; the
  loop law is pinned EQUIVALENT to the shipped F3 handler branch)
- Tempo ladder (pure, S2): `engine/practice/ramp.ts`
  (`rampNext` + `normalizeRampConfig`); config taste + chip
  formatter: `src/lib/practiceMechanics.ts`
- Mechanics wiring (refs + handler branch + gates): the S2 block in
  `src/App.tsx` (D123: exactly ONE new handler branch; D128: chord
  early-return + `backingEngine.setRestMuted`)
- Rest bus gate: `setRestMuted` in `src/lib/backingEngine.ts`
- Drills panel UI: `src/components/PracticeMechanicsPanel.tsx`; gear
  + chips host: `src/components/PracticeHeader.tsx`; rail data attrs:
  `src/components/PlaySessionRail.tsx`
- Matcher math (pure, S3): `engine/practice/detect.ts`
  (`matchPhrase` + `assignBar`, the bucket + no-overlap laws);
  latency median/clamp: `engine/practice/latency.ts`; session
  fold/summarize: `engine/practice/session.ts`
- Expected grid (S3): `src/lib/practiceExpected.ts` (guideTonePcs is
  a pinned mirror of the shipped `intervalToRole` law -- the
  cross-check oracle pin lives in its test)
- Detection hook (S3): `src/hooks/usePlayedCorrectly.ts` (window
  "midin" subscription + read-only `playbackClock.subscribe` boundary
  observer -- TD-052); wiring + verdict routing + session lifecycle:
  the S3 effects block in `src/App.tsx`
- Wizard (S3): `src/components/LatencyWizard.tsx`; latency record:
  `src/lib/practiceLatency.ts`; sessions adapter (the ONE
  appendAttempt dual-write seam): `src/lib/practiceSessions.ts`;
  keys `K.practiceLatency` / `K.completedSessions` in
  `src/lib/storage.ts`
- Count-in: sequence `src/lib/countIn.ts`, timer
  `src/hooks/useCountIn.ts`, visible overlay
  `src/components/CountInOverlay.tsx`, gate `requestPlayState` in
  `src/App.tsx`
- Drawer: `src/components/ConceptDrawer.tsx` on
  `src/components/ModalShell.tsx`; registry `engine/pedagogy/`
- Print: `@media print` block in `src/index.css`; `print-area` /
  `print-hide` usage in `src/components/EtudeViews.tsx`
- Persistence: `metronomeConfig` in `src/hooks/useSessionStore.ts`,
  registry key `K.metronomeConfig` in `src/lib/storage.ts`
- e2e: `e2e/count-in.spec.ts`; S2 legs:
  `e2e/practice-pause.spec.ts`, `e2e/practice-ab.spec.ts`,
  `e2e/practice-ramp.spec.ts` (the ramp leg is click-deterministic,
  no playback); S3 legs: `e2e/practice-detection.spec.ts` (negative
  no-API leg, a synthetic-stream leg driving the shipped window
  "midin" seam on the real transport with monotonic-counter asserts
  only, and a deterministic wizard/persistence leg); S4 legs:
  `e2e/practice-inputs.spec.ts` (REAL trusted keyboard + pointer
  input through the app's own listener into the same "midin" seam:
  keyboard->detection, on-screen piano + the 44x56 geometry floor,
  octave persistence + the Meta-guard, and the zero-timing wizard
  fallback merge).
- S4 input surfaces: mapping `classifyNoteKey` +
  `NOTE_KEY_SEMITONES_BY_CODE` in `src/hooks/useKeyDown.ts`;
  listener `src/hooks/useNoteInput.ts`; seam emitter
  `src/lib/noteInputBus.ts` (the ONE "midin" contract, hse-*
  sentinels, channel 0); touch surface
  `src/components/NoteInputPiano.tsx` (mounted by `src/App.tsx`
  above the display piano + embedded in the wizard); config slice
  `noteInput` in `src/lib/practiceMechanics.ts`; per-source record
  widening + `compensationOfFallback` in
  `src/lib/practiceLatency.ts`; per-note override
  `PerformedNote.compensationMs` in `engine/practice/detect.ts`
  (law 4, additive).
