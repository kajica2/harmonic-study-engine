/**
 * src/lib/marketplace.ts - marketplace client + pure helpers.
 *
 * The marketplace is a standalone surface (mode "marketplace"): it
 * lists published backing tracks and lets the user preview one with
 * a local beat ticker + HTMLAudioElement. It deliberately does NOT
 * couple to playbackClock or the practice audio engine - the preview
 * is its own island.
 *
 * Two backends coexist:
 *   - Vercel serverless (deployed flow): the SPA and /api/* live on
 *     one origin. publishListing POSTs multipart to /api/publish and
 *     fetchListingsFromGithub GETs /api/listings. MP3 encoding is
 *     client-side (lamejs) because Vercel has no ffmpeg.
 *   - FastAPI backend (local dev): server/marketplace.py still serves
 *     /marketplace/listings + /marketplace/publish. fetchListings is
 *     kept for that surface; the deployed flow prefers the serverless
 *     endpoints.
 *
 * Base URLs:
 *   - MARKETPLACE_SERVERLESS_BASE is "" (same-origin relative /api/*).
 *   - MARKETPLACE_SERVER follows the VITE_DDSP_API pattern and falls
 *     back to the local Python backend on the developer's machine.
 *
 * Why pure, no React:
 *   - parseListing / buildSlideshowLayers / beatAtElapsed /
 *     wavBlobToMp3 / parseGithubListing are node-testable without a
 *     renderer / DOM / audio engine; pin them in a node test
 *     (PIN-001).
 *   - fetchListings / fetchListingsFromGithub / publishListing never
 *     throw: every failure path (offline, non-ok status, malformed
 *     payload) returns a typed { ok: false, error } so the surface
 *     can render a degraded state instead of crashing.
 */

import type { SlideLayer } from "./slideshow";

const DEFAULT_BACKEND = "http://127.0.0.1:8765";

export const MARKETPLACE_SERVER: string =
  (import.meta.env.VITE_DDSP_API as string | undefined)?.replace(/\/$/, "") ||
  DEFAULT_BACKEND;

/**
 * Same-origin base for the Vercel serverless endpoints. The deployed
 * app serves the SPA and /api/* from one origin, so an empty base
 * resolves /api/listings and /api/publish against the current page.
 */
export const MARKETPLACE_SERVERLESS_BASE = "";

/** A published (or draft) backing-track listing from the backend. */
export interface Listing {
  id: string;
  title: string;
  composer: string;
  key: string | null;
  tempo: number | null;
  form: string | null;
  audio_url: string;
  cover_url: string | null;
  status: string;
  source_commit: string | null;
  created_at: string;
  updated_at: string;
}

export interface FetchListingsOptions {
  /** Backend filter; defaults to "published" when omitted. */
  status?: string;
}

export type FetchListingsResult =
  | { ok: true; listings: Listing[] }
  | { ok: false; error: string };

/**
 * Fetch the listing array from the backend. Never throws: offline,
 * non-ok status and malformed payloads all resolve to a typed
 * failure so the caller can render a degraded state.
 *
 * Uses AbortSignal.timeout(3000) - the same pattern as
 * checkDDSPStatus in ddspSynth.ts.
 */
