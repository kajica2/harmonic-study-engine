/**
 * src/lib/composeExport.ts - PRD-001 Phase 4 Slice 4 (D80/D81).
 *
 * ADAPTER-LAND (src/lib): @tonejs/midi + midi-file imports are legal
 * here (composeMidi.ts precedent - the engine never sees either).
 *
 * COMBINED MIDI (REQ-COMP-40): one Midi track per ORIGINAL
 * NormalizedTrack (INCLUDING percussion - export is DATA, not mix:
 * D78's mixer skips drums, this writer does not) + one track per
 * generated role present in result.meta.roles. Header: ppq + tempos +
 * timeSignatures from the EFFECTIVE project (D79 - no override -> the
 * file's map preserved). Original notes export UNTRANSPOSED
 * (REQ-TRANS-3); generated notes carry their PLAN-time transpose
 * already baked (S3 D71) - export NEVER re-transposes. The extracted
 * melody is NOT a track (D78 no-double-voice).
 *
 * KEY SIGNATURES (D80, the errata-D6 landmine): @tonejs's
 * encodeKeySignature is off by +14 (verified byte-level: writes
 * indexOf+7 where the SMF signed byte is indexOf-7) - the broken path
 * is BYPASSED, not patched: header.keySignatures stays EMPTY, and
 * after the @tonejs encode the bytes go through midi-file's parseMidi,
 * spec-correct {keySignature} events are INSERTED into track 0 at the
 * right cumulative ticks, then writeMidi. If @tonejs ever fixes their
 * encoder our output is unaffected (we never wrote their bytes).
 * midi-file is a DECLARED dependency but was already in the bundle
 * via @tonejs (zero download, zero bundle delta).
 *
 * WAV FULL MIX (REQ-COMP-41, D81): renderMixGroupsSequential (600s
 * export cap) - MED-001 (S4 fix round) renders groups ONE AT A TIME
 * and free-mixes each into a mono Float32 accumulator at the CURRENT
 * computeGroupGains levels (peak = one group buffer + accumulator,
 * not 4 concurrent buffers + sum + encode) -> peak-normalize (D88:
 * divide by measured peak, clamped to <= 1.0 - never amplify) ->
 * loopWav's encodeWav (REUSED via its new export keyword - a second
 * RIFF writer would drift). Mono 44.1k 16-bit (REQ-IO-31 stereo/SR
 * selection is P2 - documented carve-out). BYTE-IDENTICAL to the old
 * parallel-sum (same job builder, same gains, same order).
 *
 * FILENAME (REQ-COMP-43): <sanitizedBase>_accomp_<Key>.<ext>, Key =
 * spellTonic(tonicPc, mode, "") of the MERGED key (the packet's
 * "spellKey" does NOT exist - flagged). chromaticFallback / no key ->
 * the key segment is OMITTED (never a fake key).
 *
 * No console outside real-failure warn arms; no any; DOM-touching
 * download helpers are F9-safe (URL.createObjectURL guarded).
 */

import { Midi } from "@tonejs/midi";
import { parseMidi, writeMidi } from "midi-file";
import { spellTonic } from "../../engine/core/spelling";
import {
  computeGroupGains,
  renderMixGroupsSequential,
  previewFullSec,
  previewFrameCount,
  PREVIEW_SAMPLE_RATE,
  type MixRenderInput,
} from "./composePreview";
import { encodeWav } from "./loopWav";
import type {
  AccompRole,
  AccompanimentResult,
  KeyCandidate,
  MixGroup,
  MixerState,
  NormalizedProject,
  TrackRoleAssignment,
} from "../../engine/compose/types";

/** D80: the export input. project is the EFFECTIVE one (D79). */
export interface ComposeExportInput {
  readonly project: NormalizedProject;
  readonly result: AccompanimentResult | null;
  readonly roles: readonly TrackRoleAssignment[];
}

/** D80 GM programs for the generated roles (documented choices:
 *  33 Electric Bass Finger - generic; 0 Acoustic Grand; 89 Pad-warm). */
export const GENERATED_GM_PROGRAM: Readonly<Record<AccompRole, number>> = {
  bass: 33,
  chords: 0,
  pad: 89,
};

const ROLE_ORDER: readonly AccompRole[] = ["bass", "chords", "pad"];

