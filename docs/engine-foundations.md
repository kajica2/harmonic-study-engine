# Engine Foundations (PRD-001 Phase 0)

Phase 0 lays the pure-TypeScript core everything else in
[PRD-001](PRD-001.md) stands on: one sanctioned seeded RNG, deterministic
identity for generated works, a versioned-data envelope with a migration
runner skeleton, and the `StyleProfile` data model with three shipped
profiles. Nothing here renders UI or touches Web Audio: the engine is plain
data and pure functions, testable in the node env. Requirements trace to
PRD-001 section 8.1 (REQ-FND-1..6, REQ-STYLE-1..7), section 10.2 (engine module
map), section 11.3 (migrations), and section 14 (Phase 0 rollout).

## Layout

| Path | Responsibility |
|---|---|
| `engine/core/` | `rng.ts` seeded PRNG, `ids.ts` canonical/instance identity, `versioned.ts` version envelope. |
| `engine/migrations/` | `types.ts` + `runner.ts` sequential upgrade chain; `index.ts` session registry (baseline v1, empty chain). |
| `engine/styles/` | `types.ts` profile tree; `profiles/` jazz + pop + classical data; `index.ts` registry and validator; `difficulty.ts` probability scaling. |
| `engine/purity.test.ts` | The dependency-rule guard below. Engine tests live beside sources, not in `tests/`, so the README drift gate (`assets/check-links.cjs`) is untouched. |

There is no `engine/index.ts` barrel; consumers deep-import, e.g.
`import { mulberry32 } from "../../engine/core/rng"` (as `src/magenta/noise.ts` does).

## The dependency rule

`src/**` may import `engine/**`; never the reverse, and never a UI/audio
package. `engine/purity.test.ts` (policy-as-test, copied from
`tests/no-debug-logs.test.ts`) scans every non-test `.ts` under `engine/`:

- Banned impure calls, matched line-by-line: `Math.random(`, `Date.now(`,
  `new Date(`, `performance.now(`, and any `console.` (stricter than src's
  warn/error allowance: engine errors flow through return values, see
  `MigrationOutcome`, never logs). Lines whose trimmed start is `*` or `//`
  are skipped, so the ban can be documented in comments.
- Boundary-crossing imports: relative specifiers are normalized and flagged
  if they resolve into `src/`; bare `node:` specifiers are exempt; every
  other specifier's package root (scoped = two segments, e.g. `@tonejs/midi`)
  is checked against a denylist: `react`, `react-dom`, `tone`, `@tonejs`,
  `@magenta`, `abcjs`, `lucide-react`, `midi-writer-js`, `jspdf`,
  `svg2pdf.js`, `fflate`, `soundfont-player`.

Note this is a denylist, not a true allowlist: a brand-new dep (e.g. `tonal`)
passes silently; adopting one inside `engine/` is a review decision. A sanity
floor (`MIN_SCANNED_FILES = 21`; Phase 0 shipped 12 sources, and Phase 3
slice 1 raised the floor to 21 alongside its seven new engine sources, per
D20) stops a broken glob from silently passing.

## API reference

### engine/core/rng.ts (REQ-FND-2/3, REQ-NFR-7)

```ts
type Seed = number; // uint32, 0..4294967295
declare function mulberry32(seed: number): () => number; // raw [0,1) stream
declare function hashSeed(s: string): number; // FNV-1a -> uint32; collisions acceptable
interface Weighted<T> { readonly item: T; readonly weight: number } // weight >= 0
interface Rng {
  readonly seed: Seed; // coerced uint32: createRng(-1).seed === 4294967295
  next(): number; // [0, 1)
  int(maxExclusive: number): number; // [0, maxExclusive); RangeError if < 1
  range(minIncl: number, maxIncl: number): number; // RangeError if min > max
  bool(p?: number): boolean; // P(true) = p, default 0.5
  pick<T>(arr: readonly T[]): T; // uniform; RangeError on empty; never mutates
  weighted<T>(items: readonly Weighted<T>[]): T; // cumulative scan; RangeError on empty or total <= 0
  shuffle<T>(arr: readonly T[]): T[]; // Fisher-Yates on a copy
}
declare function createRng(seed: Seed): Rng;
```

One `Rng` per generator call. Never share a handle across independent
outputs: the streams interleave and reproducibility dies.

### engine/core/ids.ts (REQ-FND-6)

```ts
declare const canonicalBrand: unique symbol; // opaque, not exported
declare const instanceBrand: unique symbol;
type CanonicalId = string & { readonly [canonicalBrand]: true }
type InstanceId = string & { readonly [instanceBrand]: true }
declare function canonicalize(value: unknown): string // key-sorted stable JSON
declare function deriveCanonicalId(kind: string, seed: Seed, constraints: unknown): CanonicalId
declare function makeInstanceId(nowMs: number, seq: number): InstanceId
// escape hatches for tests / parsing persisted ids: asCanonicalId, asInstanceId
```

