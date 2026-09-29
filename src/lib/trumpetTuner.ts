/**
 * src/lib/trumpetTuner.ts — multi-strategy monophonic pitch detector
 * for trumpet / brass.
 *
 * Three estimators vote on each block; a confidence-weighted blend
 * picks the winner and a harmonic-correction pass snaps octave
 * errors (common on brass when H1 is weak and H2/H3 dominate).
 *
 *   1. YIN-style cumulative squared difference function.
 *      Best for periodic, low-noise signals with strong fundamental.
 *      Source: de Cheveigné & Kawahara (2002).
 *
 *   2. Harmonic Product Spectrum (HPS) — sum of |FFT|^k across k=
 *      2..5. Pushes the fundamental above its overtones; works even
 *      when H1 is the weakest harmonic. Fast (one radix-2 FFT).
 *
 *   3. SubHarmonic Summation (SHS) — collapses octaves 2..5 onto
 *      the fundamental bin, summing their magnitudes. Resolves
 *      cases where H1 is buried in broadband hiss (mouthpiece
 *      breath noise). Last-resort fallback.
 *
 * Octave correction: when the AC/YIN period disagrees with the
 * spectral peak by an integer multiple, we trust the spectral peak
 * weighted by its harmonic energy (the classic "follow the loudest
 * harmonic" trick). Cents are then computed against that frequency.
 *
 * Confidence = 0..1, blend of AP clarity + HPS peak prominence. Low
 * confidence blocks are reported with `freq = 0` so callers can
 * treat them as silence.
 */

const MIN_AMP_DEFAULT = 0.012;
/** Search lags down to ~50 Hz (covers low brass pedal tones). */
const MIN_LAG_HZ_FLOOR = 50;
/** Reject frequencies above 2 kHz (above the trumpet's written
 *  range; cuts mouthpiece hiss). */
const MIN_LAG_HZ_CAP = 2000;

/** YIN-style absolute threshold. de Cheveigné & Kawahara recommend
 *  ~0.10–0.15; we sit at 0.12 to balance false-period vs missed-fund. */
const YIN_THRESHOLD = 0.12;

/** Octave-correction guard: a sub-octave candidate (base/2, base/3)
 *  whose own fundamental bin holds less than this fraction of its
 *  loudest harmonic is matching H2/H4 by accident, not a real
 *  fundamental. */
const SUB_OCTAVE_FUND_FLOOR = 0.15;
/** Score multiplier applied to such artefact candidates. */
const SUB_OCTAVE_FUND_DAMP = 0.6;

export interface PitchEstimate {
  freq: number;
  amp: number;
  /** 0..1 — confidence in `freq`. < 0.5 means caller should treat
   *  this block as noise and not score it. */
  confidence: number;
  /** Which estimator won: "yin" | "hps" | "shs" | "blend". */
  source: "yin" | "hps" | "shs" | "blend";
}

/** Cooley–Tukey radix-2 FFT, in-place, length must be a power of 2. */
function fft(re: Float32Array, im: Float32Array): void {
  const N = re.length;
  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // Butterflies.
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let cRe = 1;
      let cIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * cRe - im[i + k + len / 2] * cIm;
        const vIm = re[i + k + len / 2] * cIm + im[i + k + len / 2] * cRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextCRe = cRe * wRe - cIm * wIm;
        const nextCIm = cRe * wIm + cIm * wRe;
        cRe = nextCRe;
        cIm = nextCIm;
      }
    }
  }
}

/** Next power of two >= n. */
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * YIN cumulative mean normalized difference. `out[tau]` is small
 * (close to 0) for periods that match the signal. `out[0]` is always
 * 1. Implementation: standard de Cheveigné & Kawahara (2002).
 */
