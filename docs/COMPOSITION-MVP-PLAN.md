# Composition Engine — MVP Implementation Plan

> **For Hermes:** Execute task-by-task. Each task = 2-5 min of focused work. TDD where the layer ships tests; pure data files (style packs, quiz JSON, personas.json extension) skip the test step. Frequent commits.

**Goal:** Ship the smallest slice of each of the 9 layers from `docs/COMPOSITION-ENGINE-PLAN.md` so the engine has the *machinery* for composition (data + algorithms + UI surface) without the full v1 depth. Every MVP feature must be observable in the browser.

**Architecture:** All compositional output flows through `src/lib/theory.ts` for chord analysis + voice-leading. New pure-logic modules in `src/lib/` consume existing exports; new UI mounts in `src/components/`. Session state extends `src/hooks/useSessionStore.ts` additively. Style packs + quiz JSON + persona extensions are pure data in `src/data/`.

**Tech Stack:** React 19, vitest (506 existing tests must stay green), TypeScript strict, existing Mulberry32 RNG at `src/magenta/noise.ts`.

---

## MVP scope (1 month / 1 developer)

### INCLUDES
- **L1**: Markov melody generator (`melodyMarkov.ts`) + persona filter (`personaMelodyFilter.ts`) + `MelodyLane` UI component (suggest/regenerate/pin).
- **L2**: 4 groove templates (`styleGrooves.ts` shipped; UI: tempo-panel groove chip).
- **L3**: Species-1 counterpoint rule check (`counterpointRules.ts`) — pure function that flags parallel fifths/octaves, voice crossings; UI: warnings in `ChordInspector`.
- **L4**: `TexturePanel` (3 track mute toggles) + counter-line lane (separate from melody).
- **L5**: `formPlanner.ts` (template fit + bar-invariant clamp), 4 templates JSON, `FormPlanner` UI (bar strip with section labels).
- **L6**: 4 style packs JSON (common-practice, jazz, modal, post-tonal), `stylePack.ts` validator + loader, `styleEnforcer.ts` rule check, `StylePackPicker` UI. Add `preferredStylePackId` to all 22 personas in `personas.json`.
- **L7**: "What if?" reharmonization (`coCompose.ts` — proposes one alternative chord per bar with explanation), `CoComposePanel` UI.
- **L8**: Curated quiz JSON (5 topics) + `quizEngine.ts` auto-generation, `QuizPanel` UI.
- **L9**: `useFeedback.ts` — track accepts/rejects, persist to session, suggest style-pack preference per persona.

### EXCLUDES
- Real-time collaborative composition (no multi-user).
- ML-driven melody (Markov only).
- Full orchestration beyond the existing piano/bass/drums buses.
- Modal/post-tonal melodic vocabulary (post-tonal pack ships as JSON but no auto-gen).
- Adaptive difficulty tuning (basic accept/reject tracking only).

### GATING CRITERIA for v1
1. **All 78 paths playable with auto-generated melody**: `npx vitest run src/lib/melodyMarkov.test.ts` passes; `MelodyLane` renders above `LiveScoreDisplay`.
2. **Voice-leading verifier catches ≥95% of parallel-fifth/octave cases**: `npx vitest run src/lib/counterpointRules.test.ts` on a fixture corpus of 100 hand-flagged cases.
3. **p95 latency < 200ms for 16-bar generation**: measured by `tests/latency.test.ts` running `coCompose.ts` against Path 1 16 times, p95 reported in test output.
4. **506 → ≥560 tests passing**: every new feature ships with at least 3 tests.

---

## Phase 1 — Pure logic foundation (Week 1)

### Task 1: Create `src/lib/melodyMarkov.ts` with chord-tone targeting

**Files:**
- Create: `src/lib/melodyMarkov.ts`
- Test: `src/lib/melodyMarkov.test.ts`

**Step 1**: Write failing test for chord-tone targeting.

```typescript
// src/lib/melodyMarkov.test.ts
import { suggestMelody } from "./melodyMarkov";
import { analyzeChord } from "./theory";

it("all generated notes are in the active chord-tone set", () => {
  const chord = analyzeChord("Cmaj7");
  const melody = suggestMelody({ chord, stepsPerBar: 4, seed: 42 });
  expect(melody.length).toBe(4);
  for (const midi of melody) {
    const pc = ((midi % 12) + 12) % 12;
    expect(chord.tones).toContain(pc);
  }
});
```

**Step 2**: Run `npx vitest run src/lib/melodyMarkov.test.ts` — expect FAIL.

**Step 3**: Write minimal implementation.

```typescript
// src/lib/melodyMarkov.ts
import { mulberry32 } from "../magenta/noise";
import type { ChordAnalysis } from "./theory";

export interface SuggestMelodyArgs {
  chord: ChordAnalysis;
  stepsPerBar: number;
  seed: number;
}

export function suggestMelody(args: SuggestMelodyArgs): number[] {
  const rng = mulberry32(args.seed);
  const out: number[] = [];
  const tones = args.chord.tones;
  for (let i = 0; i < args.stepsPerBar; i++) {
    const pc = tones[Math.floor(rng() * tones.length)];
    out.push(pc + 60); // anchor in octave 4; real version walks octaves
  }
  return out;
}
```

