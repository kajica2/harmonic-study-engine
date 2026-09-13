import { InstrumentType } from "./audio";
import PERSONA_DATA from "../data/personas.json";

export type VisualTheme =
  | "kandinsky"
  | "coltrane"
  | "bach"
  | "debussy"
  | "eno"
  | "glass"
  | "monk"
  | "miles"
  | "chet"
  | "dizzy"
  | "hubbard"
  | "shorter"
  | "simone"
  | "novaro"
  | "getz"
  | "rollins"
  | "henderson"
  | "default";

export type SynesthesiaStatus = "documented" | "interpretive";

export type NoteName =
  | "C" | "Db" | "D" | "Eb" | "E" | "F"
  | "Gb" | "G" | "Ab" | "A" | "Bb" | "B";

export interface ColorEntry {
  hex: string;
  label: string;
}

export interface PersonaRules {
  minHandSpan?: string;
  bassIsolation?: boolean;
  allowMiddleGap?: boolean;
  frozenBassBars?: number;
  motifTracker?: boolean;
  allowMajorMinorThirdTogether?: boolean;
  phraseLengths?: number[];
  sequenceStepper?: boolean;
  sequenceInterval?: number;
  sliceAndRepeat?: boolean;
  keyDriftAcrossPath?: boolean;
  allowTextureSwitch?: boolean;
  reverbDistance?: boolean;
}

export type ContourProfile = "leaping" | "stepwise" | "angular" | "neutral";

/**
 * Reference to a composer in `docs/COMPOSER-HARMONIC-INNOVATIONS.md` whose
 * harmonic devices influenced this persona. Lightweight — the full chart
 * is loaded from the docs / `composerCatalog.ts` on demand. v1 schema:
 *   - composerId: matches the `### <name>` heading in the docs page
 *     (lowercase, kebab-case — e.g. "the-beatles", "john-coltrane").
 *   - devices: subset of that composer's harmonic-innovation bullets that
 *     apply to this persona's playing language.
 *   - keyWork: the most-cited representative piece.
 *   - romanExample: one bar from the chart (e.g. "bII" or "i — bVI — bVII"),
 *     shown in the PersonaLensBanner as a one-line signature.
 */
export interface ComposerHarmonicInfluence {
  composerId: string;
  composerName: string;
  devices: string[];
  keyWork: string;
  romanExample: string;
  /** Optional link to the catalog section in the docs. */
  docsAnchor?: string;
}

export interface Persona {
  id: string;
  name: string;
  role: string;
  quote: string;
  // New fields (Phase 1): keep old defaults so existing 12 personas keep working
  // when these are absent in JSON.
  synesthesiaStatus?: SynesthesiaStatus;
  dates?: string;
  nationality?: string;
  tagline?: string;
  instrumentLabel?: string;
  colorMap?: Partial<Record<NoteName, ColorEntry>> | null;
  colorPalette?: string[];
  defaultVoicing?: string;
  defaultPath?: string;
  techniques?: string[];
  scale?: string;
  rhythmLayers?: string[];
  /**
   * Melodic contour preference. Drives `personaMelodyFilter.ts` to
   * bias the genre-neutral Markov output. Optional — personas without
   * the field get "neutral" (no bias).
   */
  contourProfile?: ContourProfile;
  /**
   * Style-pack id the StylePackPicker auto-selects on persona change.
   * Optional — UI falls back to most-recently-used. Per user decision
   * 2026-09-13 this is a SUGGESTION not a lock; user can pick any pack.
   */
  preferredStylePackId?: string;
  /**
   * Harmonic-influence entries from `docs/COMPOSER-HARMONIC-INNOVATIONS.md`
   * that this persona's language is shaped by. Each entry is a lightweight
   * reference (composer id + device list + key-work) — the full chart lives
   * in the docs page and is loaded on demand via `composerCatalog.ts`.
   *
   * Optional — personas without the field show no harmonic-influence
   * section in the PersonaLensBanner. Currently mapped for the 7 personas
   * that overlap directly with a composer in the catalog (bach, coltrane,
   * debussy, eno, glass, miles, scriabin → Bartók via axis system).
   */
  harmonicInfluence?: ComposerHarmonicInfluence[];
  rules?: PersonaRules;
  // Original fields
  originalSongId: string; // references PATH id
  instrument: InstrumentType;
  tempo: number;
  arpType:
    | "none"
    | "up"
    | "down"
    | "upDown"
    | "downUp"
    | "random"
    | "converge"
    | "diverge";
  arpRate: number;
  arpGate: number;
  arpOctaves: number;
  visualTheme: VisualTheme;
  accentColor: string;
  gradientFrom: string;
  gradientTo: string;
}

/**
 * Built-in personas. Source of truth is `src/data/personas.json`
 * — edit the JSON to add / tweak personas without touching code.
 *
 * To use the JSON directly (avoid the wrapper): add PERSONA_DATA.
 */
export const PERSONAS: Persona[] = PERSONA_DATA as Persona[];

/**
 * Load personas from a JSON drop (drag-drop or pasted text).
 * Validates the shape — returns the entries that pass minimal
 * validation and silently skips malformed ones. Throws only when
 * the top-level JSON isn't an array at all.
 *
 * Useful for "bring your own persona" workflows.
 */
export function loadPersonasFromJson(jsonText: string): Persona[] {
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) {
    throw new Error("Personas JSON must be an array");
  }
  const valid = parsed.filter(
    (p): p is Persona =>
      p &&
      typeof p.id === "string" &&
      typeof p.name === "string" &&
      typeof p.instrument === "string",
  );
  if (valid.length === 0) {
    throw new Error("No valid persona entries found");
  }
  return valid;
}

/** Merge custom personas onto the built-in set, deduped by id. */
export function mergePersonas(custom: Persona[]): Persona[] {
  const map = new Map<string, Persona>();
  for (const p of PERSONAS) map.set(p.id, p);
  for (const p of custom) map.set(p.id, p);
  return Array.from(map.values());
}