/**
 * src/lib/storage.ts — centralized localStorage schema + safe I/O.
 *
 * Vercel `client-localstorage-schema`: version the shape, minimize the
 * data. Every key the app persists is registered in STORAGE_KEYS with
 * the shape it stores and the schema version that introduced it.
 * `ensureStorageSchemaVersion()` runs from App boot (before any hook
 * hydrates), so a future shape change is one entry in MIGRATIONS
 * instead of a breakage sweep across every read site.
 *
 * Reads/writes go through storageGet/storageSet, which mirror the old
 * try/catch-fallback semantics exactly (corrupt values never block
 * startup). Large collections are capped on write — see
 * FEEDBACK_HISTORY_MAX.
 */

export const STORAGE_SCHEMA_VERSION = "1";

export const SCHEMA_VERSION_KEY = "synesthesia.schemaVersion";

/** Centralized key constants — prefer these over string literals. */
export const K = {
  activePathIndex: "synesthesia_activePathIndex",
  activeStepIndex: "synesthesia_activeStepIndex",
  arpGate: "synesthesia_arpGate",
  arpOctaves: "synesthesia_arpOctaves",
  arpRate: "synesthesia_arpRate",
  arpType: "synesthesia_arpType",
  bassMuted: "synesthesia_bassMuted",
  beatType: "synesthesia_beatType",
  clefLayout: "synesthesia_clefLayout",
  counterMelodyByStep: "synesthesia_counterMelodyByStep",
  drumsMuted: "synesthesia_drumsMuted",
  feedbackHistory: "synesthesia_feedbackHistory",
  hdSounds: "synesthesia_hdSounds",
  humanizeAmount: "synesthesia_humanizeAmount",
  humanizePersonaId: "synesthesia_humanizePersonaId",
  instrument: "synesthesia_instrument",
  isLooping: "synesthesia_isLooping",
  kbRange: "synesthesia_kbRange",
  loopEndBar: "synesthesia_loopEndBar",
  loopStartBar: "synesthesia_loopStartBar",
  melodyByStep: "synesthesia_melodyByStep",
  metronomeOn: "synesthesia_metronomeOn",
  metronomeConfig: "synesthesia_metronomeConfig",
  optimizeVoiceLeading: "synesthesia_optimizeVoiceLeading",
  paths: "synesthesia_paths",
  pianoMuted: "synesthesia_pianoMuted",
  practiceSessions: "synesthesia_practice_sessions",
  practiceSets: "synesthesia_practice_sets",
  quizScore: "synesthesia_quizScore",
  savedVoicings: "synesthesia_savedVoicings",
  scoreDisplayMode: "synesthesia_scoreDisplayMode",
  selectedPersonaId: "synesthesia_selectedPersonaId",
  showTheoryLabels: "synesthesia_showTheoryLabels",
  stylePackId: "synesthesia_stylePackId",
  tempo: "synesthesia_tempo",
  timeSignature: "synesthesia_timeSignature",
  transposeShift: "synesthesia_transposeShift",
  visualTranspose: "synesthesia_visualTranspose",
  voicingType: "synesthesia_voicingType",
  volume: "synesthesia_volume",
  wavMode: "synesthesia_wavMode",
  // Versioned (own marker embedded in the key).
  performanceLog: "hse.performance.log.v1",
  pathBriefingDismissed: "hse.pathBriefing.dismissed",
  // Phase 1: zustand session store (mode + globalTranspose + currentIdea).
  session: "hse.session",
  // Phase 1: named-idea library (capped at 100, REQ-IDEA-4).
  ideas: "hse.ideas",
  // Phase 6 (REQ-PED-30/40, D107): SRS + practice log OUTSIDE zustand.
  pedagogySrs: "pedagogy.srs",
  pedagogyLog: "pedagogy.log",
} as const;

export type StorageKey = (typeof K)[keyof typeof K];

/** Registry entry: shape stored under `key` + the version that defined it. */
export interface StorageKeyMeta {
  key: string;
  /** Schema version that introduced this shape. */
  since: string;
  /** Human-readable expected stored shape (for CSPM review/CI). */
  shape: string;
}

/**
 * 1:1 registry of every persisted key. Add keys here when a new piece
 * of state is introduced; bump STORAGE_SCHEMA_VERSION + add a MIGRATIONS
 * entry when an *existing* shape changes.
 */
