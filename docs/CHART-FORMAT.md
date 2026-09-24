# Chord-Chart Paste: the Grammar (for humans)

The reference for text you type or paste into Compose's
[Paste a chord chart] panel. The PRD specs it tersely
(REQ-IO-10..16); the engine's internal table lives in
`docs/engine-compose.md`; this page is the human version, verified
against `engine/compose/chordchart.ts` + `engine/compose/chordsym.ts`
and their pinned tests.

A chart is plain text: optional `{...:}` directive lines, then
chord tokens. One token = one bar. Everything bad warns; almost
nothing fails (see "Errors" below).

## Structure at a glance

    {key: Bb}          <- optional directives (each on its own line)
    {tempo: 132}
    {time: 4/4}
    {style: jazz}
    Bbmaj7 Gm7 Ebmaj7 Ab7 | Bbmaj7 % Cm7 F7 | - % % %

- Directive lines must be ALONE on their line (pattern
  `{name: value}`); anything else is body text. A line like
  `{key: Bb} C F` is THREE body tokens, not a directive.
- Body: `|` characters are STRIPPED (purely visual), then every
  whitespace-separated token is ONE BAR. Newlines are just
  whitespace - break lines wherever you like.
- Cap: 512 bars (tokens). Over the cap the whole paste is rejected
  with "chart too long (N bars; limit is 512)".

## Directives (the header)

Names are case-insensitive; whitespace around the colon is legal.
A bad VALUE warns and is ignored - the rest of your header and the
whole body still parse.

| Directive | Accepts | Notes |
|---|---|---|
| `{key: X}` | tonic + optional quality: `Bb`, `Cm`, `F# minor`, `Eb major` | major/minor ONLY (a modal value warns + ignored). A user-stated key is CERTAIN (confidence 1) - it is a directive, not a guess. Drives chord spelling + the generated key signature |
| `{tempo: N}` | finite number 20..300 | becomes the session's ONE fixed tempo (a pasted chart has no analysis-header tempo field - this directive is how you set it) |
| `{time: n/d}` | denominator in {1,2,4,8,16,32}, numerator 1..16 | e.g. `6/8`, `3/4`. Sets every bar's length. (16/32 are real denoms for long-note meters like `4/16` - a single-digit-denominator regex silently rejected them before the S4 fix round; widened + pinned) |
| `{style: s}` | a shipped style id: `jazz`, `pop`, `classical` | a SUGGESTION: at commit it pre-fills the accompaniment request once; the panel owns it after |
| `{anything-else: x}` | - | warns "unknown directive" and is ignored |

## Chord symbols (the same grammar as the cell editor)

One recognizer, shared by paste AND the popover editor
(`engine/compose/chordsym.ts`) - what the preview accepts is what
the grid can hold.

- Root: `A`-`G` with `#`/`b` (enharmonics all land on the same
  pitch class; display spelling follows the key family).
- Qualities (canonical suffix): `` (maj), `m`, `dim`, `dim7`,
  `m7b5`, `maj7`, `m7`, `7`, `7alt`, `sus4`, `6`, `m6`, `add9`,
  `madd9`, `maj9`, `9`, `m9`.
- Aliases: `M7`/`Maj7` -> maj7, `M9`/`Maj9` -> maj9, `M6` -> maj6,
  `-` -> m, `min` -> m, `o` -> dim, `o7` -> dim7, the slashed
  circle (or `halfdim`) -> m7b5, `alt` -> 7alt.
- REJECTED (the grid cannot honestly hold them): alterations and
  extensions beyond the 17 (`C13`, `C7#9`), inner whitespace
  (`C sus4`), anything not root-first.

## The slash rule (two readings, one deterministic winner)

`X/Y` is ambiguous: an INVERSION (one chord, bass note Y) or TWO
CHORDS in the bar. The rule, in order:

