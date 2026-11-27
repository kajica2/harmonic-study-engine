import { describe, expect, it } from "vitest";
import { LESSON_IDS, LESSONS } from "../src/learning/catalog";
import {
  completedCount,
  DEFAULT_STATE,
  engineHref,
  LEVELS,
  parseLearningState,
  STEPS,
  toggleStep,
} from "../src/learning/model";
import { parsePracticeParams } from "../src/lib/practiceUrl";
import { ALL_PATHS } from "../src/lib/paths";

describe("Ultimate Exercise curriculum and engine boundary", () => {
  it("offers an original playable lesson at every level, with complete translations", () => {
    expect(new Set(LESSON_IDS).size).toBe(LESSONS.length);
    for (const level of LEVELS)
      expect(LESSONS.some((l) => l.level === level)).toBe(true);
    for (const lesson of LESSONS) {
      expect(lesson.revision.trim().length).toBeGreaterThan(0);
      expect(lesson.provenance).toBe("Original Ultimate Exercise study");
      for (const locale of ["en", "sr-Latn"] as const) {
        expect(lesson.title[locale].length).toBeGreaterThan(0);
        expect(lesson.goal[locale].length).toBeGreaterThan(0);
        for (const step of STEPS)
          expect(lesson.prompts[step][locale].length).toBeGreaterThan(0);
      }
      expect(lesson.notes.length).toBeGreaterThan(0);
      for (const note of lesson.notes) {
        expect(note.midi).toBeGreaterThanOrEqual(0);
        expect(note.midi).toBeLessThanOrEqual(127);
        expect(note.duration).toBeGreaterThan(0);
        expect(note.beat).toBeGreaterThanOrEqual(0);
        expect(note.beat + note.duration).toBeLessThanOrEqual(lesson.beats);
      }
    }
  });
  it("hands tempo and resolvable path IDs to the existing URL parser", () => {
    for (const lesson of LESSONS) {
      const params = new URL(engineHref(lesson), "http://localhost")
        .searchParams;
      const parsed = parsePracticeParams(params, [], []);
      expect(parsed.bpm).toBe(lesson.bpm);
      if (lesson.enginePathId) {
        expect(ALL_PATHS.some((path) => path.id === parsed.pathId)).toBe(true);
        expect(parsed.pathId).toBe(lesson.enginePathId);
      }
    }
  });
});

describe("device-local practice backup and progress", () => {
  it("round-trips a lesson, language, reflection, instrument and loop", () => {
    const state = structuredClone(DEFAULT_STATE);
    state.profile.locale = "sr-Latn";
    state.profile.instrument = "flugelhorn";
    state.selectedLesson = "pentatonic-open-door";
    state.progress[state.selectedLesson] = {
      steps: [...STEPS],
      reflection: "Let the phrase breathe.",
    };
    state.loop[1][7] = true;
    expect(
      parseLearningState(JSON.parse(JSON.stringify(state)), LESSON_IDS),
    ).toEqual(state);
    expect(completedCount(state, LESSON_IDS)).toBe(1);
  });
  it("rejects incompatible files without changing the existing state", () => {
    for (const raw of [
      null,
      [],
      "bad",
      {},
      { version: 2, profile: {} },
      { version: 1, profile: null },
    ]) {
      expect(parseLearningState(raw, LESSON_IDS)).toBeNull();
    }
  });
  it("drops unknown lessons, duplicate steps and unexpected data; bounds reflections", () => {
    const raw = {
      version: 1,
      profile: {
        level: "wrong",
        instrument: "wrong",
        locale: "wrong",
        caregiver: "true",
      },
      selectedLesson: "unknown",
      loop: [[true]],
      progress: {
        "tap-the-swing": {
          steps: ["listen", "listen", "unlocked", 1, "play"],
          reflection: "a".repeat(3000),
        },
        unknown: { steps: [...STEPS], reflection: "not a known lesson" },
      },
      account: { token: "do not import" },
    };
    const result = parseLearningState(raw, LESSON_IDS)!;
    expect(result.profile).toEqual(DEFAULT_STATE.profile);
    expect(result.selectedLesson).toBe(LESSON_IDS[0]);
    expect(result.loop).toEqual(DEFAULT_STATE.loop);
    expect(result.progress["tap-the-swing"].steps).toEqual(["listen", "play"]);
    expect(result.progress["tap-the-swing"].reflection).toHaveLength(2000);
    expect(Object.keys(result.progress)).toEqual(["tap-the-swing"]);
    expect(result).not.toHaveProperty("account");
  });
  it("requires all five steps and supports undo without losing reflection", () => {
    let state = structuredClone(DEFAULT_STATE);
    state.progress[LESSON_IDS[0]] = { steps: [], reflection: "Try slower" };
    for (const step of STEPS.slice(0, 4))
      state = toggleStep(state, LESSON_IDS[0], step);
    expect(completedCount(state, LESSON_IDS)).toBe(0);
    state = toggleStep(state, LESSON_IDS[0], "create");
    expect(completedCount(state, LESSON_IDS)).toBe(1);
    state = toggleStep(state, LESSON_IDS[0], "listen");
    expect(completedCount(state, LESSON_IDS)).toBe(0);
    expect(state.progress[LESSON_IDS[0]].reflection).toBe("Try slower");
    expect(DEFAULT_STATE.progress).toEqual({});
  });
});
