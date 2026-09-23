# Compose Engine (PRD-001 Phase 4, Slices 1-3)

Phase 4 slice 1 ships the pure parse+analysis core for Compose mode:
`engine/compose/` (normalize, tempo map, roles, key, melody, harmony
inference, the `analyzeProject` pipeline), `engine/core/chords.ts`
(shared chord tables extracted from the Etude generator), and the
single `@tonejs/midi` adapter (`src/lib/composeMidi.ts`). Slice 2
wires the upload surface + analysis review on top of it (user guide:
`docs/COMPOSE-MODE.md`; design: `docs/PHASE-4-S2-ANALYSIS-UI.md`,
D57..D65) and adds the two engine changes documented below: the
`blendKeyEvidence` key-confidence blend (D58, additive in `key.ts`)
and the `mergeGrid` slot-append fix (D60, `types.ts`). Slice 3 adds
the accompaniment engine - pattern library, voice-lead, bass
resolvers, plan/realize pipeline + offline preview (design:
`docs/PHASE-4-S3-ACCOMPANIMENT.md`, D66..D76; the S3 section is at
the end of this doc; pattern content: `docs/PATTERN-LIBRARY.md`).
Requirements trace to PRD-001 section 8.2 (REQ-COMP) and section 8.5
(REQ-PED-1, analyzer annotations); the approved design is
`docs/PHASE-4-COMPOSE.md` (D45-D56 - read its ERRATA section alongside
this doc; six design premises were falsified during implementation).
Foundations: [engine-foundations.md](engine-foundations.md); the
sibling Etude engine: [engine-etude.md](engine-etude.md).

## Layout

| Path | Responsibility |
|---|---|
| `engine/compose/types.ts` | The canonical model: `NormalizedProject`, the `MidiJsonLike` DTO, `Outcome`, analysis result shapes, `AnalysisOverrides` + `mergeAnalysis`, `restCell` / `EMPTY_OVERRIDES`, `confidenceTier`. |
| `engine/compose/normalize.ts` | `normalizeMidiJson(json, fileName)` - the single SMF-quirk choke point; validation, defaults, warnings; never throws. |
| `engine/compose/tempo.ts` | Tempo-map math: `ticksPerBar`, `barBoundaries` (meter-change-aware, tick-derived), piecewise `ticksToSeconds`/`secondsToTicks`, `defaultWindow` (4 min). |
| `engine/compose/roles.ts` | `classifyRoles` - deterministic feature-scored track roles (REQ-COMP-4). |
| `engine/compose/key.ts` | `detectKey` - hand-rolled Krumhansl-Schmuckler (Krumhansl-Klinger 1982 profiles), ranked candidates (REQ-COMP-10/52) + `blendKeyEvidence` / `KEY_BLEND_WEIGHTS` (D58, slice 2). |
| `engine/compose/melody.ts` | `extractMelody` - role track when confident, else top-line synthesis with eighth-note hysteresis (REQ-COMP-11). |
| `engine/compose/harmony.ts` | `segmentGrid` + `inferChords` + `reinferBar` - per-region chord inference, calibrated confidence + top-3 alternatives (REQ-COMP-12/13/23). |
| `engine/compose/patterns.ts` | S3 (D66): THE PATTERN LIBRARY - 14 authored entries (8 chord + 6 bass) with hits/ranks/accents/feel affinities + the meter-tiling helper. Content reference: `docs/PATTERN-LIBRARY.md`. |
| `engine/compose/voicing.ts` | S3 (D68): clean-room SEQUENTIAL voice-lead - tone map, 5 style shapes, rootless draws, register containment. |
| `engine/compose/bass.ts` | S3 (D69): bass pitch resolvers - chord tones by proximity, seeded walking approaches, slash-bass honoring. |
| `engine/compose/accompany.ts` | S3 (D70/D71): the accompaniment pipeline - `planAccompaniment` (all rng draws) -> `realizePlan` (pure arithmetic: thinning, swing map, annotations) -> `generateAccompaniment`; `gridFingerprint`. |
| `engine/compose/index.ts` | `analyzeProject` (the pipeline) + the public surface S2/S3/S4 import. |
| `engine/core/chords.ts` | D47 extraction: `QUALITY_INTERVALS` (17 qualities) + `NAME_SUFFIX` + `spellChordName`/`keyUsesFlats`; `engine/etude/harmony.ts` re-exports them (same-reference identity pinned by `chords.test.ts`). |
| `src/lib/composeMidi.ts` | The ONLY `@tonejs/midi` import in app code (the two src tests + the dev bench also load the package): `readMidiFile` (30MB cap -> parse -> normalize), `parseMidiBytes`, F9-guarded `sha256Hex`. |
| `src/lib/composeVoices.ts` | S3 (D72 seam): `VOICE_RECIPES` + `scheduleComposeNote` - the per-role voice recipe S4's realtime player and WAV export absorb unchanged. |
| `src/lib/composePreview.ts` | S3 (D72): render-and-play preview - OfflineAudioContext render (90s cap), singleton play/stop player (idle -> rendering -> playing -> idle). |
| `engine/compose/*.test.ts`, `engine/core/chords.test.ts` | Colocated node-env tests (invisible to the README drift gate, same precedent as Phase 0/3). |
| `src/lib/composeMidi.test.ts` + `.perf.test.ts` | Byte round-trip through the real package + the CI perf budget pin. |
| `scripts/compose-perf.ts` | Local p50/p95 bench (`npx tsx`), manual gate - not a CI step. |

