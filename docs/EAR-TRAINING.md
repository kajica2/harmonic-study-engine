# Ear Training (PRD-001 Phase 6)

Ear training is the hearing gym on the Etude surface. It plays
short prompts -- an interval, a chord, a scale, a progression, a
few notes to notate -- and you name what you heard. There is a
right answer every time, and the panel tells you honestly how you
are doing: per-answer feedback, a running accuracy line, and a
per-concept memory that resurfaces what is due. No points, no
levels, no badges -- streaks are the only progression mechanic.

User requirements traced here: REQ-PED-20/21 (7 drill types,
seeded generator, difficulty 1-5, seed), REQ-PED-22 (same-pool
distractors minus the answer), REQ-PED-23 (enharmonic + timing
tolerance), REQ-PED-24 (partial credit, melodic dictation only),
REQ-PED-25 (failure offers the linked concept), REQ-PED-30/31/32
(SRS state, SM-2, due-bias), REQ-PED-40/41/42 (log entries,
summary, storage), REQ-PED-6 (right-click chord to concept),
REQ-PED-12 (drawer search), REQ-PED-13 (drawer Hear + Send to
Explore). Scoring follows the Q10 call: accuracy-% + streaks,
never XP. Design authority: `docs/PHASE-6-PEDAGOGY.md`
(decisions D102..D114).

## Where it lives

Open Etude with the tab or the `2` key. The **Ear training**
section sits between the Etude Composer panel and the practice
views: pick a type, a difficulty (1-5), and a seed, press
Generate, then press **Hear prompt** to listen. Same type +
difficulty + seed always produces the same prompt, so a seed is a
shareable drill by word of mouth. Training attempts never mark
the session dirty -- missing an interval will never trigger the
mode-switch prompt.

