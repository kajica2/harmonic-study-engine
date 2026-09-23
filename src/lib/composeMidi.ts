/**
 * src/lib/composeMidi.ts - PRD-001 Phase 4 Slice 1 (D46).
 *
 * The ONLY place @tonejs/midi is imported in the repo. The adapter owns
 * the package + the byte/file boundary (reading files, the 30MB cap,
 * SHA-256); the engine owns normalization via the plain MidiJsonLike DTO
 * (purity-legal, worker-liftable). readMidiFile NEVER throws - every
 * failure is an Outcome error arm (REQ-COMP-15).
 *
 * SMF format is injected into the DTO from the 2-byte header because
 * @tonejs/midi's toJSON() omits it (verified against 2.0.28); the engine
 * needs it to validate "format > 2" (channel-9 percussion is format-
 * independent - the old format!==0 gate rested on the falsified F6
 * premise and was relaxed in the slice-1 fix round).
 */

import { Midi } from "@tonejs/midi";
import { normalizeMidiJson } from "../../engine/compose/normalize";
import type {
  MidiJsonLike,
  NormalizedProject,
  Outcome,
} from "../../engine/compose/types";

/** REQ-COMP-1: pre-parse byte ceiling. */
export const MAX_MIDI_BYTES = 30 * 1024 * 1024;

/** Minimal structural view of a File (name + size + bytes). The DOM
 *  File satisfies it; tests pass a plain stub - no casting. */
export interface ReadableMidiFile {
  readonly name: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

function readSmfFormat(buf: ArrayBuffer): number | undefined {
  if (buf.byteLength < 10) return undefined;
  const dv = new DataView(buf);
  // "MThd"
  if (dv.getUint8(0) !== 0x4d || dv.getUint8(1) !== 0x54 || dv.getUint8(2) !== 0x68 || dv.getUint8(3) !== 0x64) {
    return undefined;
  }
  return dv.getUint16(8);
}

/** Parse MIDI bytes into the engine's plain DTO (injecting format). May
 *  throw on garbage - callers (readMidiFile) wrap it. */
export function parseMidiBytes(buf: ArrayBuffer): MidiJsonLike {
  const json = new Midi(buf).toJSON();
  const format = readSmfFormat(buf);
  return {
    header: {
      ppq: json.header.ppq,
      name: json.header.name,
      format,
      tempos: json.header.tempos,
      timeSignatures: json.header.timeSignatures,
      keySignatures: json.header.keySignatures,
    },
    tracks: json.tracks,
  };
}

/** Full upload path: size check -> bytes -> parse -> normalize. */
export async function readMidiFile(file: ReadableMidiFile): Promise<Outcome<NormalizedProject>> {
  if (file.size > MAX_MIDI_BYTES) {
    return {
      ok: false,
      error: { code: "tooLarge", message: `File is larger than the ${Math.round(MAX_MIDI_BYTES / (1024 * 1024))} MB limit` },
    };
  }
  let buf: ArrayBuffer;
  try {
    buf = await file.arrayBuffer();
  } catch {
    return { ok: false, error: { code: "parseFailed", message: "Could not read the file" } };
  }
  let json: MidiJsonLike;
  try {
    json = parseMidiBytes(buf);
  } catch {
    return { ok: false, error: { code: "parseFailed", message: "Not a valid MIDI file" } };
  }
  // Second line of defense (REQ-COMP-15): normalizeMidiJson is
  // never-throws by contract (its own guards pin it), but a future
  // regression must surface as the typed "internal" arm, never as an
  // exception escaping the upload path.
  try {
    return normalizeMidiJson(json, file.name);
  } catch {
    return { ok: false, error: { code: "internal", message: "Could not process the parsed MIDI data" } };
  }
}

/** REQ-IO-51 fileHash. F9-guarded: null when crypto.subtle is absent
 *  (jsdom / insecure context) so the caller can show "hash unavailable". */
export async function sha256Hex(buf: ArrayBuffer): Promise<string | null> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) return null;
  try {
    const digest = await subtle.digest("SHA-256", buf);
    const bytes = new Uint8Array(digest);
    let hex = "";
    for (const b of bytes) hex += b.toString(16).padStart(2, "0");
    return hex;
  } catch {
    return null;
  }
}