function yinDifference(
  x: Float32Array,
  out: Float32Array,
  minLag: number,
  maxLag: number,
): { tau: number; clarity: number } {
  const tauMax = maxLag;
  // d[tau] = sum (x[i] - x[i+tau])^2
  // We use a "fast" form: differencing against a sliding window.
  for (let tau = minLag; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < tauMax; i++) {
      const delta = x[i] - x[i + tau];
      sum += delta * delta;
    }
    out[tau] = sum;
  }

  // Cumulative mean normalized difference:
  //   d'(tau) = d(tau) / ((1/tau) * sum_{j=1..tau} d(j))
  // Set d'(0) = 1 by convention; d'(tau>0) per formula.
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += out[tau];
    out[tau] = (out[tau] * tau) / (running || 1e-12);
  }

  // Absolute-threshold search: first dip below YIN_THRESHOLD that
  // is also a local minimum.
  let bestTau = -1;
  for (let tau = minLag; tau <= tauMax; tau++) {
    if (out[tau] < YIN_THRESHOLD) {
      // Walk to the local minimum.
      while (tau + 1 <= tauMax && out[tau + 1] < out[tau]) tau++;
      bestTau = tau;
      break;
    }
  }
  if (bestTau === -1) {
    // Fallback: argmin over the search range.
    let minVal = Infinity;
    let minIdx = minLag;
    for (let tau = minLag; tau <= tauMax; tau++) {
      if (out[tau] < minVal) {
        minVal = out[tau];
        minIdx = tau;
      }
    }
    bestTau = minIdx;
  }
  // Parabolic interpolation around the chosen tau.
  let tauInterp = bestTau;
  if (bestTau > 1 && bestTau < tauMax) {
    const s0 = out[bestTau - 1];
    const s1 = out[bestTau];
    const s2 = out[bestTau + 1];
    const denom = 2 * (2 * s1 - s0 - s2);
    if (denom !== 0) {
      tauInterp = bestTau + (s2 - s0) / denom;
    }
  }
  // Clarity: 1 - min normalized difference.
  return { tau: tauInterp, clarity: Math.max(0, 1 - out[Math.round(bestTau)]) };
}

/**
 * Magnitude spectrum via FFT. Returns peak bin + magnitude for the
 * given search range.
 */
function findSpectralPeak(
  re: Float32Array,
  im: Float32Array,
  sr: number,
  minHz: number,
  maxHz: number,
): { freq: number; mag: number; bin: number } {
  const N = re.length;
  const halfN = N / 2;
  const binHz = sr / N;
  const minBin = Math.max(1, Math.floor(minHz / binHz));
  const maxBin = Math.min(halfN - 2, Math.ceil(maxHz / binHz));
  let bestBin = minBin;
  let bestMag = 0;
  for (let i = minBin; i <= maxBin; i++) {
    const mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    if (mag > bestMag) {
      bestMag = mag;
      bestBin = i;
    }
  }
  // Parabolic interpolation around the peak for sub-bin accuracy.
  if (bestBin > 1 && bestBin < halfN - 1) {
    const m0 =
      Math.sqrt(re[bestBin - 1] * re[bestBin - 1] + im[bestBin - 1] * im[bestBin - 1]);
    const m1 = bestMag;
    const m2 =
      Math.sqrt(re[bestBin + 1] * re[bestBin + 1] + im[bestBin + 1] * im[bestBin + 1]);
    const denom = 2 * (2 * m1 - m0 - m2);
    if (denom !== 0) {
      const delta = (m2 - m0) / denom;
      const interpBin = bestBin + delta;
      return { freq: interpBin * binHz, mag: bestMag, bin: bestBin };
    }
  }
  return { freq: bestBin * binHz, mag: bestMag, bin: bestBin };
}

/**
 * Harmonic Product Spectrum. Sums |FFT|^k for k = 2..5 with the
 * magnitudes downsampled by k. The peak of the sum is the fundamental
 * frequency even when H1 is buried. Parabolic interpolation refines
 * sub-bin accuracy.
 */
