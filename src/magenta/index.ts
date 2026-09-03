/**
 * magenta/index.ts
 * ───────────────
 * Barrel export. App code imports from `"../magenta"` and gets
 * the curated surface — adapter, humanizer, profiles, grooves —
 * without ever reaching into individual files.
 *
 * The `INoteSequence` re-export keeps Magenta's type identity
 * transparent: callers can keep using `@magenta/music`'s type
 * names without learning this folder exists.
 */
export type { INote, INoteSequence, NoteSequence } from "./INoteSequence";
export {
  STEPS_PER_QUARTER,
  DEFAULT_QPM,
  pathToNoteSequence,
  chordSymbolsOf,
  noteSequenceToPath,
  quantize,
  unquantize,
} from "./adapter";
export {
  mulberry32,
  gaussian,
  OUDrift,
  hashSeed,
  hasQuantizedStep,
} from "./noise";
export {
  PERSONA_PROFILES,
  DEFAULT_PERSONA_PROFILE,
  getPersonaProfile,
  type PersonaProfile,
} from "./personaProfiles";
export {
  STYLE_GROOVES,
  getGroove,
  type StyleGroove,
} from "./styleGrooves";
export {
  humanize,
  humanizeSequence,
  type HumanizeOptions,
  type HumanizeInput,
  type HumanizedSequence,
} from "./humanizer";
export {
  createMixHumanizer,
  applyMixWobble,
  gainToDb,
  dbToGain,
  MIX_HUMANIZER_SMOOTHING,
  type TrackId,
  type MixHumanizerOptions,
  type MixHumanizerHandle,
} from "./mixHumanizer";