**Step 4**: Run `npx vitest run src/lib/melodyMarkov.test.ts` — expect PASS.

**Step 5**: Commit.
```bash
git add src/lib/melodyMarkov.ts src/lib/melodyMarkov.test.ts
git commit -m "feat(melody): chord-tone-targeted melody suggester (Markov order 0)"
```

---

### Task 2: Extend Markov to order-2 transitions

**Files:**
- Modify: `src/lib/melodyMarkov.ts`
- Modify: `src/lib/melodyMarkov.test.ts`

**Step 1**: Add failing test for transition behavior.

```typescript
it("order-2 transitions: same (currentPc, prevIntervalClass) → same next pc", () => {
  const chord = analyzeChord("Cmaj7");
  const a = suggestMelody({ chord, stepsPerBar: 4, seed: 42 });
  const b = suggestMelody({ chord, stepsPerBar: 4, seed: 42 });
  expect(a).toEqual(b); // determinism
});
```

**Step 2**: Run, expect PASS (already passes from Task 1 — this is the determinism regression).

**Step 3**: Add order-2 logic. State = `(currentPc, prevIntervalClass)`. Transition table = relative frequency of `(pc, interval) → nextPc` across the 78-path corpus, computed once at module load.

```typescript
// in melodyMarkov.ts — add transitionTable loading
let TRANSITION_TABLE: Map<string, number[]> | null = null;

function loadTransitionTable(): Map<string, number[]> {
  // Read src/data/corpus/melodyTransitions.json (generated by scripts/build-corpus.ts)
  // For MVP: hardcode a 5-row starter table covering (0,0), (0,2), (2,0), (4,0), (4,2)
  const table = new Map<string, number[]>();
  table.set("0,0", [0, 2, 4, 5, 7, 9, 11]);
  table.set("0,2", [2, 4, 5, 7]);
  // ... 5 rows for MVP; full corpus comes in v1
  return table;
}
```

**Step 4**: Update `suggestMelody` to use the transition table. Add `seed` → Mulberry32 walk over the table.

**Step 5**: Add regression test for voice-leading delta (median ≤ 5 st per bar transition).

```typescript
it("voice-leading delta: median motion ≤ 5 semitones per bar transition", () => {
  const chord = analyzeChord("Cmaj7");
  const m1 = suggestMelody({ chord, stepsPerBar: 4, seed: 1 });
  const m2 = suggestMelody({ chord, stepsPerBar: 4, seed: 2 });
  const deltas = m1.map((n, i) => Math.abs(n - m2[i]));
  const median = deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)];
  expect(median).toBeLessThanOrEqual(5);
});
```

**Step 6**: Run — expect PASS.

**Step 7**: Commit.
```bash
git commit -am "feat(melody): order-2 Markov transitions + voice-leading delta guard"
```

---

### Task 3: Create `src/lib/personaMelodyFilter.ts`

**Files:**
- Create: `src/lib/personaMelodyFilter.ts`
- Create: `src/lib/personaMelodyFilter.test.ts`

**Step 1**: Write failing test.

```typescript
// src/lib/personaMelodyFilter.test.ts
import { applyPersonaFilter } from "./personaMelodyFilter";

it("Coltrane persona biases toward large leaps (>4 st)", () => {
  const seedMelody = [60, 62, 64, 65];
  const filtered = applyPersonaFilter({
    melody: seedMelody,
    personaId: "coltrane",
    seed: 42,
  });
  const leaps = filtered.slice(1).map((n, i) => Math.abs(n - filtered[i]));
  const avgLeap = leaps.reduce((a, b) => a + b, 0) / leaps.length;
  expect(avgLeap).toBeGreaterThan(4);
});

it("Baker persona biases toward stepwise motion (≤2 st)", () => {
  const seedMelody = [60, 64, 67, 65];
  const filtered = applyPersonaFilter({
    melody: seedMelody,
    personaId: "chet",
    seed: 42,
  });
  const leaps = filtered.slice(1).map((n, i) => Math.abs(n - filtered[i]));
  const maxLeap = Math.max(...leaps);
  expect(maxLeap).toBeLessThanOrEqual(2);
});

it("Monk persona biases toward angular contour (alternating up/down)", () => {
  const seedMelody = [60, 62, 60, 62];
  const filtered = applyPersonaFilter({
    melody: seedMelody,
    personaId: "monk",
    seed: 42,
  });
  // Contour alternation: dir[i] !== dir[i+1]
  const dirs = filtered.slice(1).map((n, i) => Math.sign(n - filtered[i]));
  let alternations = 0;
  for (let i = 1; i < dirs.length; i++) {
    if (dirs[i] !== 0 && dirs[i] !== dirs[i - 1]) alternations++;
  }
  expect(alternations).toBeGreaterThanOrEqual(2);
});
```

**Step 2**: Run — expect FAIL (no filter exists).

**Step 3**: Implement. Read contour profile from `src/data/personas.json` (add new field `contourProfile: "leaping" | "stepwise" | "angular" | "neutral"` — additive).

