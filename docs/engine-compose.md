# Compose Engine (PRD-001 Phase 4, Slices 1-2)

Phase 4 slice 1 ships the pure parse+analysis core for Compose mode:
`engine/compose/` (normalize, tempo map, roles, key, melody, harmony
inference, the `analyzeProject` pipeline), `engine/core/chords.ts`
(shared chord tables extracted from the Etude generator), and the
single `@tonejs/midi` adapter (`src/lib/composeMidi.ts`). Slice 2
wires the upload surface + analysis review on top of it (user guide:
`docs/COMPOSE-MODE.md`; design: `docs/PHASE-4-S2-ANALYSIS-UI.md`,
D57..D65) and adds the two engine changes documented below: the
`blendKeyEvidence` key-confidence blend (D58, additive in `key.ts`)
and the `mergeGrid` slot-append fix (D60, `types.ts`). Requirements
trace to PRD-001 section 8.2 (REQ-COMP) and section 8.5 (REQ-PED-1,
analyzer annotations); the approved design is `docs/PHASE-4-COMPOSE.md`
(D45-D56 - read its ERRATA section alongside this doc; six design
premises were falsified during implementation). Foundations:
[engine-foundations.md](engine-foundations.md); the sibling Etude
engine: [engine-etude.md](engine-etude.md).

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
| `engine/compose/index.ts` | `analyzeProject` (the pipeline) + the public surface S2/S3/S4 import. |
| `engine/core/chords.ts` | D47 extraction: `QUALITY_INTERVALS` (17 qualities) + `NAME_SUFFIX` + `spellChordName`/`keyUsesFlats`; `engine/etude/harmony.ts` re-exports them (same-reference identity pinned by `chords.test.ts`). |
| `src/lib/composeMidi.ts` | The ONLY `@tonejs/midi` import in app code (the two src tests + the dev bench also load the package): `readMidiFile` (30MB cap -> parse -> normalize), `parseMidiBytes`, F9-guarded `sha256Hex`. |
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
- renderers and S3's assemble read `region.slots.length` per bar, so
variable-length bars were already representable in the data model.

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
- **No audio** - nothing plays; Compose owns its own transport in
  slice 4 (D50); `rhythmEngine`/`backingEngine`/`playbackClock`
  untouched (still true after slice 2).
- **No export** - the MIDI/WAV/chart-paste surface is slice 4 (the
  keySig finding above is its entrance requirement).
- **No accompaniment** - `voicing`/`patterns`/`bass`/`assemble` are
  slice 3; the grid + `core/chords` tables are ready for them.
- **No new npm deps, no Web Worker yet** (D54: only if the harness
  fails), no `tests/` or dirty-component edits; engine purity floor
  21 -> 29 (D56; the floor is a MINIMUM - the tree now holds 30
  non-test sources with `index.ts` as the 9th slice-1 file). Slice 2
  kept the floor: two existing-file engine edits, zero new engine
  files.

## Consumed by (slice 2 shipped, S3/S4 next)

S2's pipeline is live: `file -> readMidiFile -> analyzeProject ->
store`, the card renders `mergeAnalysis(analysis, overrides)` +
`blendKeyEvidence`, and the popover uses `confidenceTier` +
`reinferBar` + the `chordInput` grammar. S3's
`generateAccompaniment` takes exactly the `ChordGrid` this ships
(per-bar variable-length slots included, D60); S4's player/export
import the SAME `tempo.ts` functions (one tempo-map truth) and
consume the record-only `tempoBpm`/`timeSignature` overrides.
Everything above is verified against the shipped code; design
authority remains `docs/PHASE-4-COMPOSE.md` + its ERRATA +
`docs/PHASE-4-S2-ANALYSIS-UI.md`.
