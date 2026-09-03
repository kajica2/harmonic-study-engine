/**
 * Offline path-to-WAV renderer using OfflineAudioContext.
 *
 * Reuses the same oscillator+envelope+filter chain from lib/audio.ts but
 * in a non-realtime context, so the result is exactly what you'd hear
 * at the active tempo with the active instrument, no backend required.
 *
 * Output is a 16-bit mono PCM WAV blob.
 */

import { HarmonicPath } from "./paths";
import { InstrumentType } from "./audio";

const SAMPLE_RATE = 44100;

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const n = samples.length;
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = n * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  let o = 0;
  writeStr(o, "RIFF"); o += 4;
  view.setUint32(o, 36 + dataSize, true); o += 4;
  writeStr(o, "WAVE"); o += 4;
  writeStr(o, "fmt "); o += 4;
  view.setUint32(o, 16, true); o += 4;
  view.setUint16(o, 1, true); o += 2;       // PCM
  view.setUint16(o, 1, true); o += 2;       // mono
  view.setUint32(o, sampleRate, true); o += 4;
  view.setUint32(o, byteRate, true); o += 4;
  view.setUint16(o, blockAlign, true); o += 2;
  view.setUint16(o, 16, true); o += 2;        // bits per sample
  writeStr(o, "data"); o += 4;
  view.setUint32(o, dataSize, true); o += 4;

  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const v = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
    view.setInt16(o, v, true); o += 2;
  }
  return new Blob([buf], { type: "audio/wav" });
}

/**
 * One chord -> a small offline renderer that tracks the active instrument.
 * Mirrors the ADSR / filter characteristics of `audioEngine` for the
 * most common instruments (sine / pad / epiano / trumpet). For unknown
 * instruments falls back to a warm-pad shape.
 */
function scheduleChord(
  ctx: OfflineAudioContext,
  out: AudioNode,
  midis: number[],
  startSec: number,
  durSec: number,
  instrument: InstrumentType,
) {
  if (!midis.length) return;
  // Trim midis to a reasonable register: clamp to 3 octaves from middle C
  const sorted = [...midis].sort((a, b) => a - b);
  const clamp = (n: number) => Math.max(36, Math.min(84, n));
  const tones = sorted.map(clamp);

  // Master compressor / reverb-ish lite damping per chord
  const chordGain = ctx.createGain();
  chordGain.gain.setValueAtTime(0.001, startSec);
  chordGain.connect(out);

  // Slightly stretch release across the bar so chords ring into each other
  const release = Math.min(1.2, durSec * 0.7);
  const sustainLevel =
    instrument === "pad" ? 0.28 : instrument === "epiano" ? 0.32 : 0.4;

  // ADSR per instrument
  if (instrument === "sine") {
    chordGain.gain.exponentialRampToValueAtTime(0.5, startSec + 0.04);
    chordGain.gain.exponentialRampToValueAtTime(sustainLevel, startSec + 0.4);
    chordGain.gain.exponentialRampToValueAtTime(0.001, startSec + durSec + release);
  } else if (instrument === "pad") {
    chordGain.gain.exponentialRampToValueAtTime(0.32, startSec + 0.3);
    chordGain.gain.exponentialRampToValueAtTime(0.22, startSec + 0.8);
    chordGain.gain.exponentialRampToValueAtTime(0.001, startSec + durSec + release);
  } else {
    // epiano / trumpet / pluck / others — punchy attack
    chordGain.gain.exponentialRampToValueAtTime(
      instrument === "trumpet" ? 0.45 : 0.35,
      startSec + 0.02,
    );
    chordGain.gain.exponentialRampToValueAtTime(sustainLevel, startSec + 0.6);
    chordGain.gain.exponentialRampToValueAtTime(0.001, startSec + durSec + release);
  }

  for (const midi of tones) {
    const freq = midiToFreq(midi);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 1.5;
    filter.frequency.setValueAtTime(
      Math.min(8000, freq * 3),
      startSec,
    );
    filter.connect(chordGain);

    if (instrument === "pad") {
      // Two detuned saws for richness
      const o1 = ctx.createOscillator();
      o1.type = "sawtooth";
      o1.frequency.value = freq * 0.995;
      o1.connect(filter);
      o1.start(startSec);
      o1.stop(startSec + durSec + release);

      const o2 = ctx.createOscillator();
      o2.type = "sawtooth";
      o2.frequency.value = freq * 1.005;
      o2.connect(filter);
      o2.start(startSec);
      o2.stop(startSec + durSec + release);
    } else if (instrument === "sine") {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(filter);
      osc.start(startSec);
      osc.stop(startSec + durSec + release);
    } else {
      // Default: triangle for warm piano-ish voice
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      osc.connect(filter);
      osc.start(startSec);
      osc.stop(startSec + durSec + release);

      // Add a quieter octave-up harmonic on voices above the bass for body
      if (midi !== tones[0]) {
        const harm = ctx.createOscillator();
        harm.type = "sine";
        harm.frequency.value = freq * 2;
        const harmGain = ctx.createGain();
        harmGain.gain.setValueAtTime(0.15, 0);
        harm.connect(harmGain);
        harmGain.connect(filter);
        harm.start(startSec);
        harm.stop(startSec + durSec + release);
      }
    }
  }
}

