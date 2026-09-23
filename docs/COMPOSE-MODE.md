# Compose Mode (PRD-001 Phase 4, Slices 2-3)

Compose is the MIDI-file workspace. Drop in a `.mid` file and the app
reads it, analyzes it, and hands back an editable chart: the detected
key, tempo, meter, melody line, and a chord for every bar -- each one
yours to correct. Phase 4 slice 2 made this real for the first time;
before it, Compose was an empty-state stub. Slice 3 added the
accompaniment: the chart can now generate a style-aware backing
(bass / chords / pad) you can audition.

Everything happens in your browser. The file is parsed locally and
the analysis runs locally -- nothing is uploaded anywhere. The
privacy statement on the surface is literal: the whole pipeline makes
zero network calls (REQ-IO-70/71).

Open Compose with the tab or the `1` key.

User requirements traced here: REQ-COMP-1 (upload), REQ-COMP-5
(melody preview, melody-only carve), REQ-COMP-6 (pitch-bend warning),
REQ-COMP-20..24 (editable analysis + undo), REQ-COMP-30..36
(accompaniment: roles, voicing, patterns, density, seed),
REQ-COMP-50..53 (edge cases + windowing), REQ-PED-4/5 (annotations +
concept drawer, Compose host), REQ-TRANS-3 (accompaniment-only
transpose), REQ-IO-51/70/71. Design authority:
`docs/PHASE-4-S2-ANALYSIS-UI.md` (D57..D65) +
`docs/PHASE-4-S3-ACCOMPANIMENT.md` (D66..D76); engine internals:
`docs/engine-compose.md`; pattern content: `docs/PATTERN-LIBRARY.md`.

## Uploading your file

Two ways in: drag a Standard MIDI File onto the drop zone, or use
"browse for one" (a real keyboard-accessible button that opens the
system picker). `.mid` and `.midi` files are accepted up to 30 MB;
anything else is rejected with a visible message before any parsing
starts. SMF formats 0, 1, and 2 all work.