1. Try to parse the WHOLE token as one symbol. The bass must be a
   CHORD TONE. `C/G` -> one cell (G is C's 5th). `G7/B` -> one
   cell. `Cmaj7/B` -> one cell.
2. Otherwise split on `/` into EXACTLY two sides and parse each:
   - both parse -> TWO cells, first half + second half of the bar:
     `C/Am` -> C then Am.
   - one side fails -> the parsing side still LANDS + a warning
     for the other: `C/junk` -> one C cell + warning.
3. Three or more sides (`C/E/G`) -> the token is a non-chord
   (rest + warning).

The subtle consequence, pinned by a test: **`Em7/A` is TWO
cells** (Em7 then A), NOT one inversion - A is not a chord tone of
Em7 (E G B D), so reading 1 fails and reading 2 lands. An older
design-doc example claimed one cell; the RULE is authoritative
(the doc example is a recorded erratum). Same math: `C/D` -> two
cells (C, then D), `G/F#` -> two cells (G, then F#).

A split bar promotes the WHOLE grid to half-bar slots
(`slotsPerBar: 2`); single-chord bars keep the full bar.

## Repeats and rests

- `%` repeats the PREVIOUS bar's cells VERBATIM - including a
  two-cell bar. It is a BAR-level repeat: to repeat an 8-bar
  section you re-type the 8 tokens (a run of `%` just repeats the
  one bar before each).
- A leading `%` (no previous bar) lands a rest + warning.
- Rests: `-`, `0`, `r` (case-insensitive).

## Warnings and errors

Warnings are shown in the preview and NEVER fail the chart
(REQ-IO-15). Exact shapes:

    bar 2: 'junk' is not a chord symbol
    bar 2: non-ASCII token rejected
    bar 1: '%' repeat has no previous bar - rest used
    bar 1: 'junk' is not a chord symbol        (the failing split side)
    directive {tempo:} '999' is not a tempo in 20..300 - ignored
    unknown directive '{groove:}' ignored

Only three arms reject the whole paste: no tokens at all, nothing
sounding after parsing (all rests/junk) -> "no chord symbols
found"; and the 512-bar cap.

## Worked examples

12-bar blues in Bb (quick-to-slow, turnaround on 12):

    {key: Bb}
    {tempo: 144}
    {style: jazz}
    Bb7 % % Eb7 % Bb7 % F7 % Bb7 % F7

32-bar rhythm-changes AABA with bar-level `%` and one split bar:

    {key: Bb}
    {tempo: 200}
    Bb7 % Gm7 % Eb7 % Cm7/F7 F7
    Bb7 % Gm7 % Eb7 % Cm7/F7 F7
    Eb7 % Ab7 % Eb7 % F7 %
    Bb7 % Gm7 % Eb7 % Cm7/F7 F7

An inverted-bass chart (each slash is ONE cell - every bass is a
chord tone):

    {key: C}
    Cmaj7 Cmaj7/B Am7 Am7/G Dm7 G7/F Em7 A7/G Dm7 G7 Cmaj7 %

## Editing, committing, and what round-trips

The preview is EDITABLE before you commit (REQ-IO-14): every cell
is an inline field re-parsed through THE SAME grammar - a rejected
symbol rings red and [Use chart] stays disabled until fixed. A
blank cell is a rest.

On commit, the persisted/URL chart text is REGENERATED from the
grid you approved (directives first, rests as `-`), so the text
re-parses to what you saw - with ONE documented exception: a
slash-bass cell INSIDE a two-cell bar ("C/E" + "Am") joins as
"C/E/Am", which re-parses as a non-chord token (rest + warning) -
the `/` grammar is inherently ambiguous there. The same drift hits
edited 2-cell bars whose join re-parses differently: `[C, G]` joins
"C/G" (one cell - G is C's 5th), `[C, Em7/G]` joins "C/Em7/G"
(three sides - rest), `[C, -]` joins "C/-" (C lands + warning, one
cell). The panel WARNS at commit time (MED-002, pinned): "Some bars
cannot be saved unambiguously and will merge on reload - approve
anyway?" with the bar numbers, and [Use chart] needs a second
approve click - the preview grid stays the truth-teller, and drift
only ever warns, never rewrites. The editable preview is the other
safety valve: fix it before committing, or split the bar across two
bars.

Everything else round-trips: chord qualities, inversions, rests,
split bars (without slash bass), all four directives.

Size: the chart text rides the share URL (`cchart`) under its
6000-character governor - a huge chart can push the compose keys
out of the URL (honest notice, never silent truncation; the
persisted local session is unaffected). See
`docs/COMPOSE-MODE.md` "Export + share".
