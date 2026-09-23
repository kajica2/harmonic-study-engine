/**
 * engine/compose/normalize.ts - PRD-001 Phase 4 Slice 1 (D46,
 * REQ-COMP-2/3/50).
 *
 * normalizeMidiJson(json, fileName): the SINGLE choke point that turns
 * the plain-JSON @tonejs/midi DTO into a validated NormalizedProject.
 * Every SMF quirk is handled here so no other module re-litigates the
 * parser's quirks. Returns an Outcome - it never throws (REQ-COMP-15).
 *
 * Velocity is pinned 0..1 (X4); ticks are absolute and notes sorted
 * ascending; out-of-range pitches are dropped (counted, warned);
 * durationTicks clamped >= 1. Null / non-object track + note entries
 * (hostile hand-built DTOs) fail the parseFailed arm, never throw.
 * Percussion-only is NOT a noNotes error (REQ-COMP-51) - only a total
 * absence of notes is.
 *
 * Purity: relative imports only, no clock, no randomness, no console.
 */

import { parseKey } from "../core/spelling";
import { ticksToSeconds } from "./tempo";
import type {
  AnalysisErrorCode,
  MidiJsonLike,
  NormalizedNote,
  NormalizedProject,
  NormalizedTrack,
  Outcome,
  ProjectKeySignature,
  ProjectTempo,
  ProjectTimeSignature,
} from "./types";

/** Defensive note-count ceiling (the 30MB byte cap lives in the
 *  adapter, REQ-COMP-1; this guards a pathological dense-but-small file). */
export const MAX_NOTES = 200_000;

const VALID_DENOMS: ReadonlySet<number> = new Set([1, 2, 4, 8, 16, 32]);

function fail<T>(code: AnalysisErrorCode, message: string): Outcome<T> {
  return { ok: false, error: { code, message } };
}

/**
 * Resolve a stored denominator. @tonejs/midi's midi-file parser ALREADY
 * converts the SMF power-of-two CODE to the real value (`1 << code`),
 * so a real DTO carries 1/2/4/8/16/32 and passes straight through. A
 * hand-built DTO may still carry the raw code (e.g. 3 => eighth); those
 * convert. Anything else is nonsense -> null (caller defaults to 4).
 */
function realDenominator(raw: number): number | null {
  if (!Number.isInteger(raw) || raw < 0) return null;
  if (VALID_DENOMS.has(raw)) return raw; // already real (the @tonejs case)
  const asCode = 1 << raw; // interpret as the raw SMF code
  return VALID_DENOMS.has(asCode) ? asCode : null;
}

function clampInt(v: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  const r = Math.round(v);
  return r < lo ? lo : r > hi ? hi : r;
}