export const STORAGE_KEYS: StorageKeyMeta[] = [
  { key: K.paths, since: "1", shape: "HarmonicPath[] JSON" },
  { key: K.activePathIndex, since: "1", shape: "string (index)" },
  { key: K.activeStepIndex, since: "1", shape: "string (index)" },
  { key: K.tempo, since: "1", shape: "string (number)" },
  { key: K.transposeShift, since: "1", shape: "string (number)" },
  { key: K.visualTranspose, since: "1", shape: "string (number)" },
  { key: K.beatType, since: "1", shape: "string (BackingStyle id)" },
  { key: K.timeSignature, since: "1", shape: "string (TimeSignature id)" },
  { key: K.volume, since: "1", shape: "string (number 0-1)" },
  { key: K.instrument, since: "1", shape: "string (InstrumentType)" },
  { key: K.arpType, since: "1", shape: "string (ArpType JSON)" },
  { key: K.arpRate, since: "1", shape: "string (number)" },
  { key: K.arpGate, since: "1", shape: "string (number)" },
  { key: K.arpOctaves, since: "1", shape: "string (number)" },
  { key: K.voicingType, since: "1", shape: "string (VoicingId)" },
  { key: K.optimizeVoiceLeading, since: "1", shape: "string (0|1)" },
  { key: K.kbRange, since: "1", shape: "KeyboardRange JSON" },
  { key: K.drumsMuted, since: "1", shape: "string (0|1)" },
  { key: K.bassMuted, since: "1", shape: "string (0|1)" },
  { key: K.pianoMuted, since: "1", shape: "string (0|1)" },
  { key: K.isLooping, since: "1", shape: "string (0|1)" },
  { key: K.loopStartBar, since: "1", shape: "string (number|null)" },
  { key: K.loopEndBar, since: "1", shape: "string (number|null)" },
  { key: K.metronomeOn, since: "1", shape: "string (0|1)" },
  { key: K.metronomeConfig, since: "1", shape: "MetronomeConfig JSON" },
  { key: K.wavMode, since: "1", shape: "string (RenderMode id)" },
  { key: K.humanizeAmount, since: "1", shape: "string (number)" },
  { key: K.humanizePersonaId, since: "1", shape: "string (persona id)" },
  { key: K.melodyByStep, since: "1", shape: "Record<stepKey, number[]> JSON" },
  { key: K.counterMelodyByStep, since: "1", shape: "Record<stepKey, number[]> JSON" },
  { key: K.stylePackId, since: "1", shape: "string (StylePackId|empty)" },
  { key: K.quizScore, since: "1", shape: "{correct,total} JSON" },
  { key: K.feedbackHistory, since: "1", shape: "FeedbackEvent[] JSON (capped)" },
  { key: K.selectedPersonaId, since: "1", shape: "string (persona id)" },
  { key: K.scoreDisplayMode, since: "1", shape: "string (ScoreDisplayMode id)" },
  { key: K.showTheoryLabels, since: "1", shape: "string (0|1)" },
  { key: K.clefLayout, since: "1", shape: "string (ClefLayout)" },
  { key: K.hdSounds, since: "1", shape: "string (0|1)" },
  { key: K.savedVoicings, since: "1", shape: "Record JSON" },
  { key: K.practiceSets, since: "1", shape: "PracticeSet[] JSON" },
  { key: K.practiceSessions, since: "1", shape: "PracticeSession[] JSON (capped)" },
  { key: K.performanceLog, since: "1", shape: "PerformanceLog JSON (capped)" },
  { key: K.pathBriefingDismissed, since: "1", shape: "string[] JSON" },
  { key: K.session, since: "1", shape: "zustand persist JSON (mode slice)" },
  { key: K.ideas, since: "1", shape: "Idea[] JSON (capped at 100, REQ-IDEA-4)" },
  { key: K.pedagogySrs, since: "1", shape: "Record<string, SrsState> JSON (capped at 10, REQ-PED-30)" },
  { key: K.pedagogyLog, since: "1", shape: "PracticeEntry[] JSON (capped at 500, REQ-PED-40)" },
];

/**
 * Collection caps — "minimize localStorage data". Apply on write so the
 * stored value stays bounded even under heavy use.
 */
export const FEEDBACK_HISTORY_MAX = 200;

/**
 * Cross-version migrations. Each entry migrates *from* the given stored
 * schema version to the next. Ordered; the boot gate steps through them.
 *
 * v1 → (future) v2: add `{ from: "1", apply: () => {...} }` here and
 * bump STORAGE_SCHEMA_VERSION.
 */
export interface StorageMigration {
  from: string;
  to: string;
  apply: () => void;
}

export const MIGRATIONS: StorageMigration[] = [];

// ---------- safe I/O (mirrors the old try/catch-fallback semantics) ----

export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Void on failure — persisted-state writes must never break the UI. */
export function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage quota / private mode — keep in-memory value, move on.
  }
}

export function storageGetJSON<T>(key: string, fallback: T): T {
  const raw = storageGet(key);
  if (raw === null || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function storageGetNumber(key: string, fallback: number): number {
  const raw = storageGet(key);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function storageGetBool(key: string, fallback: boolean): boolean {
  const raw = storageGet(key);
  if (raw === null || raw === "") return fallback;
  // Accept both "0"|"1" (the mutes/hdSounds encoding) and JSON booleans.
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  try {
    return Boolean(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

/**
 * Write an array, keeping only the last `max` entries. Returns the
 * trimmed array so callers can also update in-memory state.
 */
export function storageSetCap<T>(
  key: string,
  values: T[],
  max: number,
): T[] {
  const trimmed = values.length > max ? values.slice(-max) : values;
  storageSet(key, JSON.stringify(trimmed));
  return trimmed;
}

// ---------- boot gate ---------------------------------------------------

let ensured = false;

/**
 * Runs once per app load: advances the stored schema marker through any
 * registered MIGRATIONS, then persists the current version. Safe to
 * call anywhere (no-op after the first call); never throws.
 */
export function ensureStorageSchemaVersion(): void {
  if (ensured) return;
  ensured = true;
  if (typeof localStorage === "undefined") return;

  try {
    for (const migration of MIGRATIONS) {
      const current = localStorage.getItem(SCHEMA_VERSION_KEY);
      if (current === migration.from) {
        migration.apply();
        localStorage.setItem(SCHEMA_VERSION_KEY, migration.to);
      }
    }
    // No marker or pre-version data: record the current version. (If a
    // future entry migration bumps past v1, this final write is a no-op
    // because MIGRATIONS already recorded the target version.)
    localStorage.setItem(SCHEMA_VERSION_KEY, STORAGE_SCHEMA_VERSION);
  } catch {
    // Storage unavailable — hydration falls back to per-key defaults.
  }
}