export async function fetchListings(
  baseUrl: string,
  opts: FetchListingsOptions = {},
): Promise<FetchListingsResult> {
  try {
    const base = baseUrl.replace(/\/$/, "");
    const params = new URLSearchParams();
    if (opts.status !== undefined && opts.status.length > 0) {
      params.set("status", opts.status);
    }
    const qs = params.toString();
    const url = `${base}/marketplace/listings${qs ? `?${qs}` : ""}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      return { ok: false, error: `Marketplace server error (${res.status})` };
    }
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) {
      return { ok: false, error: "Marketplace returned a non-array payload" };
    }
    const listings: Listing[] = [];
    for (const item of data) {
      const parsed = parseListing(item);
      if (parsed !== null) listings.push(parsed);
    }
    return { ok: true, listings };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Marketplace unreachable";
    return { ok: false, error: message };
  }
}

/**
 * Validate an unknown JSON value into a Listing. Returns null when
 * the payload is not an object or any of the three required fields
 * (id, title, composer, audio_url) is missing / not a non-empty
 * string. Optional fields (key, tempo, form, cover_url, status,
 * source_commit, created_at, updated_at) are coerced defensively so
 * a sparse backend record still renders.
 */
export function parseListing(json: unknown): Listing | null {
  if (typeof json !== "object" || json === null) return null;
  const record = json as Record<string, unknown>;

  const id = record.id;
  const title = record.title;
  const composer = record.composer;
  const audioUrl = record.audio_url;

  if (typeof id !== "string" || id.length === 0) return null;
  if (typeof title !== "string" || title.length === 0) return null;
  if (typeof composer !== "string" || composer.length === 0) return null;
  if (typeof audioUrl !== "string" || audioUrl.length === 0) return null;

  const optionalString = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;

  return {
    id,
    title,
    composer,
    key: optionalString(record.key),
    tempo:
      typeof record.tempo === "number" && Number.isFinite(record.tempo)
        ? record.tempo
        : null,
    form: optionalString(record.form),
    audio_url: audioUrl,
    cover_url: optionalString(record.cover_url),
    status: optionalString(record.status) ?? "published",
    source_commit: optionalString(record.source_commit),
    created_at: typeof record.created_at === "string" ? record.created_at : "",
    updated_at: typeof record.updated_at === "string" ? record.updated_at : "",
  };
}

/**
 * Derive the slideshow layers for a listing from its key / tempo /
 * form (e.g. "Key: Bb", "Tempo: 120", "Form: AABA"). barsPerLayer
 * defaults to 4. When fewer than two metadata layers exist, pad with
 * title / composer so the slideshow always has a crossfade partner.
 */
export function buildSlideshowLayers(listing: Listing): {
  layers: SlideLayer[];
  barsPerLayer: number;
} {
  const layers: SlideLayer[] = [];
  if (listing.key !== null) {
    layers.push({ id: "key", title: `Key: ${listing.key}` });
  }
  if (listing.tempo !== null) {
    layers.push({ id: "tempo", title: `Tempo: ${listing.tempo}` });
  }
  if (listing.form !== null) {
    layers.push({ id: "form", title: `Form: ${listing.form}` });
  }
  if (layers.length === 0) {
    layers.push({ id: "title", title: listing.title });
    layers.push({ id: "composer", title: listing.composer });
  } else if (layers.length === 1) {
    layers.push({
      id: "title",
      title: listing.title,
      subtitle: listing.composer,
    });
  }
  return { layers, barsPerLayer: 4 };
}

/**
 * Beat index (quarter-note beats, 0-based) from elapsed milliseconds
 * at the given BPM. Defensive: non-finite inputs or bpm <= 0 return 0
 * so a stale tick never produces NaN in the slideshow.
 */
export function beatAtElapsed(elapsedMs: number, bpm: number): number {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(bpm) || bpm <= 0) {
    return 0;
  }
  // Clamp negative elapsed (a ticker that fires before the start
  // timestamp) so Math.floor never produces a negative beat index.
  const safeMs = Math.max(0, elapsedMs);
  return Math.floor((safeMs / 1000) * (bpm / 60));
}

/**
 * True when the audio element that just resolved (or ended / errored)
 * is still the one the user asked to play. Guards the marketplace
 * preview against stale callbacks: HTMLAudioElement.play() resolves
 * asynchronously, so a Stop click or a newer card can supersede the
 * element before its promise settles. Without the guard, the stale
 * .then() would set isPlaying(true) and start a ticker for silent
 * audio, and a superseded element's onended/onerror would kill the
 * current playback.
 */
export function isActiveAudio(
  current: HTMLAudioElement | null,
  candidate: HTMLAudioElement,
): boolean {
  return current === candidate;
}

/**
 * Derive a marketplace slug from a path title: lowercase, collapse
 * runs of non-alphanumeric characters into a single dash, and trim
 * leading/trailing dashes. Empty or symbol-only titles fall back to
 * "untitled" so the publish button always has a valid slug (the
 * backend validates ^[a-z0-9-]+$).
 */
export function deriveSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "untitled";
}

/**
 * Convert a `data:audio/midi;base64,...` data URI (the shape
 * exportToMidiFile returns) into a Blob for the multipart upload.
 * Throws on a malformed URI; publishListing wraps the call so the
 * surface never sees the throw.
 */
export function midiDataUriToBlob(dataUri: string): Blob {
  const comma = dataUri.indexOf(",");
  if (comma === -1) {
    throw new Error("Invalid MIDI data URI");
  }
  const meta = dataUri.slice(0, comma);
  const mimeMatch = /^data:([^;]+);/.exec(meta);
  const mime = mimeMatch !== null ? mimeMatch[1] : "audio/midi";
  const binary = atob(dataUri.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export interface PublishListingInput {
  /** Client-side MP3 render (wavBlobToMp3 output). */
  mp3Blob: Blob;
  /** MIDI blob (midiDataUriToBlob output). */
  midiBlob: Blob;
  /** Serverless-validated slug (^[a-z0-9-]+$). */
  slug: string;
  title?: string;
  composer?: string;
}

/**
 * Build the multipart FormData for POST /api/publish. The mp3 field
 * carries the client-side MP3 render, midi carries the MIDI blob, and
 * slug/title/composer ride as form fields. Empty optional metadata is
 * omitted so the serverless defaults apply.
 */
export function buildPublishFormData(input: PublishListingInput): FormData {
  const form = new FormData();
  form.append("mp3", input.mp3Blob, "render.mp3");
  form.append("midi", input.midiBlob, "render.mid");
  form.append("slug", input.slug);
  if (input.title !== undefined && input.title.length > 0) {
    form.append("title", input.title);
  }
  if (input.composer !== undefined && input.composer.length > 0) {
    form.append("composer", input.composer);
  }
  return form;
}

export type PublishListingResult =
  | { ok: true; listing: Listing | null }
  | { ok: false; error: string };

/**
 * Publish the current path to the marketplace: POST the client-side
 * MP3 render + MIDI to /api/publish (same-origin Vercel serverless).
 * The serverless function commits marketplace/<slug>.mp3 +
 * <slug>.mid to the HSE GitHub repo. Never throws: offline, non-ok
 * status and malformed payloads all resolve to a typed failure.
 *
 * Uses AbortSignal.timeout(30000) - publishing renders + uploads can
 * take much longer than the 3s listing fetch.
 */
export async function publishListing(
  baseUrl: string,
  input: PublishListingInput,
): Promise<PublishListingResult> {
  try {
    const base = baseUrl.replace(/\/$/, "");
    const form = buildPublishFormData(input);
    const res = await fetch(`${base}/api/publish`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      let detail = `Marketplace publish failed (${res.status})`;
      try {
        const data = (await res.json()) as {
          detail?: unknown;
          error?: unknown;
        };
        if (typeof data.detail === "string" && data.detail.length > 0) {
          detail = data.detail;
        } else if (typeof data.error === "string" && data.error.length > 0) {
          detail = data.error;
        }
      } catch {
        // Non-JSON error body - keep the status-based message.
      }
      return { ok: false, error: detail };
    }
    const data = (await res.json()) as unknown;
    if (typeof data !== "object" || data === null) {
      return { ok: false, error: "Marketplace returned a non-object payload" };
    }
    const record = data as Record<string, unknown>;
    if (record.published !== true) {
      return { ok: false, error: "Marketplace did not confirm the publish" };
    }
    // The serverless function confirms the commit but does not return
    // a full listing; the caller refreshes the catalog separately.
    return { ok: true, listing: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Marketplace publish failed";
    return { ok: false, error: message };
  }
}

/**
 * Validate an unknown JSON value from the serverless /api/listings
 * endpoint into a Listing. The serverless shape is
 * { slug, title, mp3_url, midi_url }; the Listing surface needs
 * id/title/composer/audio_url, so slug becomes id, mp3_url becomes
 * audio_url, and composer is the fixed catalog owner. Returns null
 * when any required field is missing / not a non-empty string.
 */
export function parseGithubListing(json: unknown): Listing | null {
  if (typeof json !== "object" || json === null) return null;
  const record = json as Record<string, unknown>;

  const slug = record.slug;
  const title = record.title;
  const mp3Url = record.mp3_url;
  const midiUrl = record.midi_url;

  if (typeof slug !== "string" || slug.length === 0) return null;
  if (typeof title !== "string" || title.length === 0) return null;
  if (typeof mp3Url !== "string" || mp3Url.length === 0) return null;
  if (typeof midiUrl !== "string" || midiUrl.length === 0) return null;

  return {
    id: slug,
    title,
    composer: "harmonic-study-engine",
    key: null,
    tempo: null,
    form: null,
    audio_url: mp3Url,
    cover_url: null,
    status: "published",
    source_commit: null,
    created_at: "",
    updated_at: "",
  };
}

export type FetchListingsFromGithubResult =
  | { ok: true; listings: Listing[] }
  | { ok: false; error: string };

/**
 * Fetch the listing array from the same-origin Vercel serverless
 * endpoint (/api/listings). Never throws: offline, non-ok status and
 * malformed payloads all resolve to a typed failure so the caller can
 * render a degraded state.
 *
 * Uses AbortSignal.timeout(3000) - the same pattern as
 * checkDDSPStatus in ddspSynth.ts.
 */
export async function fetchListingsFromGithub(
  baseUrl: string,
): Promise<FetchListingsFromGithubResult> {
  try {
    const base = baseUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/api/listings`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      return { ok: false, error: `Marketplace server error (${res.status})` };
    }
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) {
      return { ok: false, error: "Marketplace returned a non-array payload" };
    }
    const listings: Listing[] = [];
    for (const item of data) {
      const parsed = parseGithubListing(item);
      if (parsed !== null) listings.push(parsed);
    }
    return { ok: true, listings };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Marketplace unreachable";
    return { ok: false, error: message };
  }
}

