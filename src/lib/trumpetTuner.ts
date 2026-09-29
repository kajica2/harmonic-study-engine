/**
 * src/lib/trumpetTuner.ts — autocorrelation pitch detector (YIN-lite,
 * no external libs). Returns frequency in Hz for a mono Float32Array.
 * Browser-only: no DOM access, but uses Float32Array.
 */

const MIN_AMP_DEFAULT = 0.015;
/** Ignore lags corresponding to frequencies > 1 kHz (mouthpiece hiss). */
const MIN_LAG_HZ_CAP = 1000;

export interface PitchEstimate {
  freq: number;
  amp: number;
}

/**
 * Estimate the fundamental frequency of a mono signal using normalized
 * autocorrelation with parabolic peak interpolation. `freq = 0` means
 * no clear pitch (silence or sub-threshold amplitude).
 */
export function detectPitch(
  x: Float32Array,
  sampleRate: number,
  minAmp: number = MIN_AMP_DEFAULT,
): PitchEstimate {
  const N = x.length;
  // Center the signal in-place.
  let mean = 0;
  for (let i = 0; i < N; i++) mean += x[i];
  mean /= N;
  let maxAbs = 0;
  for (let i = 0; i < N; i++) {
    const v = x[i] - mean;
    if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
  }
  if (maxAbs < minAmp) return { freq: 0, amp: maxAbs };

  // Hanning-windowed copy.
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  }

  // Autocorrelation (lag 0 .. N-1).
  const ac = new Float32Array(N);
  for (let lag = 0; lag < N; lag++) {
    let sum = 0;
    for (let i = 0; i < N - lag; i++) sum += win[i] * win[i + lag];
    ac[lag] = sum;
  }

  // Zero out lags < sampleRate / 1000 to ignore the >1 kHz tail.
  const minLag = Math.max(1, Math.floor(sampleRate / MIN_LAG_HZ_CAP));
  for (let i = 0; i < minLag; i++) ac[i] = 0;

  // Argmax.
  let peak = 0;
  let peakVal = 0;
  for (let i = 1; i < N; i++) {
    if (ac[i] > peakVal) {
      peakVal = ac[i];
      peak = i;
    }
  }
  if (peak === 0) return { freq: 0, amp: maxAbs };

  // Parabolic interpolation.
  if (peak > 0 && peak < N - 1) {
    const y1 = ac[peak - 1];
    const y2 = ac[peak];
    const y3 = ac[peak + 1];
    const denom = y1 - 2 * y2 + y3;
    if (denom !== 0) peak = peak + 0.5 * ((y1 - y3) / denom);
  }
  return { freq: sampleRate / peak, amp: maxAbs };
}

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export interface NoteRef {
  midi: number;
  cents: number;
  name: string;
  octave: number;
}

/**
 * Convert frequency to a MIDI note + pitch-class name. Cents is the
 * fractional offset from the nearest equal-tempered semitone, in
 * cents (-50..50, sign indicates sharp/flat).
 */
export function freqToNote(
  freq: number,
  a4: number = 440,
): NoteRef | null {
  if (freq <= 0) return null;
  const n = 69 + 12 * Math.log2(freq / a4);
  const midi = Math.round(n);
  const cents = (n - midi) * 100;
  return {
    midi,
    cents,
    name: NOTE_NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
  };
}