`canonicalize` sorts object keys recursively (arrays keep order,
undefined-valued keys dropped), so constraint field order never affects
identity. `deriveCanonicalId` hashes `canonicalize(constraints) + "|" +
(seed >>> 0)` into `"<kind>-<base36>"` (`"etu"` now; `"acc"` later): same
inputs, any device, any day, same id. `makeInstanceId` yields
`"i-<nowMs:base36>-<seq:base36, min 4 chars>"`. The engine never reads the
clock: `nowMs` is caller-supplied (the guard bans `Date.now`/`new Date`).

```ts
// src/lib/<adapter>.ts - the adapter layer is where the clock is read
import { createRng, type Seed } from "../../engine/core/rng";
import { deriveCanonicalId, makeInstanceId } from "../../engine/core/ids";

let instanceSeq = 0;

export function newEtude(seed: Seed, constraints: { style: string; bars: number }) {
  const canonical = deriveCanonicalId("etu", seed, constraints);
  const rng = createRng(seed);
  const firstNote = rng.range(48, 84); // shipped for real in Phase 3 slice 1
  const instance = makeInstanceId(Date.now(), instanceSeq++);
  return { canonical, firstNote, instance };
}
```

### engine/core/versioned.ts (REQ-FND-5)

```ts
interface Versioned { readonly version: number } // positive integer
declare function isVersioned(value: unknown): value is Versioned
```

Everything serialized (localStorage, URL params, file export) carries
`version`. This file is the root of the engine dependency graph: zero imports.

### engine/migrations/ (REQ-FND-5, PRD 11.3)

```ts
interface DataMigration {
  readonly from: number; readonly to: number; // to === from + 1, validated
  readonly up: (data: unknown) => unknown; // pure, copy-on-write
}
type MigrationOutcome<T> =
  | { readonly ok: true; readonly value: T; readonly applied: readonly number[] }
  | { readonly ok: false; readonly readOnly: true; readonly value: T; readonly error: string }
interface MigrationRunner<T = unknown> {
  readonly currentVersion: number;
  run(raw: unknown): MigrationOutcome<T>;
}
interface MigrationRunnerOptions {
  readonly migrations: readonly DataMigration[];
  readonly currentVersion: number;
  readonly assumeVersion?: number; // default 1, for pre-runner hse.* payloads
}
declare function createMigrationRunner<T = unknown>(opts: MigrationRunnerOptions): MigrationRunner<T>
declare function validateMigrationChain(migrations: readonly DataMigration[], currentVersion: number): string | null
// index.ts: CURRENT_SESSION_VERSION = 1, SESSION_MIGRATIONS = [],
// createSessionRunner<T>() and the re-exports above
```

Runner contract: never throws, never logs. A non-plain-object payload, a
stored version newer than `currentVersion`, a missing step, or an `up()`
that throws / returns a non-object / wrong `version` all yield `ok: false`
with the ORIGINAL unmodified payload (adapters render it read-only and do
their own `console.warn`). `up()` must be pure copy-on-write. Chains start
at 1 and step by exactly +1; `validateMigrationChain` returns `null` when
valid, else a fault string.

Worked example, adding a v1 -> v2 session migration:

```ts
// engine/migrations/index.ts
const sessionV1ToV2: DataMigration = {
  from: 1,
  to: 2,
  up: (data) => ({ ...(data as object), version: 2, transposeOffset: 0 }),
};

export const SESSION_MIGRATIONS: readonly DataMigration[] = [sessionV1ToV2];
export const CURRENT_SESSION_VERSION = 2;
// and in runner.test.ts: expect(validateMigrationChain(SESSION_MIGRATIONS, 2)).toBeNull()
```

### engine/styles/ (REQ-STYLE-1..7)

`StyleProfile extends Versioned` - a plain-data tree, JSON round-trip safe
(pinned by test). `StyleProfile`/`StyleId` live in `engine/styles/types.ts`
(the index re-exports only its own surface). Field groups:

| Group | Fields | Notes |
|---|---|---|
| meta | `id`, `name`, `description`, `instrument` | `instrument` is a display hint; adapters map real voices in Phase 3+. |
| tempo | `tempoRange: [lo, hi]`, `defaultTempo` | BPM ints; validator: `0 < lo <= hi < 400`, default inside range. |
| harmony | `vocabulary: {numeral, weight}[]`, `progressions: numeral[][]`, `extensionBias`, `alterationBias`, `modalInterchangeRate`, `secondaryDominantRate`, `reharmonizationRate` | Weights >= 0 and sum to 1.000 +/- 0.001; every progression token must exist in the vocabulary. The five biases are BASE probabilities calibrated at difficulty 3. |
| melody | `contour`, `range`, `chromaticism`, `syncopation`, `chordToneStrongBeat`, `maxLeapSemitones`, `repeatNoteRate` | `range` MIDI 0-127; `maxLeapSemitones` 1-24; `chordToneStrongBeat` = P(strong beat on a chord tone). |
| rhythm | `defaultFeel`, `swingRatio`, `gridDivisions`, `bassPattern`, `chordPattern`, `meters`, `densityDefault` | `swingRatio` 0.5 straight, 0.58/0.64/0.70 light/medium/hard swing; `gridDivisions` 2 = eighths, 4 = sixteenths; `densityDefault` centers the 0-5 density slider (REQ-COMP-35). |
| voicing | `style`, `rootlessRate`, `spreadBias`, `registers: {bass, chords, pad, melody}`, `inversionAwareness` | Registers are inclusive MIDI pairs; all shipped profiles use the PRD Appendix D defaults (pinned by test). |

