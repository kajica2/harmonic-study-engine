/**
 * engine/explore/seeds.ts - PRD-001 Phase 5 (D93).
 *
 * Free-text seed parsing through the ONE chord grammar (chordsym) plus
 * hand-rolled scale/interval grammars. Resolution order (deterministic,
 * test-pinned): (1) whole-string parseChordSymbol -> chord; (2a)
 * whitespace-split, every token parseChordSymbol (2+ tokens) ->
 * progression; (2b) numeral head + key context (D21 grammar, e.g.
 * "ii-V-I in C") -> realized progression; (2c) "12-bar" + key context
 * -> 12-bar blues progression; (3) scale grammar -> scale; (4)
 * interval grammar -> interval; (5) else free (never throws, never a
 * dead end - the surface shows preset chips).
 *
 * Purity: relative imports only, no clock, no randomness, no console.
 */

import { parseChordSymbol, buildCellFromSymbol } from "../compose/chordsym";
import { parseNumeral } from "../etude/harmony";
import type { ExploreSeed } from "./types";

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

/**
 * The 12 stub strings, VERBATIM (ExploreSurface stub PRESET_SEEDS).
 * Each MUST parse to a non-free kind (seeds.test.ts pins it).
 */
export const EXPLORE_PRESETS: readonly string[] = [
  "Cmaj7",
  "ii-V-I in C",
  "D dorian",
  "Fmaj7",
  "C blues",
  "12-bar in A",
  "C lydian",
  "Dm9",
  "Bbmaj7-A7alt",
  "G mixolydian",
  "Cm-Eb-Gm progression",
  "Phrygian in E",
];

/** Normalized mode names (lowercase). */
const MODE_ALIASES: Readonly<Record<string, string>> = {
  ionian: "ionian",
  major: "ionian",
  dorian: "dorian",
  phrygian: "phrygian",
  lydian: "lydian",
  mixolydian: "mixolydian",
  aeolian: "aeolian",
  minor: "aeolian",
  locrian: "locrian",
  blues: "blues",
  chromatic: "chromatic",
  "major-pent": "major-pent",
  "major pent": "major-pent",
  "major pentatonic": "major-pent",
  "minor-pent": "minor-pent",
  "minor pent": "minor-pent",
  "minor pentatonic": "minor-pent",
};

/** Interval token -> semitones (test-pinned). */
const INTERVAL_SEMITONES: Readonly<Record<string, number>> = {
  m2: 1,
  M2: 2,
  m3: 3,
  M3: 4,
  P4: 5,
  P5: 7,
  m6: 8,
  M6: 9,
  m7: 10,
  M7: 11,
  oct: 12,
};

const INTERVAL_RE =
  /^(m2|M2|m3|M3|P4|P5|m6|M6|m7|M7|oct)(?:[_\s]+(up|down))?$/;
