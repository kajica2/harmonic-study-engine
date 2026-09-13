/**
 * Pure helpers extracted from src/lib/audio.ts. The audio module
 * itself depends on window/AudioContext and can't be imported in
 * the vitest node environment. Splitting the pure functions out
 * lets us unit-test the math while the Web Audio side stays
 * browser-only.
 *
 * Helpers:
 *  - buildWarmthCurve(samples, k): soft-knee saturation curve for
 *    WaveShaper. f(x) = sign(x) * (1 - exp(-k*|x|)) / (1 - exp(-k)).
 *  - velocityToGain(midiVelocity): MIDI 0..127 → gain 0.15..1.0
 *    with a soft floor so quiet hits are still audible.
 */

export function buildWarmthCurve(samples: number, k: number): Float32Array {
  const curve = new Float32Array(samples);
  const norm = 1 - Math.exp(-k);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1; // -1..1
    curve[i] = (Math.sign(x) * (1 - Math.exp(-k * Math.abs(x)))) / norm;
  }
  return curve;
}

/**
 * MIDI velocity 0..127 → linear gain in [0.15, 1.0]. The soft
 * floor at 0.15 means velocity=0 still produces an audible note
 * (so the playhead click on a silent chord isn't audible as a
 * dropped frame). Callers can normalize from other 0..1 inputs
 * by multiplying by 127.
 */
export function velocityToGain(midiVelocity: number): number {
  const v = midiVelocity / 127;
  return Math.max(0.15, Math.min(1.0, v));
}