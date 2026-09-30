/**
 * src/lib/marketplace.ts - marketplace client + pure helpers.
 *
 * The marketplace is a standalone surface (mode "marketplace"): it
 * lists published backing tracks from the FastAPI backend and lets
 * the user preview one with a local beat ticker + HTMLAudioElement.
 * It deliberately does NOT couple to playbackClock or the practice
 * audio engine - the preview is its own island.
 *
 * Backend contract (fixed shape, built in parallel):
 *   GET /marketplace/listings -> 200 + array of Listing
 *   (created_at desc, ?status= defaults to published)
 *
 * Base URL: same VITE_DDSP_API pattern as src/lib/ddspSynth.ts.
 * When unset (dev / preview / no backend), it falls back to the
 * local Python backend on the developer's machine:
 * http://127.0.0.1:8765.
 *
 * Why pure, no React:
 *   - parseListing / buildSlideshowLayers / beatAtElapsed are
 *     node-testable without a renderer / DOM / audio engine; pin
 *     them in a node test (PIN-001).
 *   - fetchListings never throws: every failure path (offline,
 *     non-ok status, malformed payload) returns a typed
 *     { ok: false, error } so the surface can render a degraded
 *     state instead of crashing.
 */

import type { SlideLayer } from "./slideshow";

const DEFAULT_BACKEND = "http://127.0.0.1:8765";

export const MARKETPLACE_SERVER: string =
  (import.meta.env.VITE_DDSP_API as string | undefined)?.replace(/\/$/, "") ||
  DEFAULT_BACKEND;

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
  /** WAV render of the active path (renderPathToWav output). */
  wavBlob: Blob;
  /** MIDI data URI (exportToMidiFile output). */
  midiDataUri: string;
  /** Backend-validated slug (^[a-z0-9-]+$). */
  slug: string;
  title?: string;
  composer?: string;
}

/**
 * Build the multipart FormData for POST /marketplace/publish. The
 * audio field carries the WAV render, midi carries the decoded MIDI
 * blob, and slug/title/composer ride as form fields. Empty optional
 * metadata is omitted so the backend defaults apply.
 */
export function buildPublishFormData(input: PublishListingInput): FormData {
  const form = new FormData();
  form.append("audio", input.wavBlob, "render.wav");
  form.append("midi", midiDataUriToBlob(input.midiDataUri), "render.mid");
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
 * Publish the current path to the marketplace: POST the WAV render +
 * MIDI to /marketplace/publish. The backend encodes MP3, commits
 * marketplace/<slug>.mp3 + <slug>.mid to the HSE GitHub repo and
 * syncs the catalog. Never throws: offline, non-ok status and
 * malformed payloads all resolve to a typed failure.
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
    const res = await fetch(`${base}/marketplace/publish`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      let detail = `Marketplace publish failed (${res.status})`;
      try {
        const data = (await res.json()) as { detail?: unknown };
        if (typeof data.detail === "string" && data.detail.length > 0) {
          detail = data.detail;
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
    return { ok: true, listing: parseListing(record.listing) };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Marketplace publish failed";
    return { ok: false, error: message };
  }
}