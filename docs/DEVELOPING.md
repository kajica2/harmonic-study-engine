# Developing

How to extend the engine. Three recipes cover 90% of changes: add a
persona, add a path, add a voicing. Each is annotated with the test
you should add and the commit message style.

## Setup

```bash
# 1. install
npm install
source .venv/bin/activate
pip install -r server/requirements.txt   # heavy; ddsp + tf 2.21

# 2. dev servers
npx vite --port=5175 --host=127.0.0.1 --strictPort  # :3000 is taken on this machine by the Hermes WhatsApp bridge
python -m server.app                              # :8765, optional

# 3. test commands
npm test                # vitest run (185 tests, ~700ms)
npm run test:watch      # vitest watch mode for one test file
npm run lint            # tsc --noEmit
npm run build           # vite build (1.59 MB main bundle, ~6s)
```

## Add a persona

Personas live in `src/data/personas.json`. The schema is
`Persona` in `src/lib/personas.ts`. Minimum fields: `id`, `name`,
`role`, `quote`, `originalSongId`, `instrument`, `tempo`, `arpType`,
`arpRate`, `arpGate`, `arpOctaves`, `visualTheme`, `accentColor`,
`gradientFrom`, `gradientTo`. Extended fields (recommended for new
personas): `synesthesiaStatus`, `dates`, `nationality`, `tagline`,
`instrumentLabel`, `colorMap`, `colorPalette`, `defaultVoicing`,
`defaultPath`, `techniques`, `scale`, `rules`.

### Step-by-step

1. **Add the persona entry** to `src/data/personas.json`. Pick an
   `id` not already used. Set `originalSongId` to one of the
   `PATHS` ids — this is the path that loads when the persona card
   is clicked (unless you set `defaultPath`).
2. **Pick an instrument** from `InstrumentType`: `epiano`, `sine`,
   `pad`, `pluck`, `trumpet`, `guitar`, `sax`. Each has its own
   voice design in `audio.ts`. Use `sine` for any synth-only persona.
3. **Set `visualTheme`** to one of `default`, `kandinsky`, `coltrane`,
   `bach`, `debussy`, `eno`, `glass`, `monk`, `miles`, `chet`,
   `dizzy`, `hubbard`, `shorter`. If your theme doesn't fit any,
   use `default` and add a new case to `SynesthesiaCanvas.tsx`.
4. **Set `synesthesiaStatus`** to `documented` if there's a
   historical record of color-tone mapping for this composer
   (currently only Kandinsky + Scriabin). Otherwise `interpretive`.
5. **Pick a `colorPalette`** — 4 hex colors used for the bar strip
   left-edge accent (cycles per bar). Pick contrasting palette
   colors for visual distinction from existing personas.
6. **(Optional) Define `colorMap`** — a `Record<NoteName, ColorEntry>`
   mapping 12 chromatic pitch classes to color+label. Only matters if
   the canvas's per-note coloring matters; otherwise skip.
7. **(Optional) Define `techniques`** — a `string[]` of technique
   tags rendered as chips under the card description. Examples:
   `["modal_restraint", "muted_effects"]`.
8. **(Optional) Define `rules`** — see "Behavioural rules" below.

### Behavioural rules (optional)

The persona's `rules` object declares which per-bar behaviors should
fire on paths the persona selects. Rules:

| Rule | Effect |
|---|---|
| `keyDriftAcrossPath: true` | if the path declares `key: "X → Y"`, drift linearly from X to Y across bars |
| `motifTracker: true` | show Δ glyph on bars where the chord re-voices prior content |
| `bassIsolation: true` | show ≈ glyph on bars where the bass carries unchanged |
| `minHandSpan: "10th"` | (planned) voicing rule to limit spread |
| `bassIsolation: true` | bass held across bars |

Example — Miles persona (modal restraint, sustained bass):

```json
{
  "id": "miles",
  "name": "Miles Davis",
  ...
  "rules": {
    "motifTracker": false,
    "bassIsolation": true,
    "keyDriftAcrossPath": false
  }
}
```

### Test the persona

Add to `src/lib/personas.test.ts`:

```typescript
it("registers the new persona with required fields", () => {
  const p = PERSONAS.find((x) => x.id === "newid");
  expect(p).toBeDefined();
  expect(p.synesthesiaStatus).toMatch(/^(documented|interpretive)$/);
  expect(p.colorPalette?.length ?? 0).toBeGreaterThan(0);
});
```

If you set `defaultVoicing`, verify it's a registered VoicingId:

```typescript
it("newid's defaultVoicing is registered", () => {
  const p = PERSONAS.find((x) => x.id === "newid");
  expect(VOICINGS).toHaveProperty(p!.defaultVoicing!);
});
```

### Commit

```
git commit -m "feat(personas): add <Name> persona"
```

## Add a path