First visit shows the empty-state copy ("Hear a prompt, name
what you heard, and build harmonic hearing") and nothing is
saved until your first answer.

The app header carries a **concept search** box beside the mode
selector: type a fragment of a title or definition, press Enter,
and the concept drawer opens on the first match.

## The seven drills, in plain language

Five drills are multiple choice (the answer plus three
same-pool distractors, shuffled into four buttons). Two are
write-it-down (a text field plus on-screen piano keys that
append note names; Web MIDI input is not wired here). The
**Hear prompt** button plays every prompt through the existing
Compose preview voice -- no new audio engine, no new transport.

- **Intervals** -- you hear two notes back to back ("Which
  interval?") and pick one of four. Level 1 sticks to the
  friendly three (perfect 5th, perfect 4th, major 3rd); higher
  levels add minor 2nds and 3rds, 6ths, 7ths, the tritone, and
  the augmented interval; level 5 sometimes stacks an extra
  octave on top.
- **Chord quality** -- you hear one block chord ("Which chord
  quality?") and pick one of four. Level 1 is major vs minor;
  higher levels add 7th chords, diminished and
  half-diminished, 9ths, and at level 5 altered, suspended,
  and major-6th colors.
- **Chord inversion** -- you hear one chord ("Which
  inversion?") and answer root, 1st, 2nd, or 3rd. Levels 1-2
  use triads; level 3 and up use seventh chords (which is
  where 3rd inversion becomes possible).
- **Progression** -- you hear the roots of a short
  progression, one bar per chord ("Which progression?
  (N chords)") and pick one of four. Level 1 is two-chord
  pairs; level 2 adds the ii-V-I; level 3 a 12-bar blues
  fragment; level 4 a rhythm-changes-style bridge fragment;
  level 5 a Coltrane-style fragment.
- **Scale** -- you hear an ascending scale ("Which scale?")
  and pick one of four. Level 1 is major vs minor; higher
  levels add dorian, mixolydian, lydian, phrygian, locrian,
  blues, and at level 5 the full chromatic run.
- **Melodic dictation** -- you hear a short stepwise melody
  ("Notate the 4 notes", 6 at levels 3-4, 8 at level 5) and
  type it as note names (`C D E`) or MIDI numbers
  (`60 62 64`), or tap the piano keys. This is the one drill
  with partial credit (see Scoring).
- **Harmonic dictation** -- you hear chord tones ("Notate
  the 4 chord tones"): one chord at low levels, two chords
  back to back higher up. Same input as melodic dictation,
  but grading is exact -- no partial credit.

Distractors come from the same pool as the answer and never
contain it spelled differently: if the answer is A#, Bb is
excluded from the options by design.

## Scoring: what counts and how it reads

Every answer gets a one-line verdict: `Correct: <question>
Answer <key>` or `Not quite: <question> Answer <key>
(3/4 pcs)`. Below the prompt the session line keeps the
honest tally, for example `12/20 correct (60%) - streak 3`,
plus a per-concept memory line such as `SRS voice-leading:
streak 2, due in 6 days`. A miss also offers a `What is
<concept>?` button that opens the drawer on the concept the
prompt teaches -- every prompt carries exactly one.

Spelling never punishes you: answers are compared by pitch
class, so **Cb counts for B**, Fb for E, B# for C, E# for
F, and A# equals Bb. Quality aliases are accepted too
(`m7b5` counts for half-diminished). What fails honestly: a
near-miss name with a different pitch (`B` for `Bb`),
or the right root with the wrong quality (`Cmaj7` for
`Cm7`).

Partial credit exists for melodic dictation only: the pitch
hit fraction plus a small contour bonus (capped at 1.0),
correct at 0.85 and above. Every other drill is exact.

## Remembering: one paragraph on SRS

Your hits and misses feed a per-concept memory running the
canonical SM-2 algorithm. Each concept holds an ease factor
(starting at 2.5, never below 1.3), a gap in days, and a
streak: a first correct answer is due tomorrow, a second
after 6 days, then the gap multiplies by ease; a miss
resets the gap to a day and the streak to zero. The next
drill favors overdue concepts, weighted by how overdue; when
nothing is due it picks the longest-unseen concept. State
lives outside the session store in `pedagogy.srs` (10
concepts max, corrupt data falls back to empty), and
progress is streaks, never points.

## Your practice log

Every answer appends one entry to `pedagogy.log` (capped at
500): when it happened, the prompt id, correct / incorrect /
partial, seconds spent, and the concept. The summary math --
minutes practiced per day over the last 30 days, attempts
per concept over the whole log, and rolling accuracy over
the last 20 attempts (a partial counts half) -- is computed
from that log. Honest gap: no summary panel renders on
screen yet; the panel shows the session honesty line, and
the log waits for a future surface.

## The drawer, everywhere in Phase 6

The concept drawer gained a footer with two buttons. **Hear
an example** plays the concept's own example chords,
generated in C through the preview voice (the label reads
what the tokens say, e.g. "Hear ii-V-I in C" -- never a
hand-authored recording). **Send to Explore** carries those
example numerals as free-text seed into Explore. In Compose,
right-clicking (or long-pressing, or Shift+F10 on) a chord
cell in the analysis card opens the concept linked from the
nearest annotation covering that bar -- or the global
search prefilled with the cell symbol when no annotation
covers it. Chord cells elsewhere stay ungated follow-up
work, tracked as TD-PED-6-REST.

## Not yet -- what ear training does NOT do today

- **No summary panel.** The log and its summary math ship;
  the on-screen rendering is a fast-follow.
- **No MIDI answers.** The on-screen piano and the text
  field are the inputs; Web MIDI ear answers are tracked
  debt.
- **PED-6 is scoped.** Right-click-to-concept works on
  Compose analysis chord cells only; piano-roll labels,
  chart-viewer roman spans, and the dirty-surface hosts
  wait for their owners (TD-PED-6-REST).
- **No shareable ear URLs.** Prompts are runtime data, never
  catalog files; the seed numbers are the sharing path.
- **Prompts are short by construction.** The longest (a
  4-chord progression) runs seconds; nothing approaches the
  preview length cap.

## Where to look

- Design: `docs/PHASE-6-PEDAGOGY.md` (decisions D102..D114)
- Engine: `engine/ear-training/` (`types.ts`,
  `generate.ts`, `distractors.ts`, `check.ts`) and
  `engine/pedagogy/` (`srs.ts`, `log.ts`)
- Surface: `src/components/EarTrainingPanel.tsx` (local
  state, honesty line, failure-concept offer);
  `src/components/ConceptSearch.tsx` (header search);
  `src/components/useConceptPress.ts` (PED-6 gestures)
- Hear adapter (the only audio-touching file):
  `src/lib/earHear.ts` (pure builder + preview-singleton
  playback, plus the generated concept examples)
- Adapters: `src/lib/srsStore.ts` (`pedagogy.srs`, cap 10);
  `src/lib/pedagogyLog.ts` (`pedagogy.log`, cap 500)
- Browser coverage: `e2e/ear-training.spec.ts`
  (prompt->answer->feedback->SRS update; failure-concept
  drawer + header search)
