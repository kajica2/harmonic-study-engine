#!/usr/bin/env node
/**
 * scripts/_debug_pitch.ts — interactive detector inspector. Calls
 * detectPitch on a battery of trumpet signals and prints each
 * estimator's vote + chosen frequency. Used to chase future
 * regression cases by running a single block through every step.
 *
 * Run with: npx tsx scripts/_debug_pitch.ts [test name]
 *   no arg   -> run all 10 cases
 *   "a4"     -> only A4
 *   "bb3"    -> only Bb3 pedal
 *   "h1weak" -> only A4 with H1 weak
 */

import { detectPitch } from "../src/lib/trumpetTuner";

const SR = 44100;

function trumpetStack(
  freq: number,
  durationMs: number,
  amps: number[] = [1.0, 0.55, 0.3, 0.18, 0.1],
): Float32Array {
  const N = Math.floor((durationMs / 1000) * SR);
  const block = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let v = 0;
    for (let h = 0; h < amps.length; h++) {
      v += amps[h] * Math.sin(2 * Math.PI * freq * (h + 1) * (i / SR));
    }
    block[i] = v * 0.3;
  }
  return block;
}

function noise(): Float32Array {
  const N = SR;
  const block = new Float32Array(N);
  let x = 1;
  for (let i = 0; i < N; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    block[i] = ((x / 0x7fffffff) - 0.5) * 0.005;
  }
  return block;
}

function run(label: string, freq: number, block: Float32Array): void {
  const est = detectPitch(block, SR);
  const cents = freq > 0 ? (1200 * Math.log2(est.freq / freq)).toFixed(2) : "n/a";
  // Bb label: "OK" if within ±5 cents, "WARN" if within ±15,
  // "FAIL" if off by more or wrong octave.
  let verdict = "OK";
  if (freq > 0 && est.freq > 0) {
    const absCents = Math.abs(1200 * Math.log2(est.freq / freq));
    const ratio = est.freq / freq;
    if (absCents > 15 || ratio < 0.7 || ratio > 1.5) verdict = "FAIL";
    else if (absCents > 5) verdict = "WARN";
  }
  console.log(
    `[${verdict}] ${label.padEnd(28)} freq=${est.freq.toFixed(2).padStart(8)}Hz ` +
      `(target=${freq}Hz, ${cents}c) conf=${est.confidence.toFixed(3)} src=${est.source}`,
  );
}

const filter = (process.argv[2] || "").toLowerCase();
function match(label: string): boolean {
  if (!filter) return true;
  return label.toLowerCase().includes(filter);
}

if (match("A4 pure")) {
  const N = 4096;
  const block = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    block[i] = 0.4 * Math.sin(2 * Math.PI * 440 * (i / SR));
  }
  run("A4 pure sine", 440, block);
}

if (match("Bb3 pedal stack")) {
  run("Bb3 pedal stack", 233.08, trumpetStack(233.08, 200));
}

if (match("A4 stack H1 weak")) {
  run(
    "A4 stack H1 weak",
    440,
    trumpetStack(440, 150, [0.3, 1.0, 0.6, 0.3, 0.15]),
  );
}

if (match("F#5 high brass")) {
  run("F#5 high brass", 740, trumpetStack(740, 100));
}

if (match("C6 altissimo")) {
  run("C6 altissimo", 1046.5, trumpetStack(1046.5, 100));
}

if (match("G#3 with noise")) {
  const signal = trumpetStack(415.3, 200);
  const n = noise();
  for (let i = 0; i < signal.length; i++) signal[i] += n[i % n.length];
  run("G#3 + noise", 415.3, signal);
}

if (match("D4 with dropouts")) {
  const block = trumpetStack(293.66, 200);
  for (let i = 0; i < block.length; i += 200) {
    if (i % 400 === 0) block[i] = 0;
  }
  run("D4 with dropouts", 293.66, block);
}

if (match("Bb4 long")) {
  run("Bb4 long", 466.16, trumpetStack(466.16, 1000));
}

if (match("silence")) {
  run("silence", 0, new Float32Array(SR));
}

if (match("noise")) {
  run("white noise", 0, noise());
}
// Realistic trumpet envelope: attack ramp + sustained plateau
function trumpetWithEnvelope(
  freq: number,
  durationMs: number,
  amps: number[] = [1.0, 0.55, 0.3, 0.18, 0.1],
): Float32Array {
  const N = Math.floor((durationMs / 1000) * SR);
  const block = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    // Envelope: attack 30ms, decay 50ms, sustain 0.6, release 100ms.
    let env = 0;
    if (t < 0.03) env = t / 0.03;
    else if (t < 0.08) env = 1 - 0.4 * ((t - 0.03) / 0.05);
    else if (t < (durationMs / 1000) - 0.1) env = 0.6;
    else
      env = 0.6 *
        Math.max(0, 1 - (t - (durationMs / 1000 - 0.1)) / 0.1);
    let v = 0;
    for (let h = 0; h < amps.length; h++) {
      v += amps[h] * Math.sin(2 * Math.PI * freq * (h + 1) * t);
    }
    block[i] = v * env * 0.4;
  }
  return block;
}

if (match("Bb3 ADSR") || filter === "") {
  // ADSR-shaped Bb3 — what a real trumpet sounds like
  run("Bb3 ADSR envelope", 233.08, trumpetWithEnvelope(233.08, 400));
}
if (match("F#4 ADSR")) {
  run("F#4 ADSR envelope", 370, trumpetWithEnvelope(370, 300));
}
if (match("D5 ADSR")) {
  run("D5 ADSR envelope", 587.33, trumpetWithEnvelope(587.33, 300));
}