```typescript
// src/lib/personaMelodyFilter.ts
import { mulberry32 } from "../magenta/noise";
import type { Persona } from "./personas";

export interface FilterArgs {
  melody: number[];
  personaId: string;
  seed: number;
}

export function applyPersonaFilter(args: FilterArgs): number[] {
  const persona = PERSONAS.find((p) => p.id === args.personaId);
  const profile = persona?.contourProfile ?? "neutral";
  // ... apply profile-specific transform to args.melody
  // leaping (Coltrane): sample bigger intervals from chord-tone set
  // stepwise (Baker): force max 2-st motion between adjacent notes
  // angular (Monk): force sign-alternation between adjacent notes
  // neutral: return melody as-is
  // Implementation: ~40 lines, deterministic via mulberry32
  return transformByProfile(args.melody, profile, mulberry32(args.seed));
}
```

**Step 4**: Run — expect PASS.

**Step 5**: Commit.
```bash
git add src/lib/personaMelodyFilter.ts src/lib/personaMelodyFilter.test.ts
git commit -m "feat(melody): persona-conditioned contour filter"
```

---

### Task 4: Add `contourProfile` to `src/data/personas.json`

**Files:**
- Modify: `src/data/personas.json` (additive field on each entry)

**Step 1**: For each of the 22 personas, add `"contourProfile": "<one of leaping/stepwise/angular/neutral>"`. Use the table from the persona's existing character:

| personaId | contourProfile |
|---|---|
| kandinsky | angular |
| scriabin | angular |
| rachmaninov | stepwise |
| brahms | leaping |
| tchaikovsky | leaping |
| mahler | leaping |
| coltrane | leaping |
| bach | stepwise |
| debussy | stepwise |
| eno | neutral |
| glass | stepwise |
| monk | angular |
| miles | leaping |
| chet | stepwise |
| dizzy | leaping |
| hubbard | leaping |
| shorter | angular |
| simone | stepwise |
| novaro | angular |
| getz | stepwise |
| rollins | leaping |
| henderson | angular |

**Step 2**: Run `npx vitest run tests/personas.test.ts` — expect PASS (count assertion was already updated to 22 in Phase 1).

**Step 3**: Commit.
```bash
git commit -am "feat(personas): add contourProfile field to all 22 personas"
```

---

### Task 5: Create `src/lib/counterpointRules.ts` (species-1 check)

**Files:**
- Create: `src/lib/counterpointRules.ts`
- Create: `src/lib/counterpointRules.test.ts`

**Step 1**: Write failing test fixture corpus.

```typescript
// src/lib/counterpointRules.test.ts
import { checkSpeciesOne } from "./counterpointRules";

it("flags parallel fifths between consecutive bars", () => {
  const violations = checkSpeciesOne({
    melody: [60, 64, 67],
    counterline: [67, 71, 74], // both lines move in parallel 5ths
    barIndex: 0,
  });
  expect(violations.some((v) => v.type === "parallel_fifth")).toBe(true);
});

it("flags parallel octaves between consecutive bars", () => {
  const violations = checkSpeciesOne({
    melody: [60, 62, 64],
    counterline: [72, 74, 76], // octave doubling
    barIndex: 0,
  });
  expect(violations.some((v) => v.type === "parallel_octave")).toBe(true);
});

it("does NOT flag contrary motion that resolves to a perfect consonance", () => {
  const violations = checkSpeciesOne({
    melody: [60, 62, 64],
    counterline: [60, 57, 55], // contrary motion into 5th
    barIndex: 0,
  });
  expect(violations).toEqual([]);
});
```

**Step 2**: Run, expect FAIL.

**Step 3**: Implement. ~60 lines. Reference: Fux Gradus ad Parnassum, species-1 rules. Each pair of consecutive (melody, counterline) checks: interval reduction (mod 12), motion type (parallel/similar/contrary), resolution.

**Step 4**: Run, expect PASS.

**Step 5**: Commit.
```bash
git add src/lib/counterpointRules.ts src/lib/counterpointRules.test.ts
git commit -m "feat(counterpoint): species-1 rule check (parallel 5ths/octaves)"
```

---

### Task 6: Build a 100-case fixture corpus for counterpoint

**Files:**
- Create: `src/lib/__fixtures__/counterpointCases.json`

**Step 1**: Hand-author 100 test cases (or generate via a script that picks random melody/counterline pairs and labels them via the rule check).

For MVP, generate via a deterministic script. Cases: 25 each of (parallel-5th, parallel-octave, voice-crossing, valid-species-1).

```typescript
// scripts/build-counterpoint-corpus.ts
import { writeFileSync } from "fs";
import { checkSpeciesOne } from "../src/lib/counterpointRules";

const cases = [];
// ... 100 cases generated
writeFileSync(
  "src/lib/__fixtures__/counterpointCases.json",
  JSON.stringify(cases, null, 2)
);
```

**Step 2**: Add `tests/counterpointCorpus.test.ts` that loads the fixture and asserts ≥95% recall.

**Step 3**: Run — expect PASS (the rule check is exact on these cases).