Paths live in `src/lib/paths.ts` (curated concept paths) or
`src/lib/studies.ts` (jazz standards). Concept paths use `key` field
for behavioral rules; studies use `composer` for catalog display.

### Step-by-step

1. **Pick the right module.** Hand-authored concept paths go in
   `paths.ts`. Hand-authored jazz standards go in `studies.ts`
   (matching the existing 36). For paths that need `sliceAndRepeat`
   or `motifTracker` behavioral flags, use `paths.ts` (it has the
   extra fields).
2. **Write the path** following the `HarmonicPath` shape:

   ```typescript
   {
     id: "new-path-id",
     title: "Path LXV: The New One",
     description: "What it teaches in one sentence.",
     composer: "...",
     key: "...",
     feel: "...",
     steps: [
       { name: "Chord 1", notes: [60, 64, 67], descriptions: "..." },
       { name: "Chord 2", notes: [62, 65, 69], descriptions: "..." },
       // 4 steps per bar; padPath extends to 24 bars automatically.
     ],
   }
   ```

3. **Add behavioral fields when relevant:**

   ```typescript
   // sequenceStepper: climbs by sequenceInterval semitones per bar
   {
     id: "climbing_path",
     ...
     sequenceStepper: true,
     sequenceInterval: 2, // up by 2 semitones per bar (use -1 for descending)
     steps: [...],
   }

   // keyDrift: drift from start key to end key across the path
   {
     id: "drifting_path",
     ...
     key: "D minor → C major", // arrow-separated
     steps: [...],
   }

   // sliceAndRepeat: marks the path as chop-friendly
   {
     id: "choppy_path",
     ...
     sliceAndRepeat: true,
     steps: [...],
   }

   // techniques: rendered as chips in the persona card and catalog
   {
     id: "tagged_path",
     ...
     techniques: ["modal_restraint", "long_decay"],
     steps: [...],
   }
   ```

4. **Voice leading is up to you.** Use root-position 7th chords for
   standards (`[60, 64, 67, 71]` = Cmaj7), proper rootless for modal
   pieces. `analyzeChord([60,64,67,71]).family` should be `"major"`.

### Test the path

```typescript
it("registers new-path with composer, key, feel", () => {
  const p = PATHS.find((x) => x.id === "new-path-id");
  expect(p).toBeDefined();
  expect(p!.composer!.length).toBeGreaterThan(0);
});
```

If it has `sequenceStepper`, verify the interval:

```typescript
it("climbing_path climbs by 2 semitones per bar", () => {
  const p = PATHS.find((x) => x.id === "climbing_path")!;
  expect(p.sequenceStepper).toBe(true);
  expect(p.sequenceInterval).toBe(2);
});
```

If it has `key: "X → Y"`, verify the arrow is in the literal:

```typescript
it("drifting_path has keyDrift metadata", () => {
  const p = PATHS.find((x) => x.id === "drifting_path")!;
  expect(p.key!.includes("\u2192")).toBe(true);  // literal → character
});
```

### Commit

```
git commit -m "feat(paths): add <concept name>"
```

## Add a voicing

Voicings live in `src/lib/theory.ts` in the `VOICINGS` registry.
Each entry has `intervals: number[]` — semitones above the bass
that make up the voicing.

### Step-by-step

1. **Pick a VoicingId name.** Use snake_case. Add it to the union in
   `VoicingId` (also in `theory.ts`).
2. **Add the registry entry:**

   ```typescript
   export const VOICINGS: Record<VoicingId, Voicing> = {
     // ...existing...
     my_new_voicing: {
       id: "my_new_voicing",
       label: "My New Voicing",
       description: "What this voicing sounds like and when to use it.",
       intervals: [0, 4, 7, 10, 14],  // root, 3rd, 5th, m7, 9
       usedBy: [],
     },
   };
   ```

3. **`applyVoicing` handles it automatically** as long as the
   `intervals` field is set. The dispatcher in `applyVoicing()`
   uses the array directly to stack notes from the bass.
4. **Add the dropdown entry to the Voicing picker.** In App.tsx, the
   select is auto-populated from `Object.values(VOICINGS)`, so no
   code change needed — just refresh the browser.
5. **(Optional) Set as a persona's `defaultVoicing`** if this voicing
   characterizes the persona's sound.

### Edge cases in `applyVoicing`

- If `intervals` exceed the chord's actual pitch classes, `applyVoicing`
  reuses the chord's pitch classes and re-bases them around the bass.
- `drop2` and `inversion` are special: they delegate to
  `alternativeVoicing` instead of using `intervals` (see code).
- `minimum_motion` ignores `intervals` and applies
  `applyVoiceLeading` from the previous chord (per-voice closest-octave
  matching).

### Test

```typescript
it("my_new_voicing keeps the bass note unchanged", () => {
  const out = applyVoicing([48, 52, 55, 59], "my_new_voicing");
  expect(out[0]).toBe(48);  // bass preserved
});
```

