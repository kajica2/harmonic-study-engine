/**
 * midiBatchExport — plan + pack N paths × M MIDI variations into a
 * single ZIP archive. Lives next to midiExport.ts because it consumes
 * its API, but is deliberately split out so the pure MIDI writer
 * stays narrow (single file in, single file out).
 *
 * Public surface:
 *
 *   planBatchExport(items) → BatchResult[]
 *     Pure. Builds one entry per (path × variation) with a
 *     collision-safe slug filename and the data URI from the writer.
 *
 *   zipBatchExport(results) → Promise<Blob>
 *     Async because fflate's zipSync is sync but the Blob constructor
 *     that wraps the result is best created via the async `zip`
 *     pipeline so callers can use it directly with the existing
 *     download helper. Empty input returns an empty archive (Blob
 *     backed by a single 0-byte buffer) — useful for the "nothing
 *     selected" UX without needing a special-case branch.
 *
 *   downloadBatchZip(blob, filename)
 *     DOM-touching. Lives here for cohesion but is exported
 *     separately so the pure tests don't import it. The modal in
 *     ImportExportModal.tsx calls this directly.
 */

import { HarmonicPath } from "./paths";
import { MidiVariation, exportMidiWithVariation } from "./midiExport";
import { zipSync, strToU8 } from "fflate";

export interface BatchItem {
  path: HarmonicPath;
  variations: MidiVariation[];
}

export interface BatchResult {
  /** Relative path inside the ZIP, e.g. "study-star-eyes__transpose+5.mid" */
  filename: string;
  /** The MIDI data URI produced by exportMidiWithVariation. */
  dataUri: string;
}

/**
 * Lowercase, alphanumeric-or-underscore slug. Mirrors the
 * ImportExportModal's existing single-path filename slug so the
 * UI stays consistent.
 */
function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * Human-readable label for a variation. Used in filenames so the
 * user can tell `asWritten.mid` from `transpose+5.mid` from
 * `closedVoicing.mid`.
 */
function variationLabel(v: MidiVariation): string {
  switch (v.kind) {
    case "asWritten":
      return "as_written";
    case "transpose":
      const sign = v.semitones >= 0 ? "+" : "";
      return `transpose${sign}${v.semitones}`;
    case "splitTracks":
      return "split_tracks";
    case "melodyOnly":
      return `melody_${v.melodyIndex}`;
    case "rhythmOnly":
      return `rhythm_${v.noteDuration}`;
    case "closedVoicing":
      return "closed_voicing";
    case "openVoicing":
      return "open_voicing";
  }
}

/**
 * Append a `-2`, `-3`, … suffix if the proposed filename has already
 * been used in this batch. Mutates `used` (passed by reference) and
 * returns the disambiguated filename. Always returns a string ending
 * in `.mid`.
 */
function deduplicate(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  // Strip the trailing ".mid" before adding the suffix.
  const stem = base.replace(/\.mid$/, "");
  for (let n = 2; n < 1000; n++) {
    const candidate = `${stem}-${n}.mid`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  // Pathologically unique enough that 1000 collisions won't happen in
  // a real batch — but bail loudly if it ever does.
  throw new Error(`midiBatchExport: too many filename collisions for "${base}"`);
}

/**
 * Plan a batch: return one BatchResult per (path × variation).
 *
 * The order is stable: each path's variations appear in the order
 * they were given. Filenames are slug-safe (lowercase, underscore
 * for non-alnum) and disambiguated within the batch so two paths
 * with identical titles don't clobber each other in the archive.
 */
export function planBatchExport(items: BatchItem[]): BatchResult[] {
  const results: BatchResult[] = [];
  const used = new Set<string>();

  for (const item of items) {
    const pathSlug = slugify(item.path.title || item.path.id || "untitled");
    for (const variation of item.variations) {
      const dataUri = exportMidiWithVariation(item.path, variation);
      const label = variationLabel(variation);
      const proposed = `${pathSlug}__${label}.mid`;
      const filename = deduplicate(proposed, used);
      results.push({ filename, dataUri });
    }
  }
  return results;
}

/**
 * Pack the planned batch into a single ZIP archive, returned as a
 * Blob ready for download. Uses fflate's sync zip + strToU8 helpers
 * (no worker, no streaming) because batch sizes are bounded by the
 * path count and we want the API to stay simple. The function is
 * marked async-returning so the caller can `await` it the same way
 * regardless of whether we move to fflate's streaming `zip` later.
 * Empty input → an empty archive (a Blob containing only the ZIP
 * end-of-central-dir record).
 */
export function zipBatchExport(results: BatchResult[]): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  for (const r of results) {
    // data URI → base64 payload → bytes.
    const b64 = r.dataUri.replace(/^data:audio\/midi;base64,/, "");
    // atob exists in both browser and Node 18+. Decode the base64 to a
    // binary string, then hand it to strToU8(latin1=true) so fflate
    // treats each char as one byte.
    const bin = atob(b64);
    files[r.filename] = strToU8(bin, true);
  }
  const zipped = zipSync(files);
  // Wrap the bytes in a Blob. The constructor accepts Uint8Array
  // directly; the explicit cast keeps TS happy across the fflate
  // generic boundary.
  const blob = new Blob([zipped as unknown as BlobPart], { type: "application/zip" });
  return Promise.resolve(blob);
}

/**
 * Trigger a browser download for the given ZIP blob. DOM-touching —
 * not exercised by the pure batch tests (which only check the
 * Blob shape), but called by ImportExportModal.
 */
export function downloadBatchZip(blob: Blob, zipFilename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = zipFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoke after a tick so the click has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}