/**
 * src/lib/stylePack.ts — JSON style-pack loader + validator.
 *
 * Style packs are pure data files in `src/data/styles/*.json`.
 * Adding a style = adding a JSON file, never a TypeScript module
 * change. The validator rejects packs missing required fields; the
 * loader fetches + parses + caches at module load.
 */

import aabaPack from "../data/styles/common-practice.json";
import jazzPack from "../data/styles/jazz.json";
import modalPack from "../data/styles/modal.json";
import postTonalPack from "../data/styles/post-tonal.json";

export type StylePackId =
  | "common-practice"
  | "jazz"
  | "modal"
  | "post-tonal";

export interface StyleConstraints {
  /** Interval progressions the enforcer flags as violations. */
  forbiddenIntervals: ("parallelFifth" | "parallelOctave" | "hiddenFifth" | "hiddenOctave")[];
  /** Non-chord-tone categories the enforcer allows. */
  allowedNCTs: ("passingTone" | "neighborTone" | "anticipation" | "escapeTone" | "suspension" | "pedal" | "modalMixture" | "chromaticApproach")[];
  /** Resolution rules the enforcer checks. */
  requiredResolutions: ("leadingToneResolves" | "tritoneResolves" | "guideToneResolves")[];
}

export interface StylePack {
  id: StylePackId;
  name: string;
  description: string;
  constraints: StyleConstraints;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const PACKS: ReadonlyMap<StylePackId, StylePack> = new Map([
  ["common-practice", aabaPack as StylePack],
  ["jazz", jazzPack as StylePack],
  ["modal", modalPack as StylePack],
  ["post-tonal", postTonalPack as StylePack],
]);

/**
 * Validate a candidate pack. Used by `loadStylePack` and by tests.
 * Returns ok=true on a well-formed pack, otherwise a list of errors.
 */
export function validateStylePack(candidate: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof candidate !== "object" || candidate === null) {
    return { ok: false, errors: ["pack must be an object"] };
  }
  const p = candidate as Record<string, unknown>;
  if (typeof p.id !== "string") errors.push("id must be a string");
  if (typeof p.name !== "string") errors.push("name must be a string");
  if (typeof p.description !== "string") errors.push("description must be a string");
  if (typeof p.constraints !== "object" || p.constraints === null) {
    errors.push("constraints must be an object");
  } else {
    const c = p.constraints as Record<string, unknown>;
    if (!Array.isArray(c.forbiddenIntervals)) errors.push("constraints.forbiddenIntervals must be an array");
    if (!Array.isArray(c.allowedNCTs)) errors.push("constraints.allowedNCTs must be an array");
    if (!Array.isArray(c.requiredResolutions)) errors.push("constraints.requiredResolutions must be an array");
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Load a style pack by id. Throws if the id is unknown.
 * For MVP the packs are imported statically; v1 will JSON.parse
 * from src/data/styles/*.json at boot.
 */
export function loadStylePack(id: StylePackId): StylePack {
  const pack = PACKS.get(id);
  if (!pack) {
    throw new Error(`Unknown style pack id '${id}'. Valid ids: ${[...PACKS.keys()].join(", ")}`);
  }
  return pack;
}

/** All available style pack ids. */
export function allStylePackIds(): StylePackId[] {
  return [...PACKS.keys()];
}

/** All available style packs. */
export function allStylePacks(): StylePack[] {
  return [...PACKS.values()];
}