/** D81: WAV export cap (10 min) - the 90s AUDITION cap does NOT
 *  apply; the UI labels it honestly ("WAV renders up to 10:00"). */
export const EXPORT_CAP_SEC = 600;

// ---------------------------------------------------------------------------
// SMF key-signature table (D80)
// ---------------------------------------------------------------------------

/** sf by canonical MAJOR tonic name (circle of fifths, SMF range
 *  [-7, 7]). */
const MAJOR_SF: Readonly<Record<string, number>> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7,
  F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
};

/** sf by canonical MINOR tonic name (= major sf of the relative
 *  tonic, derived per D80). */
const MINOR_SF: Readonly<Record<string, number>> = {
  Am: 0, Em: 1, Bm: 2, "F#m": 3, "C#m": 4, "G#m": 5, "D#m": 6, "A#m": 7,
  Dm: -1, Gm: -2, Cm: -3, Fm: -4, Bbm: -5, Ebm: -6, Abm: -7,
};

/**
 * SMF sf byte for a (pc, mode) pair, spelled via the repo's canonical
 * tables (spellTonic - fewest accidentals, ties flat major / sharp
 * minor). Returns null for out-of-domain input (defensive - the
 * canonical 24 are ALL in [-7, 7]; theoretical keys like Gb minor
 * (-9) are unreachable through spellTonic, and an unknown name
 * SKIPS the event: documented degradation, SMF sf is [-7, 7]).
 */
export function keySignatureSf(tonicPc: number, mode: "major" | "minor"): number | null {
  if (!Number.isInteger(tonicPc) || tonicPc < 0 || tonicPc > 11) return null;
  const name = spellTonic(tonicPc, mode, "");
  return (mode === "major" ? MAJOR_SF : MINOR_SF)[mode === "major" ? name : `${name}m`] ?? null;
}

// ---------------------------------------------------------------------------
// keySig EVENT INSERTION (D80 - the broken-encoder bypass)
// ---------------------------------------------------------------------------

interface KeySigEventSpec {
  readonly tick: number;
  readonly sf: number;
  readonly scale: 0 | 1;
}

type MidiFileEvent = { deltaTime: number; type: string; meta?: boolean; [key: string]: unknown };

/**
 * Insert spec keySig events into track 0 of an already-encoded file,
 * walking cumulative deltaTime. A keySig at tick T lands AFTER all
 * events that start at T (tick-0 sigs therefore sit among the
 * leading meta block, before the first advancing event) with
 * deltaTime = T - cumBefore and the following event's deltaTime
 * reduced accordingly. Never inserts after endOfTrack.
 */
export function insertKeySignatureEvents(
  bytes: Uint8Array,
  specs: readonly KeySigEventSpec[],
): Uint8Array {
  if (specs.length === 0) return bytes;
  const parsed = parseMidi(bytes);
  const events = parsed.tracks[0] as unknown as MidiFileEvent[];
  for (const spec of specs) {
    insertOne(events, spec);
  }
  return new Uint8Array(writeMidi(parsed));
}

function insertOne(events: MidiFileEvent[], spec: KeySigEventSpec): void {
  let cum = 0;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === "endOfTrack") {
      // Never key the end of the track: clamp the insertion before it.
      events.splice(i, 0, {
        meta: true,
        type: "keySignature",
        key: spec.sf,
        scale: spec.scale,
        deltaTime: Math.max(0, spec.tick - cum),
      });
      return;
    }
    if (cum + e.deltaTime > spec.tick) {
      const delta = spec.tick - cum;
      e.deltaTime -= delta;
      events.splice(i, 0, {
        meta: true,
        type: "keySignature",
        key: spec.sf,
        scale: spec.scale,
        deltaTime: delta,
      });
      return;
    }
    cum += e.deltaTime;
  }
  // tick past every event: no insertion (defensive - normalize keeps
  // keySigs inside endTick).
}

// ---------------------------------------------------------------------------
// MIDI build + encode (D80)
// ---------------------------------------------------------------------------

/** Deterministic ascending channel pick: first UNUSED of 0..15,
 *  skipping 9 (GM drums) for the non-percussion generated roles. */
function pickChannel(used: Set<number>): number {
  for (let c = 0; c <= 15; c++) {
    if (c === 9) continue;
    if (!used.has(c)) {
      used.add(c);
      return c;
    }
  }
  return 0; // unreachable: 15 candidates > 16-9-|used|
}