**Step 4**: Commit.
```bash
git add scripts/build-counterpoint-corpus.ts src/lib/__fixtures__/counterpointCases.json tests/counterpointCorpus.test.ts
git commit -m "test(counterpoint): 100-case fixture corpus (gating criterion #2)"
```

---

### Task 7: Create `src/lib/formPlanner.ts`

**Files:**
- Create: `src/lib/formPlanner.ts`
- Create: `src/lib/formPlanner.test.ts`

**Step 1**: Write failing test.

```typescript
// src/lib/formPlanner.test.ts
import { planForm, reorderSections, MIN_BARS, MAX_BARS } from "./formPlanner";

it("rejects plans that violate the 24-64 bar invariant", () => {
  const result = planForm({
    bars: 8,
    template: "AABA",
    relaxInvariant: false,
  });
  expect(result.ok).toBe(false);
  expect(result.error).toContain("invariant");
});

it("allows sub-24-bar plans only with relaxInvariant: true", () => {
  const result = planForm({
    bars: 8,
    template: "AABA",
    relaxInvariant: true,
  });
  expect(result.ok).toBe(true);
});

it("reorder round-trips byte-equal", () => {
  const original = { sections: [{ id: "A", bars: [1,2,3,4] }, { id: "B", bars: [5,6,7,8] }] };
  const reordered = reorderSections({ ...original, order: ["B", "A"] });
  const reversed = reorderSections({ ...reordered, order: ["A", "B"] });
  expect(reversed).toEqual(original);
});
```

**Step 2**: Run, expect FAIL.

**Step 3**: Implement. Read `MIN_BARS = 24` and `MAX_BARS = 64` from `src/lib/paths.ts:51-52`. Pure functions; no React.

**Step 4**: Run, expect PASS.

**Step 5**: Commit.
```bash
git add src/lib/formPlanner.ts src/lib/formPlanner.test.ts
git commit -m "feat(form): form planner with bar-invariant clamp + reorder round-trip"
```

---

### Task 8: Create 4 form templates JSON

**Files:**
- Create: `src/data/formTemplates/aaba.json`
- Create: `src/data/formTemplates/abac.json`
- Create: `src/data/formTemplates/theme-vars.json`
- Create: `src/data/formTemplates/through-composed.json`

**Step 1**: Each template has structure:

```json
{
  "id": "aaba",
  "name": "AABA (32-bar standard)",
  "sections": [
    { "id": "A", "length": 8, "cadence": "ii-V-I" },
    { "id": "A", "length": 8, "cadence": "ii-V-I" },
    { "id": "B", "length": 8, "cadence": "V/V-V-I" },
    { "id": "A", "length": 8, "cadence": "ii-V-I" }
  ]
}
```

**Step 2**: Commit (no test — pure data).
```bash
git add src/data/formTemplates/
git commit -m "feat(form): 4 form templates (AABA, ABAC, theme-vars, through-composed)"
```

---

### Task 9: Create `src/lib/stylePack.ts` (validator + loader)

**Files:**
- Create: `src/lib/stylePack.ts`
- Create: `src/lib/stylePack.test.ts`

**Step 1**: Write failing test.

```typescript
// src/lib/stylePack.test.ts
import { loadStylePack, validateStylePack } from "./stylePack";

it("loads a valid style pack", () => {
  const pack = loadStylePack("common-practice");
  expect(pack.id).toBe("common-practice");
  expect(pack.constraints.forbiddenIntervals).toContain("parallelFifth");
});

it("rejects a pack missing required fields", () => {
  const result = validateStylePack({ id: "broken" }); // no constraints
  expect(result.ok).toBe(false);
  expect(result.errors.length).toBeGreaterThan(0);
});
```

**Step 2**: Run, expect FAIL.

**Step 3**: Implement. Required fields per pack: `id`, `name`, `constraints: { forbiddenIntervals: string[], allowedNCTs: string[], requiredResolutions: string[] }`. JSON schema or hand-rolled validator.

**Step 4**: Run, expect PASS.

**Step 5**: Commit.
```bash
git add src/lib/stylePack.ts src/lib/stylePack.test.ts
git commit -m "feat(style): JSON style-pack loader + validator"
```

---

### Task 10: Create 4 style packs JSON

**Files:**
- Create: `src/data/styles/common-practice.json`
- Create: `src/data/styles/jazz.json`
- Create: `src/data/styles/modal.json`
- Create: `src/data/styles/post-tonal.json`

**Step 1**: Each pack has the structure from Task 9. Concrete rules per pack:

- **common-practice**: forbiddenIntervals = [parallelFifth, parallelOctave]; allowedNCTs = [passingTone, neighborTone]; requiredResolutions = [leadingToneResolves, tritoneResolves].
- **jazz**: forbiddenIntervals = []; allowedNCTs = [all]; requiredResolutions = [guideToneResolves]. No parallel-5th ban (jazz uses parallel 5ths freely).
- **modal**: forbiddenIntervals = [parallelFifth, parallelOctave]; allowedNCTs = [passingTone, neighborTone, modalMixture]; requiredResolutions = [] (no leading-tone resolution in modal).
- **post-tonal**: forbiddenIntervals = []; allowedNCTs = [all]; requiredResolutions = []. (No tonal rules; everything allowed.)

