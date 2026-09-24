/**
 * src/lib/composeUrl.ts - PRD-001 Phase 4 Slice 4 (D86).
 *
 * Pure URL <-> ComposeSession serialization (etudeUrl.ts is the
 * template). The compose keys RIDE the SINGLE debounced writer
 * (ADR-015 - a second read-modify-write effect on location.search
 * would race it; a second writer is structurally banned).
 *
 * Param scheme (REQ-IO-50 compose portion + REQ-IO-51):
 *   cfile  fileName (MIDI sessions only - charts carry cchart)
 *   chash  fileHash (the hash-gate identity: cross-device restore
 *          seeds the EXISTING "Re-upload <file>" prompt, REQ-IO-51)
 *   cchart pasted chart TEXT (user-typed text, NEVER file bytes -
 *          REQ-IO-70 honored)
 *   creq   accompaniment request (JSON)
 *   covr   analysis overrides (JSON - chordCells included, they are
 *          small)
 *   canf   "1" when analyzeFull
 *   cmix   mixer state (JSON)
 *
 * Defaults/absent fields DELETE their key (compact URLs). SIZE
 * GOVERNOR: a serialized payload over COMPOSE_URL_MAX chars flips
 * tooLarge -> the writer SKIPS every compose key (practice/etude keys
 * survive untouched) and the surface shows the honest notice (never
 * silent truncation - RK-S4-5).
 *
 * Malformed values parse to { session: null, malformed: true } - the
 * boot reader warns and DROPS (the ?idea= precedent), the persisted
 * slice survives. No DOM: takes/returns URLSearchParams (node-tested).
 *
 * BOOT RESTORE (HIGH-001, S4 fix round): mergeComposeUrlWithPersisted
 * below - a stale debounced URL never clobbers fresher persisted
 * values field-wise; genuine cross-device shares (empty storage) keep
 * the wholesale URL-wins.
 */

import { CHART_SESSION_FILE_NAME, type ComposeSession } from "../state/sessionStore";
import {
  EMPTY_OVERRIDES,
  MIXER_DEFAULTS,
  type AccompanimentRequest,
  type AnalysisOverrides,
  type MixerState,
} from "../../engine/compose/types";

export const COMPOSE_URL_KEYS: readonly string[] = [
  "cfile",
  "chash",
  "cchart",
  "creq",
  "covr",
  "canf",
  "cmix",
];

/** D86/RK-S4-5: the compose-payload governor (chars). A pasted chart
 *  is normally < 1KB; a 200-cell override map is the blowout case. */
export const COMPOSE_URL_MAX = 6000;

/** True when ANY compose key is present - distinguishes "no compose
 *  in this URL" (silent) from "malformed compose params" (warn). */
export function hasComposeParams(params: URLSearchParams): boolean {
  return COMPOSE_URL_KEYS.some((k) => params.has(k));
}

type ParamRecord = Record<string, string | null>;

function json(v: unknown): string {
  return JSON.stringify(v);
}

function sameAsDefaults(v: unknown, defaults: unknown): boolean {
  try {
    return JSON.stringify(v) === JSON.stringify(defaults);
  } catch {
    return false;
  }
}

/** Serialize the compose session; null values DELETE the key. On
 *  tooLarge EVERY compose key is deleted (practice/etude keys are
 *  untouched - the writer merges per-entry). */