/**
 * Parse a WAV Blob into its PCM sample layout. Handles the RIFF/WAVE
 * container, walks chunks (fmt / data / fact / LIST ...), and returns
 * the channel count, sample rate, bit depth, audio format and the
 * byte range of the data chunk. Throws on a malformed container.
 */
export interface ParsedWav {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  audioFormat: number;
  dataOffset: number;
  dataLength: number;
}

export function parseWavBuffer(buffer: ArrayBuffer): ParsedWav {
  const view = new DataView(buffer);
  if (buffer.byteLength < 44) {
    throw new Error("WAV buffer is too small");
  }
  // "RIFF" / "WAVE" read as little-endian uint32.
  if (view.getUint32(0, true) !== 0x46464952) {
    throw new Error("Not a RIFF file");
  }
  if (view.getUint32(8, true) !== 0x45564157) {
    throw new Error("Not a WAVE file");
  }

  let channels = 1;
  let sampleRate = 44100;
  let bitsPerSample = 16;
  let audioFormat = 1;
  let dataOffset = -1;
  let dataLength = 0;

  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const chunkId = view.getUint32(offset, true);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkData = offset + 8;
    if (chunkId === 0x20746d66) {
      // "fmt "
      audioFormat = view.getUint16(chunkData, true);
      channels = view.getUint16(chunkData + 2, true);
      sampleRate = view.getUint32(chunkData + 4, true);
      bitsPerSample = view.getUint16(chunkData + 14, true);
    } else if (chunkId === 0x61746164) {
      // "data"
      dataOffset = chunkData;
      dataLength = chunkSize;
    }
    // Chunks are word-aligned (padded to even length).
    offset = chunkData + chunkSize + (chunkSize % 2);
  }

  if (dataOffset === -1) {
    throw new Error("WAV has no data chunk");
  }
  return { channels, sampleRate, bitsPerSample, audioFormat, dataOffset, dataLength };
}

