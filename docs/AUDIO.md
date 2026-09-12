# Audio Engine Reference

How `AudioEngine` (in `src/lib/audio.ts`) makes sound. Read this
when changing voice design, adding a new instrument, debugging
audio issues, or extending the Web Audio graph.

## Signal flow

```
osc1 ─┐
      ├─→ filter ─→ velocityGain ─┐
osc2 ─┤                          │
      │                          ├─→ melodyBus ─┬─→ warmth (WaveShaper) ─┐
osc3 ─┘                          │             │                           │
                                 │             ├─→ masterGain ─┬─→ compressor ─┬─→ destination
(sustain pedal, etc.)                            │                          │      │
                                                │                          │      └─→ recorder (optional)
backingEngine buses (drums/bass/piano) ──→ bassEq (35Hz HP) ──→ masterGain ──┘     │
                                                │                          │
                                                └──── compressor ←─────────┘
                                                           │
                                                           └─→ reverb (3s) → 0.5 wet → destination
```

## Voice design

Each instrument is a hand-tuned combination of oscillators, gains,
filters, and ADSR envelopes. The per-instrument block in `playNote()`
determines the sound. All voices pass through the same per-note
velocity-gain stage and the global warmth/compressor/reverb chain.

### Per-instrument voice recipes

| Instrument | OSCs | Filter | ADSR | Notes |
|---|---|---|---|---|
| `sine` | 1 sine | lowpass 3× | 50ms attack, 800ms decay | Pure tone; default for synth personas. |
| `pad` | 2 saw detuned ±5¢ + 1 triangle sub-octave | lowpass 2× → 4× sweep | 500ms slow attack, 1000ms long release | Rich harmonic content. Best with HD sounds off. |
| `pluck` | 1 square + 1 saw +8va | lowpass 8× → 1× sweep | 20ms fast attack, 600ms fast decay | FM-flavored percussive. |
| `trumpet` | 1 saw + 1 square (slight detune) | lowpass 8× → 3× sweep | 50ms attack, 150ms peak, 500ms release | Brass envelope with strong upper harmonics. |
| `guitar` | 1 saw | bandpass 2.5×, Q=0.8 | 20ms attack, 1.2s release | Plucked-string with body resonance. |
| `sax` | 1 saw + 1 triangle (slight detune) | lowpass 5× → 2×, Q=1.5 | 80ms slower attack, 1s release | Reedy envelope, less bite than trumpet. |
| `epiano` | 1 sine + 1 triangle + 1 sub-octave sine (for midi<72) + 1 sine +2.01 octaves (bell) | lowpass 5× → 1.5× sweep | 50ms attack, 800ms decay | Rich default voice. |

### ADSR envelopes

The release (note-off) uses `cancelScheduledValues + setTargetAtTime`
which is **click-proof** — no audible artifact on fast re-triggers.

```typescript
// On note-off (src/lib/audio.ts:455-490):
gain.gain.cancelScheduledValues(now);
gain.gain.setTargetAtTime(0, now, releaseTime / 3);
// Release filter
if (filter) {
  filter.frequency.cancelScheduledValues(now);
  filter.frequency.setTargetAtTime(100, now, releaseTime / 2);
}
for (const osc of oscs) {
  osc.stop(now + releaseTime);
}
```

`setTargetAtTime(time-constant)` produces an exponential approach that
is mathematically click-free. The `releaseTime / 3` is the time
constant (1/e decay).

## Global chain

### Warmth saturation

A `WaveShaperNode` on the melody bus. The curve is a soft-knee
saturation:

```
f(x) = sign(x) * (1 - exp(-k * |x|)) / (1 - exp(-k))
```

with k=2.5. This adds gentle odd-order harmonics, fattening the
sound without harsh clipping. 4× oversample to avoid aliasing.

The curve is built by `buildWarmthCurve(1024, 2.5)` in
`audioHelpers.ts`. It's a Float32Array of length 1024 mapping input
[-1, 1] to output [-1, 1] with soft saturation at the extremes.

