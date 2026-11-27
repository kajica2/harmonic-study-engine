/** Device-local learning domain. Musical events always use sounding MIDI. */
export type Locale = "en" | "sr-Latn";
export type Copy = Record<Locale, string>;
export const LEVELS = [
  "first-sounds",
  "foundation",
  "intermediate",
  "advanced",
  "open-study",
] as const;
export type Level = (typeof LEVELS)[number];
export const STEPS = ["listen", "sing", "play", "review", "create"] as const;
export type Step = (typeof STEPS)[number];
export const INSTRUMENTS = [
  "body-voice",
  "trumpet",
  "flugelhorn",
  "piano",
  "guitar",
  "bass",
  "saxophone",
  "percussion",
  "other",
] as const;
export type Instrument = (typeof INSTRUMENTS)[number];
export type Role = "pulse" | "melody" | "bass" | "harmony" | "production";
export interface NoteEvent {
  midi: number;
  beat: number;
  duration: number;
}
export type LessonMedia = {
  title: Copy;
  src: string;
  rights: string;
  locale: Locale;
  transcript: Copy;
} & ({ kind: "video"; captions: string } | { kind: "audio"; captions?: never });
export interface Lesson {
  id: string;
  level: Level;
  role: Role;
  minutes: number;
  bpm: number;
  title: Copy;
  goal: Copy;
  prompts: Record<Step, Copy>;
  notes: readonly NoteEvent[];
  beats: number;
  enginePathId?: string;
  /** Cleared, captioned video/audio can be attached without changing lesson logic. */
  media: readonly LessonMedia[];
  provenance: "Original Ultimate Exercise study";
}
export interface LessonProgress {
  steps: Step[];
  reflection: string;
}
export interface LearningState {
  version: 1;
  profile: {
    level: Level;
    instrument: Instrument;
    locale: Locale;
    caregiver: boolean;
  };
  selectedLesson: string;
  progress: Record<string, LessonProgress>;
  loop: boolean[][];
}
export const STORAGE_KEY = "hse.ultimate.learning.v1";
export const DEFAULT_STATE: LearningState = {
  version: 1,
  profile: {
    level: "first-sounds",
    instrument: "body-voice",
    locale: "en",
    caregiver: false,
  },
  selectedLesson: "tap-the-swing",
  progress: {},
  loop: [
    [true, false, false, false, true, false, false, false],
    [false, false, true, false, false, false, true, false],
  ],
};
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const member = <T extends string>(v: unknown, values: readonly T[]): v is T =>
  typeof v === "string" && values.includes(v as T);

/** Reject incompatible imports; sanitize optional fields and never merge unknown keys. */
export function parseLearningState(
  raw: unknown,
  lessonIds: readonly string[],
): LearningState | null {
  if (!object(raw) || raw.version !== 1 || !object(raw.profile)) return null;
  const fallback = structuredClone(DEFAULT_STATE);
  const p = raw.profile;
  const progress: Record<string, LessonProgress> = {};
  if (object(raw.progress))
    for (const id of lessonIds) {
      const entry = raw.progress[id];
      if (!object(entry)) continue;
      progress[id] = {
        steps: Array.isArray(entry.steps)
          ? [...new Set(entry.steps.filter((s): s is Step => member(s, STEPS)))]
          : [],
        reflection:
          typeof entry.reflection === "string"
            ? entry.reflection.slice(0, 2000)
            : "",
      };
    }
  const loop =
    Array.isArray(raw.loop) &&
    raw.loop.length === 2 &&
    raw.loop.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 8 &&
        row.every((x) => typeof x === "boolean"),
    )
      ? (raw.loop as boolean[][])
      : fallback.loop;
  return {
    version: 1,
    profile: {
      level: member(p.level, LEVELS) ? p.level : fallback.profile.level,
      instrument: member(p.instrument, INSTRUMENTS)
        ? p.instrument
        : fallback.profile.instrument,
      locale: member(p.locale, ["en", "sr-Latn"] as const) ? p.locale : "en",
      caregiver: p.caregiver === true,
    },
    selectedLesson: member(raw.selectedLesson, lessonIds)
      ? raw.selectedLesson
      : (lessonIds[0] ?? fallback.selectedLesson),
    progress,
    loop: loop.map((row) => [...row]),
  };
}
export function completedCount(
  state: LearningState,
  ids: readonly string[],
): number {
  return ids.filter((id) =>
    STEPS.every((step) => state.progress[id]?.steps.includes(step)),
  ).length;
}
export function toggleStep(
  state: LearningState,
  id: string,
  step: Step,
): LearningState {
  const entry = state.progress[id] ?? { steps: [], reflection: "" };
  return {
    ...state,
    progress: {
      ...state.progress,
      [id]: {
        ...entry,
        steps: entry.steps.includes(step)
          ? entry.steps.filter((s) => s !== step)
          : [...entry.steps, step],
      },
    },
  };
}
export function engineHref(lesson: Lesson): string {
  const params = new URLSearchParams({
    mode: "etude",
    bpm: String(lesson.bpm),
  });
  if (lesson.enginePathId) params.set("path", lesson.enginePathId);
  return `/?${params}`;
}
