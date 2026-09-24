# Etude Composer (PRD-001 Phase 3, Slice 2)

The Etude Composer is the deterministic etude generator on the Etude
surface. It turns the Phase 3 slice 1 engine (`engine/etude/`,
documented in `docs/engine-etude.md`) into something you can actually
use: pick constraints, press Generate, and a seeded etude loads
straight into the existing practice session -- loop, transpose,
backing, and export all work on it unchanged.

It lives as a full-width section directly **below the practice rail**
(PlaySessionRail) on the Etude mode (press `2` or click the Etude tab).
The legacy "Etude Assistant" in the Generator Lab fold still exists
and still works; the Composer is the new constraint-driven entry
point, and the two coexist.

User requirements traced here: REQ-ETU-1 (controls), REQ-ETU-2
(constraints), REQ-ETU-3 (URL persistence), REQ-ETU-4 (regenerate /
randomize), REQ-ETU-15 (determinism), REQ-ETU-20/21 (roll + staff),
REQ-ETU-31 (MusicXML melody), plus the slice-3 surfaces over the
views: REQ-PED-4 (etude annotation display) / REQ-PED-5 / REQ-PED-7
(margin notes + concept drawer) and REQ-ETU-32 (print). Design
authority: `docs/PHASE-3-SLICE2.md` (slice 2) and
`docs/PHASE-3-SLICE3.md` (slice 3 surfaces).

## The core controls

Seven fields define an etude. All are always visible:

| Control | Values | Notes |
|---|---|---|
| Style | `jazz` / `pop` / `classical` | the three shipped `StyleProfile`s |
| Key | 12 tonic picks (C, Db, D, Eb, ...) | flat spellings in the picker |
| Mode | `major` / `minor` | the TONAL mode (see URL section -- not the app mode) |
| Difficulty | 1-5 | scales chromaticism, syncopation, extensions (Phase 0 model) |
| Bars | 4-32 | the TRUE FORM length; the practice loop pads it seamlessly |
| Tempo | `auto` checkbox + BPM field (40-300) | auto = the style profile's default tempo |
| Seed | integer 0 - 4294967295 | the determinism handle; see Randomize |

Plus two actions:

- **Generate etude** -- validates the draft, generates, and loads the
  result (see "What Accept does"). The button is disabled exactly when
  generation cannot succeed, and the reason is shown inline (status
  line + tooltip) -- never a bare disabled affordance. An infeasible
  constraint combo (e.g. filters that exclude every style template)
  tells you what to widen.
- **Randomize** (next to the seed field) -- rolls a fresh random
  uint32 seed and generates immediately (subject to the same
  valid+feasible gating as Generate). Same constraints, new tune.
  Re-roll as many times as you like; re-rolling back to a previous
  seed reproduces that exact etude.

The status line under the controls reports what is loaded
(`Loaded: <title> (seed N)`) or what is blocking generation.

## Advanced (6 of 9)

A collapsible `Advanced` section (closed by default) exposes six
constraint fields:

| Field | Meaning |
|---|---|
| Start on | numeral token the etude must open on (e.g. `ii7`) |
| End on | numeral token for the final bar (e.g. `I`) |
| Require chromaticism | force at least one chromatic chord |
| Straight rhythms only | no syncopated onsets in the melody |
| Chord tones on strong beats | melody beats 1/3 land on chord tones |
| Max interval (st) | cap on melody leaps, 1-24 semitones; empty = profile default |

Three engine constraints are **not yet exposed** (named in the panel,
so nothing is silently missing): `allowedQualities`,
`allowedNumerals`, and the melody `range`. They need bespoke widgets;
the engine treats them as unrestricted, so deferral does not change
what any shipped control generates. This is the honest "6 of 9" ship
of REQ-ETU-2 (a P1 requirement) -- the remaining three land in a
follow-up.

## What Accept does

Generate and Randomize both go through the same accept path
(`handleEtudeAccept` in `src/App.tsx`):

- The etude is converted to a normal `HarmonicPath` (id
  `etu-etu-<hash>`) and **prepended to the Paths list as the active
  path**. It is deduped by id, so generating the same seed twice does
  not clutter the list.