Routing: melody bus → warmth (parallel) → masterGain. Dry+wet
parallel — the warmth doesn't replace the dry signal, it adds to it.
The compressor after the master catches any peaks the warmth
generates.

**To make the warmth more aggressive:** increase k (e.g. k=4).
**To bypass:** `audioEngine.warmth = null` (not exposed; requires
patch).

### Velocity scaling

Per-note velocity via `velocityToGain(midiVelocity)` in
`audioHelpers.ts`:

```typescript
velocityToGain(0)   = 0.15   // floor
velocityToGain(64)  ≈ 0.65   // mid
velocityToGain(127) = 1.0    // max
```

Soft floor at 0.15 so quietest hits are audible. Clamped to [0.15, 1.0].

In App.tsx:
- **Chord playback** (`arpType === 'none'`): velocity is chord-position
  weighted — bass (idx=0) → MIDI 60, top (idx=last) → MIDI 110.
- **Arpeggiator**: `arpVelocity = arpIndex % 4 === 0 ? 105 : 75` —
  every 4th step (downbeat of next 16th group) is accented.

### Compressor

```typescript
compressor.threshold.value = -30;   // dB
compressor.knee.value = 10;
compressor.ratio.value = 8;
compressor.attack.value = 0.01;
compressor.release.value = 0.25;
```

Compresses dynamics by 8:1 above -30 dB with a soft knee. Catches
peaks from warmth saturation + loud chord voicings.

### Reverb

Synthetic impulse response, 3 seconds, exponential decay envelope:

```typescript
for (let i = 0; i < length; i++) {
  const envelope = Math.pow(reverseIndex / length, decay);
  left[i] = (Math.random() * 2 - 1) * envelope;
  right[i] = (Math.random() * 2 - 1) * envelope;
}
```

50% wet mix via `reverbLevel.gain.value = 0.5`. Routed in parallel
to dry destination.

## Backing engine

Drums, bass, piano on separate buses for per-track mute. Each bus
goes to `masterBus` (then compressor + reverb + destination).

**Bass bus has a 35 Hz highpass** at Q=0.7 to remove DC offset /
sub-bass rumble. Drums and piano are unfiltered (the kick needs
that low end).

11 backing styles — swing, bossa, funk, latin, ballad, clave 3-2,
clave 3-3, African 4:4, 4:3, 3:4, plus `off`. Per-style percussion
patterns in `src/lib/backingEngine.ts`. Per-track mute toggles in
App.tsx (`drumsMuted`, `bassMuted`, `pianoMuted`) drop each bus's
gain to 0 when true.

## MIDI I/O

### Out (`src/lib/midiOut.ts`)

`MidiOut` singleton wraps `navigator.requestMIDIAccess()`. On success
the list of available outputs is surfaced via `onOutputsChange`.
`selectOutput(id)` routes outgoing notes to the chosen device.
`playNote(midi, velocity=80)` / `stopNote(midi)` translate to MIDI
message bytes `[0x90, midi, velocity]` / `[0x80, midi, 0]`.

### In (`src/lib/midiIn.ts`)

`MidiIn` singleton wraps Web MIDI input. Binds NOTE ON/OFF messages
from every connected input, dispatches a `midin` CustomEvent on
`window` with `{ note, velocity, type, inputId, inputName, timestamp }`.

Listeners can subscribe via:
```typescript
window.addEventListener("midin", (e) => {
  const ev = (e as CustomEvent).detail;
  console.log(ev.note, ev.velocity, ev.type);
});
```

Or via the typed API:
```typescript
const unsubscribe = midiIn.onMidin((e) => { ... });
```

## HD sounds (FluidR3 soundfont)

When `useHDSounds = true` (localStorage `synesthesia_hdSounds=1`),
`playNote` calls `playSoundfontNote` instead of building an oscillator
voice. Soundfonts are loaded from
`https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@master/FluidR3_GM`
on first use, **cached in module scope** so persona switches
don't re-download.