const KEY_CTX_RE = /^(.*?)\s+in\s+([A-G][#b]?)$/i;
const ROOT_RE = /^[A-G][#b]?$/;

function free(raw: string): ExploreSeed {
  return {
    kind: "free",
    raw,
    chord: null,
    progression: null,
    scale: null,
    interval: null,
  };
}

/** Root pitch class via the ONE grammar (no duplicated ROOT_PC table):
 *  a bare root parses as a major triad - we keep only the rootPc. */
function rootPcOf(token: string): number | null {
  if (!ROOT_RE.test(token)) return null;
  const parsed = parseChordSymbol(token);
  return parsed === null ? null : parsed.rootPc;
}

/**
 * Realize numeral tokens to chord symbols in a key (the "ii-V-I in C"
 * arm). Bare numerals realize as triads per the D21 resolution table
 * ("ii" -> min, "V"/"I" -> maj) - documented, pinned by test.
 */
function realizeNumerals(
  tokens: readonly string[],
  keyPc: number,
  mode: "major" | "minor",
): readonly string[] | null {
  const key = { tonicPc: keyPc, mode, correlation: 1 as const };
  const out: string[] = [];
  for (const token of tokens) {
    const real = parseNumeral(token, mode);
    if (real === null) return null;
    const rootPc = mod12(keyPc + real.rootOffsetSemitones);
    const cell = buildCellFromSymbol(
      { rootPc, qualitySymbol: real.qualitySymbol, bassPc: null },
      key,
    );
    out.push(cell.name);
  }
  return out;
}

/**
 * Realize "12-bar" in a key as the standard 12-bar blues changes
 * (I7 x4, IV7 x2, I7 x2, V7 IV7 I7 V7). The seed names the FORM + key;
 * the standard changes are the honest reading (labeled as such on the
 * card - never claimed as the user's own progression).
 */
function twelveBarBlues(keyPc: number): readonly string[] {
  const key = { tonicPc: keyPc, mode: "major" as const, correlation: 1 as const };
  const steps: readonly number[] = [0, 0, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7];
  return steps.map((offset) => {
    const rootPc = mod12(keyPc + offset);
    return buildCellFromSymbol(
      { rootPc, qualitySymbol: "dom7", bassPc: null },
      key,
    ).name;
  });
}

function parseIntervalToken(
  token: string,
): { semitones: number; direction: "up" | "down" } | null {
  const m = INTERVAL_RE.exec(token.trim());
  if (m === null) return null;
  const semitones = INTERVAL_SEMITONES[m[1]];
  if (semitones === undefined) return null;
  const direction = m[2] === "down" ? "down" : "up";
  return { semitones, direction };
}

/**
 * D93 order. Never throws - unparseable input falls through to free.
 */
export function parseExploreSeed(raw: string): ExploreSeed {
  if (typeof raw !== "string") return free("");
  const trimmed = raw.trim();
  if (trimmed === "") return free(trimmed);

  // (1) Whole-string chord (slash-bass included, whole-token-first).
  const whole = parseChordSymbol(trimmed);
  if (whole !== null) {
    return {
      kind: "chord",
      raw: trimmed,
      chord: trimmed,
      progression: null,
      scale: null,
      interval: null,
    };
  }

  // Hyphen normalization (the "Bbmaj7-A7alt" preset form): chord
  // symbols never contain "-", so this is separator-only.
  const spaced = trimmed.replace(/-/g, " ").replace(/\s+/g, " ").trim();

  // Trailing "in <key>" context ("ii-V-I in C", "Phrygian in E").
  // The key feeds numeral realization + scale roots; the head parses.
  let head = spaced;
  let keyPc: number | null = null;
  const keyCtx = KEY_CTX_RE.exec(spaced);
  if (keyCtx !== null) {
    const pc = rootPcOf(keyCtx[2]);
    if (pc !== null) {
      head = keyCtx[1].trim();
      keyPc = pc;
    }
  }
  if (head === "") return free(trimmed);

  // Filler strip ("Cm-Eb-Gm progression").
  const tokens = head
    .split(" ")
    .filter((t) => t !== "" && t.toLowerCase() !== "progression");

  // (2a) Every token a chord symbol (2+ tokens) -> progression.
  if (tokens.length >= 2 && tokens.every((t) => parseChordSymbol(t) !== null)) {
    return {
      kind: "progression",
      raw: trimmed,
      chord: null,
      progression: tokens,
      scale: null,
      interval: null,
    };
  }

  // (2b) Numeral head ("ii V I") realized in the key (default C major).
  if (tokens.length >= 2) {
    const realized = realizeNumerals(tokens, keyPc ?? 0, "major");
    if (realized !== null) {
      return {
        kind: "progression",
        raw: trimmed,
        chord: null,
        progression: [...realized],
        scale: null,
        interval: null,
      };
    }
  }

  // (2c) "12-bar" form + key -> standard blues changes.
  if (/^12\s*bar$/i.test(head)) {
    return {
      kind: "progression",
      raw: trimmed,
      chord: null,
      progression: [...twelveBarBlues(keyPc ?? 0)],
      scale: null,
      interval: null,
    };
  }

  // (3) Scale grammar: "<root> <mode>" or "<mode> in <root>".
  // (keyCtx arm first: head is the bare mode name.)
  if (keyCtx !== null && keyPc !== null) {
    const modeName = MODE_ALIASES[head.toLowerCase()];
    if (modeName !== undefined) {
      return {
        kind: "scale",
        raw: trimmed,
        chord: null,
        progression: null,
        scale: { rootPc: keyPc, modeName },
        interval: null,
      };
    }
  }
  if (tokens.length >= 2) {
    // Root-first ("C blues") or mode-first ("blues C", accepted).
    const rootFirst =
      rootPcOf(tokens[0]) !== null
        ? { root: rootPcOf(tokens[0]) as number, rest: tokens.slice(1).join(" ") }
        : null;
    const modeFirst =
      tokens.length === 2 && rootPcOf(tokens[1]) !== null
        ? { root: rootPcOf(tokens[1]) as number, rest: tokens[0] }
        : null;
    const shape = rootFirst ?? modeFirst;
    if (shape !== null) {
      const modeName = MODE_ALIASES[shape.rest.toLowerCase()];
      if (modeName !== undefined) {
        return {
          kind: "scale",
          raw: trimmed,
          chord: null,
          progression: null,
          scale: { rootPc: shape.root, modeName },
          interval: null,
        };
      }
    }
  }

  // (4) Interval grammar ("P5 up", "m2_down", "oct").
  const interval = parseIntervalToken(spaced);
  if (interval !== null) {
    return {
      kind: "interval",
      raw: trimmed,
      chord: null,
      progression: null,
      scale: null,
      interval,
    };
  }

  // (5) Free: preset chips only, never an error arm.
  return free(trimmed);
}

/** D98 carrier shape (mirrors the Idea payload slots). */
export interface IdeaLike {
  readonly kind: string;
  readonly chord: string | null;
  readonly progression: readonly string[] | null;
  readonly scale: string | null;
  readonly melody: readonly number[] | null;
  readonly seed: number | null;
}

/**
 * D98: the surface boots its seed text from the current idea. chord ->
 * raw chord; progression -> joined; scale -> raw scale; melody ->
 * space-joined MIDI (parses as free - the melody seeds the VARY panel,
 * not the seed parser - documented); seed -> preset by index.
 */
export function ideaToSeedText(idea: IdeaLike): string {
  if (idea.kind === "chord" && idea.chord !== null) return idea.chord;
  if (
    idea.kind === "progression" &&
    idea.progression !== null &&
    idea.progression.length > 0
  ) {
    return idea.progression.join(" ");
  }
  if (idea.kind === "scale" && idea.scale !== null) return idea.scale;
  if (
    idea.kind === "melody" &&
    idea.melody !== null &&
    idea.melody.length > 0
  ) {
    return idea.melody.join(" ");
  }
  if (idea.kind === "seed" && idea.seed !== null) {
    const idx =
      ((idea.seed % EXPLORE_PRESETS.length) + EXPLORE_PRESETS.length) %
      EXPLORE_PRESETS.length;
    return EXPLORE_PRESETS[idx] as string;
  }
  return "";
}