/**
 * Decode the PCM samples of a parsed WAV into one Int16Array per
 * channel (the shape lamejs Mp3Encoder.encodeBuffer expects). Handles
 * 16-bit PCM, 8-bit unsigned PCM and 32-bit IEEE float. Throws on an
 * unsupported bit depth.
 */
export function wavSamplesToInt16(
  buffer: ArrayBuffer,
  info: ParsedWav,
): Int16Array[] {
  const view = new DataView(buffer);
  const bytesPerSample = info.bitsPerSample / 8;
  if (bytesPerSample < 1) {
    throw new Error(`Unsupported WAV bit depth: ${info.bitsPerSample}`);
  }
  const frameCount = Math.floor(
    info.dataLength / (info.channels * bytesPerSample),
  );
  const channels: Int16Array[] = [];
  for (let c = 0; c < info.channels; c++) {
    channels.push(new Int16Array(frameCount));
  }
  for (let i = 0; i < frameCount; i++) {
    for (let c = 0; c < info.channels; c++) {
      const byteOffset = info.dataOffset + (i * info.channels + c) * bytesPerSample;
      let sample: number;
      if (info.audioFormat === 3 && info.bitsPerSample === 32) {
        // IEEE float: clamp to [-1, 1] then scale to Int16 range.
        const f = view.getFloat32(byteOffset, true);
        sample = Math.max(-1, Math.min(1, f));
        channels[c][i] =
          sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
        continue;
      }
      if (info.bitsPerSample === 16) {
        sample = view.getInt16(byteOffset, true);
      } else if (info.bitsPerSample === 8) {
        sample = (view.getUint8(byteOffset) - 128) << 8;
      } else {
        throw new Error(`Unsupported WAV bit depth: ${info.bitsPerSample}`);
      }
      channels[c][i] = sample;
    }
  }
  return channels;
}