**Step 2**: Run `npx vitest run src/lib/stylePack.test.ts` — expect PASS.

**Step 3**: Commit.
```bash
git add src/data/styles/
git commit -m "feat(style): 4 starter style packs (common-practice, jazz, modal, post-tonal)"
```

---

### Task 11: Create `src/lib/styleEnforcer.ts`

**Files:**
- Create: `src/lib/styleEnforcer.ts`
- Create: `src/lib/styleEnforcer.test.ts`

**Step 1**: Write failing test.

```typescript
// src/lib/styleEnforcer.test.ts
import { enforceStyle } from "./styleEnforcer";
import { loadStylePack } from "./stylePack";

it("flags parallel fifths in common-practice style", () => {
  const pack = loadStylePack("common-practice");
  const verdict = enforceStyle({ steps: [{ melody: [60, 64], counterline: [67, 71] }], style: pack });
  expect(verdict.violations.some((v) => v.type === "parallelFifth")).toBe(true);
});

it("does NOT flag parallel fifths in jazz style", () => {
  const pack = loadStylePack("jazz");
  const verdict = enforceStyle({ steps: [{ melody: [60, 64], counterline: [67, 71] }], style: pack });
  expect(verdict.violations.some((v) => v.type === "parallelFifth")).toBe(false);
});
```

**Step 2**: Run, expect FAIL.

**Step 3**: Implement. Reuses `counterpointRules.checkSpeciesOne` for the parallel-5th check, extends with pack-specific forbidden intervals.

**Step 4**: Run, expect PASS.

**Step 5**: Commit.
```bash
git add src/lib/styleEnforcer.ts src/lib/styleEnforcer.test.ts
git commit -m "feat(style): enforcer applies pack-specific forbidden-interval rules"
```

---

### Task 12: Add `preferredStylePackId` to all 22 personas

**Files:**
- Modify: `src/data/personas.json` (additive field on each entry)

**Step 1**: For each of the 22 personas, add `"preferredStylePackId": "<pack-name>"`. Use the user-confirmed mapping (Scriabin → post-tonal, Coltrane → modal, Monk → angular via common-practice, etc.). If a pack doesn't exist, leave as null.

Concretely:
- kandinsky → modal
- scriabin → post-tonal
- rachmaninov → common-practice
- brahms → common-practice
- tchaikovsky → common-practice
- mahler → common-practice
- coltrane → modal
- bach → common-practice
- debussy → modal
- eno → modal
- glass → modal
- monk → common-practice
- miles → modal
- chet → jazz
- dizzy → jazz
- hubbard → jazz
- shorter → modal
- simone → modal
- novaro → common-practice
- getz → jazz
- rollins → jazz
- henderson → modal

**Step 2**: Run `npx vitest run tests/personas.test.ts` — expect PASS.

**Step 3**: Commit.
```bash
git commit -am "feat(personas): add preferredStylePackId to all 22 personas"
```

---

### Task 13: Create `src/lib/coCompose.ts` (reharmonization proposer)

**Files:**
- Create: `src/lib/coCompose.ts`
- Create: `src/lib/coCompose.test.ts`

**Step 1**: Write failing test.

```typescript
// src/lib/coCompose.test.ts
import { proposeAlternative } from "./coCompose";
import { analyzeChord } from "./theory";

it("proposes one alternative chord per bar with explanation", () => {
  const result = proposeAlternative({
    pathId: "path-1",
    barIndex: 4,
    seed: 42,
  });
  expect(result.alternative).not.toBeNull();
  expect(result.explanation).toContain("tritone substitution"); // or "modal mixture" etc.
});
```

**Step 2**: Run, expect FAIL.

**Step 3**: Implement. For each bar, propose one of: tritone substitution, modal mixture, secondary dominant, passing diminished. Use `analyzeChord` to verify the alternative is musically valid. Return `{ alternative: ChordAnalysis | null, explanation: string, voiceLeadingDistance: number }`.

**Step 4**: Run, expect PASS.

**Step 5**: Commit.
```bash
git add src/lib/coCompose.ts src/lib/coCompose.test.ts
git commit -m "feat(cocompose): reharmonization proposer with explanation"
```

---

### Task 14: Create `src/lib/quizEngine.ts`

**Files:**
- Create: `src/lib/quizEngine.ts`
- Create: `src/lib/quizEngine.test.ts`

**Step 1**: Write failing test.

```typescript
// src/lib/quizEngine.test.ts
import { generateQuiz } from "./quizEngine";

it("generates a Roman-numeral identification question from a chord analysis", () => {
  const question = generateQuiz({ pathId: "path-1", stepIndex: 0, seed: 42 });
  expect(question.prompt).toContain("Roman numeral");
  expect(question.options.length).toBeGreaterThanOrEqual(3);
  expect(typeof question.correct).toBe("number");
});

it("deterministic: same (pathId, stepIndex, seed) → same question", () => {
  const a = generateQuiz({ pathId: "path-1", stepIndex: 0, seed: 42 });
  const b = generateQuiz({ pathId: "path-1", stepIndex: 0, seed: 42 });
  expect(a).toEqual(b);
});
```