### Commit

```
git commit -m "feat(voicing): add <name> voicing"
```

## Add a behavioral rule (engine-side)

The engine reads behavioral flags from two places: path fields and
persona rules. To add a NEW rule (e.g. `accentOnDownbeat`), you'd
touch:

1. **`PersonaRules` interface** in `src/lib/personas.ts` — add the
   new optional field.
2. **`deriveBehavioralMarkers` in `src/lib/theory.ts`** — read the
   new field and emit a marker property when it's true.
3. **`PlaySessionRail.tsx`** — render the new marker (badge, color,
   accessibility label).
4. **Tests** in `src/lib/theory.test.ts` (the marker heuristic) and
   `src/components/PlaySessionRail.test.tsx` (if it exists).

This is a larger change. Plan it as a multi-commit PR.

## File layout cheat sheet

```
src/
├── App.tsx                       — top-level component, owns playback state
├── main.tsx                      — entry point
├── data/
│   └── personas.json             — source of truth for 17 personas
├── lib/
│   ├── audio.ts                  — AudioEngine (Web Audio, side-effectful)
│   ├── audioHelpers.ts           — pure audio math (testable)
│   ├── backingEngine.ts          — drums/bass/piano buses + styles
│   ├── soundfont.ts              — FluidR3 GM loader
│   ├── midiOut.ts / midiIn.ts    — Web MIDI wrappers
│   ├── paths.ts                  — PATHS (curated concept paths)
│   ├── conceptPaths.ts           — 7 educational paths
│   ├── studies.ts                — 36 jazz standards
│   ├── personas.ts               — Persona interface + PERSONAS
│   ├── theory.ts                 — pure music theory + VOICINGS
│   ├── playbackClock.ts          — singleton rAF clock
│   ├── scalePlayer.ts / rhythmDrill.ts — practice modes
│   ├── scoreGenerator.ts / scoreExport.ts — abcjs + MusicXML/Score21
│   └── *.test.ts                 — 5 unit test files (node env)
└── components/
    ├── PlaySessionRail.tsx       — bar strip + stage nav
    ├── PathCatalog.tsx           — filterable grid
    ├── SynesthesiaCanvas.tsx     — chord visualization
    ├── LiveScoreDisplay.tsx      — abcjs-rendered score
    ├── PianoKeyboard.tsx         — interactive piano
    ├── PracticeSessionPlayer.tsx — practice-set runner
    ├── PracticeSetBrowser.tsx    — practice-set catalog
    ├── SetEditor.tsx              — practice-set CRUD
    ├── ModalShell.tsx             — accessible modal
    ├── InlineStatus.tsx           — toast pill
    ├── InspectPanel.tsx           — chord inspector
    ├── ChordInspector.tsx         — voicing + voicing save
    └── *.test.tsx                 — 2 component test files (jsdom env)
```

## Common pitfalls

- **MIDI 60 is C4 (middle C), not C3.** A common bug — MIDI 60 is
  one octave higher than synth C3 in many DAWs. The code uses
  scientific pitch notation: `Math.floor(midi/12) - 1` = octave.
- **Bass note is `Math.min(...notes)`** (lowest), not the chord's
  root. Use the explicit `name` field to disambiguate.
- **`padPath` trims paths longer than MAX_PATH_BARS** (24 bars).
  If you want a longer path, edit `MAX_PATH_BARS` in `paths.ts`.
- **`analyzeChord` heuristics fail on inversions.** A C/G chord
  (notes `[67, 72, 76]`) will report `rootName='G'` because the bass
  has no 3rd above it. This is a pinned limitation, not a bug.
- **Behavioral rule priority:** path-level fields win over
  persona-level rules. If a path declares `keyDrift` via its `key`
  string, the persona's `rules.keyDriftAcrossPath` is ignored for
  that path.
- **Local port :3000 is taken** by the Hermes WhatsApp bridge on
  this machine. Use `--port=5175` (or any non-3000 port). `dev.sh`
  kills anything on :3000 to free the port — don't run it.

## Where to ask for help

- **Persona doesn't show up in the grid:** check `id` is unique and
  that the entry has `accentColor` + `gradientFrom` + `gradientTo`.
- **Path doesn't play:** verify `steps[].notes.length > 0` for every
  step. Empty notes make `Math.min` return `Infinity`, which I
  patched to fall back to 60 — but a chord with all-empty steps
  plays a C4 unison. Check the data.
- **Voicing sounds wrong:** check the `intervals` array. `intervals: [3, 5, 7]` means "stack 3, 5, 7 above the bass" (so Cmaj7
  becomes [60, 64, 67, 71]). Don't include the bass interval
  itself.
- **Tests pass locally but fail in CI:** check that new test files
  are listed in `tsconfig.json`'s include (it defaults to all
  `src/**/*` so usually fine) and that `vitest.config.ts`
  environmentMatchGlobs covers them.