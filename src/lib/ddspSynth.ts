/**
 * Client for the DDSP synthesis + FX backend server.
 *
 * The server exposes two endpoints:
 *   POST /synthesize  – generate chord-progression WAV from MIDI notes
 *                       (DDSP harmonic synth, no FX)
 *   POST /fx/reverb   – take an uploaded WAV and return it with DDSP
 *                       reverb applied
 *
 * Both are reachable on the same FastAPI process.
 *
 * The base URL is read from `VITE_DDSP_API` at build time. When unset
 * (dev / preview / no backend), it falls back to the local Python
 * backend on the developer's machine: http://127.0.0.1:8765.
 */

const DEFAULT_BACKEND = "http://127.0.0.1:8765";
export const DDSP_SERVER: string =
  (import.meta.env.VITE_DDSP_API as string | undefined)?.replace(/\/$/, "") ||
  DEFAULT_BACKEND;

export interface DDSPStatus {
  running: boolean;
  version: string;
}

export async function checkDDSPStatus(): Promise<DDSPStatus> {
  try {
    const res = await fetch(`${DDSP_SERVER}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { running: false, version: "" };
    const data = await res.json();
    return { running: true, version: data.ddsp_version };
  } catch {
    return { running: false, version: "" };
  }
}

export interface FxReverbParams {
  decay_sec?: number;
  brightness?: number; // 0..1
  dry_wet?: number;    // 0..1
  seed?: number;
}

/**
 * Send chord progression to the DDSP server, receive WAV audio,
 * and play it immediately. Returns a promise that resolves when
 * playback ends.
 *
 * NOTE: this remains as the synth endpoint. Real-time playback
 * for chord progression stays Web Audio (audioEngine) — DDSP is
 * used only as an offline render/FX path.
 */
export async function synthesizeAndPlay(
  chordNotes: number[][],
  chordDuration: number = 2.0,
): Promise<void> {
  const res = await fetch(`${DDSP_SERVER}/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chord_notes: chordNotes, chord_duration: chordDuration }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown error");
    throw new Error(`DDSP server error (${res.status}): ${text}`);
  }

  const blob = await res.blob();
  const arrayBuffer = await blob.arrayBuffer();

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (audioCtx.state === "suspended") await audioCtx.resume();

  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioCtx.destination);
  source.start(0);

  return new Promise((resolve) => {
    source.onended = () => resolve();
  });
}

/**
 * Apply DDSP reverb to a WAV blob (e.g. a recorded performance or
 * a synthesized chord progression). Returns the processed WAV as a Blob.
 */
export async function applyReverbToWav(
  wavBlob: Blob,
  params: FxReverbParams = {},
): Promise<Blob> {
  const fd = new FormData();
  fd.append("audio", wavBlob, "input.wav");
  if (params.decay_sec !== undefined) fd.append("decay_sec", String(params.decay_sec));
  if (params.brightness !== undefined) fd.append("brightness", String(params.brightness));
  if (params.dry_wet !== undefined) fd.append("dry_wet", String(params.dry_wet));
  if (params.seed !== undefined) fd.append("seed", String(params.seed));

  const res = await fetch(`${DDSP_SERVER}/fx/reverb`, {
    method: "POST",
    body: fd,
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown error");
    throw new Error(`DDSP FX error (${res.status}): ${text}`);
  }
  return res.blob();
}

/**
 * Helper: convert an AudioBuffer to a WAV-formatted Blob so it can be
 * round-tripped through the DDSP server (which expects 16-bit PCM WAV).
 */
export function audioBufferToWavBlob(audioBuffer: AudioBuffer): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const numSamples = audioBuffer.length;

  // Interleave channels
  const interleaved = new Float32Array(numSamples * numChannels);
  for (let ch = 0; ch < numChannels; ch++) {
    const chData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < numSamples; i++) {
      interleaved[i * numChannels + ch] = chData[i];
    }
  }
  // Convert to 16-bit PCM
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = interleaved.length * bytesPerSample;
  const headerSize = 44;
  const out = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(out);

  let offset = 0;
  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i));
  };
  const u32 = (v: number) => { view.setUint32(offset, v, true); offset += 4; };
  const u16 = (v: number) => { view.setUint16(offset, v, true); offset += 2; };

  writeStr("RIFF");
  u32(36 + dataSize);
  writeStr("WAVE");
  writeStr("fmt ");
  u32(16);
  u16(1);              // PCM
  u16(numChannels);
  u32(sampleRate);
  u32(byteRate);
  u16(blockAlign);
  u16(16);
  writeStr("data");
  u32(dataSize);
  for (let i = 0; i < interleaved.length; i++) {
    let s = Math.max(-1, Math.min(1, interleaved[i]));
    s = s < 0 ? s * 32768 : s * 32767;
    view.setInt16(offset, s | 0, true);
    offset += 2;
  }
  return new Blob([out], { type: "audio/wav" });
}