export function serializeComposeSession(s: ComposeSession | null): {
  record: ParamRecord;
  tooLarge: boolean;
} {
  const rec: ParamRecord = {};
  const wipe = (): ParamRecord => {
    for (const k of COMPOSE_URL_KEYS) rec[k] = null;
    return rec;
  };
  if (s === null) return { record: wipe(), tooLarge: false };

  const isChart = s.chartText != null;
  if (isChart) {
    rec.cchart = s.chartText ?? null;
    rec.cfile = null; // chart identity rides cchart alone (e2e leg 6)
    rec.chash = null;
  } else {
    rec.cfile = s.fileName;
    rec.chash = s.fileHash;
    rec.cchart = null;
  }
  rec.creq = s.request != null ? json(s.request) : null;
  rec.covr = sameAsDefaults(s.overrides, EMPTY_OVERRIDES) ? null : json(s.overrides);
  rec.canf = s.analyzeFull ? "1" : null;
  rec.cmix = s.mixer != null && !sameAsDefaults(s.mixer, MIXER_DEFAULTS) ? json(s.mixer) : null;

  const total = Object.entries(rec).reduce(
    (n, [k, v]) => (v === null ? n : n + k.length + 1 + encodeURIComponent(v).length + 1),
    0,
  );
  if (total > COMPOSE_URL_MAX) {
    return { record: wipe(), tooLarge: true };
  }
  return { record: rec, tooLarge: false };
}

function parseOverrides(raw: string): AnalysisOverrides | null {
  try {
    const v = JSON.parse(raw) as Partial<AnalysisOverrides>;
    if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
    // Sparse by contract: fill any missing field from the frozen
    // defaults so downstream consumers see the full map.
    return {
      key: v.key ?? null,
      tempoBpm: typeof v.tempoBpm === "number" ? v.tempoBpm : null,
      timeSignature: Array.isArray(v.timeSignature) ? (v.timeSignature as [number, number]) : null,
      melodyTrackIndex: typeof v.melodyTrackIndex === "number" ? v.melodyTrackIndex : null,
      chordCells: v.chordCells ?? {},
      roles: v.roles ?? {},
    };
  } catch {
    return null;
  }
}

function parseRequest(raw: string): AccompanimentRequest | null {
  try {
    const v = JSON.parse(raw) as Partial<AccompanimentRequest>;
    if (
      v === null ||
      typeof v !== "object" ||
      v.version !== 1 ||
      typeof v.styleId !== "string" ||
      !Array.isArray(v.roles) ||
      typeof v.density !== "number" ||
      typeof v.seed !== "number"
    ) {
      return null;
    }
    return v as AccompanimentRequest;
  } catch {
    return null;
  }
}

function parseMixer(raw: string): MixerState | null {
  try {
    const v = JSON.parse(raw) as MixerState;
    if (v === null || typeof v !== "object") return null;
    for (const g of ["original", "bass", "chords", "pad"] as const) {
      const s = v[g];
      if (
        !s ||
        typeof s.level !== "number" ||
        s.level < 0 ||
        s.level > 1 ||
        typeof s.muted !== "boolean" ||
        typeof s.solo !== "boolean"
      ) {
        return null;
      }
    }
    return v;
  } catch {
    return null;
  }
}

/** Parse the compose param subset (boot read). Absent keys are NOT
 *  malformed (hasComposeParams separates the cases upstream). */
export function parseComposeParams(params: URLSearchParams): {
  session: ComposeSession | null;
  malformed: boolean;
} {
  const bad = { session: null, malformed: true } as const;
  const cchart = params.get("cchart");
  const cfile = params.get("cfile");
  if (cchart === null && cfile === null) {
    // Compose keys present but NO session identity -> malformed.
    return bad;
  }
  let overrides: AnalysisOverrides = EMPTY_OVERRIDES;
  const covr = params.get("covr");
  if (covr !== null) {
    const parsed = parseOverrides(covr);
    if (parsed === null) return bad;
    overrides = parsed;
  }
  let request: AccompanimentRequest | null | undefined;
  const creq = params.get("creq");
  if (creq !== null) {
    request = parseRequest(creq) ?? undefined;
    if (request === undefined) return bad;
  }
  let mixer: MixerState | null | undefined;
  const cmix = params.get("cmix");
  if (cmix !== null) {
    mixer = parseMixer(cmix) ?? undefined;
    if (mixer === undefined) return bad;
  }
  const canfRaw = params.get("canf");
  if (canfRaw !== null && canfRaw !== "1" && canfRaw !== "0") return bad;

  if (cchart !== null) {
    return {
      session: {
        fileName: CHART_SESSION_FILE_NAME,
        fileHash: null,
        overrides,
        analyzeFull: canfRaw === "1",
        request: request ?? null,
        chartText: cchart,
        mixer: mixer ?? null,
      },
      malformed: false,
    };
  }
  return {
    session: {
      fileName: cfile as string,
      fileHash: params.get("chash"),
      overrides,
      analyzeFull: canfRaw === "1",
      request: request ?? null,
      chartText: null,
      mixer: mixer ?? null,
    },
    malformed: false,
  };
}

