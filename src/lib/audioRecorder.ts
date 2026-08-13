/**
 * audioRecorder — captures audio (Web Audio output + mic) and
 * optionally canvas video, combines them with MediaRecorder,
 * and uploads the resulting WebM blob to the backend where it
 * gets transcoded to MP4 (H.264 + AAC) via ffmpeg.
 *
 * The output format is WebM (VP8/Opus) because MediaRecorder
 * support for `video/mp4` is inconsistent across browsers;
 * transcoding to MP4 happens server-side so the user always
 * gets a file that plays on every device and uploads to every
 * social platform.
 */
import { audioEngine } from "./audio";

export interface AudioRecorderOptions {
  /** Canvas to capture as video. Optional — pure audio recordings
   *  are still supported. */
  canvas?: HTMLCanvasElement | null;
  /** Whether to capture the user's microphone in addition to the
   *  Web Audio output. Defaults to true. */
  includeMic?: boolean;
  /** Video frame rate. Default 24. */
  videoFps?: number;
  /** Bits per second for video. Default 2.5 Mbps. */
  videoBitsPerSecond?: number;
}

export interface RecordingResult {
  /** MimeType used to record (e.g. "video/webm;codecs=vp8,opus"). */
  mimeType: string;
  /** The recorded blob (WebM). */
  blob: Blob;
  /** Duration of the recording in seconds. */
  durationSec: number;
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: BlobPart[] = [];
  private combinedStream: MediaStream | null = null;
  private recordingStartTime = 0;
  private micStream: MediaStream | null = null;
  private onStopCallback: ((result: RecordingResult) => void) | null = null;
  private onErrorCallback: ((err: Error) => void) | null = null;

  /**
   * Check whether the browser can produce a WebM recording with
   * the given codec. Returns the best-supported mime type, or
   * null if the browser doesn't support MediaRecorder at all.
   */
  static getSupportedMimeType(): string | null {
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=h264,opus",
      "video/webm",
      "audio/webm;codecs=opus",
      "audio/webm",
    ];
    for (const c of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
        return c;
      }
    }
    return null;
  }

  /**
   * Start a recording. Returns the mime type that will be used.
   * Throws if MediaRecorder isn't available or the user denies
   * the microphone permission.
   */
  async start(opts: AudioRecorderOptions = {}): Promise<string> {
    const { canvas = null, includeMic = true, videoFps = 24, videoBitsPerSecond = 2_500_000 } = opts;

    if (typeof MediaRecorder === "undefined") {
      throw new Error("MediaRecorder is not available in this browser");
    }
    const mimeType = AudioRecorder.getSupportedMimeType();
    if (!mimeType) {
      throw new Error("No supported WebM mime type for MediaRecorder");
    }

    // 1. Web Audio output stream (master bus)
    const ctx = audioEngine.getCtx();
    if (!ctx) throw new Error("AudioContext not initialised — click anywhere first");
    const audioDest = ctx.createMediaStreamDestination();
    audioEngine.connectMasterTo(audioDest); // new method we'll add

    const tracks: MediaStreamTrack[] = [...audioDest.stream.getAudioTracks()];

    // 2. Microphone stream (optional)
    if (includeMic) {
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        this.micStream.getAudioTracks().forEach((t) => tracks.push(t));
      } catch (e) {
        // Permission denied — proceed without mic; don't throw.
        // The recording still captures the Web Audio output.
        console.warn("Mic capture denied; recording without mic", e);
      }
    }

    // 3. Canvas video stream (optional)
    let canvasStream: MediaStream | null = null;
    if (canvas) {
      try {
        // 30 fps is the typical capture rate; some browsers cap at
        // 24 or 60. We honour the requested fps if supported.
        canvasStream = (canvas as any).captureStream?.(videoFps);
      } catch {
        canvasStream = null;
      }
      if (canvasStream) {
        canvasStream.getVideoTracks().forEach((t) => tracks.push(t));
      }
    }

    // 4. Combine into a single MediaStream
    this.combinedStream = new MediaStream(tracks);

    // 5. Start MediaRecorder
    this.recordedChunks = [];
    this.mediaRecorder = new MediaRecorder(this.combinedStream, {
      mimeType,
      videoBitsPerSecond,
    });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.recordedChunks.push(e.data);
    };
    this.mediaRecorder.onstop = () => {
      const durationSec = (Date.now() - this.recordingStartTime) / 1000;
      const blob = new Blob(this.recordedChunks, { type: mimeType });
      const result: RecordingResult = { mimeType, blob, durationSec };
      this.cleanup();
      this.onStopCallback?.(result);
    };
    this.mediaRecorder.onerror = (e) => {
      const err = new Error(
        `MediaRecorder error: ${(e as any).error?.message ?? "unknown"}`,
      );
      this.cleanup();
      this.onErrorCallback?.(err);
    };
    this.recordingStartTime = Date.now();
    this.mediaRecorder.start(250); // collect a chunk every 250ms
    return mimeType;
  }

  /** Stop the recording. The onStop callback fires when the file is
   *  finalised. Returns immediately. */
  stop(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    } else {
      // Already stopped — just clean up.
      this.cleanup();
    }
  }

  /** Subscribe to the result. Returns an unsubscribe function. */
  onResult(cb: (result: RecordingResult) => void): () => void {
    this.onStopCallback = cb;
    return () => {
      this.onStopCallback = null;
    };
  }

  onError(cb: (err: Error) => void): () => void {
    this.onErrorCallback = cb;
    return () => {
      this.onErrorCallback = null;
    };
  }

  get isRecording(): boolean {
    return this.mediaRecorder?.state === "recording";
  }

  get elapsedSec(): number {
    return this.recordingStartTime > 0
      ? (Date.now() - this.recordingStartTime) / 1000
      : 0;
  }

  private cleanup() {
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.combinedStream) {
      this.combinedStream.getTracks().forEach((t) => t.stop());
      this.combinedStream = null;
    }
    // Disconnect the master bus from the recording destination
    audioEngine.disconnectMasterFromRecording();
    this.mediaRecorder = null;
  }
}

/** Singleton. */
export const audioRecorder = new AudioRecorder();