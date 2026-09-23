# PRD-001 Phase 4 Slice 3 Design: Accompaniment Generation + Pattern Library

Status: APPROVED DESIGN (from @architect research packet, 2026-09-23).
Implementation authority for @developer. Parent: `docs/PHASE-4-COMPOSE.md`
(D45..D56 + ERRATA + FIX ROUND - read ALL THREE) and
`docs/PHASE-4-S2-ANALYSIS-UI.md` (D57..D65 - shipped). The parent's S3
sketch (sec 9) + D52 are the seed; this doc FLESHES THEM OUT and, at
exactly ONE point, re-slices the parent's intent (D72 audio preview -
see "PARENT INTENT UPDATE" section, stated explicitly).

Scope: PRD sec 8.2 Accompaniment (REQ-COMP-30..36; 37 stays S4),
REQ-PED annotations on generated content, REQ-FND-2/3 (rng +
determinism), REQ-STYLE consumption (first real StyleProfile consumer),
REQ-TRANS-3 (opt-in accompaniment transposition), PRD 11.1
AccompanimentRequest/Plan/Result, PRD Appendix C (THE PATTERN LIBRARY -
the PRD defers its CONTENT to a reference that does not exist; D66
AUTHORS it), Appendix D registers (first real consumer).

Baseline (re-verified this round at HEAD cb953ed, `npm test` run
fresh): 1820 passed / 1 skipped / 2 failed (the 2 = pre-existing
CSS-WIP FormPlanner.test.tsx + FormTemplatePicker.test.tsx - do NOT
fix). `tests/` it( = 362 FROZEN (re-counted). check:paths 36/36.
count pins 40/12 untouched. Purity floor MIN_SCANNED_FILES = 29 (tree
scans 30). Dirty-11 confirmed via `git status`: ChordInspector,
CoComposePanel, FormPlanner, FormTemplatePicker, InspectPanel,
LiveScoreDisplay, MelodyToolbar, PathCatalog, PracticeSessionPlayer,
PracticeSetBrowser, StylePackPicker. Slices 1+2 shipped: f92a0c4,
52cf468 (kai records d435a0d, cb953ed).

Standing rules for every new/edited file: ASCII only; no `console.*`
except warn/error (engine: fully silent); no `any`, no `@ts-ignore`;
relative imports; `engine/` purity absolute (allowlist: relative-only,
no packages, no node:*, no clock, no Math.random); `tests/`,
`src/lib/studies.ts`, `src/lib/theory.ts` (FROZEN, D47),
`src/lib/paths.ts`, README/SPEC/AGENTS/.kai OFF-LIMITS; new
`src/components/**/*.test.tsx` auto-register via the vitest JSDOM_FILES
glob (verified present); src/lib + engine tests are node-project and
drift-gate-invisible; PHASE-2-01 live-gate + PHASE-3-03 StrictMode
one-shot apply to every new effect; FILE-COPY snapshots, never
`git checkout --` (PHASE-2-02); TD-040 guardrail: zero etude mode-UI
changes.

---

## 1. Re-audit (anchors verified at HEAD cb953ed; cite search strings, not line numbers)

| Anchor | Location | Verified content |
|---|---|---|
| StyleProfile pattern FIELDS, zero STEP DATA | engine/styles/types.ts, search `bassPattern: BassPatternId` / `chordPattern: ChordPatternId` | `BassPatternId = walking|twoFeel|rootFifth|eighthPulse|shuffleBoogie|drone` (6 - superset of REQ-COMP-34's walking/root-fifth/boogie/drone); `ChordPatternId = freddieGreen|charleston|block|pulse|offbeat|lazy|sustain|alberti` (8 - exactly PRD Appendix C); `VoicingStyle = close|drop2|quartal|spread|block` (exactly REQ-COMP-32). Grep for any steps/hits/mask data with these ids: ZERO hits outside styles/ - the 14 patterns exist ONLY as ids. THE GAP S3 FILLS (D52 -> D66 here). |
| swingRatio + gridDivisions have ZERO consumers | grep -rn "swingRatio\|gridDivisions" src/ engine/ --include="*.ts" (non-test) | Only hits: engine/styles/{types,index,profiles/*}. The etude generators never touch them (etude rhythm is step-native, no swing realization exists anywhere). S3's tick realization (D70) is the FIRST real consumer of both fields - Phase 0 data finally fully consumed. |
| VoicingProfile | engine/styles/types.ts, search `inversionAwareness` | `{style, rootlessRate, spreadBias, registers, inversionAwareness}`. jazz: drop2/.55/.6/true; pop: block/.02/.4/false; classical: close/0/.35/true. Registers identical across profiles = Appendix D defaults (bass [28,48], chords [48,72], pad [60,84], melody [60,86]). Every window is >= 21 semitones -> contains every pitch class (math fact S3 relies on; property-tested). |
| HarmonyProfile is NOT S3's concern | engine/compose/harmony.ts header | Accompaniment plays the ANALYZED (merged) grid - no reharmonization. `reharmonizationRate` stays etude-domain (etude/harmony.ts pass 4c). Confirmed out of S3. |
| ChordGrid + variable-length bars | engine/compose/types.ts, search `slotsPerBar stays the NOMINAL default` | mergeGrid (D60) APPENDS out-of-range slot patches -> `region.slots.length` VARIES PER BAR while `grid.slotsPerBar` is nominal. TD-043 mandates S3 reads `region.slots.length` per bar + adds the S3-side pin. BarRegions carries startTick/endTick (meter-resolved by barBoundaries); the grid covers the analysis WINDOW only (truncated files: accompaniment spans the window - honest, S4 may extend). |
| ChordCell -> pitches | engine/compose/types.ts `interface ChordCell`; engine/core/chords.ts `QUALITY_INTERVALS` | Cell = (rootPc, qualitySymbol, bassPc|null, isRest). QUALITY_INTERVALS has 17 qualities (errata D8); `alt` contains interval 20 (b13 as a 13th - mod-12 dedup needed); `sus4` = [0,5,7,10] (7sus4). `qualityIntervals(q): readonly number[] | null` is the accessor - unknown symbol -> null (defensive path, D71). |
| Etude drop2 realization | engine/etude/harmony.ts, search `profile.voicing.style === "drop2"` | Step 7 realizes EACH chord INDEPENDENTLY: root placement in registers.chords + fixed drop2 permutation `[n2-12, n0, n1, n3]`. No prev-chord state. REQ-COMP-31 "smooth across chord changes" needs what etude does NOT have: a sequential voice-lead (prev voicing -> nearest-pc per voice). D47 precedent: shared TABLES in core, algorithms may duplicate when semantics differ - they differ here. Clean-room `engine/compose/voicing.ts` (D68); the drop2 PERMUTATION formula is shared knowledge (same 1 line, documented cross-reference, not a shared function - the surrounding semantics differ). |
| theory.ts voice-leader exists but FROZEN | src/lib/theory.ts, search `export function applyVoiceLeading` | `(prevNotes, targetNotes) -> number[]` greedy nearest-pc octave matching. D47 mandates the S3 equivalence pin: `src/lib/composeVoicingEquivalence.test.ts` imports BOTH (engine voicing restricted to close/full/inversion-aware where the semantics overlap; drop2/quartal/spread are OUTSIDE the equivalence surface - theory has no such concept). theory.ts itself: NOT edited, no new callers. |
| Tempo map + tick realization inputs | engine/compose/tempo.ts | `barBoundaries` (meter-change aware, integer-tick bars), `ticksPerBar = num*ppq*4/den`, piecewise `ticksToSeconds`. Generation itself needs only `grid` (bars carry ticks) + `ppq` (beats-per-cell math) - NOT the full project. Preview/playback maps ticks->seconds via tempo.ts (one truth, D46). Tempo/meter OVERRIDES stay record-only until S4 (TD-043) - the preview uses the PROJECT tempo map and says so. |
| Melody track + register collision | engine/compose/types.ts `MelodyResult`; Appendix D | Extracted melody is arbitrary-range (imported file); profile registers are the DESIGN guard (chords 48-72 vs pad 60-84 vs melody 60-86 overlap BY DESIGN). S3 policy (D71): every generated note is clamped into its role's register (property-tested); NO dynamic melody-avoidance (Phase 8 editor territory; S4's mixer handles masking). Generator never emits into the melody role - result carries exactly 3 role buckets. |
| S2 seam: loaded state hosts the panel | src/components/ComposeSurface.tsx, search `AnalysisCard` / `data-state={loaded` | Loaded state renders AnalysisCard under memoized `merged` (mergeAnalysis + melody re-extraction) + `blend`. AccompanimentPanel slots BELOW AnalysisCard in the same column, fed by the SAME memoized merged grid. Zero ModeGate/App.tsx impact (the empty-state pins are untouched by S3). |
| S2 seam: store v4, request WITHOUT v5 | src/state/sessionStore.ts, search `S3/S4 fields (request/mixer) widen ComposeSession later WITHOUT a v5` | D57's promise is in the shipped header comment verbatim. `ComposeSession = {fileName, fileHash, overrides, analyzeFull}`; partialize keeps composeSession only. S3 adds `request?: AccompanimentRequest | null` to the PERSISTED type (missing field defaults at read - no migration, no v5) and `composeAccompaniment: AccompanimentResult | null` IN-MEMORY (excluded by partialize). Result is deterministic from (grid, request, seed) -> NEVER persisted (D73). |
| Undo scope | sessionStore.ts search `patchComposeOverrides`; PHASE-4-S2 D59 | Undo stacks cover ANALYSIS OVERRIDES only. Request changes (style/density/seed) do NOT push undo - regeneration is instant + seed is user-owned. Documented, not a gap. |
| audioEngine playNote = realtime-only | src/lib/audio.ts, search `playNote(midi: number` | Single-voice realtime on melodyBus with instrument state + `stopNote(midi)` collision semantics (same-pitch retrigger). NO generic scheduled-voice API (parent audit stands). Reusing it for a multi-voice accompaniment preview = wrong object (melody bus, practice-instrument voices). backingEngine: own BackingStyle beats, wrong object (D50 precedent). VERDICT (D72): render-and-play via OfflineAudioContext (loopWav precedent: search `new OfflineAudioContext(` in src/lib/loopWav.ts - hand-rolled, no deps). |
| OfflineAudioContext absent in jsdom | tests/setup.ts header; tests/loopWav-mock.ts | No polyfill (abandoned); loopWav mocks around it. Preview unit tests stay at PURE-helper level (recipe tables, mapping math); the render path is browser-verified via the e2e state machine + manual. |
| Pedagogy targets ready | engine/pedagogy/types.ts, search `kind: "voicing"` | `AnnotationTarget` ALREADY includes `voicing{bar}` + `chord{bar}` + `progression{fromBar,toBar}` - designed forward in Phase 3, zero type changes. Annotation ids deterministic ("ann-<detector>-<bar>" precedent in annotate.ts). |
| Concept registry: 8 concepts, NO count pin | engine/pedagogy/concepts.ts, search `id: "drop-2"` | ii-v-i, tritone-sub, secondary-dominant, modal-interchange, VOICE-LEADING, DROP-2, cadence, axis-progression. concepts.test.ts pins quality (definition <= 160 chars, body >= 100 words, related/references/exampleNumerals non-empty) + id uniqueness - NOT a count. Accompaniment annotations link voice-leading/drop-2 (exist); D74 adds exactly 2 new curated concepts (walking-bass, comping) - additive, registry-legal. |
| e2e convention | e2e/compose-upload.spec.ts header + imports | Specs run in NODE; fixture MIDI generated IN-SPEC via `createRequire` + `setInputFiles(buffer)` (D65); zero committed binaries; requires `npm run build` first. S3 earns its own spec (D76) on the same rails. |
| Gate floor facts | vitest.config.ts JSDOM_FILES; assets/check-links.cjs | `src/components/**/*.test.tsx` glob present (new component tests need NO config edit). check-links counts it( in tests/ only (362 - untouched); docs/ is NOT scanned. `npm run build` = two configs (rnn then main); neither is affected by engine/compose additions. |

---

## 2. THE CONTENT WARNING (read before anything else)

PRD Appendix C says: "Full steps are in the Pattern Library reference."
That reference DOES NOT EXIST. The PRD defers the pattern CONTENT to a
document nobody wrote; Phase 0 shipped the ids and the fields; Slices
1-2 shipped the grid the patterns ride on. **D66 below is CONTENT
DESIGN, not plumbing: the step grids, thinning ranks, velocity tiers,
feel affinities and bass tone-resolvers authored here ARE the missing
reference.** The developer transcribes the tables verbatim (they are
the spec); musical regressions cannot be caught by unit tests (RK6) -
tests pin STRUCTURE (positions, ranks, determinism, register
containment), humans pin MUSICALITY (manual eval + the five qualitative
user tests in PRD Appendix F remain the only real bar).

---

## 3. Decisions (D66..D76, continuing the parent numbering)

### D66 (THE PATTERN LIBRARY DATA SPEC): authored engine data in engine/compose/patterns.ts; per-beat hit masks with thinning ranks; meter tiling table.

Shape (copyable):

```ts
// engine/compose/patterns.ts (new engine source - purity floor, D75)
import type { FeelId } from "../styles/types";

export type BassTone =
  | "root" | "third" | "fifth" | "seventh" | "b7" | "nextApproach";

export interface PatternHit {
  /** Cell-relative beat index (see tiling below). */
  readonly beat: number;
  /** Slot within the beat, in this entry's divisions (0..divisions-1). */
  readonly step: number;
  /** Length in slots; -1 = sustain to the end of the cell region. */
  readonly span: number;
  /** THE THINNING RANK (REQ-COMP-33): the hit sounds iff density >= rank.
   *  0 = anchor (survives any density), 5 = full-detail. Monotone by
   *  construction: raising density only ADDS hits, never moves or
   *  re-pitches them (property-tested, D67). */
  readonly rank: number; // 0..5
  /** Velocity tier: 2 = strong, 1 = beat, 0 = color (table below). */
  readonly accent: 0 | 1 | 2;
  /** toneMode "cycle" (chord patterns): index into the ASCENDING-sorted
   *  voicing (0 = lowest voice). Ignored for "all". */
  readonly voice?: number;
  /** kind "bass": the pitch token this hit plays (resolved by bass.ts).
   *  Ignored by chord patterns. */
  readonly tone?: BassTone;
}

export interface PatternEntry {
  readonly id: string; // ChordPatternId | BassPatternId value
  readonly kind: "chord" | "bass";
  /** Grid the hits are authored on: steps per beat (2 = eighths, 4 = 16ths).
   *  Realization uses max(entry.divisions, profile.rhythm.gridDivisions)
   *  so 16th patterns (lazy, shuffleBoogie) survive a 2-division style. */
  readonly divisions: 2 | 4;
  readonly toneMode: "all" | "cycle"; // all = strum the full voicing
  /** Feel affinity (PRD App C "feel affinity"): the feels this pattern is
   *  idiomatic for. DATA + integrity-tested (every shipped profile's
   *  defaultFeel must be in its patterns' affinity lists); runtime use:
   *  annotation wording only. */
  readonly feel: readonly FeelId[];
  /** Bar length in beats the hit table TILES across (4/4 authoring ->
   *  3/4 truncates, 5/4 repeats + truncates - table below). */
  readonly repeat: number;
  readonly hits: readonly PatternHit[];
  /** TRUTHFUL annotation stem (D74): the label is only ever emitted when
   *  this entry is the one realized. */
  readonly label: string;
}

export function chordPattern(id: ChordPatternId): PatternEntry | null;
export function bassPattern(id: BassPatternId): PatternEntry | null;
export function allPatterns(): readonly PatternEntry[]; // 14, id-unique (pinned)
```

Velocity tiers (named, exported, tested):
`PATTERN_VELOCITY = { bass: [0.70, 0.85, 0.95], chords: [0.62, 0.78, 0.92], pad: [0.50, 0.58, 0.65] } as const` indexed by accent. No rng in velocity - velocity is a pure function of data (draw-order surface stays tiny).

Meter tiling (the "documented table" D52 promised): cell beats `B = barTicksCell / beatTicks` (beatTicks = ppq quarters; 6/8 bar = 3 quarter-beats, 7/8 = 3.5 -> floor to 3 for tiling, the half-beat tail clamps the last span). A hit at authored beat `b` fires at `b + k*repeat` for every k >= 0 with `b + k*repeat < B`; spans clamp to the cell end; hits whose step >= divisions are data bugs (validated at test time, not runtime). Pins: 4/4 identity; 3/4 drops beat-3 hits; 5/4 tiles beat 0 to beat 4; 6/8 = 3 beats; 7/8 = 3 beats + clamped tail.

ERRATA (LOW-6, fix round): the tiling sentence reads as if EVERY hit
tiles by `b + k*repeat < B` verbatim. A span -1 (sustain) hit fires
ONCE per cell - `tiledHits` breaks the tile loop after the first copy
(a beat-4 re-fire under a still-sustaining beat-0 drone would
self-overlap and break the monophonic-bass invariant); the resolution
lives in the patterns.ts header ("SPAN -1 EXCEPTION").

### WORKED EXAMPLES (the authored library - transcribe verbatim; this table IS the PRD's missing "Pattern Library reference")

Chord patterns (voicing = 4 voices max, ascending indices 0..3):

| id | div | toneMode | feel | repeat | label | hits (beat, step, span, rank, accent[, voice]) |
|---|---|---|---|---|---|---|
| freddieGreen | 2 | all | lightSwing, mediumSwing, hardSwing, shuffle | 4 | "Freddie Green quarter-note stabs" | (0,0,1,0,2) (2,0,1,1,1) (1,0,1,2,1) (3,0,1,2,1) |
| charleston | 2 | all | straight, lightSwing, mediumSwing | 4 | "Charleston figure (dotted quarter + off-beat)" | (0,0,2,0,2) (1,1,1,1,0) |
| block | 2 | all | straight | 4 | "sustained block chords on the halves" | (0,0,2,0,2) (2,0,2,1,1) (1,0,1,3,1) (3,0,1,3,1) |
| pulse | 4 | all | straight | 4 | "steady eighth-note pulse" | (0,0,2,0,2) (1,0,2,2,1) (2,0,2,1,1) (3,0,2,2,1) (0,2,2,3,0) (1,2,2,4,0) (2,2,2,4,0) (3,2,2,4,0) |
| offbeat | 2 | all | straight, lightSwing | 4 | "off-beat stabs" | (0,1,1,0,1) (2,1,1,1,1) (1,1,1,2,0) (3,1,1,2,0) |
| lazy | 4 | all | straight, lightSwing | 4 | "lo-fi dragged hits behind the beat" | (0,1,3,0,2) (2,1,3,1,1) (1,3,2,2,0) (3,3,2,3,0) |
| sustain | 2 | all | (all five) | 4 | "whole-bar sustained pad" | (0,0,-1,0,2) |
| alberti | 2 | cycle | straight | 4 | "Alberti broken-chord accompaniment" | (0,0,1,0,2,0) (2,0,1,1,1,0) (1,0,1,2,1,1) (3,0,1,2,1,1) (0,1,1,3,0,2) (1,1,1,4,0,2) (2,1,1,3,0,2) (3,1,1,4,0,2) |

Bass patterns (tone tokens resolved by D69's functions):

| id | div | toneMode | feel | repeat | label | hits (beat, step, span, rank, accent, tone) |
|---|---|---|---|---|---|---|
| walking | 2 | all | lightSwing, mediumSwing, hardSwing | 4 | "walking bass (chord tones + approach)" | (0,0,1,0,2,root) (2,0,1,1,1,fifth) (1,0,1,2,1,third) (3,0,1,2,0,nextApproach) |
| twoFeel | 2 | all | mediumSwing, hardSwing, straight | 4 | "two-feel (root-half, fifth-half)" | (0,0,2,0,2,root) (2,0,2,1,1,fifth) |
| rootFifth | 2 | all | straight | 4 | "root-fifth quarters" | (0,0,1,0,2,root) (2,0,1,1,1,root) (1,0,1,2,1,fifth) (3,0,1,2,1,fifth) |
| eighthPulse | 2 | all | straight | 4 | "eighth-note root pulse" | (0,0,1,0,2,root) (2,0,1,1,1,root) (1,0,1,2,2,root) (3,0,1,2,2,root) (0,1,1,3,0,root) (1,1,1,3,0,root) (2,1,1,4,0,root) (3,1,1,4,0,root) |
| shuffleBoogie | 4 | all | shuffle, hardSwing | 4 | "shuffle boogie (root-fifth-flat7 cells)" | (0,0,2,0,2,root) (0,2,1,2,1,fifth) (0,3,1,3,0,b7) (2,0,2,1,1,root) (2,2,1,2,1,fifth) (2,3,1,3,0,b7) (1,0,2,2,1,root) (1,2,1,3,0,fifth) (1,3,1,3,0,b7) (3,0,2,2,1,root) (3,2,1,3,0,fifth) (3,3,1,3,0,b7) |
| drone | 2 | all | straight, mediumSwing | 4 | "drone root" | (0,0,-1,0,2,root) |

Honesty notes baked into the data (RK6 mitigation, D74 negatives):
freddieGreen caps at density 2 (all four quarters are present) -
densities 3..5 are NO-OPS for it, and the annotation says "quarter-note
stabs", never "sixteenth-note" anything. `nextApproach` exists only on
walking. The lo-fi "lazy" identity is the late STEP (16th index 1/3),
not a hidden swing - the label says "behind the beat".

### D67 (DENSITY THINNING RULE): rank-ordered post-pitch filtering - structurally cannot reshape.

Decision: pipeline order is FIXED: (1) plan pitches at FULL density
(voicings + bass tone sequences - all rng draws happen here, grid- and
seed-dependent, density-INdependent); (2) resolve hit -> (slot, midi,
span, velocity) for every hit; (3) FILTER hits by `hit.rank <= density`;
(4) map slots -> ticks (D70); (5) apply transpose offsets + register
clamp. Consequences, each property-tested:
- Same seed, density d vs d+1: the d-note set is a SUBSET (by exact
  (tick, midi, durationTicks, velocity) tuple) of the d+1 set, and no
  pitch ever changes with density ("thins steps, NOT reshapes" -
  REQ-COMP-33 verbatim, pinned as a universal over a corpus of grids x
  styles x densities).
- Cycle indices (alberti voice, walking tone position) are computed on
  the PRE-FILTER hit list, so thinning never re-pitches survivors
  (thinning walking to density 0 leaves the downbeat ROOT, not the
  third).
- Density slider 0..5 default = `profile.rhythm.densityDefault`
  (REQ-COMP-35 P1; the slider is in S3's panel).
- No rng participates in thinning (D52 stands).
Confidence: HIGH.

### D68 (VOICING ENGINE): clean-room sequential voice-lead in engine/compose/voicing.ts; per-style shapes; every VoicingProfile field consumed with a real effect.

```ts
// engine/compose/voicing.ts (new engine source)
export interface VoicingInput {
  readonly cells: readonly (readonly ChordCell[])[]; // per bar, per slot (variable length - TD-043)
  readonly profile: StyleProfile;
  readonly rng: Rng;                 // draws: rootless decisions ONLY (see order)
  readonly allowRootless: boolean;   // false unless the bass role is selected (D68 rule)
  readonly register: MidiRange;      // chords or pad register (two independent passes)
  readonly rootlessRate?: number;    // default: profile.voicing.rootlessRate
}
/** null per rest cell; ascending pitch arrays, all inside register. */
export function voiceSequence(input: VoicingInput): (readonly number[] | null)[];
```

Spec (all deterministic given rng stream):
1. TONE MAP (data, tested): qualitySymbol -> 3-4 selected pcs (root, 3rd
   or 4th for sus, 7th if present, top extension; 5-tone qualities
   (alt/maj9/dom9/min9) DROP the 5th). Rootless form = same set minus
   root (requires >= 4 full tones; triads never go rootless).
2. First chord (and post-rest): root-position (or `bassPc` bottom when
   `inversionAwareness` && cell.bassPc != null) placed at
   `regLo + round(spreadBias * (regHi - regLo - span))`-anchored stack,
   tones ascending nearest-octave. `inversionAwareness: false` (pop)
   re-anchors root position at EVERY chord (parallel motion = the pop
   block sound).
3. Subsequent chords: greedy nearest-pc per voice, processed TOP-DOWN;
   collision-free by construction (a pitch already taken is excluded);
   completeness repair: duplicate-pc voices swap to the nearest unused
   target pc; unassigned target pcs are taken by the least-moved voice.
   Tie-break: equal distance -> lower pitch, UNLESS
   `spreadBias >= 0.5` -> higher pitch (the field has teeth).
4. Style shapes (REQ-COMP-32, `profile.voicing.style`):
   - close: the greedy stack as-is.
   - drop2: greedy close 4-voice, then the fixed permutation
     (2nd-from-top down an octave) - SAME formula as etude step 7
     (cross-referenced comment; D47 duplication is legal where
     semantics differ - here the permutation is one line of shared
     knowledge, the surrounding voice-lead is new).
   - quartal: per chord, candidate stacks of 4ths (5 st) rooted on each
     chord tone; score = covered target pcs; pick max coverage, ties ->
     bottom nearest previous bottom (voice-lead across stacks);
     coverage < 3 pcs -> CLOSE FALLBACK (counted in
     `meta.quartalFallbackCount` - honest, never labeled quartal when
     fallen back).
   - spread: bottom-up greedy with a MINIMUM 5-semitone inter-voice gap
     (nearest chord tone >= a 4th above the previous voice).
   - block: triad-only (root, 3rd, 5th - extensions dropped), close,
     root always bottom; movement-minimal parallel shape.
5. Rootless: per non-rest cell, `rng.bool(rootlessRate)` ONLY when
   `allowRootless` (bass role selected) && tone count >= 4 &&
   rootlessRate > 0. Decision recorded per bar for D74 annotations.
6. Register containment: every voice placed within [lo,hi] (windows are
   >= 21 semitones -> always feasible; property-tested against
   Appendix D ranges).
7. Unknown quality symbol (defensive): cell treated as rest, counted in
   `meta.unknownQualityCount` (never throws - D49 pattern).

Draw-order contract (part of REQ-FND-3 reproducibility, pinned by the
determinism matrix): chords pass (bars ascending, slots ascending,
rootless bool per eligible cell) -> pad pass (same shape, no rootless
draws) -> bass pass (D69). Density NEVER enters draw order (D67 filters
after). The etude assemble precedent (engine/etude/assemble.ts header:
"harmony all bars -> melody all bars -> title") is the documented model.

Equivalence pin (D47 promise): `src/lib/composeVoicingEquivalence.test.ts`
- on a curated ii-V-I/triad fixture (close style, full tones,
inversionAware), `voiceSequence` agrees with `theory.applyVoiceLeading`
note-for-note; divergences elsewhere (drop2/quartal/etc.) are OUT of
the pin's surface (theory has no such concept) - stated in the test
header so nobody "fixes" the divergence.

ERRATA (fix round): "note-for-note" is narrower than the style-list
suggests: agreement holds on the COMPACT register [60, 72] where both
algorithms' octave placements coincide. ii->V diverges in a WIDE
register (theory re-anchors the bass to the target's bottom; the
engine voice-leads it) - pinned as a documented divergence in the
same test, not a bug.
Confidence: HIGH (structure), MEDIUM (greedy quality on dense 5-tone
chains - manual eval is the arbiter, RK6).

### D69 (BASS): rhythm from the SAME pattern data; pitch from seeded per-idiom resolver functions in engine/compose/bass.ts.

```ts
// engine/compose/bass.ts (new engine source)
export function resolveBassPitches(
  entry: PatternEntry,          // kind "bass"
  cells: readonly (readonly ChordCell[])[][], // per bar per slot
  profile: StyleProfile,
  key: KeyCandidate | null,
  rng: Rng,
  register: MidiRange,
): readonly (readonly number[])[][]; // pitches per bar per slot, aligned to hit order (pre-thinning)
```
Token resolution (per hit, cycle-free - tokens are authored per hit):
- root/third/fifth/seventh: chord tone of the cell (mod-12 pc), octave =
  nearest to the PREVIOUS bass pitch clamped into register (voice-lead
  by proximity; first note = root at regLo + mod12 offset).
- b7: minor 7th above root (dominant idiom; on a maj7 chord resolves to
  maj7 - the boogie cell stays inside the chord, honest to the label).
- nextApproach (walking only): the LAST hit before the next sounding
  cell targets the next root via rng.pick over the VALID approach set:
  chromatic-below, chromatic-above, diatonic-step (whole/half) below -
  set members that leave the register or are unreachable are excluded;
  empty set -> nearest chord tone. `key === null` -> diatonic step
  excluded (chromatic only; deterministic without a key). Next cell is
  a rest or end-of-grid -> approach degrades to fifth (documented).
- Slash bass: `cell.bassPc != null` -> the "root" token plays bassPc
  (inversions honored - REQ-COMP-31 adjacent honesty).
- Rest cell: no hits, no draws (rests consume NOTHING from the stream -
  documented; grid edits shift the stream by design, seed semantics).
Walking honesty: the "walking" label requires >= 3 distinct pitches per
bar at the realized density; at density 0 (downbeat roots only) the
annotation says so (D74), the DATA label never lies.
Confidence: HIGH.

ERRATA (fix round, MED-5a): the bullet "Next cell is a rest or
end-of-grid -> approach degrades to fifth" overstates the rest case.
The shipped `nextSoundingCell` SKIPS rests - the approach targets the
next SOUNDING cell ACROSS rest cells (defensible: the approach aims at
the next harmony the ear will actually hear). Degrading to the fifth
happens at END-OF-GRID only (no next sounding cell exists). Both
behaviors are pinned in bass.test.ts: "end-of-grid approach degrades
to the fifth" + "approach targets ACROSS a rest cell".

### D70 (REALIZATION: slots -> ticks; swing; multi-slot cells; TD-043).

Pure arithmetic, zero rng, in engine/compose/accompany.ts:
- Cell region: bar `region` with `S = region.slots.length` cells
  (TD-043: READ PER BAR, never grid.slotsPerBar): cell i owns
  `[start + floor(i*T/S), start + floor((i+1)*T/S))`, `T = endTick -
  startTick` (last cell absorbs rounding). Property pin: variable-length
  bars tile EXACTLY (no gaps/overlaps) and every note lands inside its
  cell region.
- Beat ticks: `beatTicks = ppq` (quarter pulse; 6/8 -> 3 beats/bar via
  D66 tiling). Realization divisions: `gd = max(entry.divisions,
  profile.rhythm.gridDivisions)`; slotTicks nominal = `beatTicks/gd`.
- SWING MAP (first consumer of swingRatio/gridDivisions): global slot
  index g over the cell (beat b = floor(g/gd), step s = g%gd);
  `pair = floor(s/2)`, `within = s%2`, `pairLen = 2*beatTicks/gd`;
  `onset(g) = cellStart + b*beatTicks + pair*pairLen +
  within*round(swingRatio*pairLen)`; `rmap[gd*B] = cellEnd`; durations =
  `rmap[g+span] - rmap[g]` (clamped >= 1 tick). swingRatio 0.5 -> exact
  straight grid (identity, pinned); 0.64 at ppq 480/gd 4 -> slot 1 =
  154 (pinned integer). Monotone for ratio in [0.5, 0.75] (validator
  range, property-tested). Spans crossing beats use the same map
  (beat = floor((g+span)/gd) math).
- Because pitches are fixed pre-thinning (D67) and positions are pure
  slot functions, the RESULT is fully determined by (grid, request,
  seed) - the REQ-FND-3 contract holds at the note tuple level.
Confidence: HIGH.

### D71 (RESULT SHAPE for S4 consumption + plan/realize split + staleness).

```ts
// engine/compose/types.ts (EDIT - additive; PRD 11.1 lives beside the model)
export type AccompRole = "bass" | "chords" | "pad";

export interface AccompanimentRequest extends Versioned { // version: 1
  readonly styleId: StyleId;
  readonly roles: readonly AccompRole[];        // non-empty (validated)
  readonly density: number;                     // 0..5 (REQ-COMP-35)
  readonly seed: number;                        // uint32 (REQ-COMP-36)
  readonly registerOffsets?: Partial<Record<AccompRole, number>>; // octave shifts (REQ-COMP-35)
  readonly transposeAccompaniment?: number;     // semitones, PLAN-time (REQ-TRANS-3, D50)
}

/** PRD 11.1 Plan: the fully-resolved decisions BEFORE tick mapping.
 *  Exported for two-level testing, NOT part of the shipped result. */
export interface AccompanimentPlan extends Versioned { /* grid, roles, ppq,
  key, styleId, voicingStyle, pattern ids, swingRatio, gd, density, seed,
  registers (post-offset+transpose), voicings per bar/slot, bass pitches,
  rootless flags per bar, drawCount */ }

/** GeneratedNote IS a NormalizedNote (structural) + provenance - S4's
 *  player/export/roll consume WITHOUT re-derivation (task item 4). */
export interface GeneratedNote extends NormalizedNote {
  readonly role: AccompRole;
  readonly bar: number;
  readonly slot: number;
}

export interface AccompanimentMeta extends Versioned {
  readonly styleId: StyleId; readonly density: number; readonly seed: number;
  readonly roles: readonly AccompRole[];
  readonly patternIds: { readonly bass: string; readonly chords: string; readonly pad: string };
  readonly voicingStyle: VoicingStyle;
  readonly swingRatioApplied: number; readonly gridDivisions: number;
  readonly registersUsed: Record<AccompRole, MidiRange>;
  readonly transpose: number;
  readonly noteCounts: Record<AccompRole, number>;
  readonly rootlessCount: number; readonly quartalFallbackCount: number;
  readonly unknownQualityCount: number;
  readonly bars: number; readonly endTick: number;
  /** gridFingerprint(grid) at generation time - staleness (below). */
  readonly gridFingerprint: string;
}

export interface AccompanimentResult extends Versioned {
  readonly generated: {
    readonly bass: readonly GeneratedNote[];
    readonly chords: readonly GeneratedNote[];
    readonly pad: readonly GeneratedNote[];
  };
  readonly meta: AccompanimentMeta;
  readonly annotations: readonly Annotation[]; // REQ-PED-1 ({result, annotations} pattern)
}
```
DEVIATION FROM PRD 11.1 (flagged honestly): the PRD sketch says
`AccompanimentResult {original, generated, meta}`. We do NOT embed the
original project (up to 30MB) in the result - the store already owns it
and `gridFingerprint` pins identity. "original" is REFERENCE, not FIELD.

Pipeline (engine/compose/accompany.ts - new engine source; the parent
sketch named it "assemble.ts"; renamed so it never reads as the etude
assembler - same directory convention, clearer intent):

```ts
export function planAccompaniment(
  req: AccompanimentRequest, grid: ChordGrid, ppq: number,
  key: KeyCandidate | null,
): Outcome<AccompanimentPlan>;              // ALL rng draws here
export function realizePlan(plan: AccompanimentPlan): {
  generated: AccompanimentResult["generated"]; annotations: readonly Annotation[];
};                                          // zero rng, zero clock
export function generateAccompaniment(
  req, grid, ppq, key,
): Outcome<AccompanimentResult>;            // plan + realize + meta
export function gridFingerprint(grid: ChordGrid): string;
// "bar:rootPc.qualitySymbol" cells joined - pure, cheap, staleness pin.
```
Outcome arms: empty roles -> "unsupported"; zero-bar grid -> ok with
zero notes + honest annotation (never an error); internal bug guard ->
"internal" (never throws, D49). `clock` is NOT a parameter (no ids need
time; PRD 11.1 has no instanceId on the result; deriveCanonicalId stays
etude-domain).

STALENESS: the panel compares `meta.gridFingerprint` to the CURRENT
merged grid's fingerprint and shows a "chart changed since generation -
regenerate" chip when they differ (pure, honest, zero auto-regenerate).
Confidence: HIGH.

### D72 (AUDIO PREVIEW - THE RE-SLICE): S3 ships render-and-play (offline, no transport); S4 absorbs the voice recipe. PARENT INTENT UPDATED.

Options weighed:
- A. Silent S3 (roll-only): slice-boundary-cleanest, but accompaniment
  WITHOUT sound cannot be evaluated musically; RK6 (generic-sounding
  output) is only detectable by ears; PRD Appendix F's five qualitative
  user tests become impossible until S4. S2 shipped zero audio - making
  S3 also zero-audio defers ALL musical feedback past the point where
  it can influence the pattern library.
- B. Render-and-play (CHOSEN): OfflineAudioContext renders the generated
  notes to an AudioBuffer (loopWav precedent - raw API, no deps, no
  transport, no mixer); a play/stop button auditions it. ~150 lines.
- C. Pull S4's composePlayer + mixer into S3: rejected - the mixer
  (per-group volume/solo, O/A keys, original-track playback) is S4's
  body; moving it re-slices two slices for one button.

SEAM (so S4 absorbs without rewrite):
- `src/lib/composeVoices.ts` (NEW): `scheduleComposeNote(ctx:
  BaseAudioContext, dest: AudioNode, role: AccompRole, midi, whenSec,
  durSec, vel)` + exported `VOICE_RECIPES` table (osc types, ADSR
  constants per role: bass = triangle + fast decay; chords = two
  detuned sines, pluck envelope; pad = filtered saw, slow attack). The
  recipe is the ONLY thing S4's realtime player and S4's WAV export
  need from the preview - both import this module. S4's composePlayer
  schedules the SAME voices live; the preview button then either stays
  as a no-transport quick-check or is absorbed into the transport (S4's
  call - both work unchanged).
- `src/lib/composePreview.ts` (NEW): `renderAccompaniment(result,
  project): Promise<AudioBuffer>` (tick->sec via tempo.ticksToSeconds -
  the PROJECT tempo map; tempo OVERRIDE is record-only until S4 per
  TD-043, and the preview tooltip says exactly that) +
  `composePreviewPlayer` singleton (`play/stop/subscribe(state)`,
  lazy live AudioContext, module singleton so StrictMode double-mount
  cannot leak a second ctx - PHASE-3-03). Render cap: first
  `min(durationSec, 90s)` + honest label "preview first 1:30" on longer
  grids (a 4-min offline render is seconds of jank; 90s is plenty to
  judge a groove).
- HONESTY: preview is ACCOMPANIMENT ONLY (mixing with originals = S4,
  labeled on the button: "Preview (accompaniment)").
- App.tsx: ZERO edits (no transport routing; Space/O/A stay S4).
- jsdom: OfflineAudioContext absent -> unit tests cover PURE surfaces
  only (recipe table, buffer-length math, cap logic, tick->sec mapping
  through the already-tested tempo functions); the render path is
  browser-pinned via the e2e state machine + manual verification
  (loopWav's exact precedent).
Confidence: HIGH.

### D73 (STORE PLACEMENT): request PERSISTED into the v4 payload WITHOUT v5 (D57's promise, verbatim in the shipped header); result IN-MEMORY, never persisted.

- `ComposeSession` gains `request?: AccompanimentRequest | null`
  (OPTIONAL field - old payloads default at read via
  `session.request ?? null`; NO migration, NO version bump - the D57
  comment is the authority).
- `composeAccompaniment: AccompanimentResult | null` - in-memory,
  excluded by partialize (derivable from (grid, request, seed):
  persisting it would be caching a pure function AND it references
  ticks of a project we refuse to persist).
- Actions: `setComposeRequest(req | null)` (persisted; does NOT touch
  the undo stacks - D59 scope is overrides); `setComposeAccompaniment(r
  | null)`; `clearCompose()` resets both; `setComposeFile` KEEPS the
  persisted request (style/seed are taste, not file state - same
  reasoning as etudeConstraints surviving mode switches) and nulls the
  result.
- Mode switch: result survives (store-resident, F8 pattern); reload:
  re-upload prompt restores request; generation stays EXPLICIT (no
  auto-generate on restore - user presses Generate; seed semantics are
  user-owned).
- No new dirty semantics (DirtyMap.compose stays the literal "none",
  ADR-007/F8 untouched).
Confidence: HIGH.

### D74 (ANNOTATIONS + CONCEPTS): truthful by construction; +2 curated concepts; negatives tested.

Annotations emitted by realizePlan (ids "ann-acc-<kind>-<bar>",
targets from the EXISTING union - voicing{bar}, progression{fromBar,
toBar}, chord{bar}):
1. Per-role pattern line (target progression 0..last): one per selected
   role, text = entry.label + realized facts ("Walking bass (Freddie
   ... n/a) - 32 bars, density 2; thinned: downbeat roots only" when
   the realized rank-filtered set is a strict subset - computed from
   the DATA, never assumed).
2. Voicing annotations (target voicing{bar}): emitted ONLY when the
   rootless flag is set for that bar AND the voicing actually excludes
   the root (computed from the realized pitches - double-truth) AND the
   bass role is on: "Rootless shell on Dm7 (3rd + 7th) - bass covers
   the root." conceptId "voice-leading".
3. drop2 note (first bar only): "Voicings use drop-2 (second voice from
   the top moved down an octave)." conceptId "drop-2" - emitted only
   when style === "drop2" AND the permutation actually applied (>= 4
   voices).
4. Walking approach (target chord{bar}): "Chromatic approach to G (bar
   5)." - only when the nextApproach token resolved to a chromatic
   neighbor (the resolver records the kind; diatonic steps are labeled
   "stepwise approach").
5. Quartal fallback count (target progression): when
   quartalFallbackCount > 0: "quartal stack unavailable on N bars -
   close voicing used." (honest, never silent).
6. All-rest grid: "No chords to accompany yet - enter chords first."
   (target melody - the only legal generic target; honest dead-end,
   mirrors REQ-COMP-51's manual-entry prompt).
NEW CONCEPTS (engine/pedagogy/concepts.ts, additive - registry has NO
count pin; quality pins apply): "walking-bass" (category rhythm) and
"comping" (category rhythm), each with real references, related ids
(voice-leading, ii-v-i), exampleNumerals in the D21 grammar. Pattern
labels link these; every conceptId emitted MUST resolve (existing test
rule).
NEGATIVES (test plan): pop request -> no annotation contains "walking"
or "swing"; bass role off -> zero rootless annotations; "chromatic
approach" never when keyless diatonic-only... (key null EXCLUDES
diatonic, so: never "stepwise" without a key); density-0 freddieGreen
annotation says downbeat-only when the note count proves it.
Confidence: HIGH.

### D75 (FILE LAYOUT + PURITY FLOOR): flat in engine/compose/ (matches the shipped compose family; NO accompany/ subdir - 4 files do not earn a directory); floor 29 -> 33.

New engine sources (4): patterns.ts, voicing.ts, bass.ts,
accompany.ts. Tree scans 30 -> 34; MIN_SCANNED_FILES 29 -> 33 in the
SAME commit as the first new file (D20/D56 ladder: "33 (S3)" was
pre-authorized by the parent). Zero non-relative imports, Rng-injected,
no clock, no Math.random, no console - engine/purity.test.ts is the
enforcer, unchanged.

### D76 (e2e LEG): new spec e2e/compose-accompaniment.spec.ts (in-spec fixture, D65 rails).

Discriminative legs (each fails if the mechanism it pins is removed):
1. upload -> AccompanimentPanel visible -> Generate (defaults: jazz,
   bass+chords, density 3, seed 42) -> roll gains
   `data-testid="roll-layer-bass"` / `"roll-layer-chords"` rect groups +
   status line shows note counts (the roll IS the visual proof).
2. seed 42 -> 43 -> regenerate -> status summary CHANGES (approach
   pitches differ; count may not - assert the serialized roll summary
   string differs, not the count).
3. RELOAD + re-upload -> style select + seed input RESTORED (request
   persistence, D73 - the only browser-level proof partialize keeps
   request) -> Generate same seed -> status summary byte-identical to
   leg 1 (determinism across reload).
4. density 0 -> Generate -> strictly fewer notes than density 5
   (thinning visible in a real browser).
5. Preview button state machine: idle -> rendering -> playing -> idle
   (data-preview attribute; audio OUTPUT is manual - honest, jsdom-free
   browser proves the plumbing only).
Confidence: HIGH.

---

## 4. Component API sketches (UI)

```
src/components/AccompanimentPanel.tsx (NEW; loaded-state host)
  props: {
    grid: ChordGrid; ppq: number; key: KeyCandidate | null;   // merged truth
    request: AccompanimentRequest;
    result: AccompanimentResult | null;
    busy: boolean;                                             // generation is sync; busy = preview render
  }
  // reads NOTHING from the store (AnalysisCard pattern); ComposeSurface wires.
  controls:
    style select      <- shippedStyleIds() + profile.name (REQ-COMP-30)
    role checkboxes   bass | chords | pad (>= 1 or Generate disabled) (REQ-COMP-30)
    density slider    0..5, aria-valuetext, default profile.densityDefault (REQ-COMP-35 P1)
    register offsets  per-role select: low / standard / high (-12/0/+12 st) (REQ-COMP-35 P1)
    transpose select  accompaniment-only semitone offset, default 0 (REQ-TRANS-3, D50)
    seed input        numeric + [Randomize] (Math.floor(Math.random()*2^32) - src-side legal,
                      engine stays rng-injected) (REQ-COMP-36)
    [Generate]        calls generateAccompaniment in the SURFACE (pure, <50ms trivial),
                      dispatches setComposeAccompaniment
    meta line         "jazz - drop2 - walking + freddieGreen - 42+38 notes - seed 1234"
    [Preview (accompaniment)] data-preview state machine, D72
    staleness chip    meta.gridFingerprint !== gridFingerprint(grid) -> "chart changed - regenerate"
    annotations       chips -> ConceptDrawer (EtudeViews local-state key-remount pattern;
                      conceptId null -> static text - the honest path)
```

ComposeSurface (EDIT): compute `accompRequest` (store, defaulted),
`handleGenerate` (pure call + dispatch, error arm -> existing banner
channel), render `<AccompanimentPanel/>` + result layers below
AnalysisCard; preview play/stop effect with cleanup (PHASE-2-01 live
gate; StrictMode-safe via the D72 singleton).

ComposePianoRoll (EDIT, additive): optional
`layers?: readonly { readonly label: string; readonly notes: readonly NormalizedNote[]; readonly color: string }[]`
- undefined -> byte-identical S2 behavior (its test pins keep passing);
defined -> per-layer rect groups with `data-testid={"roll-layer-"+label}`
+ `generated` notes reuse the existing x/y mapping. Colors from
ROLL_PALETTE (bass/chords/pad slots exist in the Okabe-Ito set; if a
slot is missing, add constants to ROLL_PALETTE - EtudePianoRoll is
import-from-only EXCEPT additive palette constants, TD-040-safe).

sessionStore (EDIT): D73 fields + 2 actions + partialize stays
composeSession-only + clearCompose/setComposeFile wiring.

---

## 5. Exact file plan + dirty-collision check

NEW (engine, 4 sources + 4 tests):
```
engine/compose/patterns.ts            D66 data + accessors + tiling helper
engine/compose/patterns.test.ts
engine/compose/voicing.ts             D68 voiceSequence + tone map
engine/compose/voicing.test.ts
engine/compose/bass.ts                D69 resolveBassPitches
engine/compose/bass.test.ts
engine/compose/accompany.ts           D70/D71 plan/realize/generate + gridFingerprint
engine/compose/accompany.test.ts      (incl. determinism matrix + thinning properties)
```
EDIT (engine, additive): engine/compose/types.ts (Accomp* types),
engine/pedagogy/concepts.ts (+2 concepts), engine/purity.test.ts (floor
33, ONE line), engine/compose/index.ts (re-export the new surface).
NEW (src): src/components/AccompanimentPanel.tsx (+ .test.tsx, glob
auto-register), src/lib/composeVoices.ts + src/lib/composePreview.ts
(+ composePreview.test.ts node-env, pure surfaces only),
src/lib/composeVoicingEquivalence.test.ts (D47 promise, node-env).
EDIT (src): ComposeSurface.tsx (panel host + wiring),
ComposePianoRoll.tsx (additive layers prop), sessionStore.ts (D73),
sessionStore.test.ts (extend - it is a src test, editable),
EtudePianoRoll.tsx ONLY IF a palette constant is missing (additive
constant; zero behavior change - last resort, prefer existing colors).
NEW (e2e): e2e/compose-accompaniment.spec.ts.
DOCS: docs/engine-compose.md (S3 section + pattern-library note),
docs/COMPOSE-MODE.md (accompaniment section), CHANGELOG.md.
NOT touched: App.tsx (ZERO edits - no transport wiring needed),
ModeGate.*, audio.ts, backingEngine, rhythmEngine, playbackClock,
transport, theory.ts (FROZEN - imported by the equivalence test ONLY),
paths.ts, ImportExportModal, the dirty-11 (NONE collide: AccompanimentPanel
is new; ComposeSurface/ComposePianoRoll/sessionStore are CLEAN and NOT
in the dirty list - re-verified via git status this round), tests/**
(it( stays 362), studies.ts, theory.ts data, README/SPEC/AGENTS/.kai,
vitest.config.ts, package.json (ZERO new deps), PRD/parent docs (the
S3 re-slice is recorded HERE; parent stays as-authored per repo
convention - its S3 row already says "accompaniment engine+patterns";
D72's preview is an ADDITION to that row, flagged in this doc's
PARENT INTENT UPDATE line + CHANGELOG).
Purity floor: 29 -> 33 (D75), same commit as patterns.ts.

---

## 6. Test plan (expected +130..170 passing; baseline 1820/1/2 -> 1820+N/1/2)

Engine (node, colocated):
1. patterns.test.ts: 14 entries, ids unique + exactly the two id unions
   (8+6); every hit step < divisions; ranks 0..5; labels ASCII non-empty;
   SHIPPED-PROFILE AFFINITY PIN: each of jazz/pop/classical's
   bassPattern+chordPattern has the profile's defaultFeel in its feel
   list (data integrity - catches table typos); tiling table (4/4
   identity, 3/4 drop, 5/4 tile, 6/8 3-beat, 7/8 clamp); velocity table
   bounds.
2. voicing.test.ts: tone map per quality (incl. alt/maj9 5->4 drop-5th
   rule); register containment property (every voice in window, every
   Appendix D range); first-chord root position + inversionAwareness=false
   re-anchor; greedy movement <= naive re-voicing on a ii-V-I corpus
   (total semitones moved - the "smooth" pin REQ-COMP-31); rootless only
   when allowed+eligible; tie-break direction flips with spreadBias;
   quartal coverage scoring + fallback counter; drop2 permutation
   identity vs etude formula; unknown quality -> rest + count.
3. bass.test.ts: token resolution (root/third/fifth/seventh/b7/slash
   bassPc); nearest-octave voice-lead; approach set membership +
   keyless chromatic-only; rest cells consume zero draws (stream
   identity pin); register clamp [28,48].
4. accompany.test.ts (THE CONTRACT FILE):
   a. DETERMINISM MATRIX: 3 styles x 6 densities x 3 seeds x role-sets
      {bass, chords+pad, all} enumerated, each generated TWICE ->
      JSON.stringify byte-equality (etude precedent).
   b. THINNING PROPERTIES (REQ-COMP-33): d-subset-of-d+1 by exact tuple;
      pitches never change with density; positions never change
      (thins, NOT reshapes - universal over grid corpus).
   c. TD-043 PIN: variable-length-bar grid (1,2,1,3,1 slots) -> per-bar
      slots read; cells tile exactly (no gaps/overlaps); every note
      inside its cell region; byte-deterministic across runs.
   d. SWING MAP: 0.5 identity; ppq 480 gd 4 ratio 0.64 -> slot 1 = 154
      (exact integer pin); monotone onset map over [0.5, 0.75].
   e. REGISTER/COLLISION (task item 5): every generated note inside its
      role register (property over matrix); result never contains a
      melody-role note; chords/pad/melody overlap band documented.
   f. NOTE INVARIANTS: midi 0..127, tick >= 0, durationTicks >= 1,
      velocity 0..1, ascending within role, no same-role overlap for
      monophonic bass.
   g. TRANSPOSE: +12 shifts registers + pitches; originals untouched
      (generator never sees tracks); clamp documented.
   h. EDGE: all-rest grid -> ok arm, zero notes, honest annotation;
      empty roles -> unsupported arm; density 5 on freddieGreen ==
      density 2 (pattern ceiling no-op).
5. concepts.test.ts (extend): new ids resolve + quality pins.
6. types.test.ts (extend): request/result version literals; fingerprint
   stability + sensitivity (one cell edit changes it).
7. purity floor 33 (same commit as patterns.ts).

src (node):
8. composeVoicingEquivalence.test.ts: D47 curated-fixture agreement
   engine(close) vs theory.applyVoiceLeading; divergence surface
   documented in header.
9. composePreview.test.ts: buffer-length math (ppq/tempo -> frames),
   90s cap, tick->sec via real tempo functions, VOICE_RECIPES bounds;
   NO OfflineAudioContext execution (jsdom absent - loopWav precedent).
10. sessionStore.test.ts (extend): request defaults at read on old v4
    payloads (NO v5); setComposeRequest persists, does NOT touch undo;
    result excluded by partialize; clearCompose/setComposeFile reset
    semantics per D73.

components (jsdom, auto-registered):
11. AccompanimentPanel.test.tsx: controls render + defaults
    (densityDefault from profile); >= 1 role gate; randomize changes
    seed input; Generate dispatches with assembled request; staleness
    chip appears on fingerprint mismatch; annotation chips -> drawer
    (key-remount); meta line content; preview button states (mocked
    player).
12. ComposeSurface.test.tsx (extend): panel only in loaded state;
    generated result flows to roll layers; error arm -> existing banner
    channel; pinned strings UNTOUCHED (ModeGate suite must pass
    UNEDITED - run it explicitly in the checklist).
13. ComposePianoRoll.test.tsx (extend): layers undefined -> S2 pins
    byte-identical; defined -> per-layer testids + rect counts.
14. e2e (D76): 5 legs, `npm run build` first.
15. Gates: lint -> test -> build x2 -> check:paths 36/36 ->
    node assets/check-links.cjs (362) -> manual: test:e2e + PREVIEW
    LISTENING CHECK (human, RK6 - record verdict in the dev report).

---

## 7. Ordered checklist (commit-sized)

1. [ ] Engine types (types.ts additive) + patterns.ts DATA +
   patterns.test.ts; purity floor -> 33 IN THIS COMMIT.
   Gate: `npx vitest run engine`. Commit:
   `feat(engine): accompaniment pattern library - authored step data (REQ-COMP-33/34, D66)`.
2. [ ] voicing.ts + voicing.test.ts + equivalence test (D47 pin).
   Commit: `feat(engine): sequential voice-leading engine - 5 style shapes (REQ-COMP-31/32)`.
3. [ ] bass.ts + bass.test.ts. Commit:
   `feat(engine): idiomatic bass pitch resolvers - walking/approach/boogie (REQ-COMP-34)`.
4. [ ] accompany.ts (plan/realize/generate + fingerprint + annotations)
   + accompany.test.ts (matrix + properties + TD-043 pin) + index.ts
   re-exports + concepts.ts (+2) + concepts.test. Gate: `npx vitest run
   engine` + `npx vitest run src/lib/compose`. Commit:
   `feat(engine): accompaniment planner+realizer - deterministic generateAccompaniment (REQ-COMP-30/35/36)`.
5. [ ] Store: ComposeSession.request + composeAccompaniment + actions +
   tests (NO version bump - D73). Commit:
   `feat(compose): session store - accompaniment request persisted, result in-memory (D73)`.
6. [ ] composeVoices.ts + composePreview.ts + pure tests. Commit:
   `feat(compose): offline accompaniment preview + shared voice recipes (D72)`.
7. [ ] AccompanimentPanel + ComposeSurface wiring + tests; ModeGate
   suite run explicitly. Commit:
   `feat(compose): accompaniment panel - style/roles/density/register/seed + annotations (REQ-COMP-30..36 UI)`.
8. [ ] ComposePianoRoll layers + tests. Commit:
   `feat(compose): piano roll shows generated layers (roll-only preview half)`.
9. [ ] e2e spec + full gates + MANUAL LISTEN CHECK. Commit:
   `test(e2e): compose accompaniment - generate, determinism across reload, thinning, preview state machine`.
10. [ ] Docs: engine-compose.md S3 section, COMPOSE-MODE.md
    accompaniment section, CHANGELOG (incl. the D72 parent-intent note).
    Commit: `docs(compose): phase 4 slice 3 - pattern library + accompaniment guide`.

## 8. Risks

| Risk | P | I | Mitigation |
|---|---|---|---|
| RK-S3-1: generated audio sounds generic (RK6 carried) | M | M | The pattern library IS the mitigation (authored idioms, not random notes); checklist step 9 makes the LISTEN CHECK a gate item with a recorded verdict; annotations never over-claim (D74 negatives tested); qualitative bar stays with humans (PRD App F) |
| RK-S3-2: greedy voice-leading edge cases (5-tone chains, wide registers) | M | L | Movement-<= -naive pin (test 2); quartal close-fallback counted + disclosed; all paths deterministic (worst case is deterministic-mediocre, fixable in data) |
| RK-S3-3: thinning accidentally re-pitches via cycle indices | L | H | D67 pins indices on the PRE-FILTER list; subset property universal (test 4b) |
| RK-S3-4: preview path untestable in jsdom | M | L | Pure-surface tests + e2e state machine + manual (loopWav precedent, stated honestly); S4 absorbs composeVoices.ts so the recipe is not throwaway |
| RK-S3-5: TD-043 variable-length bars mishandled | M | M | Dedicated pin (test 4c); cell-region tiling is one function, tested for exact coverage |
| RK-S3-6: request persistence surprises on old payloads | L | L | Field optional + default at read (D57's shipped comment is the authority); store test 10 |
| RK-S3-7: ModeGate/empty-state copy drift via panel work | L | M | Empty state untouched; ModeGate suite run explicitly in step 7 |
| RK-S3-8: swing realization off-by-one rounding on odd ppq | M | L | Integer-round map pinned (test 4d); identity pin at 0.5; monotonicity property |
| RK-S3-9: scope creep into S4 (mixer, transport, export, paste) | M | M | DO-NOT list below; preview is render-and-play ONLY (no play/pause/seek/loop) |
| RK-S3-10: snapshot discipline | L | H | PHASE-2-02 file-copy rule stands |

## 9. DO NOT build in S3

- NO transport, NO mixer, NO per-group volume/solo, NO O/A keys, NO
  Space routing, NO original-track playback, NO WAV/MIDI export (all S4).
- NO edits to: audio.ts, backingEngine, rhythmEngine, playbackClock,
  App.tsx, ModeGate.*, theory.ts (equivalence TEST imports only),
  paths.ts, ImportExportModal, dirty-11, tests/** (it( = 362),
  studies.ts, README/SPEC/AGENTS/.kai, vitest.config.ts, package.json.
- NO reharmonization (the analyzed grid is the input, verbatim).
- NO chord-chart paste (S4/D53), NO URL serialization (S4 stretch).
- NO new npm deps; NO Web Worker; NO melody-avoidance heuristics.
- NO auto-generate on load/restore (Generate is user intent; seed is
  theirs).
- NO console.* anywhere (engine fully silent).

## 10. Traceability

REQ-COMP-30 -> roles x styleId via generateAccompaniment + panel |
31 -> voicing.voiceSequence greedy lead + movement pin + D47 equivalence |
32 -> 5 style shapes consumed from profile.voicing.style |
33 -> D66 hit data + D67 rank thinning (subset/never-reshape properties) |
34 -> D69 resolvers x D66 bass entries (walking/rootFifth/shuffleBoogie/drone + twoFeel/eighthPulse) |
35 -> density slider + registerOffsets (panel, P1 honored) |
36 -> seed input + randomize + determinism matrix (REQ-FND-3) |
REQ-COMP-37 -> S4 (result shape pre-serves it: role buckets) |
REQ-PED-1/4/5 (accompaniment portion) -> D74 annotations + ConceptDrawer + 2 new concepts |
REQ-STYLE consumption -> first real reads of rhythm.{bassPattern,chordPattern,gridDivisions,swingRatio,densityDefault} + voicing.* (all 5 VoicingProfile fields have teeth - audit row 2) |
REQ-FND-2/3 -> createRng injected, draw-order contract, byte-equality matrix |
REQ-TRANS-3 -> transposeAccompaniment at plan time; originals never touched |
TD-043 -> per-bar slots.length read + S3-side pin (test 4c) |
D52/D55/D56/D57 -> fleshed out here (D66/D70/D75/D73); D72 is the one explicit parent-intent addition.

```yaml
HANDOFF_TO_DEVELOPER:
  from: "@architect"
  to: "@developer"
  timestamp: "2026-09-23T20:30:00Z"
  DELIVERABLES:
    - name: "docs/PHASE-4-S3-ACCOMPANIMENT.md"
      status: complete
      sections: "re-audit (17 anchors) + D66..D76 + authored pattern library (14 entries) + file plan + test plan + checklist + risks + traceability"
  CONSTRAINTS:
    - "baseline 1820/1/2 (2 = CSS-WIP, NOT yours); tests/ FROZEN it(=362; count pins 40/12 untouched"
    - "purity floor 29 -> 33 in the SAME commit as patterns.ts; 4 new engine sources, relative imports only, Rng-injected, zero clock"
    - "the pattern tables in D66 ARE the spec - transcribe the ranks/accents/feel lists verbatim; musical regressions are human-gated (listen check, step 9)"
    - "ZERO edits: App.tsx, ModeGate.*, audio.ts, backingEngine, rhythmEngine, playbackClock, theory.ts (import-for-test only), dirty-11, tests/**"
    - "store: request is an OPTIONAL field on the persisted ComposeSession (NO v5, NO migration); result is in-memory ONLY, never persisted"
    - "ASCII, no console.*, no any/@ts-ignore; new component tests auto-register via the glob"
  DECISIONS_MADE:
    - decision: "D66/D67: pattern library authored as per-beat hit data with explicit thinning ranks; density filters AFTER pitch planning (subset property)"
      confidence: HIGH
      rationale: "the PRD's deferred 'Pattern Library reference' does not exist; rank-ordered post-pitch thinning makes 'thins, never reshapes' structural, not behavioral"
    - decision: "D68: clean-room sequential voicer in compose/voicing.ts; etude realization stays per-chord; D47 equivalence pin scoped to close/full/inversion-aware overlap"
      confidence: HIGH
      rationale: "REQ-COMP-31 needs prev-chord state the etude path never had; tables shared in core, algorithms duplicate where semantics differ"
    - decision: "D72: S3 ships render-and-play preview (OfflineAudioContext, accompaniment-only, 90s cap); S4 absorbs composeVoices.ts - parent slice map amended, mixer/transport stay S4"
      confidence: HIGH
      rationale: "accompaniment cannot be musically evaluated silent; RK6 + PRD App F user tests need ears before S4; the seam keeps S4's rewrite cost at zero"
    - decision: "D71: generated notes are NormalizedNote-compatible + role/bar/slot provenance; result carries generated+meta+annotations, NOT the original project (fingerprint instead of embedding)"
      confidence: HIGH
      rationale: "S4 consumes without re-derivation; 30MB never duplicated"
    - decision: "D73: request persisted into v4 WITHOUT v5; result derived, never persisted; request outside undo scope"
      confidence: HIGH
      rationale: "D57's shipped header is the authority; determinism makes the result a cache, not state"
  IMPLEMENTATION_NOTES:
    - "swingRatio/gridDivisions have ZERO consumers today - S3 is the first; the rmap formula in D70 is pinned at 0.5 identity and 0.64/ppq480/gd4 -> 154"
    - "TD-043: read region.slots.length PER BAR everywhere; the merge appends cells (D60), so 1/2/3-slot bars coexist - test 4c is the owed pin"
    - "rootless decisions draw rng ONLY when bass is selected AND tones >= 4 AND rate > 0 - the draw-order contract in D68 must match the tests exactly"
    - "cycle/approach indices are computed pre-thinning or thinning re-pitches (RK-S3-3)"
    - "rest cells consume zero rng draws; grid edits shift the stream by design (seed semantics, documented in the panel tooltip)"
    - "alt quality carries interval 20 (b13) - dedup mod-12 when building tone sets"
    - "the preview tooltip must state the tempo override is not applied (TD-043 record-only until S4)"
    - "concepts.ts has NO count pin; the two new concepts must satisfy the existing quality pins (100+ word bodies)"
  PROGRESS:
    phases_completed: "5/5 (handoff, re-audit at cb953ed, requirements mapping, design, roadmap+risk)"
    retries: 0
    quality_gates_passed: "5/5 (all REQ-COMP-30..36 mapped; interfaces copyable; choices justified; determinism contract pinned; risks mitigated)"
  ESTIMATED_EFFORT:
    implementation_hours: "26-38"
    testing_hours: "12-16"
    documentation_hours: "2"
  CONCERNS:
    - "RK6 stays OPEN until the manual listen check (step 9) records a verdict - the structure tests cannot hear"
    - "the authored ranks/accents are first-pass musical judgment; tuning them is DATA-ONLY edits (the property tests are rank-agnostic) - do not restructure the pipeline to re-tune"
    - "preview on very long grids caps at 90s; if users need full-song auditioning before S4, that is an S4 transport ask, not an S3 patch"
  AUDIT_TRAIL:
    - { phase: "re-audit", duration: "~25 min", tools_used: "read/grep/bash (npm test fresh run: 1820/1/2 confirmed; it( recount: 362; git status dirty-11; grep swing consumers: zero; concepts count-pin check: none; sessionStore D57 header verbatim check)", errors_encountered: "none material" }
    - { phase: "design", duration: "~30 min", notes: "one parent-intent amendment (D72 preview), one parent-sketch rename (assemble.ts -> accompany.ts), PRD 11.1 'original' field deviation flagged (D71); the missing Pattern Library reference authored (D66)" }
```

**End of Slice 3 design.**