function harmonicProduct(
  re: Float32Array,
  im: Float32Array,
  sr: number,
  minHz: number,
  maxHz: number,
): { freq: number; mag: number } {
  const N = re.length;
  const binHz = sr / N;
  const minBin = Math.max(2, Math.floor(minHz / binHz));
  const maxBin = Math.min(Math.floor(N / 2) - 2, Math.ceil(maxHz / binHz));
  let bestBin = minBin;
  let bestVal = 0;
  for (let i = minBin; i <= maxBin; i++) {
    const mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    let sum = mag;
    for (let k = 2; k <= 5; k++) {
      const j = i * k;
      if (j >= N / 2) break;
      const mj = Math.sqrt(re[j] * re[j] + im[j] * im[j]);
      sum += mj;
    }
    if (sum > bestVal) {
      bestVal = sum;
      bestBin = i;
    }
  }
  // Parabolic interpolation.
  let interpBin = bestBin;
  if (bestBin > 1 && bestBin < Math.floor(N / 2) - 1) {
    const m0 = Math.sqrt(
      re[bestBin - 1] * re[bestBin - 1] + im[bestBin - 1] * im[bestBin - 1],
    );
    const m1 = Math.sqrt(
      re[bestBin] * re[bestBin] + im[bestBin] * im[bestBin],
    );
    const m2 = Math.sqrt(
      re[bestBin + 1] * re[bestBin + 1] + im[bestBin + 1] * im[bestBin + 1],
    );
    const denom = 2 * (2 * m1 - m0 - m2);
    if (denom !== 0) interpBin = bestBin + (m2 - m0) / denom;
  }
  return { freq: interpBin * binHz, mag: bestVal };
}

/**
 * SubHarmonic Summation: collapse octaves 2..5 onto the
 * fundamental, summing their magnitudes. Picks the lowest bin
 * with the strongest accumulated energy.
 */
function subHarmonicSummation(
  re: Float32Array,
  im: Float32Array,
  sr: number,
  minHz: number,
  maxHz: number,
): { freq: number; mag: number } {
  const N = re.length;
  const binHz = sr / N;
  const minBin = Math.max(2, Math.floor(minHz / binHz));
  const maxBin = Math.min(Math.floor(N / 2) - 2, Math.ceil(maxHz / binHz));
  let bestBin = minBin;
  let bestVal = 0;
  for (let i = minBin; i <= maxBin; i++) {
    let sum = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    for (let k = 2; k <= 5; k++) {
      const j = i * k;
      if (j >= N / 2) break;
      sum += Math.sqrt(re[j] * re[j] + im[j] * im[j]) * (1 - (k - 1) * 0.1);
    }
    if (sum > bestVal) {
      bestVal = sum;
      bestBin = i;
    }
  }
  let interpBin = bestBin;
  if (bestBin > 1 && bestBin < Math.floor(N / 2) - 1) {
    const m0 = Math.sqrt(
      re[bestBin - 1] * re[bestBin - 1] + im[bestBin - 1] * im[bestBin - 1],
    );
    const m1 = Math.sqrt(
      re[bestBin] * re[bestBin] + im[bestBin] * im[bestBin],
    );
    const m2 = Math.sqrt(
      re[bestBin + 1] * re[bestBin + 1] + im[bestBin + 1] * im[bestBin + 1],
    );
    const denom = 2 * (2 * m1 - m0 - m2);
    if (denom !== 0) interpBin = bestBin + (m2 - m0) / denom;
  }
  return { freq: interpBin * binHz, mag: bestVal };
}

/**
 * Find the lowest harmonic frequency consistent with the spectrum.
 * Walks candidate fundamentals from 50 Hz upward; for each, sums
 * magnitudes at H1..H5. The candidate whose stack has the strongest
 * aligned energy wins. Resolves missing-fundamental cases where the
 * fundamental is silent but H2..H5 are loud.
 */