export function normalizeMidiJson(
  json: MidiJsonLike,
  fileName: string,
): Outcome<NormalizedProject> {
  if (
    json === null ||
    typeof json !== "object" ||
    typeof json.header !== "object" ||
    json.header === null ||
    !Array.isArray(json.tracks)
  ) {
    return fail<NormalizedProject>("parseFailed", "input is not a MIDI JSON object");
  }

  const warnings: string[] = [];
  const header = json.header;

  // --- ppq (REQ-COMP-3) ---
  const ppq = header.ppq;
  if (!Number.isFinite(ppq) || ppq <= 0) {
    return fail<NormalizedProject>("unsupported", "ticks-per-quarter must be a positive number");
  }

  // --- format (adapter-supplied; see types.ts DTO note) ---
  let format: 0 | 1 | 2;
  const rawFormat = header.format;
  if (rawFormat !== undefined && Number.isFinite(rawFormat)) {
    if (rawFormat < 0 || rawFormat > 2) {
      return fail<NormalizedProject>("unsupported", `unsupported SMF format ${rawFormat}`);
    }
    format = rawFormat as 0 | 1 | 2;
  } else {
    format = json.tracks.length <= 1 ? 0 : 1;
  }

  // --- tempo map (ascending, [0].tick === 0) ---
  let tempos: ProjectTempo[] = [];
  for (const t of header.tempos ?? []) {
    if (Number.isFinite(t.bpm) && t.bpm > 0) {
      tempos.push({ tick: clampInt(t.ticks, 0, Number.MAX_SAFE_INTEGER, 0), bpm: t.bpm });
    }
  }
  tempos.sort((a, b) => a.tick - b.tick);
  if (tempos.length === 0) {
    tempos = [{ tick: 0, bpm: 120 }];
    warnings.push("no tempo event; assumed 120 BPM");
  } else if (tempos[0].tick !== 0) {
    tempos = [{ tick: 0, bpm: tempos[0].bpm }, ...tempos];
  }

  // --- time signatures (REAL denominators; [0].tick === 0) ---
  let timeSignatures: ProjectTimeSignature[] = [];
  for (const ts of header.timeSignatures ?? []) {
    const arr = ts.timeSignature;
    if (!Array.isArray(arr) || arr.length < 2) continue;
    const den = realDenominator(arr[1]);
    if (den === null) {
      warnings.push("unrecognized time-signature denominator; assumed 4");
      timeSignatures.push({
        tick: clampInt(ts.ticks, 0, Number.MAX_SAFE_INTEGER, 0),
        numerator: clampInt(arr[0], 1, 32, 4),
        denominator: 4,
      });
      continue;
    }
    timeSignatures.push({
      tick: clampInt(ts.ticks, 0, Number.MAX_SAFE_INTEGER, 0),
      numerator: clampInt(arr[0], 1, 32, 4),
      denominator: den,
    });
  }
  timeSignatures.sort((a, b) => a.tick - b.tick);
  if (timeSignatures.length === 0) {
    timeSignatures = [{ tick: 0, numerator: 4, denominator: 4 }];
    warnings.push("no time signature event; assumed 4/4");
  } else if (timeSignatures[0].tick !== 0) {
    const first = timeSignatures[0];
    timeSignatures = [
      { tick: 0, numerator: first.numerator, denominator: first.denominator },
      ...timeSignatures,
    ];
  }

  // --- key signatures (via core/spelling parseKey) ---
  const keySignatures: ProjectKeySignature[] = [];
  for (const ks of header.keySignatures ?? []) {
    const pk = parseKey(`${ks.key} ${ks.scale}`);
    if (!pk || (pk.mode !== "major" && pk.mode !== "minor")) {
      warnings.push("unrecognized key signature ignored");
      continue;
    }
    keySignatures.push({
      tick: clampInt(ks.ticks, 0, Number.MAX_SAFE_INTEGER, 0),
      tonicPc: pk.tonicPc,
      mode: pk.mode,
    });
  }
  keySignatures.sort((a, b) => a.tick - b.tick);

  // --- hostile-DTO guards (REQ-COMP-15: never throw, typed arm) ---
  // @tonejs/midi never emits null / non-object entries, but a hand-built
  // or tampered DTO can. Without these, `tr.notes` / `n.midi` deref a
  // null and normalize THROWS - the tester's adversarial finding. A
  // malformed entry is corrupt input: fail parseFailed (message says
  // "malformed"), do not silently drop.
  for (let i = 0; i < json.tracks.length; i++) {
    const tr = json.tracks[i];
    if (tr === null || typeof tr !== "object") {
      return fail<NormalizedProject>("parseFailed", `malformed track entry at index ${i}`);
    }
    if (Array.isArray(tr.notes)) {
      for (let j = 0; j < tr.notes.length; j++) {
        const n = tr.notes[j];
        if (n === null || typeof n !== "object") {
          return fail<NormalizedProject>(
            "parseFailed",
            `malformed note entry at track ${i}, note ${j}`,
          );
        }
      }
    }
  }

  // --- tracks + notes ---
  let totalNotes = 0;
  let droppedMidi = 0;
  const tracks: NormalizedTrack[] = [];
  json.tracks.forEach((tr, index) => {
    const rawNotes = Array.isArray(tr.notes) ? tr.notes : [];
    const notes: NormalizedNote[] = [];
    for (const n of rawNotes) {
      const midi = Math.round(n.midi);
      if (!Number.isFinite(n.midi) || midi < 0 || midi > 127) {
        droppedMidi++;
        continue;
      }
      const tick = clampInt(n.ticks, 0, Number.MAX_SAFE_INTEGER, 0);
      const durationTicks = Math.max(1, clampInt(n.durationTicks, 1, Number.MAX_SAFE_INTEGER, 1));
      let velocity = Number.isFinite(n.velocity) ? n.velocity : 1;
      if (velocity > 1) velocity /= 127; // legacy 0..127 defensive (X4)
      if (velocity < 0) velocity = 0;
      if (velocity > 1) velocity = 1;
      notes.push({ midi, tick, durationTicks, velocity });
    }
    notes.sort((a, b) => a.tick - b.tick);
    totalNotes += notes.length;

    let endTick = 0;
    for (const nn of notes) {
      const e = nn.tick + nn.durationTicks;
      if (e > endTick) endTick = e;
    }
    const channel = clampInt(tr.channel, 0, 15, 0);
    const program =
      tr.instrument && Number.isFinite(tr.instrument.number)
        ? clampInt(tr.instrument.number, 0, 127, 128)
        : 128;
    // Channel 9 is the GM percussion channel for EVERY SMF format. The
    // old "format !== 0" clause rested on the F6 premise ("format 0
    // flattens per-note channel"), which @tonejs/midi 2.0.28 falsifies:
    // splitTracks() runs for all formats and groups by (program,
    // channel), so Track.channel is per-group accurate even at format 0.
    const isPercussion = channel === 9;
    const usesPitchBend = Array.isArray(tr.pitchBends) && tr.pitchBends.length > 0;
    tracks.push({
      index,
      name: typeof tr.name === "string" ? tr.name : "",
      channel,
      program,
      isPercussion,
      notes,
      endTick,
      usesPitchBend,
    });
  });

  if (droppedMidi > 0) {
    warnings.push(`${droppedMidi} note(s) with out-of-range pitch dropped`);
  }
  if (format === 0 && json.tracks.length > 1) {
    warnings.push(
      "format 0 file with multiple SMF tracks: the parser re-groups by (program, channel); original track grouping is lost; analyzed as a composite",
    );
  }
  if (totalNotes > MAX_NOTES) {
    return fail<NormalizedProject>(
      "tooLarge",
      `too many notes (${totalNotes}); limit is ${MAX_NOTES}`,
    );
  }
  if (totalNotes === 0) {
    return fail<NormalizedProject>("noNotes", "no notes found in the file");
  }

  const endTick = tracks.reduce((m, t) => (t.endTick > m ? t.endTick : m), 0);
  const name = header.name || tracks[0].name || fileName;

  const base: NormalizedProject = {
    version: 1,
    format,
    ppq,
    name,
    fileName,
    tempos,
    timeSignatures,
    keySignatures,
    tracks,
    endTick,
    durationSec: 0,
    warnings,
  };
  const durationSec = ticksToSeconds(base, endTick);
  return { ok: true, value: { ...base, durationSec } };
}
