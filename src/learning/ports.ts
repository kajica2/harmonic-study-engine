/**
 * Integration contracts for the next learning slices. Type-only:
 * importing this file never opens a microphone, database or network.
 * No recorder/analyser/export implementation is claimed here.
 */
import type { Instrument, Lesson, Locale } from "./model";

/** Seconds always refer to the original unquantized recording timeline. */
export interface PerformedNote {
  soundingMidi: number;
  startSeconds: number;
  durationSeconds: number;
  confidence: number;
}

export interface TakeContext {
  lessonId: string;
  /** Stable lesson content revision; compare takes against the same revision. */
  lessonRevision: Lesson["revision"];
  instrument: Instrument;
  bpm: number;
  tuningAHz: number;
  /** Capture offset may be unknown; do not pretend timing is calibrated. */
  inputLatencySeconds: number | null;
}

export interface CapturedAudio {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
  sampleRateHz: number | null;
  /** Actual reported settings, not the settings requested by the app. */
  settings: {
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
    autoGainControl?: boolean;
    channelCount?: number;
  };
}

export interface PracticeTake {
  id: string;
  createdAt: string;
  source: "microphone" | "file-import";
  context: TakeContext;
  audio: CapturedAudio;
}

export type TakeSummary = Omit<PracticeTake, "audio"> & {
  mimeType: string;
  durationSeconds: number;
};

export interface CaptureSession {
  /** Resolve only once final bytes are available; repeated stop must be safe. */
  stop(): Promise<CapturedAudio>;
  /** Release tracks and partial buffers on cancel, interruption and unmount. */
  cancel(): void;
}

export interface RecorderPort {
  /** Pure capability check: must never request permission. */
  supported(): boolean;
  /** Called only from an explicit learner gesture; abort must clean up tracks. */
  start(context: TakeContext, signal: AbortSignal): Promise<CaptureSession>;
}

/** IndexedDB is the intended adapter. Audio blobs never belong in localStorage. */
export interface TakeRepositoryPort {
  save(take: PracticeTake): Promise<void>;
  get(id: string): Promise<PracticeTake | null>;
  list(query: { lessonId: string; limit: number; cursor?: string }): Promise<{
    takes: TakeSummary[];
    nextCursor: string | null;
  }>;
  delete(id: string): Promise<void>;
}

export interface ReviewFinding {
  fromSeconds: number;
  toSeconds: number;
  kind: "sustain-drift" | "entry-timing" | "release";
  /** Localized copy is resolved at the UI boundary from this message key. */
  messageKey: string;
  evidence: Record<string, number>;
}

export type TakeReview = {
  takeId: string;
  analyzerVersion: string;
} & (
  | {
      status: "insufficient-signal";
      reason: "silence" | "noise" | "ambiguous-source";
      findings: [];
    }
  | {
      status: "reviewable";
      notes: PerformedNote[];
      findings: ReviewFinding[];
      nextLessonId: string | null;
    }
);

export interface ReviewPort {
  analyze(
    take: PracticeTake,
    reference: Lesson,
    signal: AbortSignal,
  ): Promise<TakeReview>;
}

export interface NotationPort {
  export(
    lesson: Lesson,
    options: {
      format: "musicxml" | "pdf";
      locale: Locale;
      /** Added to sounding MIDI at export only: +2 for a B♭ instrument. */
      writtenTransposeSemitones: number;
      clef: "treble" | "bass";
    },
  ): Promise<Blob>;
}
