/**
 * magenta/INoteSequence.ts
 * ────────────────────────
 * Minimal local re-export of the Magenta types we actually use.
 * Keeps callers from importing the whole `@magenta/music` barrel
 * (which pulls tfjs typings into every consumer).
 *
 * `NoteSequence` / `INoteSequence` come from the protobuf barrel.
 * `INote` is *defined* there too but nested deep enough inside the
 * `tensorflow.magenta.NoteSequence` sub-namespace that the TS
 * compiler won't resolve a direct export — and pulling in
 * `protobuf/proto` brings every protobuf type with it.
 *
 * Rather than fight the protobuf type tree we declare our own
 * `INote` that mirrors the fields we read/write. The shape is
 * stable across Magenta versions (every note has pitch/start/end
 * velocity/instrument plus the quantized fields when present).
 *
 * Source of truth: `@magenta/music` (already a dep, see magentaHelper.ts).
 */
export type { INoteSequence, NoteSequence } from "@magenta/music/esm/protobuf";

/**
 * Local `INote` view — covers everything the adapter, humanizer,
 * and downstream consumers touch. Optional fields mirror the
 * protobuf shape; new Magenta versions are unlikely to drop any
 * of these (they'd break every model that uses the lib).
 */
export interface INote {
  pitch: number;
  velocity?: number;
  startTime: number;
  endTime: number;
  instrument?: number;
  /** Quantized step position (when the sequence is quantized). */
  quantizedStartStep?: number;
  quantizedEndStep?: number;
  /** Optional human-friendly labels; not used by humanizer logic. */
  pitchName?: string;
  velocityName?: string;
  /** Program change; rarely used in practice. */
  program?: number;
  /** Whether the note should sustain past its end (rare). */
  sustains?: boolean;
  /** Drums-only: the drum "voice" (e.g. 36 = kick, 38 = snare). */
  isDrum?: boolean;
  /** Source sequence id (set by Magenta during concatenation). */
  sourceInfo?: { sourceSequence?: number; notesIndex?: number };
}