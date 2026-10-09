# ADR-027: Magenta melody path — MelodyRNN, not MusicVAE

- Status: Accepted (2026-10-09)
- Context: the original spec named two Magenta surfaces (`magenta-rt` for
  MIDI, `@magenta/music` for trio/melody). Without confirmation,
  `magenta-rt` was picked as the single MIDI path and `@magenta/music`
  left unused. That narrowing was wrong on both counts.

## Decision

1. **`magenta-rt` stays installed, audio-only, unwired.** Verified:
   `mrt` exposes only `checkpoints`, `jax`, `mlx`, `models` — there is
   no MIDI/generate/render subcommand. It was never the MIDI half.
2. **`@magenta/music` is the melody path.** It is ALREADY a dependency
   (`package.json` `^1.23.1`, present in the lockfile and on disk).
   No install step is outstanding.
3. **Python `magenta` / MusicVAE is skipped.** TF1-era package, no
   Python 3.11 ARM wheels, effectively unmaintained.

## Why MusicVAE cannot deliver chord-conditioned melody

Verified in this repo on 2026-10-09, not inferred:

- **It does not load.** `MusicVAE.sample()` pulls
  `@magenta/music/esm/protobuf/proto.js`, a Closure-generated protobuf
  whose `$root.tensorflow` namespace is not a real ESM named export.
  Vite fails with `does not provide an export named 'tensorflow'`.
  The existing MusicRNN path is unaffected — it reaches protobuf via
  `core/sequences`, which resolves.
- **Its checkpoints are unconditioned.** Only `mel_2bar_small` resolves
  on `storage.googleapis.com/magentadata/js/checkpoints/music_vae/`
  (`mel_2bar`, `mel_4bar`, `mel_4bar_cond`, … all 404). Its config has
  no `chordEncoder` field, so `MusicVAE`'s `chordProgression` control
  is unavailable. Chord-conditioned melody is NOT reachable this way.
- **ImprovRNN is not in the package.** `@magenta/music@1.23.1` has no
  `improv_rnn` module; it ships only in the Python package we skipped.

Revisit ONLY when a concrete scheduled VAE use case exists AND a
chord-conditioned checkpoint can actually be loaded. Fixing the protobuf
interop without such a checkpoint buys an unconditioned VAE nobody
asked for.

## What ships instead (TD-034) — NOT YET

The melody lane (`useSessionStore.melodyByStep`) stores and displays
per-bar pitches that never sound. Closing that gap needs no new
dependency and no protobuf path — it is pure wiring:

- a pure helper turning the stored lane into a per-bar schedule
  (filtering the `0` empty-cell sentinel and corrupt values), and
- a per-bar scheduling call through the existing `audioEngine.playNote`
  (which routes to `melodyBus`, already gated by the Play-along mute),
  placed beside `backingEngine.scheduleAhead` so the frozen
  `onMeasureStart` handler stays untouched.

A first attempt passed lint / tests / build but could NOT be shown to
make melody audible in the browser, so it was reverted rather than
shipped. TD-034 remains open with the measurement constraints recorded
there (HD sounds must be OFF for an unambiguous oscillator signal; the
audio context only initializes on a trusted gesture).

Coconet remains a 60-minute spike, not a plan; findings go here either
way.

## Consequences

- `@magenta/music` in `package.json` does NOT imply VAE is usable — read
  this ADR first.
- Do not treat the melody lane as audible. It renders and edits; nothing
  consumes it for audio yet.