function harmonicStackFundamental(
  re: Float32Array,
  im: Float32Array,
  sr: number,
): { freq: number; mag: number } {
  const N = re.length;
  const binHz = sr / N;
  const minBin = Math.max(2, Math.floor(50 / binHz));
  const maxBin = Math.min(Math.floor(N / 2) - 2, Math.ceil(2000 / binHz));
  let bestBin = minBin;
  let bestStack = 0;
  for (let i = minBin; i <= maxBin; i++) {
    const mag1 = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    let stack = mag1;
    // Count harmonics whose magnitude is > 5% of the loudest
    // harmonic in this stack (not just mag1) — handles missing
    // fundamental cleanly.
    let loudest = mag1;
    for (let k = 2; k <= 5; k++) {
      const j = i * k;
      if (j >= N / 2) break;
      const mj = Math.sqrt(re[j] * re[j] + im[j] * im[j]);
      stack += mj;
      if (mj > loudest) loudest = mj;
    }
    let presentHarmonics = 0;
    for (let k = 1; k <= 5; k++) {
      const j = i * k;
      if (j >= N / 2) break;
      const mj = Math.sqrt(re[j] * re[j] + im[j] * im[j]);
      if (mj > 0.05 * Math.max(loudest, 1)) presentHarmonics++;
    }
    // Reward candidates with multiple aligned harmonics; penalize
    // isolated bins (noise spikes).
    const align = presentHarmonics >= 2 ? 1 : 0.3;
    const score = stack * align;
    if (score > bestStack) {
      bestStack = score;
      bestBin = i;
    }
  }
  let interpBin = bestBin;
  if (bestBin > 1 && bestBin < Math.floor(N / 2) - 1) {
    const m0 = Math.sqrt(
      re[bestBin - 1] * re[bestBin - 1] + im[bestBin - 1] * im[bestBin - 1],
    );
    const m1 = Math.sqrt(
      re[bestBin] * re[bestBin] + im[bestBin] * im[bestBin],
    );
    const m2 = Math.sqrt(
      re[bestBin + 1] * re[bestBin + 1] + im[bestBin + 1] * im[bestBin + 1],
    );
    const denom = 2 * (2 * m1 - m0 - m2);
    if (denom !== 0) interpBin = bestBin + (m2 - m0) / denom;
  }
  return { freq: interpBin * binHz, mag: bestStack };
}

/**
 * Optional hint for the detector: when the caller already knows the
 * target pitch class + octave (e.g. the trumpet stage modal knows the
 * chord tone to drill), pass it in to bias octave-correction toward
 * the harmonic series of the expected note. The hint is advisory —
 * the detector still returns the strongest harmonic stack it finds,
 * but the target's harmonics get a score bonus.
 */
export interface PitchHint {
  /** Target pitch class, e.g. "Bb", "F". */
  pitchClass: string;
  /** Expected octave for the target (MIDI 4 = middle C = 261.63 Hz). */
  octave: number;
}

/**
 * Estimate pitch + confidence for a mono audio block.
 *
 * Multi-strategy: YIN votes on period, HPS votes on fundamental,
 * SHS is the fallback when H1 is buried. The output frequency is the
 * one that has the strongest harmonic support (octave-corrected).
 *
 * When `hint` is supplied, the octave-correction step also considers
 * the harmonics of the hinted note (H1, H2, H3) as candidates and
 * scores them higher than off-target stacks.
 */
