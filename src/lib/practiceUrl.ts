/**
 * src/lib/practiceUrl.ts - PRD-001 Phase 8 S1 (D145).
 *
 * Practice/study-surface URL <-> scalars. One truth per value: each
 * key maps to exactly one shipped store field (never a second
 * source). NO DOM, NO data imports - the persona list is INJECTED at
 * parse (App passes the live PERSONAS ids), keeping this module pure
 * + node-tested like composeUrl.ts / etudeUrl.ts.
 *
 * Param scheme (D145, four keys):
 *   path     the ACTIVE PATH ID (never the index - the recipient's
 *            list may differ; generated `etu-*` paths NEVER ride,
 *            they belong to the 13 etude keys, ADR-015 "requests not
 *            results")
 *   bpm      tempo, integer domain 20..400, deleted at the shipped
 *            default 60 (etude/compose compact law)
 *   persona  selectedPersonaId, membership-checked at parse, deleted
 *            at "" (none)
 *   voicing  voicingType, membership-checked at parse, deleted at
 *            "closed" (the shipped default)
 *
 * Malformed / unresolvable values are SILENTLY dropped at parse
 * (D145: practice keys are additive context, never a session's
 * identity - contrast compose, where a malformed session IS a broken
 * identity and warns). Absent keys parse to null so the boot merge
 * keeps the PERSISTED value (HIGH-001 field-wise doctrine; the
 * presence map mirrors composeUrl.ts:260-270 - PRESENCE is raw
 * params.has, never "parsed to non-default").
 */

export const PRACTICE_URL_KEYS: readonly ["path", "bpm", "persona", "voicing"] =
  ["path", "bpm", "persona", "voicing"];

/** Defaults that DELETE their key (the etude/compose compact law). */
export const PRACTICE_URL_DEFAULTS: { readonly bpm: 60; readonly voicing: "closed" } =
  { bpm: 60, voicing: "closed" };

/** bpm domain (D145): a superset of the UI clamps (30..240 header
 *  slider / keyboard); parse CLAMPS hand-typed values into it. */
export const PRACTICE_BPM_MIN = 20;
export const PRACTICE_BPM_MAX = 400;

/** Catalog id shape: lowercase alnum start, then lowercase alnum +
 *  hyphen, max 64 total (RAW_PATHS `path-N`, STUDIES `study-*`,
 *  composer ids all fit; `etu-*` is rejected separately by prefix). */
const PATH_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Generated-etude prefix (etudeEngine.ts etudePathId): a RESULT, not
 *  a request - the 13 etude keys already carry its regeneration. */
const ETUDE_PATH_PREFIX = "etu-";

export interface PracticeStateIn {
  pathId: string; // "" when no active path
  bpm: number;
  personaId: string; // "" = none
  voicingId: string;
}

/** Serialize; null values DELETE keys. LAWS (pinned in the test):
 *  - pathId starting "etu-" -> key DROPPED (ADR-015 interaction);
 *  - pathId failing the format gate -> key dropped;
 *  - bpm 60 (default), non-integer, or outside 20..400 -> key
 *    dropped; in-domain non-default integers written as-is (the
 *    clamp on the way IN is the boot reader's job);
 *  - persona "" / voicing "closed" -> keys dropped. */
export function serializePractice(s: PracticeStateIn): Record<string, string | null> {
  const rec: Record<string, string | null> = {
    path: null,
    bpm: null,
    persona: null,
    voicing: null,
  };
  if (
    s.pathId !== "" &&
    !s.pathId.startsWith(ETUDE_PATH_PREFIX) &&
    PATH_ID_RE.test(s.pathId)
  ) {
    rec.path = s.pathId;
  }
  if (
    Number.isInteger(s.bpm) &&
    s.bpm >= PRACTICE_BPM_MIN &&
    s.bpm <= PRACTICE_BPM_MAX &&
    s.bpm !== PRACTICE_URL_DEFAULTS.bpm
  ) {
    rec.bpm = String(s.bpm);
  }
  if (s.personaId !== "") rec.persona = s.personaId;
  if (s.voicingId !== PRACTICE_URL_DEFAULTS.voicing) rec.voicing = s.voicingId;
  return rec;
}

export interface PracticeUrlPresence {
  readonly path: boolean;
  readonly bpm: boolean;
  readonly persona: boolean;
  readonly voicing: boolean;
}

/** Field-wise merge doctrine (HIGH-001): ONLY present keys may win.
 *  PRESENCE is the raw params.has (the composeUrl.ts:244-249 lesson:
 *  parsed-non-default != present - ?bpm=60 IS present and must
 *  overwrite a fresher persisted 132). */
export function practiceUrlPresence(params: URLSearchParams): PracticeUrlPresence {
  return {
    path: params.has("path"),
    bpm: params.has("bpm"),
    persona: params.has("persona"),
    voicing: params.has("voicing"),
  };
}

export interface PracticeUrlOut {
  readonly pathId: string | null; // valid-format, non-etu
  readonly bpm: number | null; // integer 20..400 (clamped)
  readonly personaId: string | null; // membership-checked
  readonly voicingId: string | null; // membership-checked
}

function parseIntStrict(raw: string): number | null {
  if (!/^-?\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

/** Parse the PRESENT subset. Absent keys are null (never "default" -
 *  the caller keeps the persisted value). Malformed or etu-* values
 *  are SILENTLY null (benign-drop, D145). bpm clamped 20..400. */
export function parsePracticeParams(
  params: URLSearchParams,
  validPersonaIds: readonly string[],
  validVoicingIds: readonly string[],
): PracticeUrlOut {
  const pathRaw = params.get("path");
  const pathId =
    pathRaw !== null &&
    !pathRaw.startsWith(ETUDE_PATH_PREFIX) &&
    PATH_ID_RE.test(pathRaw)
      ? pathRaw
      : null;

  let bpm: number | null = null;
  const bpmRaw = params.get("bpm");
  if (bpmRaw !== null) {
    const n = parseIntStrict(bpmRaw);
    if (n !== null) bpm = Math.max(PRACTICE_BPM_MIN, Math.min(PRACTICE_BPM_MAX, n));
  }

  const personaRaw = params.get("persona");
  const personaId =
    personaRaw !== null && validPersonaIds.includes(personaRaw) ? personaRaw : null;

  const voicingRaw = params.get("voicing");
  const voicingId =
    voicingRaw !== null && validVoicingIds.includes(voicingRaw) ? voicingRaw : null;

  return { pathId, bpm, personaId, voicingId };
}