/** Build the combined @tonejs Midi (pure-aside-from-lib). */
export function buildCombinedMidiJson(input: ComposeExportInput): Midi {
  const { project, result } = input;
  const midi = new Midi();
  midi.header.name = project.name;
  for (const t of project.tempos) {
    midi.header.tempos.push({ ticks: t.tick, bpm: t.bpm });
  }
  for (const ts of project.timeSignatures) {
    midi.header.timeSignatures.push({
      ticks: ts.tick,
      timeSignature: [ts.numerator, ts.denominator],
    });
  }
  // header.keySignatures LEFT EMPTY on purpose (D80: the broken
  // encoder path is never fed; the real sigs ride the insertion below).

  const used = new Set<number>();
  for (const tr of project.tracks) {
    const mt = midi.addTrack();
    mt.name = tr.name;
    mt.channel = tr.channel;
    mt.instrument.number = tr.program >= 0 && tr.program <= 127 ? tr.program : 0;
    used.add(tr.channel);
    for (const n of tr.notes) {
      mt.addNote({
        midi: n.midi,
        ticks: n.tick,
        durationTicks: n.durationTicks,
        velocity: n.velocity,
      });
    }
  }
  if (result !== null) {
    for (const role of ROLE_ORDER) {
      if (!result.meta.roles.includes(role)) continue;
      const notes = result.generated[role];
      const mt = midi.addTrack();
      mt.name = `accomp-${role}`;
      mt.channel = pickChannel(used);
      mt.instrument.number = GENERATED_GM_PROGRAM[role];
      for (const n of notes) {
        mt.addNote({
          midi: n.midi,
          ticks: n.tick,
          durationTicks: n.durationTicks,
          velocity: n.velocity,
        });
      }
    }
  }
  return midi;
}

/** Encode the combined MIDI: @tonejs bytes -> midi-file pass that
 *  (1) fixes the header division to the PROJECT ppq (@tonejs's Header
 *  .ppq is getter-only - 480 is what its encoder would otherwise
 *  stamp; tick VALUES are absolute so a header-field rewrite is all
 *  that is needed) and (2) inserts the spec-correct keySig events. */
export function encodeComposeMidi(input: ComposeExportInput): Uint8Array {
  const { project } = input;
  const raw = new Uint8Array(buildCombinedMidiJson(input).toArray());
  const specs: KeySigEventSpec[] = [];
  for (const ks of project.keySignatures) {
    const sf = keySignatureSf(ks.tonicPc, ks.mode);
    if (sf === null) continue; // documented degradation (D80)
    specs.push({ tick: ks.tick, sf, scale: ks.mode === "major" ? 0 : 1 });
  }
  const withKeys = insertKeySignatureEvents(raw, specs);
  if (project.ppq === 480) return withKeys;
  const parsed = parseMidi(withKeys);
  parsed.header.ticksPerBeat = project.ppq;
  return new Uint8Array(writeMidi(parsed));
}

// ---------------------------------------------------------------------------
// Filenames + downloads (REQ-COMP-43, D81)
// ---------------------------------------------------------------------------

/** REQ-COMP-43: <sanitizedBase>_accomp[_<Key>].<ext>. key=null
 *  (chromaticFallback / no key) OMITS the key segment (never a fake
 *  key). Sanitize: strip [\\/:*?"<>|], collapse whitespace to "_". */
