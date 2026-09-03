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
  | "default";

export interface Persona {
  id: string;
  name: string;
  role: string;
  quote: string;
  tagline?: string; // optional short descriptor rendered in the masterclass rail
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
  accentColor: string; // hex colour for theme matching
  gradientFrom: string; // tailwind gradient
  gradientTo: string; // tailwind gradient
}

/**
 * Built-in personas. Source of truth is `src/data/personas.json`
 * — edit the JSON to add / tweak personas without touching code.
 *
 * To use the JSON directly (avoid the wrapper): import PERSONA_DATA.
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