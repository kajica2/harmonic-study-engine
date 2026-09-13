# Composition Layer — User Tour

The composition layer turns the engine from a harmonic study tool into an interactive harmonic-composition assistant. Harmony stays central and explainable; the new layers add melody, rhythm, counterpoint, texture, form, style, co-composition, pedagogy, and a learning loop on top of the existing 22-persona, 78-path shell.

This tour walks through the 9 layers from a user's perspective.

## 1. Melodic integration

**What it does:** Suggests a melody for the active bar, in the chord's notes, conditioned on the active persona's contour profile.

**How to use:**
1. Load a path (e.g. Solar — `path-3`).
2. Pick a persona (e.g. Coltrane — large leaps).
3. Click **Suggest** in the Melody toolbar.
4. Click **Regenerate** for a different melody for the same bar.
5. Click a cell to nudge the pitch up by a semitone; right-click to nudge down; double-click to reset to C4.

**Under the hood:** `melodyMarkov.ts` (genre-neutral Markov chain, order-2, state = currentPc + prevInterval) → `personaMelodyFilter.ts` (contour bias: leaping/stepwise/angular). Deterministic given the same `(chord, seed)`. The persona filter is a separate layer so the chain itself stays persona-blind and testable.

## 2. Rhythmic and metric context

**What it does:** 11 backing styles (swing, bossa, funk, latin, ballad, clave 3-2, clave 3-3, African 4:4, 4:3, 3:4, off) drive the rhythm section. Tempo, time signature, and per-track mutes persist across reloads.

**How to use:** Tempo slider in PracticeHeader, time signature in the tempo panel, per-track mutes in TexturePanel.

## 3. Counterpoint and voice-leading

**What it does:** Species-1 rules flag parallel 5ths/octaves and hidden 5ths/octaves between a melody and a counter-line. Currently runs as a pure-function check against a 100-case fixture corpus (100% recall).

**How to use:** In TexturePanel, click **Layer counter-line** to enable parallel voice rendering. (v1 will surface violation warnings inline.)

## 4. Texture and orchestration

**What it does:** Drums, bass, piano track mutes. Counter-line lane toggle (separate voice, layer-by-default per user decision 2026-09-13).

**How to use:** TexturePanel — three toggle cards; counter-line button on the right.

## 5. Form and dramaturgy

**What it does:** Plans 32-40 bar form sections for the active path. 4 templates: AABA, ABAC, Theme + Variations, Through-Composed. Bar-count invariant (24-64) hard by default; explicit `relaxInvariant: true` flag overrides for sub-24-bar user sketches.

**How to use:** FormTemplatePicker cards (top-right of the form panel). Click a template; FormPlanner section strip below shows the active plan's sections, with the active bar's section highlighted.

## 6. Style and constraints

**What it does:** 4 style packs (common-practice, jazz, modal, post-tonal), each with `forbiddenIntervals`, `allowedNCTs`, `requiredResolutions`. Adding a style = adding a JSON file in `src/data/styles/`. The enforcer applies the pack's rules to a melody/counter-line pair.

**How to use:** StylePackPicker — radio cards. The active persona's `preferredStylePackId` shows a "suggested" badge (Coltrane → modal; Scriabin → post-tonal; etc.). StyleWarnings appears when the active pack has violations.

## 7. Interactive co-composition

**What it does:** For the active bar, propose one alternative chord via one of 4 substitution techniques (tritone substitution, modal mixture, secondary dominant, passing diminished). The proposal includes the technique name and a theory-grounded explanation.

**How to use:** CoComposePanel — purple card. The header shows the technique; the body shows the chord change + why it works. (v1 wires the Accept button to mutate the path's `HarmonicStep[barIndex]`.)

## 8. Pedagogical layer

**What it does:** Music-theory quizzes — 50 curated questions across 5 topics (Roman numerals, tensions, voice-leading, modulations, form), plus an auto-generator that creates questions from `analyzeChord` for any path/bar/seed combo.

**How to use:** QuizPanel — radio group. Correct answer turns emerald, wrong picked answer turns red. The score `correct/total` is displayed at the top right and persists to `useSessionStore.quizScore`. Curated JSON takes precedence; auto-gen fills gaps.

## 9. Learning loop

**What it does:** Tracks accept/reject events per persona + suggestion. Currently recorded to `useSessionStore.feedbackHistory`. v1 will use the history to bias future suggestions per persona.

**How to use:** Today the loop is observation-only — switch personas and styles to build up the log. The StylePackPicker's `onPick` records an accept event automatically.

---

## Adding a new style pack (no code change)

```bash
# 1. Create src/data/styles/{your-style}.json
#    {
#      "id": "your-style",
#      "name": "Your Style",
#      "description": "...",
#      "constraints": {
#        "forbiddenIntervals": ["parallelFifth"],
#        "allowedNCTs": ["passingTone"],
#        "requiredResolutions": []
#      }
#    }
#
# 2. Add its id to src/lib/stylePack.ts → allStylePackIds union
#
# 3. Add a test in src/lib/stylePack.test.ts that loads the new pack
#    and asserts the expected constraints.
```

The StylePackPicker will render a new card automatically the next time the app boots. No App.tsx edit required.

## Adding a new curated quiz question

Append to the appropriate `src/data/quizzes/<topic>.json`:

```json
{
  "id": "<topic>-N",
  "topic": "<topic>",
  "prompt": "Question text shown to the user",
  "options": ["Choice A", "Choice B", "Choice C", "Choice D"],
  "correct": 0,
  "explanation": "Why this answer is right"
}
```

Curated JSON takes precedence over auto-generation (per user decision 2026-09-13), so this is the way to override an auto-generated question that's wrong or unclear.

## Adding a new persona contour profile

1. Set `Persona.contourProfile` to one of `leaping` | `stepwise` | `angular` | `neutral` in `src/data/personas.json`.
2. The persona's `melodyByStep` will be biased accordingly when `applyPersonaFilter` runs.
3. Optional: add a `preferredStylePackId` for the persona-suggested style pack badge in StylePackPicker.

## Where the math lives

- **Markov chain**: `src/lib/melodyMarkov.ts` — 12-row starter transition table; corpus-derived table is v1.
- **Contour filter**: `src/lib/personaMelodyFilter.ts` — three pure functions (`toStepwise`, `toLeaping`, `toAngular`).
- **Voice-leading check**: `src/lib/counterpointRules.ts` — Fux §3.5.
- **Form planning**: `src/lib/formPlanner.ts` — snap-to-target rounding with bar-invariant gate.
- **Style enforcer**: `src/lib/styleEnforcer.ts` — routes counterpointRules output through the pack's `forbiddenIntervals`.
- **Co-compose**: `src/lib/coCompose.ts` — 4 substitution heuristics, each with its own explanation string.
- **Quiz**: `src/lib/quizEngine.ts` — FNV-1a hash into the curated pool, type rotation across seeds.