If the load fails (offline, CORS, blocked CDN), `playSoundfontNote`
returns `false` and `playNote` falls back to the oscillator synth
silently.

The IN/OUT chips in the header show the active state: green dot =
listening/sending, gray = no device.

## When the AudioContext is suspended

Browsers require a user gesture before any AudioContext can produce
sound. `audioEngine.init()` resumes the context if suspended. The
first-interaction useEffect in App.tsx wires this:

```typescript
const handleFirstInteraction = () => {
  audioEngine.init();
  midiOut.init();
  midiIn.init();
  window.removeEventListener("keydown", handleFirstInteraction);
  window.removeEventListener("mousedown", handleFirstInteraction);
};
window.addEventListener("keydown", handleFirstInteraction);
window.addEventListener("mousedown", handleFirstInteraction);
```

If you click anywhere on the page and still hear nothing, the
AudioContext may be in `interrupted` state (iOS Safari). Refresh the
page or tap the page to retrigger the gesture.

## Debugging audio

### Quick checks

```typescript
// In browser console:
window.__debugAudio = audioEngine;  // expose via App.tsx if needed
audioEngine.getCtx();                 // returns the AudioContext
audioEngine.useHDSounds;              // check the toggle state
```

### No sound at all

1. Check `audioEngine.ctx.state` — should be `"running"`. If
   `"suspended"`, click the page again.
2. Check `useHDSounds` — if true and the soundfont failed to load,
   fall back to `false` and reload.
3. Check the master gain — `audioEngine.masterGain.gain.value`
   should reflect the volume slider.
4. Check `melodyMuted` — when true (press M to toggle), melody is
   silent but backing track plays.

### Clicking artifacts

If notes click/pop on note-on or note-off:

- Onset: the attack is exponential from `0.001`. If you change
  this, use `setTargetAtTime` (not exponentialRamp) for click-free
  ramps.
- Offset: the release uses `setTargetAtTime(0, now, release/3)` —
  if you change this to a hard `setValueAtTime(0)`, you'll hear a
  click. The `setTargetAtTime` math is click-proof by construction.

### Out-of-tune

Pitch comes from `midiToFreq(midi) = 440 * 2^((midi - 69) / 12)`.
The A4 reference (440 Hz) is hardcoded. To retune to A=442, patch
`midiToFreq` — but beware: the backing tracks in `backingEngine.ts`
also use `midiToFreq` so they'll retune too.

## Latency and CPU

- WaveShaper with 4× oversample on every voice costs CPU. If
  audio is glitching on low-end machines, reduce `oversample` to
  `"2x"` or remove the warmth node entirely.
- `playNote` does NOT debounce. Rapid-fire arpeggiator notes can
  pile up — each note creates a new oscillator chain. The cleanup
  happens via `setTimeout(disconnect, release*1000 + 100)` so the
  resources are eventually freed, but during heavy arpeggios you
  may see hundreds of active nodes.
- The MIDI input listener binds ALL incoming messages. If a device
  floods the input with aftertouch or controller messages, the
  CustomEvent dispatch can spam. Filter in the listener if you see
  this — only handle `type === "noteon" | "noteoff"`.

## Latency budget

The audio loop clock (`playbackClock.ts`) is a singleton rAF
loop. Each tick dispatches the current step's chord (or arp note)
via `setTimeout` to schedule ahead of the AudioContext's current
time. Typical end-to-end latency from `setActiveStepIndex(n)` to
sound output: ~10 ms.

## DDSP backend

The Python backend at `:8765` exposes `/synthesize` for real
DDSP-rendered audio (DDSP v3.5.1 on local install, 503 on HF free
tier). `src/lib/ddspSynth.ts` wraps the fetch + playback. Use it for
recordings (`RecordingModal`) or for persona previews when the
oscillator synth is too thin for the genre.

The app works without the backend — `synthesizeAndPlay` resolves to
`false` if the backend is unreachable, and the audio engine
continues with the oscillator synth.