/** Which compose keys the URL ACTUALLY carries. The boot merge
 *  (HIGH-001, S4 fix round) takes URL values ONLY for keys present
 *  here - an absent key never overwrites the fresher persisted
 *  session. PRESENCE is the raw `params.has` (not "value parsed to
 *  non-default"): parseComposeParams fills defaults for absent keys,
 *  so the parsed session alone cannot answer "did the URL carry it". */
export interface ComposeUrlPresence {
  readonly cfile: boolean;
  readonly chash: boolean;
  readonly cchart: boolean;
  readonly creq: boolean;
  readonly covr: boolean;
  readonly canf: boolean;
  readonly cmix: boolean;
}

export function composeUrlPresence(params: URLSearchParams): ComposeUrlPresence {
  return {
    cfile: params.has("cfile"),
    chash: params.has("chash"),
    cchart: params.has("cchart"),
    creq: params.has("creq"),
    covr: params.has("covr"),
    canf: params.has("canf"),
    cmix: params.has("cmix"),
  };
}

/**
 * HIGH-001 (S4 fix round): the FIELD-WISE boot merge.
 *
 * The bug: the debounced (200ms) URL writer dies on reload, so a fast
 * reload's URL can carry a STALE compose payload while localStorage
 * holds the fresher one - and the old wholesale "URL > persisted"
 * (D28 precedent) clobbered it (S3 e2e leg-3 flake: seed 43 expected,
 * 42 received). The complement fix (App.tsx) flushes the writer on
 * pagehide so the URL is normally fresh; THIS closes the structural
 * hole for keys the URL never carried at all.
 *
 * Rules:
 *  - persisted === null (genuine cross-device share) -> URL wins
 *    WHOLESALE (the D86 contract, unchanged).
 *  - identity gate: merge ONLY when the two sessions are the SAME
 *    session - same cfile+chash, or BOTH charts. Any mismatch is a
 *    genuine session switch: URL wins wholesale.
 *  - under the gate: URL values for PRESENT keys only; absent keys
 *    fall back to the persisted values. Identity fields come from the
 *    URL (equal under the file gate; the chart text is always present
 *    when cchart rides).
 *
 * Known accepted ambiguity: the compact-URL scheme deletes keys at
 * defaults, so "absent" cannot distinguish "writer died early" from
 * "user cleared the value" - a cleared-then-reloaded request may
 * resurrect from storage. The pagehide flush narrows that window to
 * ~ms, and resurrection is the SAFE direction (the alternative - the
 * HIGH-001 bug - LOSES user state).
 */
export function mergeComposeUrlWithPersisted(
  url: ComposeSession,
  presence: ComposeUrlPresence,
  persisted: ComposeSession | null,
): ComposeSession {
  if (persisted === null) return url;
  const urlChart = url.chartText !== null;
  const persistedChart = persisted.chartText !== null;
  const sameIdentity =
    urlChart === persistedChart &&
    (urlChart || (url.fileName === persisted.fileName && url.fileHash === persisted.fileHash));
  if (!sameIdentity) return url;
  return {
    fileName: url.fileName,
    fileHash: url.fileHash,
    chartText: url.chartText,
    request: presence.creq ? url.request : persisted.request,
    overrides: presence.covr ? url.overrides : persisted.overrides,
    analyzeFull: presence.canf ? url.analyzeFull : persisted.analyzeFull,
    mixer: presence.cmix ? url.mixer : persisted.mixer,
  };
}