/**
 * Encode a WAV Blob to an MP3 Blob client-side with lamejs (the
 * deployed Vercel flow has no ffmpeg, so the browser does the
 * encoding). Decodes the WAV container, converts PCM samples to
 * Int16, and streams 1152-sample frames through Mp3Encoder at 192k.
 * Handles mono and stereo, and any sample rate lamejs supports.
 *
 * lamejs is dynamically imported so the ~260KB encoder only loads
 * when the user actually publishes, not on every marketplace visit.
 *
 * Throws on a malformed WAV or an unsupported layout; publishListing
 * wraps the call so the surface never sees the throw.
 */
export async function wavBlobToMp3(wavBlob: Blob): Promise<Blob> {
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const buffer = await wavBlob.arrayBuffer();
  const info = parseWavBuffer(buffer);
  if (info.channels < 1 || info.channels > 2) {
    throw new Error(`Unsupported WAV channel count: ${info.channels}`);
  }
  const channels = wavSamplesToInt16(buffer, info);
  const frameCount = channels[0].length;
  if (frameCount === 0) {
    throw new Error("WAV contains no audio samples");
  }

  const encoder = new Mp3Encoder(info.channels, info.sampleRate, 192);
  const chunks: Uint8Array[] = [];
  const blockSize = 1152;
  for (let i = 0; i < frameCount; i += blockSize) {
    const left = channels[0].subarray(i, i + blockSize);
    const right =
      info.channels === 2 ? channels[1].subarray(i, i + blockSize) : undefined;
    const encoded = encoder.encodeBuffer(left, right);
    if (encoded.length > 0) chunks.push(encoded);
  }
  const flushed = encoder.flush();
  if (flushed.length > 0) chunks.push(flushed);

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return new Blob([out], { type: "audio/mpeg" });
}