# Explore Mode (PRD-001 Phase 5)

Explore is the harmonic what-if surface. Compose starts from a file
and Etude starts from constraints; Explore starts from a seed -- a
chord, a progression, a scale, an interval, or free text -- and
answers "what else could this be" with no fixed goal. There is no
right answer and nothing to complete: you type a seed, run an
operation, and keep the cards that sound interesting. Phase 5 made
this real for the first time; before it, Explore was an empty-state
stub (three visual chips that committed nothing, plus the form
planners rendered read-only).

Open Explore with the tab or the `3` key.

User requirements traced here: REQ-EXP-1/2 (seeds + presets),
REQ-EXP-10 (reharmonize), REQ-EXP-11 (substitute), REQ-EXP-12
(expand), REQ-EXP-13 (vary), REQ-EXP-15 (voice-lead, re-skin),
REQ-EXP-20/21/22 (idea cards + Hear/Send/Save + concept-linked
rationales), REQ-IDEA-3 (crossover completion). REQ-EXP-14
(modulate) is deferred -- see "Not yet" below. Design authority:
`docs/PHASE-5-EXPLORE.md` (D93..D101).

## Seeds: five kinds, twelve presets, free text

The seed picker takes anything you type and parses it through the
one chord grammar plus small scale/interval grammars, in a fixed
order: a whole-string chord first, then a run of chord symbols (a
progression), then a scale (`D dorian`, `C blues`, either word
order), then an interval (`P5 up`, `oct`), and anything else falls
through to free text -- never an error, never a dead end. The five
kind tabs above the input (chord / progression / scale / interval /
free) are filter hints only: picking one fills an example into the
input, it never constrains the parser. A live "parses as" readout
next to the chips keeps the parse honest in front of you.

Three preset chips sit beside the input, drawn from a fixed list of
12 (the same 12 the old stub showed, verbatim):

- `Cmaj7`, `ii-V-I in C`, `D dorian`, `Fmaj7`, `C blues`,
  `12-bar in A`, `C lydian`, `Dm9`, `Bbmaj7-A7alt`,
  `G mixolydian`, `Cm-Eb-Gm progression`, `Phrygian in E`

Two presets do quiet honest work: `ii-V-I in C` realizes numerals
to chord symbols in the named key, and `12-bar in A` spells out the
standard 12-bar blues changes (labeled as such on the card -- never
claimed as your own progression). A free-text seed shows no cards
and no operation buttons, just the empty-state copy ("scales
harmonize, intervals transpose") plus the preset chips.

Landing from the Idea bar boots the seed for you: whatever Idea you
are carrying becomes seed text (a melody Idea seeds the Vary panel
below, not the parser -- documented where it lands).

## The five operations, in plain language

Which buttons appear depends on the seed kind. A chord seed offers
Substitute + Expand; a progression offers Reharmonize + Substitute
+ Voice-lead; a scale offers Harmonize + Voice-lead; an interval
offers Transpose + Voice-lead. The rule behind all five is one
line: **every suggestion names the technique it actually used**
-- a label is a claim about computed intervals on the same data,
never a style name and never prose.

- **Reharmonize** -- three alternative harmonizations of a
  progression seed ("Reharm 1 (2 of 3 bars)" style labels).
  Honesty in one line: each rebuilt bar names the substitution
  that produced it, and bars with no candidate are carried over
  labeled "kept".
- **Substitute** -- one-chord swaps for a chord seed (or the first
  chord of a progression): tritone subs, secondary dominants,
  borrowed (modal-interchange) chords, passing diminished chords.
  Honesty in one line: a tritone label fires only when the
  candidate really sits a tritone away and resolves down a
  semitone to a tonic chord -- near-misses ship no label.
- **Expand** -- wider versions of one chord (`Cmaj` ->
  `Cmaj7`/`C6`/`Cadd9`; `G7` -> `G9`/`G7alt`). Honesty in one
  line: a target ships only when its pitches strictly contain the
  original's, so `dim7`/`sus4` chords honestly return nothing
  (there is nothing wider in the table).
- **Vary** -- melodic transforms over a pitch line, run from the
  "Vary a line" panel (type MIDI pitches, or "Use for vary" under
  any melody card): Displaced / Inverted / Reversed / Ornamented.
  Honesty in one line: displacement is a pitch-order rotation,
  labeled as such -- the pitch-only line cannot carry rhythm, so
  true rhythmic displacement is recorded as follow-up TD-EXP-SLOT.
- **Voice-lead options** -- the same progression voiced five ways
  (Close / Drop 2 / Quartal / Spread / Block). This is a re-skin
  of the Compose voicing engine with zero new voice-leading math.
  Honesty in one line: "Drop 2 (realized, bar 0)" and the
  voice-leading / drop-2 concept links appear only when the
  realized pitches satisfy the motion/spread gates -- a style
  name alone is never a claim.

There is no Modulate button and no modulation operation:
REQ-EXP-14 is deferred as TD-EXP-MOD (a key-change claim without
pivot analysis would violate the honesty rule above).

## Idea cards

Every result is a card: a short label, a technique chip naming
what was computed, a one-sentence description, and an italic
rationale that names the actual intervals. Rationales that resolve
to a taught concept carry an inline link that opens the same
**Concept drawer** the Etude and Compose surfaces use; the rest
are plain text, not dead click targets.

Each card carries one action row:

- **[Hear]** -- auditions the card through the existing Compose
  preview voice (close-position chords at 120 BPM; melody cards
  add the lead voice on top). The button mirrors the preview
  state: `Hear` -> `Rendering...` -> `Stop` -> back to `Hear`.
  Pressing Stop (or sending the card onward) silences it.
- **[Send to Compose]** -- progression cards only. Cards with no
  progression disable it with the honest title "Only progression
  cards transplant to the chart grid".
- **[Send to Etude]** -- the button reads "Send to Etude" and its
  hover title reads verbatim "Practice in this key (carries key
  and bar count, not literal chords)".