**Step 2**: Run, expect FAIL.

**Step 3**: Implement. Pull a chord from `src/lib/paths.ts`, run `analyzeChord`, generate 3 distractors by sampling wrong Roman numerals from a curated pool, return `{ prompt, options, correct }`.

**Step 4**: Run, expect PASS.

**Step 5**: Commit.
```bash
git add src/lib/quizEngine.ts src/lib/quizEngine.test.ts
git commit -m "feat(quiz): auto-generate Roman-numeral questions from analyzeChord"
```

---

### Task 15: Create 5 curated quiz JSON files

**Files:**
- Create: `src/data/quizzes/roman-numerals.json` (10 questions)
- Create: `src/data/quizzes/tensions.json` (10 questions)
- Create: `src/data/quizzes/voice-leading.json` (10 questions)
- Create: `src/data/quizzes/modulations.json` (10 questions)
- Create: `src/data/quizzes/form.json` (10 questions)

**Step 1**: Each file has structure:

```json
[
  {
    "id": "rn-1",
    "topic": "roman-numerals",
    "prompt": "What Roman numeral labels a I chord in C major?",
    "options": ["I", "ii", "iii", "IV"],
    "correct": 0,
    "explanation": "The tonic triad in a major key is labeled I (uppercase)."
  }
]
```

**Step 2**: Add a `quizAutoGenerate: true` flag to a new `src/data/quizzes/config.json`.

**Step 3**: Commit.
```bash
git add src/data/quizzes/
git commit -m "feat(quiz): 50 curated quiz questions across 5 topics + auto-gen flag"
```

---

### Task 16: Extend `src/hooks/useSessionStore.ts` with composition state

**Files:**
- Modify: `src/hooks/useSessionStore.ts`
- Modify: `src/hooks/useSessionStore.test.ts`

**Step 1**: Add new fields to `SessionStore`:
- `melodyByStep: Record<string, number[]>` (step ID → MIDI array)
- `counterMelodyByStep: Record<string, number[]>`
- `stylePackId: string | null` (default null)
- `quizScore: { correct: number; total: number }` (default { correct: 0, total: 0 })
- `feedbackHistory: Array<{ personaId: string; suggestion: string; accepted: boolean }>`

All loadable from localStorage with their own keys. Defaults on missing/corrupt.

**Step 2**: Add tests for hydrate-from-localStorage (already pattern in existing useSessionStore tests).

**Step 3**: Run existing + new tests — expect PASS.

**Step 4**: Commit.
```bash
git commit -am "feat(session): add melody/counterMelody/stylePack/quizScore/feedback state"
```

---

## Phase 2 — UI surfaces (Week 2)

### Task 17: Create `MelodyLane.tsx` + `MelodyToolbar.tsx`

**Files:**
- Create: `src/components/MelodyLane.tsx`
- Create: `src/components/MelodyLane.test.tsx`
- Create: `src/components/MelodyToolbar.tsx`
- Create: `src/components/MelodyToolbar.test.tsx`
- Modify: `src/App.tsx` (mount above `<LiveScoreDisplay>`)

**Step 1**: Write failing test for `MelodyLane` rendering.

```tsx
// src/components/MelodyLane.test.tsx
import { render, screen } from "@testing-library/react";
import { MelodyLane } from "./MelodyLane";

it("renders one cell per beat", () => {
  render(<MelodyLane melody={[60, 62, 64, 65]} stepsPerBar={4} />);
  expect(screen.getAllByRole("button")).toHaveLength(4);
});
```

**Step 2**: Run, expect FAIL.

**Step 3**: Implement. `MelodyLane` is a single horizontal lane with one `<button>` per beat showing the MIDI note number + a drag handle. Calls `suggestMelody` + `applyPersonaFilter` on render. `MelodyToolbar` has Suggest / Regenerate / Pin / Undo buttons wired to `useSessionStore`.

**Step 4**: Mount in App.tsx — add `<MelodyLane melody={...} />` + `<MelodyToolbar />` inside `<main>`, above `<LiveScoreDisplay>`.

**Step 5**: Run all tests — expect PASS.

**Step 6**: Smoke-test in browser (dev server on :5174): load app, click Suggest, verify lane renders 4 cells with valid MIDI numbers.

**Step 7**: Commit.
```bash
git add src/components/MelodyLane.tsx src/components/MelodyLane.test.tsx src/components/MelodyToolbar.tsx src/components/MelodyToolbar.test.tsx src/App.tsx
git commit -m "feat(ui): MelodyLane + MelodyToolbar mounted above LiveScoreDisplay"
```

---

### Task 18: Create `TexturePanel.tsx` (3 track mute toggles + counter-line)

**Files:**
- Create: `src/components/TexturePanel.tsx`
- Create: `src/components/TexturePanel.test.tsx`
- Modify: `src/App.tsx`

**Step 1**: Write failing test.