export function detectPitch(
  x: Float32Array,
  sampleRate: number,
  minAmp: number = MIN_AMP_DEFAULT,
  hint?: PitchHint,
): PitchEstimate {
  const N = x.length;
  // DC removal + amplitude.
  let mean = 0;
  for (let i = 0; i < N; i++) mean += x[i];
  mean /= N;
  let maxAbs = 0;
  for (let i = 0; i < N; i++) {
    const v = x[i] - mean;
    if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
  }
  if (maxAbs < minAmp) {
    return { freq: 0, amp: maxAbs, confidence: 0, source: "yin" };
  }

  // Windowed signal.
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    win[i] = (x[i] - mean) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  }

  // Lag bounds.
  const minLag = Math.max(2, Math.floor(sampleRate / MIN_LAG_HZ_CAP));
  const maxLag = Math.min(N - 2, Math.floor(sampleRate / MIN_LAG_HZ_FLOOR));

  // YIN.
  const yinOut = new Float32Array(maxLag + 1);
  const yin = yinDifference(win, yinOut, minLag, maxLag);
  const yinFreq = sampleRate / yin.tau;

  // FFT (next pow2 >= N for speed).
  // FFT length: use the full block size up to 8192 (covers low brass
  // pedal tones down to 5.4 Hz, gives sub-bin resolution of ~5 Hz
  // at F#2 = 92.5 Hz — vs ~10 Hz/bin at the previous 4096 cap).
  const fftN = Math.min(nextPow2(N), 8192);
  const re = new Float32Array(fftN);
  const im = new Float32Array(fftN);
  // Copy + window into the FFT buffer.
  for (let i = 0; i < Math.min(N, fftN); i++) {
    re[i] = (x[i] - mean) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftN - 1)));
  }
  fft(re, im);

  const specPeak = findSpectralPeak(re, im, sampleRate, 50, 2000);
  const hps = harmonicProduct(re, im, sampleRate, 50, 2000);
  const shs = subHarmonicSummation(re, im, sampleRate, 50, 2000);
  const stackFund = harmonicStackFundamental(re, im, sampleRate);

  // Resolve the hint frequency once: when the caller told us which
  // note is being drilled, that exact frequency + its 2nd / 3rd
  // harmonics are the strongest candidates. We pre-compute the
  // hint's expected frequency (A4=440 default) and inject it as
  // an extra candidate the scoring loop treats preferentially.
  let hintFreq = 0;
  let hintH2 = 0;
  let hintH3 = 0;
  if (hint) {
    const MIDI_NAMES: Record<string, number> = {
      C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4,
      F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9,
      "A#": 10, Bb: 10, B: 11,
    };
    const pc = MIDI_NAMES[hint.pitchClass];
    if (pc !== undefined) {
      const midi = (hint.octave + 1) * 12 + pc;
      hintFreq = 440 * Math.pow(2, (midi - 69) / 12);
      hintH2 = hintFreq * 2;
      hintH3 = hintFreq * 3;
    }
  }

  // Octave correction: walk candidates × small-integer octaves and
  // pick the frequency whose harmonic stack is strongest.
  const candidates = [yinFreq, hps.freq, shs.freq, stackFund.freq].sort(
    (a, b) => a - b,
  );
  const ratios = [1, 2, 3, 4, 0.5, 1 / 3];
  let chosenFreq = stackFund.freq;
  let bestScore = -Infinity;
  let bestSource: PitchEstimate["source"] = "hps";
  for (const base of candidates) {
    for (const r of ratios) {
      const f = base * r;
      if (f < 50 || f > 2000) continue;
      const bin = Math.round((f * fftN) / sampleRate);
      if (bin < 1 || bin >= fftN / 2) continue;
      const mag = Math.sqrt(re[bin] * re[bin] + im[bin] * im[bin]);
      // Sum energy at H1..H5 — strongest stack wins.
      let stack = mag;
      let stackMax = mag;
      for (let k = 2; k <= 5; k++) {
        const j = bin * k;
        if (j >= fftN / 2) break;
        const hMag = Math.sqrt(re[j] * re[j] + im[j] * im[j]);
        stack += hMag;
        if (hMag > stackMax) stackMax = hMag;
      }
      // Sub-octave candidates (base/2, base/3) only line up with the
      // odd harmonics by accident when their own fundamental bin is
      // empty — they match H2/H4 of the real note. Vibrato smears the
      // spectrum into near-ties and that artefact then wins (C5 read
      // as C4, F#5 as F#4, both ~1212 cents off). Damp it unless the
      // candidate's fundamental bin carries real energy.
      if (r < 1 && mag < SUB_OCTAVE_FUND_FLOOR * stackMax) {
        stack *= SUB_OCTAVE_FUND_DAMP;
      }
      // Hint bonus: if `f` is within 50 cents of the hinted
      // fundamental or any of its first 3 harmonics, add a 1.5x
      // multiplier to the stack score. This biases the detector
      // toward the note the user is actually drilling rather than
      // letting it wander to whatever pitch class has the strongest
      // absolute spectral energy.
      let score = stack;
      if (hintFreq > 0) {
        const c = Math.abs(1200 * Math.log2(f / hintFreq));
        const c2 = Math.abs(1200 * Math.log2(f / hintH2));
        const c3 = Math.abs(1200 * Math.log2(f / hintH3));
        const hintMatch = Math.min(c, c2, c3);
        if (hintMatch < 50) score *= 1.5;
      }
      if (score > bestScore) {
        bestScore = score;
        chosenFreq = f;
        if (f === hps.freq) bestSource = "hps";
        else if (f === shs.freq) bestSource = "shs";
        else if (Math.abs(f - yinFreq) / yinFreq < 0.02) bestSource = "yin";
        else bestSource = "blend";
      }
    }
  }
  // YIN refinement: at low FFT bin resolution (i.e. low freq
  // detection) the spectral peak is coarse — YIN's sub-sample
  // parabolic interpolation is much sharper. When YIN is confident
  // AND no spectral candidate agrees to within half a cent, snap to
  // YIN. Also handles cases where the spectral stack is misaligned
  // (e.g. two-octave ambiguity from strong H2).
  if (yin.clarity > 0.85) {
    const minDeltaCents =
      Math.min(
        ...[yinFreq, hps.freq, shs.freq, stackFund.freq]
          .filter((f) => f > 0)
          .map((f) => Math.abs(1200 * Math.log2(f / yinFreq))),
      );
    // With a hint, YIN only overrides when its period is within
    // 50 cents of the hinted fundamental (or its first harmonics).
    // When YIN reads a CLEARLY different pitch (e.g. the player blew
    // the wrong note), we trust YIN — the hint biases the ambiguous
    // cases, it must never hide a wrong note.
    const yinCloseToHint =
      hintFreq === 0 ||
      Math.abs(1200 * Math.log2(yinFreq / hintFreq)) < 50 ||
      Math.abs(1200 * Math.log2(yinFreq / hintH2)) < 50 ||
      Math.abs(1200 * Math.log2(yinFreq / hintH3)) < 50;
    if (minDeltaCents > 5 && (yinCloseToHint || hintFreq === 0)) {
      // Spectral estimators don't agree with YIN; clarity is high.
      // Trust YIN's sub-sample period.
      chosenFreq = yinFreq;
      bestSource = "yin";
    }
  }

  // Confidence: blend YIN clarity, spectral peak prominence,
  // harmonic-stack consistency.
  const peakProminence = specPeak.mag / (Math.max(...Array.from({ length: 32 }, (_, i) => {
    const j = specPeak.bin + i - 16;
    return j > 0 && j < fftN / 2 ? Math.sqrt(re[j] * re[j] + im[j] * im[j]) : 0;
  })) || 1);
  const yinClarity = Math.max(0, Math.min(1, yin.clarity));
  // Are YIN/HPS/SHS within a semitone of each other?
  const fset = [yinFreq, hps.freq, shs.freq];
  const fsetMax = Math.max(...fset);
  const fsetMin = Math.min(...fset);
  const agreement =
    fsetMax === 0 ? 0 : 1 - Math.min(1, Math.log2(fsetMax / fsetMin));
  const confidence = Math.max(
    0,
    Math.min(1, 0.45 * yinClarity + 0.3 * peakProminence + 0.25 * agreement),
  );

  // Reject weak estimates — caller treats freq=0 as silence.
  if (confidence < 0.3) {
    return { freq: 0, amp: maxAbs, confidence, source: bestSource };
  }

  return {
    freq: chosenFreq,
    amp: maxAbs,
    confidence,
    source: bestSource,
  };
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