- Playback, whole-path looping, **section loop ranges** (shift+click
  start/end bars), the metronome (including the slice-3
  click-settings popover and count-in -- `docs/PRACTICE-MECHANICS.md`),
  key-cycle, WAV / MIDI export: everything works on it exactly like
  a curated path, because it flows through the existing chain.
  Section loops are honest on etude paths: F3 (Phase 7 S1, D110 --
  the former open product decision, now CLOSED) made the transport
  1 step = 1 bar with form-relative windows, and an etude practice
  path carries ONE step per bar -- so a 4-bar selection plays those
  4 bars. The backing chords sound; the generated **melody
  does not play yet** -- in this slice it is notation + piano roll
  only (see "Not yet").
- Accept **resets transposition**: global offset to 0, per-exercise
  offset to 0, key-cycle disengaged -- the same reset that generate /
  persona-switch / import perform (Phase 2 convention).
- Accept **marks the Etude session dirty** with the same unsaved-work
  semantics as a CoCompose accept: switching modes afterwards prompts
  the Save / Discard / Cancel dialog (see `docs/MODES.md`, "The dirty
  prompt"). Known nuance: *Discard* reverts step edits, not a loaded
  path -- the etude stays in the Paths list after discarding, as with
  every other generated path.
- Boot restore from a shared URL never dirties anything and never
  stomps your current session: it only seeds the constraints and
  prepends the path if missing.

## The two views

When the active path is the loaded etude, a Roll / Staff tab pair
appears in the right column (above the live score). Selecting any
other path hides them; re-selecting the etude brings them back
instantly (the result is held in memory).

- **Piano roll** (`EtudePianoRoll.tsx`): a static SVG -- one column
  per eighth-note slot, chord lanes shaded behind, melody notes as
  blocks. Colorblind-safe by design (Okabe-Ito palette plus shape
  redundancy: syncopated notes are vermillion *and* dashed, strong-beat
  notes carry an outline). A
  screen-reader summary line describes the melody in words ("8-bar
  melody, 34 notes, range E4 to A5, 6 syncopated onsets, ends on the
  tonic").
- **Staff** (`EtudeStaffView.tsx`): real notation rendered by abcjs
  (the repo's existing notation renderer -- VexFlow was dropped, see
  `docs/engine-etude.md`), built from a pure ABC module with chord
  symbols above the staff and correct ties across barlines. The staff
  follows the current sounding transpose (global + per-exercise) for
  the melody notes, while chord symbols stay in concert key, matching
  the rest of the app.

Below the tabs, slice 3 added the annotation surfaces: a **Notes**
toggle (on by default) that shows or hides both the **margin-note
chip strip** (one chip per bar-anchored annotation -- `[m3-4] ii-V-I`
style; the chip covering the bar you are playing is highlighted) and
the **"About this etude"** fold (the full annotation list with its
text). Chips and About entries that resolve to a pedagogy concept
open the **Concept drawer**; the rest are plain text. The section
also gained a **Print** button (browser print of the active tab plus
visible annotations). Details: `docs/PRACTICE-MECHANICS.md`.

## MusicXML download

When an etude is loaded, a **MusicXML (with melody)** button appears in
the panel. The download contains two parts:

- **P1** -- the chord progression (the same harmony export that always
  existed);
- **P2** -- the generated **melody** as its own staff, with rests
  filling gaps and notes that cross a barline split into tied
  segments.

It exports the TRUE FORM (the etude's N bars, not the padded practice
loop), so it opens cleanly in MuseScore / Finale / Sibelius and
reflects the current sounding transpose. The legacy chord-only
MusicXML button is untouched, and chord-only exports are byte-identical
to before this feature existed.

## Shareable URLs

Every constraint serializes into the address bar as you accept an
etude, and the URL restores on load. Copy the URL from the address bar
and send it -- there is no copy-link button yet; the address bar IS
the artifact.

| Param | Example | Meaning |
|---|---|---|
| `style` | `jazz` | required, one of the three shipped styles |
| `key` | `Eb` | required, spelled tonic |
| `tmode` | `minor` | required, tonal mode (`major` / `minor`) |
| `diff` | `4` | required, 1-5 |
| `bars` | `16` | required, 4-32 |
| `seed` | `42` | required, uint32 |
| `tempo` | `144` | optional; absent = style default |
| `start` / `end` | `ii7` / `I` | optional advanced numerals |
| `chrom` / `straight` / `cts` | `1` | optional flags; absent = off |
| `maxint` | `12` | optional, max melody interval (semitones) |

A real, verified share URL (all defaults omitted-at-default rules
apply -- absent optional params mean "profile decides"):

```
/?style=pop&key=Eb&tmode=minor&diff=4&bars=16&tempo=144&seed=42&start=ii7&end=I&chrom=1&straight=1&cts=1&maxint=12
```

This reproduces "Golden Loop in Eb Minor" byte-identically, in this
browser or any other, forever.

**Why `tmode` and not `mode`:** `mode` is already owned by the app
mode selector (`?mode=compose|etude|explore`, REQ-MODE-2), and the
PRD's own example query string collides the two (`mode=etude` next to
`mode=major`) -- so the etude's tonal mode travels as `tmode`. The
address bar may also carry `mode=` and `transpose=`; those are the
Phase 1/2 app params -- they do not change the generated etude (the
transpose shifts playback and display only).

**The determinism promise (REQ-ETU-15):** same URL -> same constraints
-> same seed -> the identical etude. The generator consumes its seeded
random stream in one fixed order (harmony, then melody, then title),
and the round-trip URL -> parse -> generate -> byte-identity is pinned
by tests. Regenerating a previously seen seed+constraints pair is also
memoized, so re-opening the same URL is instant.

Malformed or partial etude params are warned to the console and
dropped (`?etude params malformed; ignoring`) -- the persisted session
value survives, and the rest of the URL still works, exactly like the
`?idea=` precedent.

## Keyboard

The panel is plain form fields -- typing inside them is guarded, so
the global shortcuts below never fire while you edit a seed or numeral.
Full map in `docs/MODES.md`:

- `1` / `2` / `3` -- switch Compose / Etude / Explore (the Composer
  lives on the Etude surface, `2`).
- `[` / `]` and `Shift+[` / `Shift+]` -- global transpose +/-1 and
  +/-12 semitones (the staff follows).
- There is deliberately **no `G` shortcut** for Generate in this slice
  (the PRD lists one; the button + URL are the shipped affordances).

## Not yet (follow-ups)

- **Melody audio**: the generated melody is notation + piano roll
  only. Playback is the chord backing through the existing chain; the
  tune's melody line does not sound. Formally deferred (TD-034):
  real melody audio needs a step-synced scheduler of its own.
- **Annotation surfaces shipped for etudes only.** The margin chips,
  About panel, Notes toggle, and Concept drawer are live (slice 3);
  the Compose / Explore hosts of REQ-PED-4 remain open, as do
  right-click-to-open on chord symbols (REQ-PED-6), concept search
  (REQ-PED-12), and the drawer's "Hear an example" / "Send to
  Explore" actions (REQ-PED-13). Drawer + print guide:
  `docs/PRACTICE-MECHANICS.md`.
- The three deferred advanced constraints (above).
- No popstate / back-forward handling for URL changes (replaceState
  only).

## Where to look

- Design: `docs/PHASE-3-SLICE2.md` (decisions D22-D31)
- Engine internals: `docs/engine-etude.md`
- Panel: `src/components/EtudeComposerPanel.tsx`
- Views: `src/components/EtudeViews.tsx`, `EtudePianoRoll.tsx`,
  `EtudeStaffView.tsx`; ABC builder `src/lib/etudeAbc.ts`
- Adapter (defaults, memoized generation, path conversion):
  `src/lib/etudeEngine.ts`
- URL serialization: `src/lib/etudeUrl.ts`; accept + boot/URL wiring:
  `src/App.tsx` (`handleEtudeAccept`)
- MusicXML second part: `src/lib/scoreExport.ts`