/**
 * Beats per bar from a meter string like "4/4" / "6/8" / "7/8" / "11/4".
 * Falls back to 4 beats/bar if the value is unrecognised.
 */
export function beatsPerBar(meter: string): number {
  const m = /^(\d+)\//.exec(meter);
  if (!m) return 4;
  const n = parseInt(m[1], 10);
  if (Number.isFinite(n) && n > 0) return n;
  return 4;
}

/**
 * Render shapes for the loop WAV export.
 *  - block:           every chord as one block (sustained for the full bar).
 *  - arp:             every chord broken into a sweeping arpeggio.
 *  - block_then_arp:  alternate block / arp per bar — useful as a study pattern.
 *  - mono:            each chord collapses to its top voice, played as a
 *                     single sustained note for the full bar. Useful for
 *                     melodic practice over a backing track.
 */
export type RenderMode = "block" | "arp" | "block_then_arp" | "mono";

/**
 * Arpeggio version of `scheduleChord`: rather than ringing the chord as
 * a single block, we play each note individually in sequence across the
 * bar, then ring the highest note as the bar's "landing." This makes the
 * WAV export useful for ear-training / melodic-practice as well as just
 * auditioning the harmony.
 */
function scheduleArpeggio(
  ctx: OfflineAudioContext,
  out: AudioNode,
  midis: number[],
  startSec: number,
  durSec: number,
  instrument: InstrumentType,
) {
  if (!midis.length) return;
  const sorted = [...midis].sort((a, b) => a - b);
  const tones = sorted.map((n) => Math.max(36, Math.min(84, n)));

  // Up-and-down sweep: bass → top → bass → top
  const seq: number[] = [];
  const step = durSec / Math.max(8, tones.length * 2 + 2);
  for (const m of tones) seq.push(m);
  for (let i = tones.length - 2; i > 0; i--) seq.push(tones[i]);
  seq.push(tones[0]);

  // Each note is a short envelope with quick attack and a small breath.
  seq.forEach((midi, i) => {
    const noteStart = startSec + i * step;
    const noteDur = step * 1.2;
    scheduleSingleNote(ctx, out, midi, noteStart, noteDur, instrument, 0.55);
  });

  // Ring the top note across the rest of the bar so we land cleanly into
  // the next chord — gives the file a continuous texture even in arp mode.
  const top = tones[tones.length - 1];
  const restStart = startSec + seq.length * step;
  const restDur = durSec - seq.length * step;
  if (restDur > 0.05) {
    scheduleSingleNote(ctx, out, top, restStart, restDur, instrument, 0.45);
  }
}

function scheduleSingleNote(
  ctx: OfflineAudioContext,
  out: AudioNode,
  midi: number,
  startSec: number,
  durSec: number,
  instrument: InstrumentType,
  peak: number,
) {
  const freq = midiToFreq(midi);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 1.5;
  filter.frequency.setValueAtTime(Math.min(8000, freq * 3), startSec);
  filter.connect(out);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.001, startSec);
  env.gain.exponentialRampToValueAtTime(peak, startSec + 0.02);
  env.gain.exponentialRampToValueAtTime(0.001, startSec + durSec);
  env.connect(filter);

  const osc = ctx.createOscillator();
  osc.type = instrument === "pad" ? "sawtooth" : instrument === "sine" ? "sine" : "triangle";
  osc.frequency.value = freq;
  osc.connect(env);
  osc.start(startSec);
  osc.stop(startSec + durSec);
}

/**
 * Monophonic version: each chord collapses to its highest note, played
 * as a single sustained tone that fills the full bar. Lets a player
 * practice a melody on top of a single-note backing track that
 * outlines the chord changes. The note sustains to the end of the
 * bar with a short release tail (~25% of the bar) so the next bar
 * starts cleanly without overlap.
 */