Files that get through the gate but fail later land on a plain
banner, never a crash: oversized files ("File is larger than the 30
MB limit"), unreadable bytes ("Not a valid MIDI file"), and empty
files ("No notes found in this file."). The drop zone always stays
put -- try another file immediately.

While loaded, dropping a different file REPLACES the session (your
undo history does not cross files). "Start over" at the bottom of
the card clears everything back to the empty state.

## What the analysis finds

From the parsed file the analyzer reports:

- **Key** -- the file's declared key signature plus a statistical
  read of the note content (see the confidence section; this is the
  interesting part).
- **Tempo + meter** -- from the file's tempo map and time signature
  meta (defaults of 120 BPM / 4/4 are assumed, with a note in the
  parse log, when the file omits them).
- **Melody track** -- the track classified as the melody line, or a
  synthesized top line when no track is confidently "the melody".
- **Chords, bar by bar** -- one inferred chord per bar, each with a
  confidence score and up to three runner-up readings.
- **Annotations** -- things the analyzer actually spotted (an ii-V-I
  span, where the melody came from), shown as chips under the chart.

## The confidence story -- what the app trusts and what it asks about

Every detected value is shown at one of four tiers, and the tier is
the app telling you how much it trusts itself:

| Tier | Look | Meaning |
|---|---|---|
| `auto` | plain text, "detected" tooltip | accepted -- the evidence lines up |
| `highlight` | amber ring, "confirm" tooltip | probably right -- give it a look |
| `radio` | candidate buttons | genuinely unsure -- pick one |
| `manual` | dashed field / dotted input | no usable answer -- enter it yourself |

For the key, the app weighs THREE independent sources before it
accepts anything: the key signature your file DECLARES, how well the
inferred chord grid FITS the candidate key (diatonic chords + a real
cadence), and the raw statistical correlation of the notes against
major/minor profiles. That blend lands in one of five states:

| State | When | What you see |
|---|---|---|
| agree | the declared signature and the notes point at the same key | accepted outright when the evidence is strong; a weak reading is demoted to the amber "confirm" ring |
| inferred-only | your file declares no key | accepted only when BOTH the statistics and the chord grid back the candidate; otherwise confirm-ring or candidate buttons |
| conflict | the declared key and the notes disagree | an amber banner naming both keys and their relation (relative / parallel / other) + a two-way radio with the DECLARED key preselected + "Other..." for manual entry |
| declared-only | your file declares a key but the notes give no tonal evidence | the key, badged "(from the file's key signature)", in the confirm ring |
| none | neither source has anything to go on | manual key entry |

The rule behind all of this: **the app never silently trusts a
single guess.** Two properties are pinned by tests and hold no
matter how the detector is tuned:

1. A statistical correlation ALONE can never auto-accept a key. A
   near-perfect correlation over chord junk still lands short of
   "detected" -- you get the confirm-ring or a candidate picker,
   never a silent accept -- because on gnarly material (think
   chromatic jazz) statistics lie, so the app asks you instead.
2. A declared-vs-inferred CONFLICT always shows the banner and the
   radio, at every confidence level. Your file's own key signature
   is the default choice -- composers' intent beats guessing -- but
   the disagreement is never hidden, and one click switches to the
   inferred key.

To change the key anyway: "Change" opens a text field (type e.g.
`F minor`; empty resets to the detected key; a "Reset" link clears
your override).

## The editable chord chart

The chart is one row per bar; each cell is that bar's chord. Empty
bars render as a centered dot. A cell in the `radio` tier shows its
top runner-up as a small chip under the cell -- one click swaps it
in.

Click any cell to open the editor:

- **Type a chord symbol** with autocomplete. The suggestions lead
  with the cell's own top-3 alternatives, then your recently used
  symbols, then the full grammar -- spelled in the current key's
  family (flats in Eb minor, sharps in G# minor).
- **Typed input wins.** Pressing Enter applies exactly what you
  typed, even when the list is highlighting something else -- arrow
  keys are how you say "no, pick that suggestion instead."
- **Common options**: the cell's top-3 alternatives as one-click
  buttons.
- **Delete** turns the cell into a rest.
- **Split bar in two** re-infers that bar as two half-bar chords
  (the second chord is inferred with the first as context). Both
  cells land as ONE edit -- one undo brings the single chord back.
- Symbols the grid cannot honestly hold (alterations like `C13` or
  `C7#9`) are rejected with an inline error; the popover stays open
  for correction. What you can type: 17 qualities (triads, 7ths,
  sus4, 6ths, add9, 9ths, dim/halfdim, alt) in their canonical
  spellings (`maj7`, `m7b5`, `7alt`, ...) plus common aliases (`o7`,
  `M7`, `-`, slashed-circle) and a slash bass when it is a chord
  tone (`G7/B`).
- Close with Escape or a click outside; focus returns to the cell.

### Undo / redo

`Cmd+Z` undoes and `Cmd+Shift+Z` redoes (`Ctrl` on Windows/Linux)
while a chart is loaded. Every committed edit is one step -- a cell
apply, a delete, a split, a key/tempo/meter/melody commit -- and the
history goes 32 edits deep. Text fields keep their own native undo:
the shortcut is inert while your caret is inside one, so undoing a
typo mid-edit works the way you expect. Redo is cleared by a new
edit (standard model). Undo does not cross files: uploading a new
one resets the history.

## The header fields

Next to the file name and duration:

| Field | Editing | What it actually does |
|---|---|---|
| Tempo | type a BPM, Enter/blur to commit | RECORDED for the full playback/export (slice 4). The accompaniment preview runs on the file's OWN tempo map, not this override - the preview's tooltip says so |
| Meter | type e.g. `6/4` | re-runs the whole analysis on the new bar grid AND clears your chord edits (bar alignment changes make them unsafe) -- both in one step, so ONE undo restores the cells and the meter together |
| Key | see the confidence section | drives chord spelling + the inference |
| Melody track | pick a track (or "Auto (top line)") | re-extracts the melody from that track's REAL notes -- the roll below genuinely changes, it is not a relabel |

## The melody preview and the 4-minute window

Under the chart, a static piano roll shows the melody: one block
per note, placed on a tick-linear grid so barlines stay evenly
spaced no matter what the tempo map does -- the roll lines up with
the chord chart above it. Barlines are labeled every four bars;
louder notes draw darker. A text summary ("melody: 34 notes, range
C4 to A5, ...") carries the same information for screen readers.

When no track was confidently a melody, the roll is built from a
synthesized top line, and it says so: "Synthesized top line -
silences are absorbed into note tails (known limitation)." That is
a real S1 limitation, disclosed rather than hidden.

Long files are analyzed in a window: by default the FIRST 4:00 of
musical time. The banner reads "Showing the first 4:00 of 6:23."
with an **Analyze full file** button; the roll marks the window
edge with a dashed line and a "first 4:00 shown" caption. Analysis
is fast (tens of milliseconds on typical files), so going full-file
is a single click -- and your window choice persists across
reloads.

## When your file is unusual

Every shipped signal lands on exactly one banner:

- **Percussion-only file** -- banner ("This file has only percussion
  - enter chords manually.") over an all-rest chart. The grid is
  yours to fill.
- **No clear key** (atonal, sparse, or chromatic material) -- banner
  ("No clear key detected - enter the key and chords manually.") +
  the key field forced to manual. Chord cells keep their own tiers.
- **Pitch bends in the file** -- warning naming how many tracks are
  involved; everything is analyzed at 12-TET (notated) pitches, so
  bent notes may read a semitone off where they sit between.
- **Parse quirks** (missing tempo, missing meter, dropped
  out-of-range notes, ...) -- collected under a collapsible "Parse
  notes (k)" list; every warning is shown, none is swallowed.

## Reloading: your edits survive, the file does not

Your corrections (chord cells, key, tempo, meter, melody pick,
window choice) persist across a reload -- but the 30 MB parsed
project deliberately does NOT go into browser storage. So after a
reload, Compose asks for the file again: "Re-upload <name> to
restore your saved session."

What happens next is hash-gated, and it is honest about it:

- **Same file** (SHA-256 of the bytes matches the saved session):
  your edits are restored, with a "Previous edits restored" notice.
- **Different file**: refused -- "This file does not match your
  saved session," with "Use anyway (clear saved session)" or Cancel.
  Your saved edits are never silently applied to the wrong song.
- **Hash unavailable** (some non-secure browser contexts cannot
  compute one): edits are DROPPED with a visible notice rather than
  applied to an unverifiable file.

## Annotations and the concept drawer

Chips under the chart list what the analysis found -- an ii-V-I
span, where the melody came from, the key reading. Chips that map
to a taught concept open the same **Concept drawer** the Etude
surface uses; the ii-V-I chip also highlights the exact bars it
covers. Chips without a concept (provenance notes) are plain text,
not dead click targets. After you generate, the accompaniment panel
adds its own chips (the realized patterns, walking approaches,
rootless/drop-2 voicings) - and those claims are computed from the
notes that actually sounded, never from what the pattern could
have done (a thinned walking line says so).

## Not yet -- what Compose does NOT do today

- **No playback of YOUR file.** Your original tracks never sound --
  the Compose transport and mixer (per-group volume/solo) are slice
  4. The only audio so far is the accompaniment preview below; the
  global `Space` key still belongs to Etude playback -- a known
  wart, not a Compose feature.
- **Accompaniment generation + preview (slice 3, live).** Under the
  analysis card, the AccompanimentPanel generates a style-aware
  backing over the MERGED chart: pick a style (Jazz/Pop/Classical),
  one or more roles (bass / chords / pad), a density 0..5 (thins
  detail, never reshapes - the same notes at every level, just
  fewer), per-role register (low/standard/high), an
  accompaniment-only transpose, and a seed. Same seed + same chart =
  byte-identical output, across regenerate AND reload (the request
  survives reload; press Generate again - it never auto-fires).
  [Randomize] rolls a new seed. The panel states whether a key
  context is active: with one, walking-bass approaches may move
  diatonically; without one they stay chromatic. The generated
  layers render on an overlay piano roll under the chart, and
  [Preview (accompaniment)] renders offline and plays it - the
  first 1:30 on longer charts, labeled - no transport, no mixing
  with your original tracks yet (that is slice 4). Honest limits
  printed in the UI: the tempo OVERRIDE is not applied to the
  preview until the mixer (the project tempo map is), and a "chart
  changed since generation - regenerate" chip appears the moment
  you edit a cell after generating.
- **No export, no mixer, no chart-paste.** Saving the chart,
  MIDI/WAV export, shareable analysis URLs, the mixer
  (per-group volume/solo, original-track playback), and
  chord-chart paste are all slice 4 (URL serialization is a
  stretch goal).
- **No piano-roll editing and one melody line only.** The roll is a
  preview; the multi-track editor is Phase 8.
- **The accompaniment's musicality is not yet human-verified.**
  Structure and determinism are test-pinned, but the manual listen
  check (the only real bar for "does it sound idiomatic") is still
  open - your ears are the gate (PRD Appendix F).
- **Detection accuracy on real-world files is still an open
  question.** The engine scores perfectly on its synthetic test
  corpus, which proves the wiring, not the world. That is exactly
  why every value is editable and nothing is ever silently trusted.

## Where to look

- Design: `docs/PHASE-4-S2-ANALYSIS-UI.md` (D57..D65); accompaniment:
  `docs/PHASE-4-S3-ACCOMPANIMENT.md` (D66..D76)
- Engine internals: `docs/engine-compose.md`
- Surface (three states + upload pipeline + undo keyboard):
  `src/components/ComposeSurface.tsx`
- Drop zone: `src/components/UploadDropZone.tsx`
- Analysis card (banners, tiers, header fields, annotations):
  `src/components/AnalysisCard.tsx`
- Cell editor: `src/components/ChordCellPopover.tsx`; symbol
  grammar: `src/lib/chordInput.ts`
- Melody preview: `src/components/ComposePianoRoll.tsx`
- Parse pipeline: `src/lib/composeMidi.ts` -> `engine/compose/`
- Accompaniment panel: `src/components/AccompanimentPanel.tsx`;
  pattern data: `engine/compose/patterns.ts` (musician-facing
  reference: `docs/PATTERN-LIBRARY.md`); pipeline:
  `engine/compose/accompany.ts`; preview:
  `src/lib/composePreview.ts` + `src/lib/composeVoices.ts`
- Session persistence (v4): `src/state/sessionStore.ts`
