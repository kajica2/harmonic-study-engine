/**
 * engine/etude/harmony.ts - PRD-001 Phase 3 Slice 1 (REQ-ETU-10/12/13, D21).
 *
 * The D21 numeral grammar (parseNumeral) + the progression generator.
 * The grammar is a strict superset of every token in the three shipped
 * StyleProfiles' vocabularies and progressions (pinned by
 * harmony.test.ts) and is shared by annotate.ts (which reads chord
 * numeral tokens, never prose) and concepts.exampleNumerals.
 *
 * Grammar (D21):
 *   [b|#] + degree(I..VII, case-significant: upper = major family,
 *   lower = minor family) + [o] (diminished) + suffix:
 *   maj7 | 7 | m7 | 7(b5) | alt | 7alt | sus4 | add9 | 6 | bare triad.
 *   Degree -> scale offset via the mode table (major
 *   [0,2,4,5,7,9,11], natural minor [0,2,3,5,7,8,10]); b = -1, # = +1.
 *
 * Determinism contract: ONE rng handle, draw order fixed:
 * template pick -> per-bar chromatic passes (bars ascending) ->
 * per-bar extension/alteration passes (bars ascending). Never reorder.
 *
 * Purity: relative imports only, no clock, no console; all randomness
 * through the injected Rng.
 */

import type { Rng } from "../core/rng";
import type { StyleProfile } from "../styles/types";
import { scaleProbability } from "../styles/difficulty";
import { spellTonic } from "../core/spelling";
import type { EtudeChord, EtudeConstraints, EtudeMode } from "./types";

/** D21 realization: everything a caller needs to sound one token. */
export interface NumeralRealization {
  readonly rootOffsetSemitones: number; // 0..11, relative to tonic
  readonly qualitySymbol: string; // see QUALITY_INTERVALS keys
  readonly intervals: readonly number[]; // semitones above root, ascending
}

/** Structural view of a token (used by annotate.ts + the filter). */
export interface NumeralInfo {
  readonly accidental: "" | "b" | "#";
  readonly degree: number; // 1..7
  readonly upper: boolean; // uppercase = major family
  readonly dim: boolean; // trailing 'o'
  readonly suffix: string; // "" | maj7 | 7 | m7 | 7(b5) | alt | 7alt | sus4 | add9 | 6
}

export const MODE_OFFSETS: Record<EtudeMode, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

const DEGREE_TO_ROMAN: readonly string[] = [
  "I", "II", "III", "IV", "V", "VI", "VII",
];
const ROMAN_TO_DEGREE: Readonly<Record<string, number>> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7,
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7,
};

const QUALITY_INTERVALS: Readonly<Record<string, readonly number[]>> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  halfdim: [0, 3, 6, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  alt: [0, 4, 7, 10, 20], // dom7 + b13 (D21)
  sus4: [0, 5, 7, 10], // 7sus4: root, 4th, 5th, b7
  maj6: [0, 4, 7, 9],
  min6: [0, 3, 7, 9],
  majadd9: [0, 4, 7, 14], // add9 = quality + 14 semitones (D21)
  minadd9: [0, 3, 7, 14],
  maj9: [0, 4, 7, 11, 14],
  dom9: [0, 4, 7, 10, 14],
  min9: [0, 3, 7, 10, 14],
};

/** qualitySymbol -> token used in HarmonyConstraints.allowedQualities. */
const QUALITY_TOKEN: Readonly<Record<string, string>> = {
  maj: "maj", min: "min", dim: "dim", dim7: "dim7", halfdim: "m7b5",
  maj7: "maj7", m7: "m7", dom7: "7", alt: "7alt", sus4: "sus4",
  maj6: "6", min6: "m6", majadd9: "majadd9", minadd9: "minadd9",
  maj9: "maj9", dom9: "9", min9: "m9",
};

/** qualitySymbol -> chord-name suffix (ASCII, no glyphs). */
const NAME_SUFFIX: Readonly<Record<string, string>> = {
  maj: "", min: "m", dim: "dim", dim7: "dim7", halfdim: "m7b5",
  maj7: "maj7", m7: "m7", dom7: "7", alt: "7alt", sus4: "sus4",
  maj6: "6", min6: "m6", majadd9: "add9", minadd9: "madd9",
  maj9: "maj9", dom9: "9", min9: "m9",
};

export function qualityToken(qualitySymbol: string): string {
  return QUALITY_TOKEN[qualitySymbol] ?? qualitySymbol;
}