Numeral tokens stay ASCII: uppercase = major family, lowercase = minor,
trailing `o` = diminished, suffixes `maj7/7/m7/m7b5/alt/sus4/add9`, `b`
prefix = flat root (borrowed). Not to be confused with `StylePack`
(`src/lib/stylePack.ts`, counterpoint constraints) or `BackingStyle`
(`src/lib/backingEngine.ts`, playback beat ids).

```ts
type StyleId = "jazz" | "pop" | "classical" | "lofi" | "blues" | "modal"
declare function shippedStyleIds(): StyleId[] // ["jazz","pop","classical"] today
declare function getStyleProfile(id: StyleId): StyleProfile // THROWS for named-but-unshipped ids
declare function allStyleProfiles(): StyleProfile[]
declare function validateStyleProfile(candidate: unknown): { ok: boolean; errors: string[] } // StyleProfileValidation
```

The full six-member union ships now so persistence and pickers never need a
breaking type change; the registry holds three. `getStyleProfile` throwing
is a programmer-error contract: UI must gate on `shippedStyleIds()` first
(`profiles.test.ts` pins the throw for `"lofi"`). `validateStyleProfile` is
hand-rolled (Zod deferred per PRD 10.3), checks every bound above, and
prefixes error paths with `p.`.

Difficulty scaling (REQ-STYLE-7):

```ts
type Difficulty = 1 | 2 | 3 | 4 | 5
declare function scaleProbability(base: number, d: Difficulty): number
```

Factors are `[0.4, 0.7, 1.0, 1.3, 1.6]` (difficulty 3 = identity, the
calibration point). Positive results are clamped to `[0.02, 0.98]`, so an
option never disappears and never saturates. Structural zeros (`base <= 0`,
e.g. classical's `rootlessRate: 0`) return 0 at every difficulty: zero is a
style fact, not an option. Vocabulary and progression LISTS are never filtered
by difficulty; only weights move (convention - tests pin probability bounds
and list contents, not list identity across difficulty).

## Adding a new style profile

1. Create `engine/styles/profiles/<slug>.ts` exporting
   `<NAME>_PROFILE = { ... } satisfies StyleProfile`. Copy `pop.ts` for
   shape: weights sum to 1.000 (+/- 0.001), biases calibrated at difficulty
   3, Appendix D registers unless the style truly needs otherwise.
2. Register it in the `PROFILES` map in `engine/styles/index.ts`
   (import + entry); `shippedStyleIds()`, `getStyleProfile()`, and
   `allStyleProfiles()` pick it up automatically.
3. Update the two registry pins in `engine/styles/profiles.test.ts` (both
   assert exactly `["jazz", "pop", "classical"]`). The per-profile
   validator/serialization tests loop over `allStyleProfiles()`, so the new
   profile is covered with no new test code.
4. `npm run lint && npm test`: purity guard and validator-backed tests pass.

## Reproducibility contract

Same seed + same constraints => same `canonicalId` AND same output, on any
device, forever. The chain of guarantees: `mulberry32`/`hashSeed` bodies are
frozen (do not "improve" them); all randomness flows through one
`createRng(seed)` handle per call; constraints are canonicalized
key-order-independently before hashing; the engine reads no clock, no ambient
entropy, and no `Math.random` (purity guard). That is why
`src/magenta/noise.ts` re-exports `mulberry32`/`hashSeed` from
`engine/core/rng.ts` instead of keeping copies: one source of truth, zero
behavior change for existing magenta/lib consumers. The stream is pinned
twice: `engine/core/rng.golden.test.ts` freezes exact outputs (including the
same values through the noise.ts re-export path), and the humanizer tests pin
determinism (same seed => byte-identical output).

## What Phase 0 deliberately does NOT include

- Generators. No `engine/etude|compose|explore` modules at Phase 0 time;
  `engine/etude/` + `engine/pedagogy/` shipped later (Phase 3 slice 1, pure
  engine, NOT yet user-facing) - see [engine-etude.md](engine-etude.md).
  Compose/explore generators remain Phases 4/5 (PRD 14).
- Persistence wiring. `createSessionRunner` is exercised by tests only;
  Phase 1 hooks it into the zustand persist `migrate` callback for `hse.session`.
- Transpose/spelling/midi utilities. PRD 10.2 lists them under `core/` and
  PRD 14's Phase 0 bullet mentions `transposeNote`, but none shipped -
  transposition is a Phase 2 deliverable (REQ-TRANS-*).
- The remaining three profiles (`lofi`, `blues`, `modal`): the union and
  picker contract exist; the data arrives with the phases that consume it.
- No `tonal`/`@tonejs/midi` usage inside `engine/` (installed for adapters,
  not the pure core).