export function composeExportFilename(
  base: string,
  key: KeyCandidate | null,
  ext: string,
): string {
  const sanitized = base
    .replace(/[\\/:*?"<>|]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  const keySeg = key === null ? "" : `_${spellTonic(key.tonicPc, key.mode, "")}`;
  return `${sanitized}_accomp${keySeg}.${ext}`;
}

/** project.fileName minus its extension; chart sessions ("chart.mid"
 *  synthetic) yield "chart" (D80). */
export function exportBaseName(fileName: string): string {
  return fileName.replace(/\.(mid|midi)$/i, "");
}

/** D81: downloadBlob folded in here (composeDownload.ts would be a
 *  one-function file - file-count honesty). createObjectURL + anchor
 *  + revoke (loopWav.downloadWavFromBlob pattern, generalized). */
export function downloadBlob(blob: Blob, name: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Download the combined MIDI (bytes -> Blob). */
export function downloadComposeMidi(input: ComposeExportInput, key: KeyCandidate | null): void {
  const bytes = encodeComposeMidi(input);
  const name = composeExportFilename(
    exportBaseName(input.project.fileName),
    key,
    "mid",
  );
  downloadBlob(new Blob([bytes.slice().buffer as ArrayBuffer], { type: "audio/midi" }), name);
}

// ---------------------------------------------------------------------------
// WAV full mix (D81)
// ---------------------------------------------------------------------------

/**
 * MED-001 (S4 fix round): the SINGLE accumulation primitive - add one
 * group's channel-0 data into `accumulator` scaled by `gain` (zero
 * gain is a no-op). Shared by mixGroupBuffers (pure sum, node-tested)
 * AND the sequential export path so the two can never drift.
 */
export function accumulateGroupInto(
  accumulator: Float32Array,
  buf: AudioBuffer,
  gain: number,
): void {
  if (gain === 0) return;
  const data = buf.getChannelData(0);
  const n = Math.min(data.length, accumulator.length);
  for (let i = 0; i < n; i++) accumulator[i] += data[i] * gain;
}

/**
 * D81/D88 PURE sum: group buffers -> one mono Float32 at the given
 * gains (the renderMixGroups buffers already carry the 0.9 master;
 * summing at computeGroupGains levels IS "one destination with the
 * current mixer gains baked"). Exported for node tests (fake buffers).
 * The PRODUCTION export path uses the sequential accumulator instead
 * (MED-001) but routes through the SAME accumulateGroupInto.
 */
export function mixGroupBuffers(
  groups: Partial<Record<MixGroup, AudioBuffer>>,
  gains: Readonly<Record<MixGroup, number>>,
): Float32Array {
  let len = 0;
  for (const group of ["original", "bass", "chords", "pad"] as const) {
    const buf = groups[group];
    if (buf !== undefined && buf.length > len) len = buf.length;
  }
  const out = new Float32Array(len);
  for (const group of ["original", "bass", "chords", "pad"] as const) {
    const buf = groups[group];
    if (buf === undefined) continue;
    accumulateGroupInto(out, buf, gains[group]);
  }
  return out;
}

/**
 * D88 PURE normalize: divide by the measured peak, CLAMPED to <= 1.0
 * (never amplify - a quiet mix stays quiet; a hot dense mix stops
 * clipping). All-zero stays zero.
 */
export function normalizePeak(samples: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  if (peak <= 1 || peak === 0) return samples;
  const scale = 1 / peak;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * scale;
  return out;
}

/**
 * REQ-COMP-41: render + download the full-mix WAV at the CURRENT
 * mixer gains (600s cap, mono 44.1k 16-bit).
 *
 * MED-001 (S4 fix round): SEQUENTIAL render + free-into-accumulator.
 * The old path (renderMixGroups -> 4 CONCURRENT OfflineAudioContexts
 * -> mixGroupBuffers sum -> normalize -> encode) peaked at ~423MB of
 * group buffers + a ~106MB sum + the encode AT THE 600s CAP. This
 * path renders ONE group at a time and mixes each buffer into the
 * accumulator before the next context is even constructed: peak =
 * ONE group buffer (~106MB) + the accumulator (~106MB) - and the
 * accumulator IS the pre-allocated sum, so no second pass. Output
 * bytes are IDENTICAL (same job builder, same gains, same order).
 */
export async function exportComposeWav(
  input: MixRenderInput,
  mixer: MixerState,
  hasOriginal: boolean,
  key: KeyCandidate | null,
): Promise<void> {
  const gains = computeGroupGains(mixer, hasOriginal);
  // Every group buffer carries EXACTLY this length (renderOneGroup
  // sizes all four from the same project/endTick/capSec - one truth).
  const renderSec = Math.min(previewFullSec(input.project, input.endTick), EXPORT_CAP_SEC);
  const accumulator = new Float32Array(previewFrameCount(renderSec));
  await renderMixGroupsSequential(input, EXPORT_CAP_SEC, (group, buf) => {
    accumulateGroupInto(accumulator, buf, gains[group]);
  });
  const mixed = normalizePeak(accumulator);
  const blob = encodeWav(mixed, PREVIEW_SAMPLE_RATE);
  const name = composeExportFilename(exportBaseName(input.project.fileName), key, "wav");
  downloadBlob(blob, name);
}