const NUMERAL_RE =
  /^(b|#)?([ivxIVX]+)(o)?(maj7|7alt|7\(b5\)|alt|7|sus4|add9|6|m7)?$/;

/** Structural parse; null on anything outside the grammar. */
export function numeralInfo(token: string): NumeralInfo | null {
  const m = NUMERAL_RE.exec(token);
  if (!m) return null;
  const accidental = (m[1] ?? "") as "" | "b" | "#";
  const roman = m[2];
  const isUpper = roman === roman.toUpperCase();
  const isLower = roman === roman.toLowerCase();
  if (!isUpper && !isLower) return null; // mixed case: not a degree
  const degree = ROMAN_TO_DEGREE[roman];
  if (degree === undefined) return null; // IIII, ix, etc.
  return {
    accidental,
    degree,
    upper: isUpper,
    dim: m[3] === "o",
    suffix: m[4] ?? "",
  };
}

/** Case+dim+suffix -> qualitySymbol per the D21 resolution table. */
function resolveQuality(info: NumeralInfo): string | null {
  const { upper, dim, suffix } = info;
  switch (suffix) {
    case "":
      if (dim) return upper ? null : "dim";
      return upper ? "maj" : "min";
    case "maj7":
      return upper && !dim ? "maj7" : null;
    case "7":
      if (dim) return "dim7";
      return upper ? "dom7" : "m7";
    case "7alt":
    case "alt":
      return upper && !dim ? "alt" : null;
    case "7(b5)":
      return !upper && !dim ? "halfdim" : null;
    case "m7":
      return !upper && !dim ? "m7" : null;
    case "sus4":
      return "sus4";
    case "add9":
      return dim ? null : upper ? "majadd9" : "minadd9";
    case "6":
      return dim ? null : upper ? "maj6" : "min6";
    default:
      return null;
  }
}

/**
 * D21: parse one numeral token in a mode. Returns null (never throws)
 * for tokens outside the grammar or with contradictory case+suffix
 * (e.g. "vimaj7", "Im7", "viio7(b5)").
 */
export function parseNumeral(
  token: string,
  mode: EtudeMode,
): NumeralRealization | null {
  const info = numeralInfo(token);
  if (!info) return null;
  const qualitySymbol = resolveQuality(info);
  if (qualitySymbol === null) return null;
  const intervals = QUALITY_INTERVALS[qualitySymbol];
  if (!intervals) return null;
  let offset = MODE_OFFSETS[mode][info.degree - 1];
  if (info.accidental === "b") offset -= 1;
  if (info.accidental === "#") offset += 1;
  return {
    rootOffsetSemitones: ((offset % 12) + 12) % 12,
    qualitySymbol,
    intervals,
  };
}

const FLAT_NAMES: readonly string[] = [
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
];
const SHARP_NAMES: readonly string[] = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

/** D11 spelling rules for chord roots: the spelled tonic's accidental
 *  wins; natural tonics fall to key-signature family (major sharp
 *  side: G D A E B; minor sharp side: E B; everything else, including
 *  the C/A ties, goes flat). */
function keyUsesFlats(keyTonicPc: number, mode: EtudeMode): boolean {
  const tonic = spellTonic(keyTonicPc, mode, "");
  if (tonic.includes("b")) return true;
  if (tonic.includes("#")) return false;
  if (mode === "major") return !["G", "D", "A", "E", "B"].includes(tonic);
  return !["E", "B"].includes(tonic);
}

/** Display name for a realized chord: "Dm7", "Abmaj9", "G7alt". */
export function spellChordName(
  rootPc: number,
  qualitySymbol: string,
  keyTonicPc: number,
  mode: EtudeMode,
): string {
  const names = keyUsesFlats(keyTonicPc, mode) ? FLAT_NAMES : SHARP_NAMES;
  const root = names[((rootPc % 12) + 12) % 12];
  return root + (NAME_SUFFIX[qualitySymbol] ?? qualitySymbol);
}

/** Does one generated token survive the user's harmony filter? */
export function tokenAllowed(token: string, constraints: EtudeConstraints): boolean {
  const info = numeralInfo(token);
  if (!info) return false;
  const h = constraints.harmony;
  if (h.allowedNumerals !== null) {
    const roman = DEGREE_TO_ROMAN[info.degree - 1];
    const bare =
      info.accidental + (info.upper ? roman : roman.toLowerCase()) + (info.dim ? "o" : "");
    if (!h.allowedNumerals.includes(token) && !h.allowedNumerals.includes(bare)) {
      return false;
    }
  }
  if (h.allowedQualities !== null) {
    const real = parseNumeral(token, constraints.mode);
    if (!real) return false;
    if (!h.allowedQualities.includes(qualityToken(real.qualitySymbol))) {
      return false;
    }
  }
  return true;
}

/** Progression templates whose every token survives the harmony filter.
 *  Exported for feasibilityOf (assemble.ts) - no rng, pure filter. */
export function filterTemplates(
  profile: StyleProfile,
  constraints: EtudeConstraints,
): readonly (readonly string[])[] {
  return profile.harmony.progressions.filter((prog) =>
    prog.every((token) => tokenAllowed(token, constraints)),
  );
}

export interface HarmonyInput {
  readonly profile: StyleProfile;
  readonly constraints: EtudeConstraints;
  readonly rng: Rng; // ONE handle per generation; documented draw order
}

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

/**
 * REQ-ETU-10/12/13: template pick -> fit to bars -> startOn/endOn ->
 * difficulty-scaled chromatic passes -> extensions/alterations ->
 * realization (close voicing inside registers.chords, drop2 spread for
 * jazz, D11 spelling). Throws RangeError when the harmony filter
 * excludes all profile material (the adapter validates first via
 * feasibilityOf; see design section 5 step 1 contract).
 */
export function generateProgression(input: HarmonyInput): readonly EtudeChord[] {
  const { profile, constraints, rng } = input;
  const mode = constraints.mode;
  const difficulty = constraints.difficulty;
  const bars = constraints.bars;
  const offsets = MODE_OFFSETS[mode];

  const templates = filterTemplates(profile, constraints);
  if (templates.length === 0) {
    throw new RangeError("constraints exclude all profile material");
  }

  // Fixed draw order: 1) template pick.
  const template = rng.pick(templates);
  const tokens: string[] = [];
  for (let i = 0; i < bars; i++) tokens.push(template[i % template.length]);

  const startLocked = constraints.harmony.startOn !== null;
  const endLocked = constraints.harmony.endOn !== null;
  if (startLocked) tokens[0] = constraints.harmony.startOn as string;
  if (endLocked) tokens[bars - 1] = constraints.harmony.endOn as string;
  // Explicit start/end overrides are protected from the random passes
  // (REQ-ETU-13 "endOn honored at every difficulty").
  const canTouch = (b: number): boolean =>
    !(b === 0 && startLocked) && !(b === bars - 1 && endLocked);

  // Pass 4 (per bar, ascending): secondary dominant -> modal
  // interchange -> tritone. Each gated by rng.bool(scaleProbability).
  for (let b = 0; b < bars; b++) {
    if (!canTouch(b)) continue;
    let t = tokens[b];
    let real = parseNumeral(t, mode);
    let info = real === null ? null : numeralInfo(t);
    if (real === null || info === null) continue; // defensive: data invariant

    // 4a. secondary dominant: diatonic non-I chord X -> its V7.
    if (
      offsets.includes(real.rootOffsetSemitones) &&
      info.degree !== 1 &&
      b < bars - 1 &&
      rng.bool(scaleProbability(profile.harmony.secondaryDominantRate, difficulty))
    ) {
      const target = mod12(real.rootOffsetSemitones + 7);
      const d2 = offsets.indexOf(target) + 1;
      if (d2 > 0) {
        const nt = DEGREE_TO_ROMAN[d2 - 1] + "7"; // uppercase degree + 7
        if (tokenAllowed(nt, constraints)) t = nt;
      }
    }

    // 4b. modal interchange: swap to a borrowed-family token.
    real = parseNumeral(t, mode);
    info = real === null ? null : numeralInfo(t);
    if (
      real !== null &&
      info !== null &&
      offsets.includes(real.rootOffsetSemitones) &&
      info.degree !== 1 &&
      rng.bool(scaleProbability(profile.harmony.modalInterchangeRate, difficulty))
    ) {
      const pool = mode === "major" ? ["bVI", "bVII7", "iv7"] : ["bII7", "III7"];
      const nt = rng.pick(pool);
      if (tokenAllowed(nt, constraints)) t = nt;
    }

    // 4c. tritone pass: V7 -> bII7 (rate = reharmonizationRate).
    real = parseNumeral(t, mode);
    info = real === null ? null : numeralInfo(t);
    if (
      real !== null &&
      info !== null &&
      info.accidental === "" &&
      info.degree === 5 &&
      real.qualitySymbol === "dom7" &&
      rng.bool(scaleProbability(profile.harmony.reharmonizationRate, difficulty))
    ) {
      if (tokenAllowed("bII7", constraints)) t = "bII7";
    }

    tokens[b] = t;
  }

  // Pass 5 (per bar, ascending): extension (m7/maj7/dom7 -> their 9th
  // forms, numeral unchanged) then alteration (V7 -> V7alt).
  const qualityOverride = new Map<number, string>();
  for (let b = 0; b < bars; b++) {
    if (!canTouch(b)) continue;
    const real = parseNumeral(tokens[b], mode);
    if (real === null) continue;
    const q = real.qualitySymbol;
    if (q === "m7" || q === "maj7" || q === "dom7") {
      if (rng.bool(scaleProbability(profile.harmony.extensionBias, difficulty))) {
        const nq = q === "m7" ? "min9" : q === "maj7" ? "maj9" : "dom9";
        if (tokenAllowedQuality(nq, constraints)) qualityOverride.set(b, nq);
      }
    }
    const info = numeralInfo(tokens[b]);
    if (
      info !== null &&
      info.accidental === "" &&
      info.degree === 5 &&
      q === "dom7" &&
      !qualityOverride.has(b) &&
      rng.bool(scaleProbability(profile.harmony.alterationBias, difficulty))
    ) {
      if (tokenAllowed("V7alt", constraints)) {
        tokens[b] = "V7alt";
        qualityOverride.delete(b);
      }
    }
  }

  // Step 6: requireChromaticism - force one deterministic substitution
  // if no pass produced a non-diatonic root.
  // INVARIANT (fix round): this throw must stay reachable ONLY on
  // constraint shapes where assemble.ts feasibilityOf() returned a
  // WARNING. The bII7 branch is seed-dependent (needs a tonic-family
  // final chord), so feasibilityOf now mirrors the CONSERVATIVE branch
  // only (bVII7 must pass the filter) - see the invariant doc there
  // and the 300-seed property sweep in assemble.test.ts.
  if (constraints.harmony.requireChromaticism) {
    const anyChromatic = tokens.some((t) => {
      const r = parseNumeral(t, mode);
      return r !== null && !offsets.includes(r.rootOffsetSemitones);
    });
    if (!anyChromatic) {
      const lastReal = parseNumeral(tokens[bars - 1], mode);
      const lastInfo = numeralInfo(tokens[bars - 1]);
      const tonicFamily =
        lastReal !== null &&
        lastInfo !== null &&
        lastReal.rootOffsetSemitones === 0 &&
        (mode === "major" ? lastInfo.upper && !lastInfo.dim : !lastInfo.upper && !lastInfo.dim);
      if (
        tonicFamily &&
        canTouch(bars - 2) &&
        tokenAllowed("bII7", constraints)
      ) {
        tokens[bars - 2] = "bII7";
      } else if (canTouch(1) && tokenAllowed("bVII7", constraints)) {
        tokens[1] = "bVII7";
      } else {
        throw new RangeError(
          "requireChromaticism cannot be satisfied under these constraints",
        );
      }
    }
  }

  // Step 7: realize every token into an EtudeChord.
  const chords: EtudeChord[] = [];
  const [regLo, regHi] = profile.voicing.registers.chords;
  for (let b = 0; b < bars; b++) {
    const t = tokens[b];
    const real = parseNumeral(t, mode);
    if (real === null) {
      // Programmer path: every token that reaches here either came from
      // the (test-pinned) profile or from the protected overrides/passes.
      throw new RangeError(`internal: unparseable token '${t}' at bar ${b}`);
    }
    const qualitySymbol = qualityOverride.get(b) ?? real.qualitySymbol;
    const intervals = QUALITY_INTERVALS[qualitySymbol];
    const rootPc = mod12(constraints.key + real.rootOffsetSemitones);
    const span = intervals[intervals.length - 1];
    let root = regLo + mod12(rootPc - regLo);
    if (root + span > regHi) root -= 12;
    let notes = intervals.map((iv) => root + iv);
    if (profile.voicing.style === "drop2" && notes.length === 4) {
      // Drop-2: second-from-top voice down an octave (the shape the
      // pedagogy detector recognizes; see annotate.ts).
      notes = [notes[2] - 12, notes[0], notes[1], notes[3]];
    }
    notes = notes.slice().sort((x, y) => x - y);
    chords.push({
      bar: b,
      numeral: t,
      rootPc,
      qualitySymbol,
      name: spellChordName(rootPc, qualitySymbol, constraints.key, mode),
      notes,
    });
  }
  return chords;
}

function tokenAllowedQuality(qualitySymbol: string, constraints: EtudeConstraints): boolean {
  const list = constraints.harmony.allowedQualities;
  if (list === null) return true;
  return list.includes(qualityToken(qualitySymbol));
}
