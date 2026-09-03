# src/magenta/

Audio-reactive *humanizer* pipeline for the Harmonic Study Engine.
Part of the broader [Magenta integration plan](https://github.com/kajica2/harmonic-study-engine/blob/main/Downloads/harmonic-magenta-plan.md) —
this folder ships the MVP (§3.4 adapter + §5 humanizer) without any
Magenta model downloads.

## What's here

| File | Role |
|---|---|
| `INoteSequence.ts` | Local `INote` view + re-export of Magenta's `INoteSequence` / `NoteSequence` from the protobuf barrel. |
| `adapter.ts` | `pathToNoteSequence`, `chordSymbolsOf`, `noteSequenceToPath`. No Magenta import — pure path-shape code. |
| `quantize.ts` | Lazy `await import("@magenta/music")` wrappers around `quantizeNoteSequence` / `unquantizeSequence`. Split out so unit tests can mock without dragging tfjs. |
| `noise.ts` | Seeded PRNG (`mulberry32`), Box–Muller `gaussian`, Ornstein–Uhlenbeck `OUDrift`, `hashSeed`. |
| `personaProfiles.ts` | Per-persona humanizer parameters (placement ms, timing σ, swing, legato, prune, drift σ, accent-upbeat). 17 profiles keyed by `Persona.id`; unknown ids fall through to Kandinsky. |
| `styleGrooves.ts` | Per-`BackingStyle` swing amount, beat-strength weight, per-track fixed offsets. |
| `humanizer.ts` | The five-rule pipeline (`groove → ensemble drift → track offsets → per-note → prune`). Async because it internally quantizes. |
| `humanizeBacking.ts` | Dial-side adapter: `(time, track) → adjustedTime`. Used by `BackingEngine.humanizer`. **No Magenta import** — works even when the model stack is unavailable. |
| `index.ts` | Barrel export. App code imports from `"../magenta"`. |

## How the Practice rail uses it

```
HumanFeelDial (slider + persona select)
        │
        ▼
useSessionStore.humanizeAmount / humanizePersonaId  (localStorage-persisted)
        │
        ▼
App.tsx useEffect  ──►  createHumanizeBacking({ amount, personaId, style, ctxNow })
        │
        ▼
backingEngine.humanizer = (time, track) => handle.adjust(time, track)
        │
        ▼
schedulePattern wraps every play-kick/snare/hat/bass/piano time arg
```

At `amount=0` the wrapper is `null` and backing plays grid-perfect
(what every existing test expects). Above zero, every backing-track
note's absolute time is adjusted by `personaPlacementMs + trackOffsetMs
+ gaussian(0, personaTimSigmaMs)` — same effect as a real drummer /
bassist playing slightly ahead, behind, or loose against the click.

## Adding a Magenta model later

The adapter is the only file that touches `INoteSequence`. When
P1 ships (MusicRNN Continue with chord conditioning):

1. `src/magenta/MagentaService.ts` — worker-side facade, owns the
   `MusicRNN` instance, handles checkpoint fetch + lazy load.
2. `src/magenta/continueSequence.ts` — wraps `pathToNoteSequence` →
   `quantizeNoteSequence` → `mvae.continueSequence(qns, steps, temp, chords)`
   → `humanize()` → returns a commit-ready `HarmonicPath`.
3. UI: a "Continue with Magenta" button in the Generator Lab
   (component TBD when that surface lands).

The humanizer test mocks `./quantize` so it doesn't depend on
Magenta being runnable — that's the contract future code should
respect when adding model-touching tests.

## Testing

- `tests/magenta-adapter.test.ts` (11 tests) — adapter invariants,
  pitch/velocity/timing, every-path round-trips-without-throwing.
- `tests/magenta-humanizer.test.ts` (16 tests) — determinism,
  amount blending, every persona × every style produces finite
  output, Miles drops notes, Glass doesn't, shared-clock continuity,
  Box–Muller / OUDrift statistical sanity.

Total: 129 tests passing across the repo.