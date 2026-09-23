/**
 * src/lib/etudeUrl.ts - PRD-001 Phase 3 Slice 2 (D28).
 *
 * Pure URL <-> EtudeConstraints serialization. No DOM: takes /
 * returns URLSearchParams and plain objects, so it is node-testable.
 *
 * Param scheme (D28):
 *   CORE (required together, as a set): style, key, tmode, diff,
 *   bars, seed. `tmode` carries the TONAL mode - `mode` is owned by
 *   the app-mode selector (REQ-MODE-2) and is never reused here.
 *   OPTIONAL (omitted at their default for compact URLs): tempo
 *   (absent = profile default), start, end, chrom, straight, cts,
 *   maxint.
 *
 * Malformed / partial sets parse to null - the caller (App boot
 * effect) warns and drops, exactly like the ?idea= precedent. The
 * ABSENCE of every etude key is not malformed: it parses to null
 * silently (hasEtudeParams distinguishes the two cases).
 */

import { shippedStyleIds } from "../../engine/styles/index";
import type { StyleId } from "../../engine/styles/types";
import { parseKey, spellTonic } from "../../engine/core/spelling";
import { isDifficulty } from "../../engine/styles/difficulty";
import {
  validateEtudeConstraints,
  type EtudeConstraints,
  type EtudeMode,
} from "../../engine/etude/types";

/** The six keys that must ALL be present for a parse to even try. */
export const ETUDE_URL_CORE_KEYS: readonly string[] = [
  "style",
  "key",
  "tmode",
  "diff",
  "bars",
  "seed",
];

/** Every key this module may write (core + optional) - the delete set
 *  for "no constraints" and the presence check for warn-and-drop. */
export const ETUDE_URL_KEYS: readonly string[] = [
  ...ETUDE_URL_CORE_KEYS,
  "tempo",
  "start",
  "end",
  "chrom",
  "straight",
  "cts",
  "maxint",
];

/** True when ANY etude key is present - used by the boot reader to
 *  tell "no etude in this URL" (silent) from "malformed etude params"
 *  (warn-and-drop). */
export function hasEtudeParams(params: URLSearchParams): boolean {
  return ETUDE_URL_KEYS.some((k) => params.has(k));
}

type ParamRecord = Record<string, string | null>;

function setOrDelete(rec: ParamRecord, key: string, value: string | null): void {
  rec[key] = value;
}

/** Serialize constraints to a param record; null values DELETE the
 *  key (the single debounced writer applies set/delete per entry).
 *  null constraints => delete every etude key. */
export function serializeEtudeConstraints(
  c: EtudeConstraints | null,
): ParamRecord {
  const rec: ParamRecord = {};
  if (c === null) {
    for (const key of ETUDE_URL_KEYS) rec[key] = null;
    return rec;
  }
  rec.style = c.styleId;
  rec.key = spellTonic(c.key, c.mode, "");
  rec.tmode = c.mode;
  rec.diff = String(c.difficulty);
  rec.bars = String(c.bars);
  setOrDelete(rec, "tempo", c.tempo === null ? null : String(c.tempo));
  rec.seed = String(c.seed);
  setOrDelete(rec, "start", c.harmony.startOn);
  setOrDelete(rec, "end", c.harmony.endOn);
  setOrDelete(rec, "chrom", c.harmony.requireChromaticism ? "1" : null);
  setOrDelete(rec, "straight", c.rhythm.straightRhythmsOnly ? "1" : null);
  setOrDelete(rec, "cts", c.melody.chordTonesOnStrongBeats ? "1" : null);
  setOrDelete(
    rec,
    "maxint",
    c.melody.maxIntervalSemitones === null
      ? null
      : String(c.melody.maxIntervalSemitones),
  );
  return rec;
}

function parseIntStrict(raw: string): number | null {
  if (!/^-?\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

function parseFlag(raw: string | null): boolean | null {
  if (raw === null || raw === "0") return false;
  if (raw === "1") return true;
  return null; // any other value is malformed
}

/** Parse the etude param subset. Returns null on absent (no keys) OR
 *  malformed / partial input - see hasEtudeParams for the split. */
export function parseEtudeParams(
  params: URLSearchParams,
): EtudeConstraints | null {
  const style = params.get("style");
  const keyRaw = params.get("key");
  const tmode = params.get("tmode");
  const diffRaw = params.get("diff");
  const barsRaw = params.get("bars");
  const seedRaw = params.get("seed");
  if (
    style === null ||
    keyRaw === null ||
    tmode === null ||
    diffRaw === null ||
    barsRaw === null ||
    seedRaw === null
  ) {
    return null; // partial core set
  }

  const styleHit = shippedStyleIds().find((s: StyleId) => s === style);
  if (styleHit === undefined) return null;
  if (tmode !== "major" && tmode !== "minor") return null;
  const mode: EtudeMode = tmode;

  const parsedKey = parseKey(keyRaw);
  if (parsedKey === null) return null;

  const diff = parseIntStrict(diffRaw);
  // isDifficulty is a type guard over unknown - narrows diff to Difficulty.
  if (diff === null || !isDifficulty(diff)) return null;
  const bars = parseIntStrict(barsRaw);
  if (bars === null || bars < 4 || bars > 32) return null;
  const seed = parseIntStrict(seedRaw);
  if (seed === null || seed < 0 || seed > 4294967295) return null;

  let tempo: number | null = null;
  const tempoRaw = params.get("tempo");
  if (tempoRaw !== null) {
    tempo = parseIntStrict(tempoRaw);
    if (tempo === null) return null; // range owned by the validator
  }

  const chrom = parseFlag(params.get("chrom"));
  const straight = parseFlag(params.get("straight"));
  const cts = parseFlag(params.get("cts"));
  if (chrom === null || straight === null || cts === null) return null;

  let maxIntervalSemitones: number | null = null;
  const maxintRaw = params.get("maxint");
  if (maxintRaw !== null) {
    maxIntervalSemitones = parseIntStrict(maxintRaw);
    if (maxIntervalSemitones === null) return null;
  }

  const candidate: EtudeConstraints = {
    version: 1,
    styleId: styleHit,
    key: parsedKey.tonicPc,
    mode,
    difficulty: diff,
    bars,
    tempo,
    seed,
    harmony: {
      allowedQualities: null,
      allowedNumerals: null,
      startOn: params.get("start"),
      endOn: params.get("end"),
      requireChromaticism: chrom,
    },
    melody: {
      maxIntervalSemitones,
      chordTonesOnStrongBeats: cts,
      range: null,
    },
    rhythm: { straightRhythmsOnly: straight },
  };

  // Final authority: the engine validator (numeral tokens, tempo
  // range, maxint bounds, ...). Anything it rejects is malformed.
  if (!validateEtudeConstraints(candidate).ok) return null;
  return candidate;
}
