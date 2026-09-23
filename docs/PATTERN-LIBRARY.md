# Pattern Library (PRD-001 Phase 4, Slice 3)

The musician-facing reference for the accompaniment patterns. PRD
Appendix C deferred the pattern CONTENT to a "Pattern Library
reference" that was never written; Slice 3 authored it as data in
`engine/compose/patterns.ts` (design D66). **The code is the single
source of truth** - this document transcribes it for humans. The
library: 14 entries - 8 chord patterns, 6 bass patterns - each a
table of hits (when), tones (what pitch), ranks (how much density
they need) and accents (how hard they hit). The engine realizes
them over the analyzed chord grid; the style profile picks which
run (Wiring, at the end).

## How to read a pattern

Entries are authored on a step grid: `div 2` = eighths (two slots a
beat), `div 4` = sixteenths. Hits are written here as:

```
position rank=R accent=A [span=N] [voice|tone]
```

- **position** - `1 2 3 4` are beats; `&2` = "and of 2" (the slot
  after it on the entry's grid); on div-4 grids `@2+` = one 16th
  after beat 2 (step 1), `@2a` = the "a" of beat 2 (step 3).
- **rank** - THE THINNING RANK: the hit sounds iff
  `density >= rank` (0 = anchor, survives any density; 5 = full
  detail). **accent** - velocity tier: 2 = strong, 1 = beat,
  0 = color.
- **span** - length in slots ON THIS ENTRY'S GRID (default 1).
  `span=1` on a div-2 entry is an eighth: a STAB - the back half of
  the beat is silent. `span=-1` = the drone exception (tiling).
- **voice** (chord, `toneMode: cycle`): which voice of the
  ASCENDING-sorted voicing plays (0 = lowest); `all` = the whole
  stack strums. **tone** (bass): the pitch token
  (root/third/fifth/seventh/b7/nextApproach), resolved by
  `engine/compose/bass.ts`.

```
PATTERN_VELOCITY (indexed by accent; pure data, no randomness)
        color(0)  beat(1)  strong(2)
bass      0.70     0.85     0.95
chords    0.62     0.78     0.92
pad       0.50     0.58     0.65
```

## Density: thins, never reshapes

The pipeline plans ALL pitches at FULL density, then filters hits by
rank on the way out (D67). For your ears:

- Raising density only ADDS hits. Survivors keep their exact pitch,
  position and velocity - the density-3 note set is an exact subset
  of the density-4 set (property-tested); adding detail never
  re-voices the bar.
- Patterns CAP where their ranks end - extra density is a no-op
  (freddieGreen caps at 2), and labels never claim more detail than
  the data can give. The pad is a single rank-0 hit: a bed doesn't
  thin.

## Feel affinity

Each entry lists the feels it is idiomatic for (`straight`,
`lightSwing`, `mediumSwing`, `hardSwing`, `shuffle`) - documentation
plus a data-integrity pin (every shipped style's `defaultFeel` must
appear in its patterns' lists), NOT a runtime switch: time-feel
comes from `swingRatio` through the swing map.

## Meter tiling

Tables are authored as 4 beats (`repeat: 4`) and tile across a
cell's beat budget:

```
B = floor(cellTicks / ppq)   (quarter-beats in the cell)
a hit authored at beat b fires at b + k*repeat, for every k >= 0
with b + k*repeat < B; spans clamp to the cell end.
```

- **4/4** (B=4) identity. **3/4** (B=3) truncate - beat-4 hits
  never fire. **5/4** (B=5) tile + truncate - the beat-1 hit
  re-fires on beat 5.
- **6/8** (compound): 3 quarter-beats (B=3) - tiles like 3/4; the
  library is quarter-pulse based, not an eighth-note grid. **7/8**:
  3.5 quarters floor to B=3, the half-beat tail clamps the last
  span. No additive GROUPING is modeled (7/8 is 3 flat beats + a
  tail, not 3+2+2), and tintal/akshar cycle math is out of scope -
  the only structure is a flat quarter budget.
- **Multi-slot cells**: the budget is PER CELL - a half-bar cell in
  4/4 gets B=2, so only beats 1-2 fire inside it.
- **span -1 (the drone exception)**: a sustain-to-cell-end hit
  fires ONCE per cell and absorbs every later tile copy - a beat-4
  re-fire under the still-ringing beat-0 drone would self-overlap
  (the bass is monophonic). Applies to `sustain` and `drone` only.

Output order is the AUTHORED hit order (pitch alignment);
realization sorts by tick afterwards.

## The realization grid + swing

Slots become ticks through the swing map: each pair's off-beat
member lands at `round(swingRatio * pairLength)` into the pair.
`swingRatio 0.5` = exact straight grid (identity, pinned); Jazz's
0.64 at ppq 480 / 16th grid puts the "and" at tick 154 of 240
(pinned integer) - a light, triplet-leaning drag.

The realization grid is `max(entry.divisions,
profile.gridDivisions)`: 16th-authored patterns (`pulse`, `lazy`,
`shuffleBoogie`) keep their detail under a 2-division style, and
8th-authored patterns keep their positions under a 4-division
style - steps scale, they never quantize away.

# The 8 chord patterns

Voicings are at most 4 voices, indices 0..3 ascending; `all` = every
voice together. The header suffix names the shipped styles that
realize this entry TODAY.

### freddieGreen - div 2, all | Jazz chords
*Like:* the Count Basie guitar chair - four short quarter stabs,
full voicing, no ringing over. The anchor of jazz comping.
- Hits: `1 r0 a2 | 2 r2 a1 | 3 r1 a1 | 4 r2 a1` (span=1 each)
- Density: d0 = beat 1 | d1 = 1+3 | d2 = all quarters | d3-5 no-ops
- Feels: lightSwing, mediumSwing, hardSwing, shuffle

### charleston - div 2, all | not wired to a shipped style yet
*Like:* the classic dance-band figure - a long dotted quarter on the
downbeat answered by a short stab on the "and of 2".
- Hits: `1 r0 a2 span=2 | &2 r1 a0`
- Density: d0 = dotted quarter alone | d1+ = figure complete (caps 1)
- Feels: straight, lightSwing, mediumSwing

### block - div 2, all | Pop chords
*Like:* hymn-faithful sustained chords - halves on the strong
beats; higher density fills the weak beats with quarters.
- Hits: `1 r0 a2 span=2 | 2 r3 a1 | 3 r1 a1 span=2 | 4 r3 a1`
- Density: d0 = beat 1 | d1 = halves 1+3 | d2 = same (no rank-2
  hits) | d3+ = quarters fill in (caps 3)
- Feels: straight

### pulse - div 4, all | not wired to a shipped style yet
*Like:* a steady eighth-note engine (pumping synth-pop keys);
thinning walks it back to quarters, then to one stab.
- Hits: `1 r0 a2 | 2 r2 a1 | 3 r1 a1 | 4 r2 a1 | &1 r3 a0 | &2 r4 |
  &3 r4 | &4 r4` (eighths authored on the 16th grid, span=2)
- Density: d0 = beat 1 | d1 = +3 | d2 = quarter pulse | d3 = +&1 |
  d4+ = full eighths (caps 4)
- Feels: straight

### offbeat - div 2, all | not wired to a shipped style yet
*Like:* the skank - stabs on every "and", downbeats silent. At low
density only &1 and &3 rock.
- Hits: `&1 r0 a1 | &2 r2 a0 | &3 r1 a1 | &4 r2 a0`
- Density: d0 = &1 | d1 = &1+&3 | d2+ = all four off-beats (caps 2)
- Feels: straight, lightSwing

### lazy - div 4, all | not wired to a shipped style yet
*Like:* lo-fi hip-hop keys - chords that drag in late: one 16th
after the downbeats (1, 3), on the "a" of the backbeats (2, 4). The
drag is the authored late STEP, not a hidden swing setting.
- Hits: `@1+ r0 a2 span=3 | @2a r2 a0 span=2 | @3+ r1 a1 span=3 |
  @4a r3 a0 span=2`
- Density: d0 = beat 1 | d1 = +3 | d2 = +2 | d3+ = all four (caps 3)
- Feels: straight, lightSwing

### sustain - div 2, all | the pad role of EVERY style
*Like:* one whole-cell chord - the bed. The only span -1 chord
entry: fires once per cell (drone exception), and its single rank-0
hit means density never thins it.
- Hits: `1 r0 a2 span=-1` (sustains to the cell end)
- Density: identical at every level (by design)
- Feels: ALL FIVE - which is why it is the universal pad (`PAD_PATTERN_ID`)

### alberti - div 2, cycle | Classical chords
*Like:* the Mozartian broken chord - low voice rocks beats 1 and 3,
middle answers on 2 and 4, upper sprinkles in off-beats as density
climbs. The only `cycle` entry: each hit plays ONE voice, not the
stack.
- Hits: `1:v0 r0 a2 | 2:v1 r2 a1 | 3:v0 r1 a1 | 4:v1 r2 a1 |
  &1:v2 r3 | &2:v2 r4 | &3:v2 r3 | &4:v2 r4` (v0 = lowest voice)
- Density: d0 = low on 1 | d1 = +3 | d2 = +2,4 (middle) | d3 = +
  &1,&3 (upper) | d4+ = full (caps 4)
- Feels: straight

# The 6 bass patterns

All monophonic - one resolved tone per hit. Chord tones take the
octave NEAREST the previous bass note (voice-lead by proximity);
`b7` is the minor 7th above the root except on maj7-family chords,
where it keeps the maj7 (the boogie cell stays inside the chord);
`nextApproach` exists ONLY on walking. Slash bass (`G7/B`) is
honored: the `root` token plays the bass note. Rest cells are
silent and consume zero rng.

### walking - div 2 | Jazz bass
*Like:* the jazz quarter walk - root, third, fifth, then a SEEDED
approach note (chromatic or diatonic step) into the next chord; the
only pattern with a pitch-side rng draw.
- Hits: `1:root r0 a2 | 2:third r2 a1 | 3:fifth r1 a1 |
  4:nextApproach r2 a0`
- Density: d0 = downbeat root | d1 = +fifth on 3 | d2+ = full walk
  incl. approach (caps 2)
- Feels: lightSwing, mediumSwing, hardSwing
- Honesty: the "walking bass" concept annotation stands only when
  EVERY sounding bar realized >= 3 distinct pitches; at d0/d1 the
  annotation says "not a full walking line at this density".

### twoFeel - div 2 | not wired to a shipped style yet
*Like:* the ballad swing feel in half-notes - root for the first
half of the bar, fifth for the second; two beats you sway to
instead of four you count.
- Hits: `1:root r0 a2 span=2 | 3:fifth r1 a1 span=2`
- Density: d0 = root half alone | d1+ = complete (caps 1)
- Feels: mediumSwing, hardSwing, straight

### rootFifth - div 2 | Pop + Classical bass
*Like:* rock/folk quarter-note bass - root and fifth alternating so
it anchors any progression without commenting on it.
- Hits: `1:root r0 a2 | 2:fifth r2 a1 | 3:root r1 a1 | 4:fifth r2 a1`
- Density: d0 = beat 1 root | d1 = roots on 1+3 | d2+ = full
  quarters (caps 2)
- Feels: straight

### eighthPulse - div 2 | not wired to a shipped style yet
*Like:* the driving root fountain - straight eighth notes on the
tonic, from a lone downbeat (d0) to a full motorik pulse (d4).
- Hits: `1 r0 a2 | 2 r2 | 3 r1 | 4 r2 | &1 r3 | &2 r3 | &3 r4 |
  &4 r4` (all `root`)
- Density: d0 = beat 1 | d1 = +3 | d2 = quarters | d3 = +&1,&2 |
  d4+ = full eighths (caps 4)
- Feels: straight

### shuffleBoogie - div 4 | not wired to a shipped style yet
*Like:* boogie-woogie left hand - the three-note cell
root-fifth-flat7 rolled across each half-bar; 16th-authored, so the
swing map gives it the limp. The only bass entry that uses `b7`.
- Hits (two cells, beats 1-2 and 3-4):
  `1:root r0 a2 span=2 | 1:fifth r2 | 1:b7 r3 | 2:root r2 span=2 |
  2:fifth r3 | 2:b7 r3 | 3:root r1 span=2 | 3:fifth r2 | 3:b7 r3 |
  4:root r2 span=2 | 4:fifth r3 | 4:b7 r3`
- Density: d0 = beat-1 root | d1 = +beat-3 root | d2 = cells form |
  d3+ = full 12-hit figure (caps 3)
- Feels: shuffle, hardSwing

### drone - div 2 | not wired to a shipped style yet
*Like:* one long tonic pedal under the whole cell - the span -1
bass entry. Fires once per cell (drone exception), so even a 5/4
re-tile never doubles it; density never thins it (rank 0).
- Hits: `1:root r0 a2 span=-1`
- Density: identical at every level
- Feels: straight, mediumSwing

# Wiring: what actually plays

The panel picks a STYLE; the profile picks the patterns
(`rhythm.bassPattern` / `rhythm.chordPattern`; the pad is ALWAYS
`sustain`). There is no per-pattern user control yet - the library
is deliberately larger than any one style so future packs (and S4+)
can reference the rest.

| style | defaultFeel | swing | grid | density default | bass | chords | pad |
|---|---|---|---|---|---|---|---|
| Jazz | mediumSwing | 0.64 | 2 | 3 | walking | freddieGreen | sustain |
| Pop | straight | 0.50 | 4 | 2 | rootFifth | block | sustain |
| Classical | straight | 0.50 | 2 | 2 | rootFifth | alberti | sustain |

Registers (Appendix D defaults, identical across profiles): bass
MIDI 28-48, chords 48-72, pad 60-84. Every generated note is
clamped inside its role's register (after any register/transpose
offset; requests that would leave 0-127 are rejected).

**Adding or re-tuning a pattern** = data-only edit in
`engine/compose/patterns.ts` + this table. Property tests are
rank-agnostic; integrity pins (affinity, step < divisions, ranks
0..5, unique ids) catch malformed tables. What tests CANNOT catch
is whether it sounds good - that gate is human (RK6: the manual
listen check), and it is OPEN for every pattern here.

Related: `docs/engine-compose.md` (pipeline + determinism),
`docs/COMPOSE-MODE.md` (user guide),
`docs/PHASE-4-S3-ACCOMPANIMENT.md` (D66..D76 design).
