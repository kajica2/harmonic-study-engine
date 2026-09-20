# Masterclass Enablement — per-tune backlog (FUTURE_PLANNING #4)

Status as of 2026-09-18. The masterclass catalog at
`src/data/masterclass.ts` has 38 entries; only **3** are
`inApp: true` (Star Eyes, What Is This Thing Called Love, I Got
Rhythm). The remaining 35 ship as concept placeholders that need
an 8-bar `HarmonicPath` entry in `src/lib/paths.ts` (or
`src/lib/studies.ts`) and an `inApp: true` flip on the catalog
entry.

This file is the per-tune iteration queue. `TODO.md` holds the
single Phase-7 pointer that the loop wrapper reads first; the
loop then comes here for the next unchecked item.

## How to do one iteration

For each tune:

1. Read the tune's title and classes in `src/data/masterclass.ts`
   to confirm key, form, and the MC family it's in.
2. Author an 8-bar `HarmonicPath` entry in `src/lib/paths.ts`
   (RAW_PATHS) — key from `masterclass.ts` when present, Real
   Book voicings from `scripts/ingest_standards.py`. Match the
   style of existing entries like `study-solar` (which is the
   3-of-38 that's already enabled and a good template).
3. Flip `inApp: true` in `src/data/masterclass.ts` for that id.
4. `npm run lint` + `npm run build` + `npm test` must all pass.
5. Verify the new path's id is in `dist/assets/index-*.js` via
   `grep -o "<id>" dist/assets/index-*.js`.
6. Mark the row `- [x]` in this file.
7. Commit message: `feat(masterclass): enable <Title> — <id> path
   in paths.ts + flip inApp`.

If authoring the path requires real-book transcriptions you don't
have, defer the row with `- [ ]` → add a `- [ ]` sub-bullet
"blocked: needs Real Book source" and skip to the next one.

## Priority order (MC 1–10 first, per FUTURE_PLANNING)

Batches are grouped by primary MC class. Within a batch, lower
class numbers come first.

### Batch A — MC 1 (Charlie Parker foundation, 6 tunes)

- [x] **Yardbird Suite** (`study-yardbird-suite`, MC 4 / MC 19) —
      Parker's contrafact on "Back Home Again in Indiana".
      B-flat, AABA. Re-use the
      `scripts/ingest_standards.py` Real Book voicing pipeline.
- [x] **Sometimes I'm Happy** (`study-sometimes-im-happy`, MC 6 / MC 12
      / MC 14-P1) — Youmans standard. C major / G major. 32-bar AABA.
- [x] **Stella by Starlight** (`study-stella-by-starlight`, MC 18) —
      Young / Washington ballad. B-flat minor / G minor. 32-bar AABA.
- [x] **There Will Never Be Another You**
      (`study-there-will-never-be-another-you`, MC 23 / MC 24 / MC 32) —
      Warren / Gordon. F major. 32-bar AABA.
- [x] **Out of Nowhere** (`study-out-of-nowhere`, MC 25 / MC 26 / MC 27
      / MC 28) — Green / Heyman. G major. 32-bar AABA.
- [x] **Nostalgia in October** (`study-nostalgia-in-october`, MC 29 /
      MC 30 / MC 31) — less common, A-flat major.

### Batch B — MC 7–10 (ii-V-I fluency, 5 tunes)

- [ ] **Cherokee** (`study-cherokee`, MC 13 / MC 15 / MC 16 / MC 20
      / MC 21 / MC 34) — Noble. B-flat major. 32-bar AABA.
      Note: this id is `study-cherokee` — confirm path authoring
      matches the "study-" prefix convention.
- [ ] **Groovin' High** (`groovin-high`, MC 36) — Gillespie.
      F major. 32-bar AABA.
- [ ] **Hot House** (`hot-house`, MC 10 / MC 11 / MC 12) —
      Gillespie / Fuller. G major. 32-bar AABA.
- [ ] **Confirmation** (`confirmation`, MC 34) — Parker. F major.
      32-bar AABA.
- [ ] **Lester Leaps In** (`lester-leaps-in`, MC 21 / MC 25) —
      Young. A-flat major. 32-bar AABA.

### Batch C — MC 12 (ballad standard, 1 tune)

- [ ] **Lady Be Good** (`lady-be-good`, MC 12 / MC 14-P1) —
      Gershwin. G major. 32-bar AABA.

### Batch D — MC 1 deep cuts (5 more Parker-era)

- [ ] **Shoe Shine Boy** (`shoe-shine-boy`, MC 1)
- [ ] **In the Middle of a Kiss** (`in-the-middle-of-a-kiss`, MC 1)
- [ ] **Mr. 5 by 5** (`mr-5-by-5`, MC 1)
- [ ] **Just Friends** (`just-friends`, MC 1 / MC 6)
- [ ] **Sophisticated Lady** (`sophisticated-lady`, MC 1)

### Batch E — MC 1 encore (3 more)

- [ ] **Teach Me Tonight** (`teach-me-tonight`, MC 1)
- [ ] **You Don't Know What Love Is** (`you-dont-know-what-love-is`,
      MC 1)
- [ ] **Sweet Rosie O'Grady** (`sweet-rosie-ogrady`, MC 19)

### Batch F — Concept exercises (already in masterclass.ts,
authored as `concept-*` ids)

- [ ] **Solar diatonic solo** (`concept-solar-diatonic-solo`, MC 8)
- [ ] **Diminished trail through changes**
      (`concept-diminished-trail`, MC 15)
- [ ] **House of Harmony (graphic)**
      (`concept-house-of-harmony`, MC 16 / MC 17 / MC 18)
- [ ] **Line cliches through the form**
      (`concept-line-cliches`, MC 27 / MC 28)
- [ ] **3-to-9 / 9-to-3 through the form**
      (`concept-three-to-nine`, MC 28 / MC 29 / MC 40)

### Batch G — Deep cuts (lowest priority, can defer)

- [ ] **If You Were No One** (`if-you-were-no-one`, MC 7 / MC 10)
- [ ] **Casba** (`casba`, MC 25)
- [ ] **Puerto Rico** (`puerto-rico`, MC 26)
- [ ] **Apostrophe** (`apostrophe`, MC 30)
- [ ] **I Never Knew** (`i-never-knew`, MC 25)
- [ ] **Strange Dear, But True Dear**
      (`strange-dear-but-true-dear`, MC 16)
- [ ] **How Much Do I Love You** (`how-much-do-i-love-you`, MC 16)
- [ ] **I'll Remember April**
      (`ill-remember-april`, MC 35 / MC 38 / MC 39)

## Status

- Total tunes in this backlog: 35
- Completed: 6
- Remaining: 29
