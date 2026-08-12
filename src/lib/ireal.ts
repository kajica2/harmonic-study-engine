import { HarmonicPath, HarmonicStep } from "./paths";
import { gunzipSync, strFromU8 } from "fflate";

export function parseChordToMidi(
  chordSymbol: string,
  baseOctave = 4,
): number[] | null {
  const slashSplit = chordSymbol.split("/");
  const mainSymbol = slashSplit[0];
  const bassSymbol = slashSplit[1];

  const match = mainSymbol.match(/^([A-G][b#]?)(.*)$/i);
  if (!match) return null;

  let rootStr = match[1];
  rootStr = rootStr.charAt(0).toUpperCase() + rootStr.slice(1).toLowerCase();
  let qualityStr = match[2] || "";

  const notesList = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];
  const flats: Record<string, string> = {
    Db: "C#",
    Eb: "D#",
    Gb: "F#",
    Ab: "G#",
    Bb: "A#",
  };
  const rootNoteName = flats[rootStr] || rootStr;
  const baseNote = notesList.indexOf(rootNoteName) + baseOctave * 12;
  if (baseNote < 0) return null;

  let intervals = [0, 4, 7]; // Default Major

  qualityStr = qualityStr
    .replace(/\^/g, "maj")
    .replace(/-/g, "m")
    .replace(/h/g, "m7b5")
    .replace(/ø/g, "m7b5")
    .replace(/o/g, "dim");

  if (qualityStr.startsWith("m7b5")) intervals = [0, 3, 6, 10];
  else if (qualityStr.startsWith("m") || qualityStr.startsWith("min")) {
    if (qualityStr.includes("maj7")) intervals = [0, 3, 7, 11];
    else if (qualityStr.includes("7")) intervals = [0, 3, 7, 10];
    else if (qualityStr.includes("9")) intervals = [0, 3, 7, 10, 14];
    else intervals = [0, 3, 7];
  } else if (qualityStr.startsWith("dim")) {
    if (qualityStr.includes("7")) intervals = [0, 3, 6, 9];
    else intervals = [0, 3, 6];
  } else if (qualityStr.startsWith("aug") || qualityStr.startsWith("+"))
    intervals = [0, 4, 8];
  else if (qualityStr.startsWith("sus4")) intervals = [0, 5, 7];
  else if (qualityStr.startsWith("sus2")) intervals = [0, 2, 7];
  else if (qualityStr.includes("maj7") || qualityStr.includes("M7"))
    intervals = [0, 4, 7, 11];
  else if (qualityStr.includes("maj9")) intervals = [0, 4, 7, 11, 14];
  else if (qualityStr.startsWith("7")) intervals = [0, 4, 7, 10];
  else if (qualityStr.startsWith("9")) intervals = [0, 4, 7, 10, 14];
  else if (qualityStr.startsWith("13")) intervals = [0, 4, 7, 10, 14, 21];

  if (qualityStr.includes("b5")) intervals[2] = 6;
  if (qualityStr.includes("#5")) intervals[2] = 8;
  if (qualityStr.includes("b9")) intervals.push(13);
  if (qualityStr.includes("#9")) intervals.push(15);
  if (qualityStr.includes("#11")) intervals.push(18);

  let finalNotes = Array.from(new Set(intervals)).map((i) => baseNote + i);

  if (bassSymbol) {
    const bMatch = bassSymbol.match(/^([A-G][b#]?)/i);
    if (bMatch) {
      let bRoot = bMatch[1];
      bRoot = bRoot.charAt(0).toUpperCase() + bRoot.slice(1).toLowerCase();
      bRoot = flats[bRoot] || bRoot;
      let bNote = notesList.indexOf(bRoot) + baseOctave * 12;
      while (bNote >= finalNotes[0]) bNote -= 12; // ensure lower than the main root
      finalNotes.unshift(bNote);
    }
  }

  // Final dedup and sort
  return Array.from(new Set(finalNotes)).sort((a, b) => a - b);
}

// ----------------------------------------------------------------------------
// iRealBook URL format
// ----------------------------------------------------------------------------
// Examples (real-world shapes users paste):
//
//   irealb://Song%20Name=64=A%20Minor=Swing=K=Cm7%20%7C%20Fm7%20%7C%20Bbmaj7%20%7C%20...=
//   irealbook://Cool%20Chart=n4n=...
//   irealpro://...      (also handled, legacy)
//
// The string after the protocol prefix splits on "=" into segments. The
// chord payload may be in any of three encodings:
//   1. base64-encoded JSON    (most common — produced by iReal Pro itself)
//   2. gzipped base64 JSON    (some older clients)
//   3. raw text with bar lines (the legacy "Cmaj7 | Dm7 G7 | ..." form)
//
// We try them in order. Title/composer/style are picked up from the URL
// when present; otherwise from the decoded payload.

interface IRealSong {
  title?: string;
  composer?: string;
  style?: string;
  key?: string;
  bpm?: number;
  time?: string;
  chords?: Array<string | [string, number]>;
  progression?: Array<string | [string, number]>;
}

interface IRealPlaylist {
  name?: string;
  songs?: IRealSong[];
}

function decodeBase64(b64: string): Uint8Array {
  // Be lenient with URL-safe base64.
  const normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
  const cleaned = normalized.replace(/[^A-Za-z0-9+/=]/g, "");
  const padded = cleaned + "=".repeat((4 - (cleaned.length % 4)) % 4);
  if (typeof atob !== "undefined") {
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Node fallback (tests only — not bundled in the browser build)
  return new Uint8Array(Buffer.from(padded, "base64"));
}

function tryGzip(bytes: Uint8Array): string | null {
  // Magic: 0x1f 0x8b — gzip
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return null;
  try {
    return strFromU8(gunzipSync(bytes));
  } catch {
    return null;
  }
}

function tryJson(bytes: Uint8Array): unknown | null {
  try {
    const text = strFromU8(bytes);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function coerceChordList(
  raw: IRealSong["chords"] | IRealSong["progression"],
): Array<[string, number]> | null {
  const list = raw ?? [];
  if (!Array.isArray(list) || list.length === 0) return null;
  const out: Array<[string, number]> = [];
  for (const entry of list) {
    if (typeof entry === "string") {
      // string only — assume 1 chord per bar
      if (entry.trim()) out.push([entry.trim(), 4]);
    } else if (
      Array.isArray(entry) &&
      typeof entry[0] === "string"
    ) {
      const beats =
        typeof entry[1] === "number" && entry[1] > 0 ? entry[1] : 4;
      if (entry[0].trim()) out.push([entry[0].trim(), beats]);
    }
  }
  return out.length > 0 ? out : null;
}

function chordEntriesToSteps(
  entries: Array<[string, number]>,
): HarmonicStep[] {
  const out: HarmonicStep[] = [];
  for (const [token] of entries) {
    if (!token) continue;
    // A token like "Cmaj7 Dm7 G7" means three chords in one bar; we split.
    const parts = token.split(/\s+/).filter(Boolean);
    for (const part of parts) {
      // iReal Pro sometimes appends *A (alternate) and f (fermata) markers.
      const cleaned = part
        .replace(/[*f<>]/g, "")
        .replace(/^A:/, "")
        .trim();
      if (!cleaned || cleaned.length < 2) continue;
      const notes = parseChordToMidi(cleaned);
      if (notes && notes.length > 0) {
        out.push({ name: cleaned, notes, descriptions: "" });
      }
    }
  }
  return out;
}

function songToHarmonicPath(song: IRealSong, fallbackTitle: string): HarmonicPath | null {
  const entries = coerceChordList(song.chords ?? song.progression);
  if (!entries) return null;
  const steps = chordEntriesToSteps(entries);
  if (steps.length === 0) return null;
  const title =
    (song.title && song.title.trim()) ||
    fallbackTitle ||
    "Imported Progression";
  const composer = song.composer?.trim();
  const style = song.style?.trim();
  const desc =
    [composer, style].filter(Boolean).join(" · ") ||
    "Imported from iRealBook";
  return {
    id: `irealb-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`,
    title,
    description: desc,
    steps,
  };
}

function parseChartText(
  text: string,
  title: string,
): HarmonicPath | null {
  // Plain-text iRealBook chart: bar lines `|`, optional `Tnn` time tag,
  // optional `*X` repeats, optional measure separators `[]`/`<>`.
  const cleaned = text
    .replace(/T\d{2}/g, " ")
    .replace(/\*[A-Z]/g, " ")
    .replace(/N\d/g, " ")
    .replace(/[xZ]/g, " ")
    .replace(/[<>]/g, " ")
    .replace(/\[/g, " | ")
    .replace(/\]/g, " | ")
    .replace(/,/g, " ")
    .replace(/\(/g, " ")
    .replace(/\)/g, " ")
    .replace(/\|+/g, " | ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;

  const tokens = cleaned.split(/\s+/);
  const steps: HarmonicStep[] = [];
  for (const tok of tokens) {
    if (tok === "|" || tok === "l" || tok.length < 2) continue;
    // Skip section labels like "[Intro]", "Verse:", etc.
    if (/^[a-z]+:$/i.test(tok)) continue;
    const notes = parseChordToMidi(tok);
    if (notes && notes.length > 0) {
      steps.push({ name: tok, notes, descriptions: "" });
    }
  }
  if (steps.length === 0) return null;
  return {
    id: `irealb-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`,
    title,
    description: "Imported from text chart",
    steps,
  };
}

/**
 * One-stop importer. Tries (in order):
 *   - iRealBook / iRealPro URL (decoded base64 JSON, gzipped, or text)
 *   - A bare base64 payload
 *   - A bare JSON object
 *   - A bare iReal text chart
 *
 * Returns:
 *   - { paths: [HarmonicPath, ...] } for URL / playlist imports (1+ chart)
 *   - { paths: [HarmonicPath] }      for a single chart (JSON or text)
 *
 * The caller decides what to do with the array.
 */
export function importIRealText(input: string): HarmonicPath[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  // 1) URL form
  const urlMatch = trimmed.match(/irealb(?:ook)?:\/\/(.*)/i);
  if (urlMatch) {
    const decoded = decodeIRealUrl(urlMatch[1]);
    if (decoded.length > 0) return decoded;
  }

  // 2) Bare base64 payload (try gzip-then-json, then raw json)
  const looksLikeB64 = /^[A-Za-z0-9+/_=\s-]+$/.test(trimmed) && trimmed.length > 16;
  if (looksLikeB64) {
    try {
      const bytes = decodeBase64(trimmed.replace(/\s+/g, ""));
      const gz = tryGzip(bytes);
      if (gz) {
        const json = JSON.parse(gz);
        const paths = extractPathsFromJson(json, "Imported");
        if (paths.length > 0) return paths;
      }
      const json = tryJson(bytes);
      if (json) {
        const paths = extractPathsFromJson(json, "Imported");
        if (paths.length > 0) return paths;
      }
    } catch {
      /* fall through */
    }
  }

  // 3) Bare JSON
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const json = JSON.parse(trimmed);
      const paths = extractPathsFromJson(json, "Imported");
      if (paths.length > 0) return paths;
    } catch {
      /* fall through */
    }
  }

  // 4) Plain-text chart
  const chart = parseChartText(trimmed, "Imported Progression");
  if (chart) return [chart];

  return [];
}

function decodeIRealUrl(payload: string): HarmonicPath[] {
  // iRealBook / iRealPro URL formats seen in the wild:
  //   irealb://<title>=<composer>=<style>=<key>=<bpm>=<time>=<encoded payload>
  //   irealbook://<title>=...=...
  //   irealpro://<title>=<composer>=<style>=<key>=<encoded payload>     (legacy)
  // The encoded payload may be plain text, base64 JSON, or gzipped base64 JSON.
  // We try every branch in order of decreasing specificity.
  const decoded = decodeURIComponent(payload);
  const segments = decoded.split("=").map((s) => s.trim()).filter(Boolean);

  // 1) Look for an encoded payload segment. Heuristic: the segment whose
  //    contents decode to JSON (base64 + gzipped/plain) wins.
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (!seg) continue;
    const cleaned = seg.replace(/\s+/g, "");
    if (cleaned.length < 2) continue;

    // base64 path — try gzip first, then raw JSON
    if (/^[A-Za-z0-9+/_=]+$/.test(cleaned)) {
      try {
        const bytes = decodeBase64(cleaned);
        const gz = tryGzip(bytes);
        if (gz) {
          const json = JSON.parse(gz);
          const paths = extractPathsFromJson(json, segments[0] || "Imported");
          if (paths.length > 0) return paths;
        }
        const json = tryJson(bytes);
        if (json) {
          const paths = extractPathsFromJson(json, segments[0] || "Imported");
          if (paths.length > 0) return paths;
        }
      } catch {
        /* keep trying */
      }
    }

    // Plain-text chart segment (contains [, |, > or chord-like tokens)
    if (/[\[\]|>]/.test(seg)) {
      const chart = parseChartText(seg, segments[0] || "Imported");
      if (chart) return [chart];
    }
  }

  // 2) Treat the entire URL body as a chart string (last resort).
  const chart = parseChartText(decoded, segments[0] || "Imported");
  return chart ? [chart] : [];
}

function extractPathsFromJson(
  json: unknown,
  fallbackTitle: string,
): HarmonicPath[] {
  if (!json) return [];
  if (Array.isArray(json)) {
    return json
      .map((entry) => coerceObjectToPath(entry, fallbackTitle))
      .filter((p): p is HarmonicPath => p !== null);
  }
  // Single song or playlist
  if (typeof json === "object") {
    const obj = json as IRealPlaylist & IRealSong;
    // Playlist form: { name, songs: [...] }
    if (Array.isArray(obj.songs)) {
      const ps: HarmonicPath[] = [];
      for (const song of obj.songs) {
        const path = songToHarmonicPath(song, obj.name || fallbackTitle);
        if (path) ps.push(path);
      }
      return ps;
    }
    // Single-song form
    return coerceObjectToPath(obj, fallbackTitle) ? [coerceObjectToPath(obj, fallbackTitle)!] : [];
  }
  return [];
}

function coerceObjectToPath(
  obj: unknown,
  fallbackTitle: string,
): HarmonicPath | null {
  if (!obj || typeof obj !== "object") return null;
  return songToHarmonicPath(obj as IRealSong, fallbackTitle);
}

// ----------------------------------------------------------------------------
// Backwards-compatible single-path API (used by existing ImportExportModal).
// ----------------------------------------------------------------------------
export function importIReal(text: string): HarmonicPath | null {
  const paths = importIRealText(text);
  return paths[0] ?? null;
}

// ----------------------------------------------------------------------------
// iReal Pro URL export
// ----------------------------------------------------------------------------
export function exportIReal(path: HarmonicPath): string {
  const chords = path.steps
    .map((s) => s.name.replace(/maj/g, "^").replace(/m/g, "-"))
    .join(" |");
  const title = encodeURIComponent(path.title);
  return `irealpro://${title}=Unknown==Medium Swing=C=n=[T44 ${chords} ]`;
}