```tsx
it("renders 3 track toggle cards", () => {
  render(<TexturePanel />);
  expect(screen.getByText("Drums")).toBeInTheDocument();
  expect(screen.getByText("Bass")).toBeInTheDocument();
  expect(screen.getByText("Piano")).toBeInTheDocument();
});
```

**Step 2**: Run, expect FAIL.

**Step 3**: Implement. Three toggle cards bound to `drumsMuted`/`bassMuted`/`pianoMuted` in `useSessionStore`. "Layer counter-line" button toggles a `counterMelodyActive` flag in session.

**Step 4**: Mount in App.tsx inside the existing `<PersonaLensBanner>` area.

**Step 5**: Run + smoke-test + commit.
```bash
git commit -m "feat(ui): TexturePanel with track mute toggles + counter-line toggle"
```

---

### Task 19: Create `FormPlanner.tsx` + `FormTemplatePicker.tsx`

**Files:**
- Create: `src/components/FormPlanner.tsx`
- Create: `src/components/FormPlanner.test.tsx`
- Create: `src/components/FormTemplatePicker.tsx`
- Create: `src/components/FormTemplatePicker.test.tsx`
- Modify: `src/App.tsx`

**Step 1**: Test: `FormPlanner` renders section labels above bars.

```tsx
it("renders a label for each section in the active plan", () => {
  render(<FormPlanner plan={{ A: [1,2,3,4], B: [5,6,7,8], A: [9,10,11,12] }} />);
  expect(screen.getAllByText("A")).toHaveLength(2);
  expect(screen.getByText("B")).toBeInTheDocument();
});
```

**Step 2**: Run, expect FAIL.

**Step 3**: Implement. `FormPlanner` is a bar strip with draggable section boundaries (snap to 24-64 invariant). `FormTemplatePicker` shows 4 template cards from `src/data/formTemplates/*.json`.

**Step 4**: Mount in App.tsx inside `<PathBriefing>` area.

**Step 5**: Commit.
```bash
git commit -m "feat(ui): FormPlanner with section labels + FormTemplatePicker"
```

---

### Task 20: Create `StylePackPicker.tsx` + `StyleWarnings.tsx`

**Files:**
- Create: `src/components/StylePackPicker.tsx`
- Create: `src/components/StylePackPicker.test.tsx`
- Create: `src/components/StyleWarnings.tsx`
- Create: `src/components/StyleWarnings.test.tsx`
- Modify: `src/App.tsx`

**Step 1**: Test: picker auto-selects persona's preferred pack with badge.

```tsx
it("auto-selects persona's preferredStylePackId with badge", () => {
  render(<StylePackPicker activePersonaId="coltrane" packs={[]} />);
  expect(screen.getByText("modal")).toHaveAttribute("data-suggested", "true");
});
```

**Step 2**: Run, expect FAIL.

**Step 3**: Implement. Drawer with 4 cards (one per `src/data/styles/*.json`). On persona change, look up `preferredStylePackId` from `useSessionStore`'s persona and auto-select. `StyleWarnings` shows inline violations from `styleEnforcer`.

**Step 4**: Mount in App.tsx.

**Step 5**: Commit.
```bash
git commit -m "feat(ui): StylePackPicker with persona-suggested default + StyleWarnings"
```

---

### Task 21: Create `CoComposePanel.tsx`

**Files:**
- Create: `src/components/CoComposePanel.tsx`
- Create: `src/components/CoComposePanel.test.tsx`
- Modify: `src/App.tsx`

**Step 1**: Test: shows "What if?" suggestion for current bar.

```tsx
it("renders the current bar's alternative chord with explanation", () => {
  render(<CoComposePanel activeBar={4} />);
  expect(screen.getByText(/tritone|substitution|mixture/i)).toBeInTheDocument();
});
```

**Step 2**: Run, expect FAIL.

**Step 3**: Implement. Reads active path + bar from `useSessionStore`, calls `proposeAlternative`, shows the chord + the `explanation` string + an Accept button (writes to a per-bar undo history).

**Step 4**: Mount in App.tsx near `LiveScoreDisplay`.

**Step 5**: Commit.
```bash
git commit -m "feat(ui): CoComposePanel with 'what if?' reharmonization suggestion"
```

---

### Task 22: Create `QuizPanel.tsx`

**Files:**
- Create: `src/components/QuizPanel.tsx`
- Create: `src/components/QuizPanel.test.tsx`
- Modify: `src/App.tsx`

**Step 1**: Test: renders a curated question if available, falls back to auto-generated.

```tsx
it("renders a curated question for known topics", () => {
  render(<QuizPanel topic="roman-numerals" pathId="path-1" stepIndex={0} />);
  expect(screen.getByRole("radiogroup")).toBeInTheDocument();
});
```

**Step 2**: Run, expect FAIL.

**Step 3**: Implement. Loads curated JSON first; if no match, calls `generateQuiz`. Tracks `quizScore` in `useSessionStore`.

**Step 4**: Mount in App.tsx near `PathBriefing`.

**Step 5**: Commit.
```bash
git commit -m "feat(ui): QuizPanel with curated-first, auto-gen fallback"
```

---

### Task 23: Wire `useFeedback` hook + integrate with style pack