function scheduleTopVoice(
  ctx: OfflineAudioContext,
  out: AudioNode,
  midis: number[],
  startSec: number,
  durSec: number,
  instrument: InstrumentType,
) {
  if (!midis.length) return;
  const top = Math.min(84, Math.max(36, Math.max(...midis)));

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(
    Math.min(8000, midiToFreq(top) * 4),
    startSec,
  );
  filter.connect(out);

  const env = ctx.createGain();
  // Full sustain across the bar, then release in the last 25%.
  // The release completes right at the bar boundary so the next
  // chord's attack lands on a clean signal — no overlapping tails.
  const release = Math.min(0.3, durSec * 0.25);
  const sustainDur = durSec - release;
  env.gain.setValueAtTime(0.001, startSec);
  env.gain.exponentialRampToValueAtTime(0.5, startSec + 0.04);
  env.gain.setValueAtTime(0.5, startSec + sustainDur);
  env.gain.exponentialRampToValueAtTime(0.001, startSec + durSec);
  env.connect(filter);

  const osc = ctx.createOscillator();
  osc.type =
    instrument === "pad" ? "sawtooth" : instrument === "sine" ? "sine" : "triangle";
  osc.frequency.value = midiToFreq(top);
  osc.connect(env);
  osc.start(startSec);
  osc.stop(startSec + durSec + 0.05);
}

/**
 * Render the entire path to a single mono WAV Blob.
 * Tempo → seconds-per-beat. Meter → beats-per-bar. Each chord occupies
 * exactly one bar. A 1-second tail is appended so the reverb release
 * doesn't get truncated on the final chord.
 */
export async function renderPathToWav(
  path: HarmonicPath,
  opts: {
    tempo?: number;
    instrument?: InstrumentType;
    sampleRate?: number;
    meter?: string;
    mode?: RenderMode;
  } = {},
): Promise<Blob> {
  const tempo = opts.tempo ?? 80;
  const instrument = opts.instrument ?? "epiano";
  const sampleRate = opts.sampleRate ?? SAMPLE_RATE;
  const meter = opts.meter ?? "4/4";
  const mode: RenderMode = opts.mode ?? "block";
  const beats = beatsPerBar(meter);
  const secPerBeat = 60 / tempo;
  const secPerBar = secPerBeat * beats;

  const totalSeconds = path.steps.length * secPerBar + 1; // +1s tail for reverb fade
  const numChannels = 1;
  const length = Math.ceil(totalSeconds * sampleRate);
  const ctx = new OfflineAudioContext(
    numChannels,
    length,
    sampleRate,
  );

  // Master bus: gentle limiter so a 4-note chord doesn't clip.
  const master: DynamicsCompressorNode = ctx.createDynamicsCompressor();
  master.threshold.value = -10;
  master.knee.value = 6;
  master.ratio.value = 4;
  master.attack.value = 0.01;
  master.release.value = 0.2;
  master.connect(ctx.destination);

  // Render every step as a one-bar event at the bar boundary.
  // Block + arp paths run the chord for the FULL bar; the envelope
  // inside scheduleChord includes its own release tail that may
  // bleed slightly into the next bar — that's the "ring out"
  // effect, not silence. The previous version passed secPerBar * 0.9
  // which left a literal gap of silence in the last 10% of each bar.
  path.steps.forEach((step, i) => {
    const startSec = i * secPerBar;
    if (mode === "mono") {
      scheduleTopVoice(
        ctx,
        master as unknown as AudioNode,
        step.notes,
        startSec,
        secPerBar,
        instrument,
      );
      return;
    }
    const useArp =
      mode === "arp" ||
      (mode === "block_then_arp" && i % 2 === 1);
    if (useArp) {
      scheduleArpeggio(
        ctx,
        master as unknown as AudioNode,
        step.notes,
        startSec,
        secPerBar,
        instrument,
      );
    } else {
      scheduleChord(
        ctx,
        master as unknown as AudioNode,
        step.notes,
        startSec,
        secPerBar,
        instrument,
      );
    }
  });

  const rendered = await ctx.startRendering();
  // Pull mono channel data and feed to the WAV encoder
  const channels = [rendered.getChannelData(0)];
  if (rendered.numberOfChannels > 1) channels.push(rendered.getChannelData(1));
  const maxLen = Math.max(...channels.map((c) => c.length));
  const mono = new Float32Array(maxLen);
  for (let i = 0; i < maxLen; i++) {
    let sum = 0;
    for (const c of channels) sum += c[i] ?? 0;
    mono[i] = sum / channels.length;
  }
  return encodeWav(mono, sampleRate);
}

export function downloadWavFromBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