- **[Save]** -- mints the card into the Idea bar and persists it
  to `hse.ideas` like any other Idea.

## Crossover: what lands where

**Compose landing is chart text you can edit before generating.**
The card's progression becomes chart text (one chord per bar, key
directive included) and lands as a real chart session: the chart
is editable cell by cell, and the accompaniment generates only
when you press Generate -- nothing auto-fires.

**Etude landing carries the key honestly, not the chords.** Chord
symbols and the Etude numeral grammar are disjoint, so a literal
transplant would be unsound -- instead the card carries key, mode,
bar count (clamped 4..32), and a deterministic seed into the
Etude constraint panel, and you press Generate there. That is
exactly what the "Practice in this key" title promises: practice
in this key, not these chords. A literal symbol-to-numeral bridge
is recorded follow-up TD-EXP-LITERAL.

The Idea bar completes the triangle in both directions: Send to
Compose transplants chord/progression Ideas literally (other kinds
warn honestly and still navigate -- the surface boots from the
carried Idea, never a dead end); Send to Etude carries
constraints the same way the cards do; Send to Explore just
switches modes, the Idea itself is the carrier.

## Determinism

Same seed + same inputs = same cards. Every operation draws from
a seeded random stream in a fixed order, and card ids are hashes
of seed + operation + index (never random draws), so re-running a
seed reproduces its cards byte-identically -- and re-rolling with
a new attempt gives a genuinely new draw, with Back/Forward
history (capped at 20) to walk back.

## Session behavior

Explore state is transient and local: seed text, cards, and
history live in the surface, not the persisted store -- a reload
clears them, and switching modes never prompts (Explore is
always `dirty === "none"`). Persistence is explicit: Save a card
and it is an Idea like any other.

## Not yet -- what Explore does NOT do today

- **No modulation.** No button, no promise -- TD-EXP-MOD sketches
  the dual-key pivot design for a fast-follow.
- **No literal Etude transplant.** Key + bars carry; chord
  symbols do not (TD-EXP-LITERAL).
- **Displacement is rotation.** The pitch-only stand-in is
  labeled on the card (TD-EXP-SLOT for true slot-grid
  displacement).
- **No shareable Explore URLs.** Cards are runtime data, never
  catalog files; the `?idea=` carrier is the sharing path.
- **No audio beyond Hear.** The audition is chords (+ lead for
  melody cards) through the Compose preview voice -- no mixer,
  no export, no melody playback engine of its own.

## Where to look

- Design: `docs/PHASE-5-EXPLORE.md` (decisions D93..D101)
- Engine: `engine/explore/` (`seeds.ts`, `substitute.ts`,
  `reharmonize.ts`, `expand.ts`, `vary.ts`, `voicelead.ts`,
  `cards.ts`, `modulate.ts` deferred stub, `types.ts`)
- Surface: `src/components/ExploreSurface.tsx` (local state,
  ops matrix, crossover handlers); `src/components/SeedPicker.tsx`
  (first entry + preset chips); `src/components/IdeaCard.tsx`
  (card + action row)
- Hear adapter (the only audio-touching file):
  `src/lib/exploreHear.ts` (pure builder + preview-singleton
  playback)
- Crossover: `src/components/IdeaBar.tsx` (`handleSend`, all
  three arms wired); `src/lib/etudeEngine.ts`
  (`DEFAULT_ETUDE_CONSTRAINTS` base); chart seam:
  `engine/compose/chordchart.ts` + `engine/compose/types.ts`
- Browser coverage: `e2e/explore.spec.ts` (seed->cards,
  Send-to-Compose landing, Hear state machine, Etude carry +
  truth spot)
