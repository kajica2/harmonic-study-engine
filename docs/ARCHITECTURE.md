# Architecture

A high-level map of the Harmonic Study Engine: which files do what,
how the engines wire together, and where to look when something is
broken.

## Stack

- **Frontend:** React 19 + Vite 6 + Tailwind 4. Single-page app.
- **Backend (optional):** FastAPI on `:8765`. DDSP synthesis at
  `/synthesize`, FX reverb at `/fx/reverb`, recording upload at
  `/recordings/upload`. Works without it; `/health` returns
  `status: "degraded"` on HF Spaces free tier, `status: "ok"` locally.
- **Tests:** Vitest 2 (node env for pure logic, jsdom for React
  components). 185 tests across 7 files.

## Top-level data flow

```
              ┌─────────────────────────────────────────────────┐
              │                  App.tsx                         │
              │  • activePathIndex, activeStepIndex, tempo      │
              │  • persona selection → handleSelectPersona      │
              │  • arpeggiator state machine (random/up/down)   │
              │  • keyboard input → playNote                     │
              │  • MIDI Out + MIDI In chips                      │
              └─────────────────────────────────────────────────┘
                  │                                  │
                  ▼                                  ▼
   ┌──────────────────────────┐    ┌───────────────────────────────┐
   │      PlaySessionRail      │    │        SynesthesiaCanvas      │
   │  • bar strip with marker  │    │  • persona-themed render       │
   │    glyphs (Δ, ≈) +       │    │  • chord→color mapping         │
   │    persona palette edges  │    │  • shape by interval class     │
   │  • voicing picker         │    │                               │
   │  • masterclass stage      │    │                               │
   └──────────────────────────┘    └───────────────────────────────┘
                  │
   ┌────────────┴─────────────┐
   ▼                          ▼
 ┌────────────────────┐    ┌────────────────────┐
 │   AudioEngine       │    │   BackingEngine    │
 │ (src/lib/audio.ts)  │    │ (src/lib/paths/... │
 │ • osc + filter voice│    │ • drums/bass/piano │
 │ • warmth WaveShaper │    │ • 11 styles        │
 │ • velocity scaling   │    │ • 35Hz highpass on │
 │ • ADSR envelopes     │    │   bass             │
 │ • stopNote release   │    └────────────────────┘
 └────────────────────┘
   │
   ▼
 ┌────────────────────────────┐
 │  Compressor + Reverb chain  │
 │  (master → dest + dry+wet)  │
 └────────────────────────────┘
```

## Where things live

| File | Role |
|---|---|
| `src/App.tsx` | Top-level React component. Owns playback state, persona, voicing, tempo, transpose. ~3000 lines. |
| `src/lib/personas.ts` | `Persona` interface + `PERSONAS` array. 17 personas. Pure data. |
| `src/lib/paths.ts` | `PATHS` + `ALL_PATHS`. ~18 entries. Padded to 24-bar minimum by `padPath`. |
| `src/lib/conceptPaths.ts` | 7 educational concept paths. Spread into `PATHS` in `paths.ts`. |
| `src/lib/studies.ts` | 36 jazz standards. Generated from SONGS dict in `scripts/ingest_standards.py`. |
| `src/lib/theory.ts` | Pure music theory. `analyzeChord`, `applyVoicing`, `applyVoiceLeading`, `deriveBehavioralMarkers`, `deriveBarTransposeDrift`, voicing registry. |
| `src/lib/audio.ts` | `AudioEngine` — main Web Audio engine. Oscillators, ADSR, warmth, velocity. |
| `src/lib/audioHelpers.ts` | Pure helpers split out for testing: `buildWarmthCurve`, `velocityToGain`. |
| `src/lib/backingEngine.ts` | `BackingEngine` — drums/bass/piano buses. 11 backing styles. Highpass EQ on bass bus. |
| `src/lib/soundfont.ts` | FluidR3 GM soundfont loader (HD Sounds toggle). Cached per-instrument. |
| `src/lib/midiOut.ts` / `midiIn.ts` | Web MIDI output + input wrappers. `midin` CustomEvent on window. |
| `src/lib/playbackClock.ts` | Singleton rAF clock. Dispatches `tick` events to subscribers. |
| `src/lib/useBassNotes.ts` | Subscribes to backing engine to surface bass line to UI. |
| `src/lib/scalePlayer.ts` / `rhythmDrill.ts` | Scale practice + 3-iteration rhythm drill. |
| `src/lib/scoreGenerator.ts` / `scoreExport.ts` | abcjs + MusicXML/Score21 export. |
| `src/components/PlaySessionRail.tsx` | Bar strip + stage nav + voicing picker. |
| `src/components/PathCatalog.tsx` | Filterable path grid (new). |
| `src/components/SynesthesiaCanvas.tsx` | Persona-themed chord visualization. |
| `src/components/LiveScoreDisplay.tsx` | abcjs-rendered score windowed to 4 bars. |
| `src/components/PracticeSessionPlayer.tsx` | Practice-set runner. |
| `src/components/ModalShell.tsx` | Accessible modal: focus trap, ARIA, scroll lock. |
| `src/components/InlineStatus.tsx` | `role=status` / `role=alert` toast pill. |
| `src/data/personas.json` | Source of truth for the 17 personas (loaded by `personas.ts`). |