## `NormalizedProject` - why NOT `HarmonicPath` (D45)

Imported songs live in a new tick-native model (`engine/compose/types.ts`):
`{ format, ppq, tempos[], timeSignatures[], keySignatures[], tracks[],
endTick, durationSec, warnings[] }`, all plain-serializable and
`Versioned` (worker-liftable, future MusicXML import). `HarmonicPath`
cannot be the container:

1. `HarmonicStep = { name, notes, descriptions }` carries no ticks, no
   velocity, no track/channel, no tempo map - REQ-COMP-3 (preserve SMF
   timing data) and REQ-COMP-14 (segment from ticks, not seconds) are
   unsatisfiable on it.
2. `padPath` (`src/lib/paths.ts`) forces every path into 24..64 bars
   (96..256 steps): a 5-minute import (~150 bars) would be TRUNCATED
   to 64 bars, violating the "your file, analyzed" privacy promise.
3. Existing playback is chord-grid PRACTICE machinery (1 step = 1 bar
   in the audio truth vs 1 step = 1 beat in `paths.ts` labeling);
   faithful multi-track song playback needs a parallel path REGARDLESS
   of the container, so the reuse dividend was illusory.

## The DTO boundary (D46)

`MidiJsonLike` (types.ts) is a structural view of `@tonejs/midi`'s
`MidiJSON` declared INSIDE the engine, so `engine/` never imports the
package (purity-legal, testable without it). `src/lib/composeMidi.ts`
is the only app-code site that touches the package; its tests and the
dev bench also import it, but no shipped UI path does. One justified
deviation from the design's DTO: `@tonejs/midi`'s `toJSON()` OMITS the
SMF format (only the raw header carries it), so the adapter reads the
2-byte `MThd` header itself and injects `header.format` - normalize
needs it to reject format > 2 and to gate channel-9 percussion on
format 1/2. The field is optional; hand-built DTO fixtures infer
`<= 1 track => format 0, else 1` when absent.

## The analyzer pipeline (D49)

```ts
// engine/compose/index.ts
declare function analyzeProject(
  project: NormalizedProject,
  opts?: { window?: AnalysisWindow; slotsPerBar?: number },
): Outcome<ComposeAnalysis>;
```

