/**
 * src/lib/backingTrack.ts — user-provided audio source.
 *
 * The engine normally renders its own backing track via BackingEngine
 * (drums + bass + piano comping). This helper lets the user substitute
 * a real recording: drop in a `.mov`, `.mpg`, or `.mp4` file from a
 * phone camera, a YouTube rip, an iReal Pro export, etc., and the
 * engine plays the audio track alongside (or instead of) the synth.
 *
 * Browser support: `.mp4` is universally supported; `.mov` and `.mpg`
 * depend on the browser's codec support. Safari handles `.mov` natively;
 * Chrome/Edge handle `.mpg` for many codecs but not all. The user
 * sees a clear error if the browser can't decode the chosen file —
 * we don't silently fail.
 */

export interface BackingTrackFile {
  /** Object URL (call URL.revokeObjectURL when done). */
  url: string;
  /** Original filename, used in the UI. */
  name: string;
  /** MIME type from the File object. */
  mimeType: string;
  /** File size in bytes (for the UI to show "12 MB"). */
  sizeBytes: number;
}

/** Allowed extensions and the MIME types we accept for each. */
export const ACCEPTED_EXTENSIONS = [".mov", ".mpg", ".mp4"] as const;
export const ACCEPTED_MIME_TYPES = [
  "video/mp4",
  "video/quicktime", // .mov
  "video/mpeg", // .mpg
  "video/x-m4v",
  "audio/mp4", // some .mp4 files report audio MIME
  "audio/mpeg", // some .mpg files report audio MIME
  "audio/x-m4a",
] as const;

/** Human-readable list for `accept=` on the file input. */
export const ACCEPT_ATTR = [
  ...ACCEPTED_EXTENSIONS,
  ...ACCEPTED_MIME_TYPES,
].join(",");

/**
 * Validate a File is a video/audio file we can decode as a backing
 * track. Returns `{ ok: true, reason?: string }`. Pure function — no
 * side effects.
 */
export function validateBackingTrackFile(file: File): {
  ok: boolean;
  reason?: string;
} {
  if (!file) return { ok: false, reason: "No file selected" };
  const name = (file.name || "").toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  const extOk = (ACCEPTED_EXTENSIONS as readonly string[]).includes(ext);
  const mimeOk = (ACCEPTED_MIME_TYPES as readonly string[]).includes(
    file.type,
  );
  if (!extOk && !mimeOk) {
    return {
      ok: false,
      reason: `Unsupported file type. Expected ${ACCEPTED_EXTENSIONS.join(
        ", ",
      )}; got ${ext || file.type || "unknown"}.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, reason: "File is empty." };
  }
  // Cap at 200 MB — most recordings fit, and decodeAudioData for
  // very large files can lock up the main thread for seconds.
  const MAX_BYTES = 200 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      reason: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ${MAX_BYTES / 1024 / 1024} MB.`,
    };
  }
  return { ok: true };
}

/**
 * Create an object URL for the file. The caller is responsible for
 * calling `URL.revokeObjectURL(track.url)` when the backing track is
 * replaced or the component unmounts.
 *
 * Throws if the file fails validation — the caller should validate
 * first (via `validateBackingTrackFile`) and surface a friendly UI
 * message before reaching this function.
 */
export function createBackingTrack(file: File): BackingTrackFile {
  const verdict = validateBackingTrackFile(file);
  if (!verdict.ok) {
    throw new Error(verdict.reason ?? "Invalid backing track file");
  }
  return {
    url: URL.createObjectURL(file),
    name: file.name,
    mimeType: file.type || guessMimeFromName(file.name),
    sizeBytes: file.size,
  };
}

function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".mpg")) return "video/mpeg";
  if (lower.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}

/** Format a byte count as "12.3 MB" / "892 KB". */
export function formatBackingTrackSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
