# SESSION DOCUMENT — 2026-10-08 (iteration 2, Batch F)

Follow-on to `SESSION_DOCUMENT-2026-10-08.md` (which closed with the
2-hour autopilot at PracticeHeader saturation). Branch `main`,
PR #3 merged (`a277ff7`).

## What shipped

**`concept-diminished-trail`** (MASTERCLASS_TODO Batch F) + a real
theory fix it depended on.

### 1. `fix(theory): analyzeChord classifies a fully-diminished 7th as "diminished"`

`src/lib/theory.ts:728-729` was:

```
else if (hasMinor3 && intervalsFromRoot.has(6)) family = "half-diminished";
else if (hasMinor3 && intervalsFromRoot.has(5)) family = "diminished";
```

The `m3 + b5` test ignored the 7th, so `Cdim7` (m3 + b5 + bb7, i.e.
intervals 0/3/6/9) matched the FIRST branch exactly as a `Cm7b5`
(m3 + b5 + b7, 0/3/6/10) did. The `"diminished"` family in the
`ChordAnalysis` type was **dead code** — nothing could return it.

Fix: read the 7th. b7 (10 semitones) = half-diminished; bb7
(9 semitones) = diminished; a triad has no 7th and classifies on its
own intervals.

Blast radius, verified not assumed:

- 242 shipped path steps across `ALL_PATHS` now report `"diminished"`
  that previously reported `"half-diminished"`.
- Consumers: `ChordInspector.tsx:243,263` (Family row — confirmed live,
  see below), `App.tsx:850-857` (co-compose accept maps
  `half-diminished` → a *minor* triad, so a dim7 was being accepted as
  Em, not E°), `CoComposePanel.tsx:29`, `quizEngine.ts:102,116`.

`src/lib/theory.test.ts` had a test named "classifies a fully diminished
triad (C Eb Gb) **per code's actual rule**" asserting the defect. That
test was **retired, not re-pinned** — it encoded a bug as a contract.
Replaced with the dim7-vs-m7b5 distinction asserted both ways.

### 2. `feat(masterclass): concept-diminished-trail`

`src/lib/conceptPaths.ts` — 9-bar descending whole-step chain
(G7 | F#°7 | Fmaj7 | E°7 | Em7 | D#°7 | Dm7 | C#°7 | Cmaj7),
36 steps, 4 per bar, root-position 4-note voicings in G3–F#5.
`inApp: true` + a curated `objective` (bump `curatedBriefingCount`
pin 12 → 13 in `tests/pathBriefing.test.ts`).

## The test caught three of my own theory errors

Worth recording, because the first draft of both the path prose and the
test asserted things that are simply false:

1. **"Each dim7 shares all four pitch classes with both neighbours."**
   False. A dim7 is a *dominant 7th with three notes raised a
   semitone* — it does not share pitch classes with its resolution.
2. **"Each dim7 resolves to a dominant 7th from three of its four
   notes."** False — measured: 1 of 4.
3. **"Each dim7 sits a major 2nd above its resolution."** False — it
   sits a semitone at-or-above (gap 1 or 0).

Corrected claims (verified by computation before re-asserting):

- lowering a dim7's root a semitone yields the dom7 below it, **pitch
  for pitch**;
- the dim7 root sits 0 or 1 semitone above the chord it resolves into.

The source docblock, the `objective`, and three step `descriptions`
carried error #3 and were corrected too.

`tests/concept-diminished-trail.test.ts` (8 cases) asserts the musical
invariant, not the literal voicing. Discriminating: mutating one note
of one dim7 (E°7 `[52,55,58,61]` → `[52,55,58,62]`) fails 3 assertions.

## Verification

- `npm run lint` (tsc --noEmit): 0 errors
- `npm test`: **3186 passed | 1 skipped** (was 3177, +9), 238 files
- `npm run build`: green
- `npm run check:paths`: 47/47 OK (PATHS 46 → 47), 36/36 studies
- `node assets/check-links.cjs`: green after README 507 → 515 and
  `src/magenta/README.md` resync (the drift gate caught the count drift
  on the first run)
- `grep -o "concept-diminished-trail" dist/assets/index-*.js | wc -l` → 2

### Live-app smoke (Chromium against `vite preview` on :4174)

Opened `?mode=etude&path=concept-diminished-trail`. Bar strip renders 36
cells, all nine chords present in order, objective card renders.
Chord inspector (reached via the mobile "More options → Inspect" sheet)
working-voicing FAMILY per bar:

| Bar | Chord | FAMILY |
|---|---|---|
| 1 | G7 | dominant |
| 5 / 13 / 21 / 29 | F#°7 / E°7 / D#°7 / C#°7 | **diminished** |
| 17 / 25 | Em7 / Dm7 | minor |
| 33 | Cmaj7 | major |

Zero occurrences of "half-diminished" anywhere in the page.

## Opened, not fixed (TD-067)

`App.tsx:5963` passes `originalNotes={path.steps[Math.max(0,
activeStepIndex - 1)]?.notes}` — the *previous* step's notes — while
`ChordInspector` renders the SYMBOL from the active step. Visible in
the smoke screenshot: selecting an F#dim7 bar shows symbol `F#dim7`
over the previous bar's G7 notes, so "ORIGINAL (AS WRITTEN)" reads
FAMILY `dominant` while "WORKING VOICING" correctly reads
`diminished`. Pre-existing and unrelated to this iteration; recorded in
`.kai/tech-debt/register.md` as TD-067 rather than expanded into.

## Remaining Batch F blockers

- `concept-solar-diatonic-solo` — needs authored *melody*; the app
  has no melody lane on paths (TD-034: chords play, melody does not).
- `concept-house-of-harmony` — a graphic, not chord data; needs a
  visualization surface that does not exist.