`normalizeMidiJson` (the adapter calls it; analyzers never re-parse)
-> `classifyRoles` -> `detectKey` (Krumhansl-Schmuckler over the
window's duration-weighted pitch-class profile; the declared SMF key
signature is surfaced SEPARATELY and wins as the inference key when
present - composers' intent beats statistics) -> `extractMelody` ->
`segmentGrid` + `inferChords` -> truthful annotations (key detection,
ii-V-I spans, melody provenance - existing pedagogy target kinds,
`conceptId` only when a pattern actually fired). The default window is
the first 4 minutes of musical time in TICKS (`defaultWindow`,
REQ-COMP-53); `truncated = endTick > window.toTick` is reported, never
silently swallowed. `mergeAnalysis(analysis, overrides)` (types.ts) is
the pure merged view S2's card renders: key/roles/chord-cell/melody
overrides merge into the view (role overrides set confidence 1 - a
manual choice is certain); `tempoBpm`/`timeSignature` overrides are
project-level and deliberately NOT merged here (S4's player/export
consume them from the overrides). `reinferBar(project, grid, bar, key,
1 | 2)` is the S2 split-editor hook.

## `Outcome` - analyzers never throw (REQ-COMP-15 / NFR-5)

Every fallible function returns
`Outcome<T> = { ok: true; value } | { ok: false; error: AnalysisError }`;
`analyzeProject` wraps its stages in try/catch so even a stage BUG
becomes the `"internal"` arm with a generic message (never a stack).
Error codes and their enforcement sites:

| Code | Raised where | Condition |
|---|---|---|
| `tooLarge` | `src/lib/composeMidi.ts` (pre-parse) | `file.size > 30MB` (`MAX_MIDI_BYTES`, REQ-COMP-1) |
| `tooLarge` | `engine/compose/normalize.ts` | total notes > `MAX_NOTES` (200,000 - defensive ceiling for dense-but-small files) |
| `noNotes` | normalize | zero pitched notes (REQ-COMP-50; percussion-only is NOT an error - the analyzer sets `percussionOnly: true`, REQ-COMP-51) |
| `unsupported` | normalize | `ppq <= 0`, SMF format > 2 |
| `parseFailed` | adapter + normalize | unreadable bytes, corrupt file, non-object DTO |
| `internal` | `analyzeProject` | bug guard |

normalize is the single choke point for every SMF quirk: notes sorted
ascending, out-of-range pitches dropped (counted warning),
`durationTicks` clamped >= 1, velocity pinned 0..1 (legacy 0..127
scaled defensively), missing tempo -> 120 + warning, missing meter ->
4/4 + warning, first tempo/meter event not at tick 0 -> extended back.

## Confidence model + tiers (REQ-COMP-22)

Every detected value carries a 0..1 confidence; `confidenceTier(c)`
maps it to the S2 UI contract, boundaries pinned by `types.test.ts`:
`> 0.80` -> `auto` (plain text), `>= 0.50` -> `highlight` (amber
ring), `>= 0.30` -> `radio` (candidate picker), else `manual`. Chord
confidence is the raw template score clamped to 0..1, capped at 0.6
for 2-or-fewer-distinct-pc regions (ambiguous by nature);
carry-over (sus-style continuation of the previous bar across a thin
region) halves it. Key confidence is the Pearson r of the pitch-class
profile against the Krumhansl-Klinger template. Role confidence is the
winning feature score (percussion short-circuits at 0.99).

## `blendKeyEvidence` - the D58 key-confidence blend (slice 2)

`engine/compose/key.ts` gains ONE exported function (additive; zero
new engine files, purity floor unchanged):

```ts
declare function blendKeyEvidence(a: ComposeAnalysis): KeyBlend;
// KeyBlend = { agreement, conflictKind, selected, blended, functional, reason }
```

Krumhansl-Schmuckler correlation is NOT a calibrated probability
(~18.3% top-1 on adversarial jazz), so `confidenceTier(candidates[0]
.correlation)` ALONE would happily auto-accept a 0.85 false-fire.
The blend weighs three sources: the DECLARED SMF key signature
(composers' intent), FUNCTIONAL fit of the analysis's own chord grid
(diatonic mass + cadence), and the KS correlation. The result is
five agreement states with a fixed blend per state:

| `agreement` | condition | `blended` |
|---|---|---|
| `agree` | declared && !fallback && declared == candidates[0] | `agreeBase + agreeKs*ks + agreeFunctional*functional` |
| `inferred-only` | !declared && !fallback | `ks * (inferredBase + inferredFunctional*functional)` |
| `declared-only` | declared && fallback | `KEY_BLEND_WEIGHTS.declaredOnly` (0.65) |
| `conflict` | declared && !fallback && declared != top | `KEY_BLEND_WEIGHTS.conflict` (0.60) |
| `none` | !declared && fallback | 0 |

`conflictKind` (`relative` / `parallel` / `other`) classifies the
disagreement for the banner copy. `selected` is what the card shows:
declared wins on conflict/declared-only, the inferred top candidate
otherwise.

**H1/H2 are ENGINE CONTRACTS, not UI preferences** - property-pinned
over grid x ks batteries in `key.test.ts`, and re-tuning
`KEY_BLEND_WEIGHTS` (the named, exported tuning surface) must never
loosen them:

- **H1**: KS correlation ALONE never auto-accepts. `auto` is
  reachable only via `agree` or `inferred-only`, and in
  inferred-only only when BOTH ks > 0.80 AND functional > 0.55
  (the adversarial-jazz guard).
- **H2**: `conflict` always yields the fixed highlight blend + the
  `conflictKind` the banner/radio UI must render (default selection
  = declared). A silent pick of either value is a spec violation.

The fixed constants sit below the 0.80 auto boundary BY DESIGN; the
UI re-clamps H1 defensively (`AnalysisCard`), but the guarantee
holds in the engine alone. The blend is pure over the analysis's own
grid + key result - it never mutates and reads nothing outside its
argument.

## `mergeGrid` slot append (D60, slice 2)

The one sanctioned engine BEHAVIOR fix. Slice 1's `mergeGrid` mapped
patches over `region.slots` positionally, so a `"bar:1"` patch on a
1-slot bar was SILENTLY DROPPED - making the REQ-COMP-23 "split bar
in two" flow (`reinferBar(..., 2)` then write `"bar:0"` + `"bar:1"`)
unsatisfiable through the merge. Out-of-range slot patches now
APPEND (ascending slot order, gaps filled with `restCell()`);
in-range behavior is byte-identical (regression-pinned in
`types.test.ts`). `ChordGrid.slotsPerBar` stays the NOMINAL default
- renderers and S3's accompaniment realizer read `region.slots.length`
  per bar (`accompany.ts` `cellGeometry`), so variable-length bars
  were already representable in the data model.

## The chord-symbol grammar boundary (D61, slice 2)

`src/lib/chordInput.ts` (pure, node-tested) is the popover's
validator: typed symbol -> `(rootPc, qualitySymbol, bassPc)` and
back, reverse-mapped from `NAME_SUFFIX` + documented aliases,
REJECTING anything a `ChordCell` cannot express ("C13", "C7#9",
out-of-template slash basses). The boundary is deliberate: the
ENGINE cannot validate UI input (it knows `QUALITY_INTERVALS`, not
typable strings), and `src/lib/ireal.ts` `parseChordToMidi` is NOT
the validator (lossy one-way to MIDI pitches, accepts symbols the
grid cannot hold). `spellChordName`/`NAME_SUFFIX` in
`engine/core/chords.ts` stay the single source of truth for
spelling; chordInput consumes them.

## The synthetic golden corpus - and its honest limit

`corpus.test.ts` (the RK1 mitigation) builds 24 seeded synthetic songs
(12 tonics x major/minor, 32 bars, diatonic 4-voice realization +
tonic-anchored melody) as `NormalizedProject`s in-engine -
deterministic, no binary fixtures, no `@tonejs` needed. Measured
(current run): key top-1 24/24 and top-3 24/24 against pins of >= 85%
/ >= 95% (Appendix F); block-chord variant root match 768/768 against
a pin of >= 80%. Plus hand-built edge cases: percussion-only DTO,
pitch-bend-flag DTO, format-2 parallel-clip DTO, and a > 5-minute
synthetic project (truncated true at the default window).

**The limitation is real:** the corpus is IDEALIZED material - pure
diatonic triads, constant tempo, no noise, no modulations, no
non-Western pitch content. 100% on it proves the machinery is wired
correctly, NOT that accuracy on real-world MIDI meets the bar. RK2
stays OPEN until slice 2 puts real files through it; the confidence
tiers + full override surface (REQ-COMP-21) are the product answer for
when detection is wrong.

## Performance (D54)

`scripts/compose-perf.ts` benches the full parse+normalize+analyze
path on a 3-minute, 8-track, 30,000-note synthetic file (10 iterations
after warm-up). Measured locally (this machine, four runs): p50
~45-50ms, p95 ~70-100ms - comfortably inside the PRD's 500ms p95
target. The CI pin is deliberately looser: `composeMidi.perf.test.ts`
asserts the same workload < 1500ms (flake-free margin on shared
hardware); the 500ms target is NOT pinned in vitest. The pipeline is
pure-function all the way down, so the designed-in Web Worker lift
(D54) remains mechanical if real files ever break the budget.

## `@tonejs/midi` 2.0.28 - library quirks (durable findings)

This section is the durable home for what the package actually does
(verified against `node_modules` source + pinned by tests, not by
prose). The design's claims that differed are itemized in
`docs/PHASE-4-COMPOSE.md` ERRATA.

1. **The ENCODER does NOT round-trip key signatures - S4 export MUST
   PLAN AROUND THIS.** `Encode.js` writes the key byte as
   `keySignatureKeys.indexOf(key) + 7`, but the SMF spec (and the
   reader, `Header.js`: `keySignatureKeys[event.key + 7]`) expects the
   SIGNED sf byte (index - 7). The encoder's output is therefore off
   by +14 and EVERY @tonejs-written key signature reads back as
   `key: undefined` (only the major/minor scale byte survives). Pinned
   by `composeMidi.test.ts` ("degrades gracefully"): normalize ignores
   the undefined key with a warning instead of throwing. Consequence
   for slice 4 (D51/REQ-COMP-40): combined-MIDI export fidelity holds
   for TEMPO and TIME SIGNATURES (round-trip pinned) but NOT for key
   signatures - the export writer must skip them, patch the byte, or
   drop the package for meta events. Do not rediscover this in S4.
2. **Time-signature denominators arrive as REAL values, not SMF
   codes.** `midi-file`'s parser converts the power-of-two byte
   (`1 << code`) before @tonejs re-exports it, so the DTO carries
   1/2/4/8/16/32. Applying the design's `2 ** code` conversion to that
   output would DOUBLE-convert (6/8 -> 256). normalize passes real
   values through and still converts raw codes for hand-built DTOs -
   both directions pinned (`normalize.test.ts`), and the real-DTO 6/8
   -> 8 survival pinned byte-round-trip style in
   `composeMidi.test.ts`.
3. **Format-0 "flattening" is NOT what happens.** `Midi.js` runs
   `splitTracks()` for EVERY format: each SMF track is split by
   (program, channel), so a multi-channel format-0 file arrives as
   ONE `Track` PER program+channel group - per-note channel is
   preserved by the split (the design's F6 "flattened into one
   composite, channel lost" premise was inaccurate). What IS lost:
   original track grouping (names/meta attach to the first group; a
   mid-track programChange forks a same-channel track). The engine
   stays conservative anyway: format 0 never trusts channel 9 for
   percussion and warns on multi-track format-0 DTOs (both pinned) -
   correct behavior regardless of parser version drift.

## What slice 1 did NOT include (and when it landed)

- **No UI** - SUPERSEDED by slice 2: drop zone, three-state surface,
  analysis card, chord popover, tick-native roll, store v4 (D48/D57).
  User guide: `docs/COMPOSE-MODE.md`.
- **No audio** - SUPERSEDED in part by slice 3: the accompaniment
  PREVIEW sounds (OfflineAudioContext render-and-play,
  accompaniment-only, 90s cap). Still true: no transport, no mixer,
  no original-track playback (S4, D50);
  `rhythmEngine`/`backingEngine`/`playbackClock` untouched.
- **No export** - the MIDI/WAV/chart-paste surface is slice 4 (the
  keySig finding above is its entrance requirement).
- **No accompaniment** - SUPERSEDED by slice 3: the pattern library,
  voice-lead engine, bass resolvers and `accompany.ts` pipeline are
  live (see the S3 section below).
- **No new npm deps, no Web Worker yet** (D54: only if the harness
  fails), no `tests/` or dirty-component edits; engine purity floor
  21 -> 29 (D56; the floor is a MINIMUM - the tree held 30 non-test
  sources after slice 1, 34 after slice 3's four new files, and the
  floor is now 33). Slice 2 kept the floor: two existing-file engine
  edits, zero new engine files.

## Consumed by (slices 2-3 shipped, S4 next)

S2's pipeline is live: `file -> readMidiFile -> analyzeProject ->
store`, the card renders `mergeAnalysis(analysis, overrides)` +
`blendKeyEvidence`, and the popover uses `confidenceTier` +
`reinferBar` + the `chordInput` grammar. S3's
`generateAccompaniment` takes exactly the `ChordGrid` this ships
(per-bar variable-length slots included, D60) and its preview maps
ticks -> seconds through the same `tempo.ts` functions; S4's
player/export import those SAME functions (one tempo-map truth) and
consume the record-only `tempoBpm`/`timeSignature` overrides.
Everything above is verified against the shipped code; design
authority remains `docs/PHASE-4-COMPOSE.md` + its ERRATA +
`docs/PHASE-4-S2-ANALYSIS-UI.md` + `docs/PHASE-4-S3-ACCOMPANIMENT.md`.


## Phase 4 Slice 3: accompaniment generation (D66..D76, shipped)

Design authority: `docs/PHASE-4-S3-ACCOMPANIMENT.md`. Four new engine
sources, flat in `engine/compose/` (D75; purity floor 29 -> 33, tree
scan 34):

### patterns.ts - THE PATTERN LIBRARY (D66)

The PRD defers Appendix C's pattern CONTENT to a "Pattern Library
reference" that does not exist; D66 AUTHORS it and the data is
transcribed verbatim: 14 entries (8 chord: freddieGreen, charleston,
block, pulse, offbeat, lazy, sustain, alberti; 6 bass: walking,
twoFeel, rootFifth, eighthPulse, shuffleBoogie, drone) with per-beat
hits (beat/step/span/RANK/accent), feel affinities (integrity-pinned
against every shipped profile's defaultFeel), labels, and the meter
tiling rule (`tiledHits`: a hit at authored beat b fires at
b + k*repeat < cellBeats; 3/4 truncates, 5/4 tiles, 6/8 = 3 beats,
7/8 clamps the tail; span -1 sustains to the cell end and fires ONCE
per cell - a self-overlapping drone re-fire would violate the
monophonic-bass invariant). Velocity is DATA
(`PATTERN_VELOCITY`, indexed by accent) - no rng in velocity. The
pad role's pattern is FIXED to `sustain` (`PAD_PATTERN_ID`), and
several patterns CAP below density 5 (freddieGreen at 2) - extra
density is a documented no-op, never a silent lie. Musician-facing
content reference: `docs/PATTERN-LIBRARY.md`.

### voicing.ts - sequential voice-lead (D68)

Clean-room (the etude realizes chords INDEPENDENTLY; REQ-COMP-31
needs prev-chord state). Tone map (3-4 pcs/quality; the 5-tone
qualities alt/maj9/dom9/min9 DROP the 5th; alt's b13 folds 20 -> 8),
first-chord root position anchored at
`regLo + round(spreadBias * (regHi - regLo - span))`, greedy
nearest-pc per voice TOP-DOWN (tie-break flips with spreadBias),
post-rest re-anchor, `inversionAwareness: false` re-anchors EVERY
chord (pop parallel), five shapes (close/drop2/quartal/spread/block;
the drop2 permutation is the etude's one-line formula, cross-
referenced), rootless gated on `allowRootless` (bass role) AND
tones >= 4 AND rate > 0. DRAW-ORDER CONTRACT (pinned by the
determinism matrix): chords pass -> pad pass (no draws) -> bass pass.
The D47 equivalence pin lives in
`src/lib/composeVoicingEquivalence.test.ts` (close/full/aware surface
only; the bass-semantics divergence is documented there).

### bass.ts - seeded resolvers (D69)

Tokens (root/third/fifth/seventh/b7/nextApproach) resolve per hit;
slash bassPc honors the "root" token; octave = nearest to the
previous bass pitch clamped into register; walking's approach picks
via `rng.pick` over the VALID set (chromatic below/above + diatonic
step below when a key exists; register/unreachable members excluded;
empty -> nearest chord tone; end-of-grid -> fifth). Rest cells
consume NOTHING from the stream (identity-pinned).

### accompany.ts - plan/realize/generate (D70/D71)

`planAccompaniment` (ALL draws, FULL density) -> `realizePlan` (pure
arithmetic: rank filtering AFTER pitching - the D67 subset property;
TD-043 per-bar `region.slots.length` cell tiling; the D70 swing map -
first real consumer of swingRatio/gridDivisions, pinned at 0.5
identity and 0.64/ppq480/gd4 -> 154; register containment; D74
annotations computed from REALIZED pitches only - per-role pattern
lines with the thinning fact computed from data, rootless only when
the flag is set AND the realized pitches exclude the root AND the
bass role is on, drop-2 only when the permutation actually applied,
approach notes labeled from the RECORDED kind of hits that FIRED,
and the "walking" concept claim standing only when every sounding
bar realized >= 3 distinct pitches).
`generateAccompaniment` = plan + realize + meta (`gridFingerprint`
staleness pin; the PRD 11.1 "original" field is DEVIATED - the result
never embeds the 30MB project). Outcome arms: empty roles ->
"unsupported"; all-rest grid -> ok + honest annotation; bug guard ->
"internal", never throws. Request validation (all "unsupported"):
roles non-empty/unique, density integer 0..5, seed uint32, transpose
integer -24..24, register offsets octave multiples of 12 within
-24..24, and no register may leave MIDI 0..127 after offsets.
`gridFingerprint` serializes each cell as `bar:rootPc.qualitySymbol`
(rests AND unknown qualities both serialize as "rest" - what the
generator actually hears), joined per bar; the panel's staleness
chip is `meta.gridFingerprint !== gridFingerprint(currentGrid)`,
pure and zero-auto-regenerate.

Determinism: 3 styles x 6 densities x 3 seeds x 3 role-sets generated
twice -> JSON byte-equality (162-case matrix in accompany.test.ts).

### src seam (D72/D73)

`src/lib/composeVoices.ts` (VOICE_RECIPES + scheduleComposeNote - the
recipe S4's player/export absorb unchanged) + `src/lib/composePreview.ts` (OfflineAudioContext render-and-play, 90s cap,
singleton player: idle -> rendering -> playing -> idle). Store: the
request is an OPTIONAL field inside the v4 `composeSession` (NO v5 -
missing fields default at read); the result is in-memory only.
