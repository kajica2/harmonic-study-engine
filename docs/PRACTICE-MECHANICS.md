# Practice Mechanics (PRD-001 Phase 3, Slice 3)

The click got a real control panel. A gear button beside the
practice header's "Click" toggle opens the click settings popover:
an independent click volume, three click sounds, subdivision,
per-beat accents, and a count-in pre-roll. Slice 3 also added the
print path for the etude views and the Concept drawer that explains
an etude's margin annotations.

None of this is etude-specific: the metronome and count-in ride the
shared transport, so they apply to every path -- curated standards,
masterclass tunes, and generated etudes alike. The annotation
surfaces that feed the drawer (the "Notes" toggle, margin chips, the
About panel) live on the etude views and are documented in
`docs/ETUDE-COMPOSER.md`.

User requirements traced here: REQ-PRAC-1 (settings), REQ-PRAC-2
(volume independence), REQ-PRAC-10/11 (count-in), REQ-PED-5 (concept
drawer), REQ-ETU-32 (print). Design authority:
`docs/PHASE-3-SLICE3.md` (D32-D44).

## Where the controls live

The practice header (the region at the top of the Etude surface)
carries, left to right: the Start/Pause button, Tempo, Loop, the
**Click** toggle (mute/unmute the click -- off by default), and the
**gear button** that opens the click settings popover. The popover
closes on Escape, on a click outside it, or on the gear again.
Everything you set in it persists across reloads.

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
so it reads as a stop. A MIDI transport stop cancels too. (Escape
stops real playback but does nothing during a pre-roll -- the
countdown runs to the end or you press Start again.)

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
concept resets the drawer's scroll).

Closing it: the X button, `Escape`, or a click on the backdrop.
Focus returns to the chip or link that opened it (the shared
ModalShell handles the trap and the restore -- the drawer does not
reimplement it).

References: when a concept carries external references they render
as links that open in a new tab with `rel="noopener noreferrer"`
(the app never shares its window with the target). The eight
concepts shipped today carry no reference URLs yet -- the rendering
path exists for future registry entries.

## Not yet (honest carve-outs)

- **Right-click a chord symbol to open the drawer** (REQ-PED-6):
  deferred -- its natural hosts are components mid-refactor.
- **Concept search** in the global header (REQ-PED-12) and the
  drawer's **"Hear an example" / "Send to Explore"** actions
  (REQ-PED-13): deferred; the drawer reserves a footer slot.
- **Annotation surfaces on Compose / Explore**: only the Etude
  portion of REQ-PED-4 ships; the other hosts wait for their
  surfaces to land.
- **Etude melody audio**: the generated melody is notation + roll
  only; playback is the chord backing (TD-034, formally deferred).

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
- e2e: `e2e/count-in.spec.ts`