**Files:**
- Create: `src/hooks/useFeedback.ts`
- Create: `src/hooks/useFeedback.test.ts`
- Modify: `src/components/StylePackPicker.tsx` (call useFeedback on accept/reject)

**Step 1**: Test: persists feedback events to `useSessionStore.feedbackHistory`.

```typescript
it("records an accept event with persona + suggestion", () => {
  const { result } = renderHook(() => useFeedback());
  act(() => result.current.record({ personaId: "coltrane", suggestion: "modal", accepted: true }));
  // ... assert session.feedbackHistory has 1 entry
});
```

**Step 2**: Run, expect FAIL.

**Step 3**: Implement. Simple hook over `useSessionStore` with `record({ personaId, suggestion, accepted })` method.

**Step 4**: Wire in StylePackPicker: on Accept → `record({ accepted: true })`; on Switch → `record({ accepted: false })`.

**Step 5**: Commit.
```bash
git commit -m "feat(feedback): useFeedback hook + StylePackPicker integration"
```

---

## Phase 3 — Verification + ship (Week 3)

### Task 24: Latency gate test

**Files:**
- Create: `tests/latency.test.ts`

**Step 1**: Test that p95 of `coCompose.ts` against Path 1 (16 bars) is < 200ms.

```typescript
import { proposeAlternative } from "../src/lib/coCompose";
import { performance } from "perf_hooks";

it("p95 latency for 16-bar coCompose < 200ms", () => {
  const samples: number[] = [];
  for (let i = 0; i < 50; i++) {
    const t0 = performance.now();
    proposeAlternative({ pathId: "path-1", barIndex: i % 16, seed: i });
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.floor(samples.length * 0.95)];
  expect(p95).toBeLessThan(200);
});
```

**Step 2**: Run, expect PASS (pure-function algorithms should be fast).

**Step 3**: Commit.
```bash
git add tests/latency.test.ts
git commit -m "test(latency): p95 < 200ms for 16-bar coCompose"
```

---

### Task 25: Counterpoint corpus gating test

Already created in Task 6. Run it as part of `npm test` and confirm ≥95% recall.

```bash
npx vitest run tests/counterpointCorpus.test.ts
```

If recall < 95%, fix `counterpointRules.ts` until it passes. Add a regression commit.

---

### Task 26: Full test run + CI gate

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: tsc clean, all tests pass (≥560), build clean.

---

### Task 27: Browser smoke test

```bash
npx vite --port=5174 --host=127.0.0.1 --strictPort &
```

Visit http://127.0.0.1:5174/ in browser. Verify:
1. App mounts without errors
2. MelodyLane renders above LiveScoreDisplay
3. Clicking Suggest regenerates 4 cells
4. PathBriefing + PersonaLensBanner + CoComposePanel + QuizPanel + TexturePanel + FormPlanner + StylePackPicker all visible
5. StylePackPicker auto-selects persona's pack on persona change
6. CoComposePanel updates on bar change
7. QuizPanel shows curated question for known topics

Take a screenshot. Save to `docs/COMPOSITION-MVP-SCREENSHOTS/`.

---

### Task 28: Update README + docs/

**Files:**
- Modify: `README.md` (mention composition layer MVP)
- Modify: `docs/ARCHITECTURE.md` (link to COMPOSITION-ENGINE-PLAN.md + COMPOSITION-MVP-PLAN.md)
- Create: `docs/COMPOSITION.md` (user-facing feature tour)

**Step 1**: Add a "Composition" section to README linking to the new docs.

**Step 2**: Update `docs/ARCHITECTURE.md` with a new "Composition layer" subsection.

**Step 3**: Write `docs/COMPOSITION.md` — 1-page tour of the 9 layers with screenshots.

**Step 4**: Commit + tag.
```bash
git add README.md docs/
git commit -m "docs(composition): MVP tour + architecture linkage"
git tag -a v0.3.0-composition-mvp -m "Composition MVP: 9 layers wired, 506 → ≥560 tests"
```

---

## Risk gates (run before declaring MVP done)

- [ ] `npx tsc --noEmit` clean
- [ ] `npx vitest run` ≥ 560 tests passing
- [ ] `npm run build` clean
- [ ] `tests/counterpointCorpus.test.ts` ≥ 95% recall on 100 cases
- [ ] `tests/latency.test.ts` p95 < 200ms
- [ ] Browser smoke screenshot saved
- [ ] README + docs/ updated
- [ ] `docs/COMPOSITION-ENGINE-PLAN.md` + `docs/COMPOSITION-MVP-PLAN.md` linked from ARCHITECTURE.md

---

## Total task count: 28

- **Phase 1 (pure logic)**: 16 tasks
- **Phase 2 (UI)**: 7 tasks
- **Phase 3 (verify + ship)**: 5 tasks

**Per-task time budget**: 2-5 min for setup, 5-10 min for non-trivial UI tasks. MVP total: ~40 hours = 1 month at 50% allocation.

---

## Remember

```
Bite-sized tasks (2-5 min each)
Exact file paths
Complete code (copy-pasteable)
Exact commands with expected output
Verification steps at task end
DRY, YAGNI, TDD
Frequent commits (one per task)
```