## Engine wiring

`App.tsx` owns the playback state machine. Each tick (~60fps) from
`playbackClock` advances `activeStepIndex` through the active path
according to the tempo. `currentChordNotes` is computed from
`optimizedStepsNotes[activeStepIndex]` (with optional
`applyVoiceLeading` between consecutive steps), then transformed by:

```
currentChordNotes
  → applyVoicing(currentChordNotes, voicingType)
  → + transposeShift + barDriftShifts[step]
  → playNote(midi, velocity)  for each note (or playChord for the
    arpType==='none' path)
```

For arpeggios, the loop picks one note per tick from `arpNotes` and
fires `playNote`. The `arpIndex++` and `arpVelocity = arpIndex%4 === 0
? 105 : 75` give the every-4th-step accent.

## Path metadata → behavior

`HarmonicPath` extended fields drive the behavioral layer:

| Field | Triggered behavior |
|---|---|
| `sequenceStepper: true, sequenceInterval: N` | per-bar transpose shift climbs by `N` semitones per bar |
| `key: "X → Y"` | linear keyDrift from start key to end key across bars |
| `sliceAndRepeat: true` | declared; consumed by PathCatalog filter (no playback effect yet) |
| `bassIsolation: true` (or persona rule) | bass held across bars; bar-strip `≈` glyph |
| `motifTracker` rule on persona | bar-strip `Δ` glyph on bars where the chord re-voices prior content |

`deriveBehavioralMarkers(path, persona)` returns one marker per bar
with `{ accentHex, isMotifTransformation, bassFrozen, hint }`. The
rail reads these and renders the `Δ` / `≈` badges plus the
persona-palette left-edge accent.

## Test boundaries

The pure-helpers split lets the math be tested without Web Audio:

- `theory.ts` exports everything pure — vitest in `node` env can
  import directly.
- `audio.ts` imports `window.AudioContext` — not importable in
  vitest. The warm/velocity helpers live in `audioHelpers.ts` so
  they're testable.
- React components are tested via `@testing-library/react` with
  jsdom env. RTL setup pattern is in `InlineStatus.test.tsx`.

`vitest.config.ts` routes `src/components/**/*.test.tsx` to jsdom;
everything else is node env.

## Adding a new persona

1. Add an entry to `src/data/personas.json` with the extended schema
   (see existing entries for the shape).
2. If it needs a new synesthesia color map, add `colorMap: Record<NoteName, ColorEntry>`.
3. Add a behavioral rule only if you want bar-strip markers to fire:
   `rules: { motifTracker: true, ... }`.
4. The persona becomes available in the grid immediately. Tests in
   `personas.test.ts` assert the schema; CI fails if your entry
   doesn't match.

## Adding a new path

1. Append to `src/lib/paths.ts` (or create a new module and spread it
   into `PATHS`). Follow the shape of `mystic_prometheus` /
   `progressive_tonality` / `developing_variation`.
2. Set `composer`, `key`, `feel`, `techniques`, `description`.
3. For a behavioral rule: set the matching path-level field
   (`sequenceStepper`, `sequenceInterval`, `key`, `sliceAndRepeat`,
   `bassIsolation`) — or rely on the active persona's `rules`.
4. `padPath` (defined inside `paths.ts`) extends the path to a
   4-bars-multiple length for the audio loop clock. Source paths
   can be any length ≥ 4 steps.
5. Tests in `paths.test.ts` assert shape, MIDI range, uniqueness,
   behavioral-rule firing.

## DDSP backend

`scripts/ingest_standards.py` runs at build time on Hugging Face to
pre-generate `studies.ts`. DDSP synthesis lives at `server/synthesizer.py`
and is lazily imported — if `ddsp` isn't installed, `/synthesize`
returns 503 but the rest of the app works.

The HF Space Dockerfile intentionally omits ddsp (~1.5 GB). Local
devs can install via `pip install ddsp` (works on macOS arm64 with
`ddsp-install-macos-arm64` recipe).

## Where to look when...

| Symptom | Check |
|---|---|
| No sound on click | `audioEngine.init()` — needs a user gesture. The `first interaction` useEffect in App.tsx wires this. |
| MIDI device not showing | The `IN` chip reads from `midiIn.init()` which runs on first interaction. Web MIDI needs HTTPS or `localhost`. |
| Bar strip markers not appearing | `deriveBehavioralMarkers` — verify the path's chord content has overlapping pitch classes between bars (motifTracker) or repeated bass (frozenBass). |
| Persona doesn't auto-load a path | Check `defaultPath` in personas.json resolves to an id in `ALL_PATHS`. |
| Path doesn't pad correctly | The `padPath` helper in paths.ts adds steps up to 24 bars. If your path is already longer it gets truncated at MAX_PATH_BARS. |
| Chord analysis says "unknown" | The `analyzeChord` heuristic fails on inversions or voicings without a clear 3rd above the bass. This is a known limitation — see `paths.test.ts > "notes the inverted-chord limitation on Roman numerals (TODO)"` for the pinned test. |
