import { describe, expect, it } from "vitest";
import { LESSON_IDS } from "../src/learning/catalog";
import { DEFAULT_STATE, STORAGE_KEY } from "../src/learning/model";
import {
  createProgressRepository,
  type ProgressStorage,
} from "../src/learning/persistence";

function memoryStorage() {
  const values = new Map<string, string>([
    ["hse.session", "existing engine session"],
  ]);
  const storage: ProgressStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
  return { storage, values };
}

describe("learning progress repository boundary", () => {
  it("round-trips progress and backup without changing the engine session", () => {
    const { storage, values } = memoryStorage();
    const repository = createProgressRepository(() => storage, LESSON_IDS);
    const state = structuredClone(DEFAULT_STATE);
    state.progress[LESSON_IDS[0]] = {
      steps: ["listen"],
      reflection: "Čuj pauzu.",
    };
    expect(repository.save(state)).toBe(true);
    expect(repository.load()).toEqual({ state, status: "restored" });
    expect(repository.restore(repository.backup(state))).toEqual(state);
    expect(values.get("hse.session")).toBe("existing engine session");
  });
  it("provides independent defaults without writing on load", () => {
    const { storage, values } = memoryStorage();
    const repository = createProgressRepository(() => storage, LESSON_IDS);
    const first = repository.load();
    expect(first.status).toBe("fresh");
    first.state.loop[0][0] = false;
    expect(repository.load().state.loop[0][0]).toBe(true);
    expect(values.has(STORAGE_KEY)).toBe(false);
  });
  it("reports malformed and incompatible storage without overwriting its bytes", () => {
    const { storage, values } = memoryStorage();
    const repository = createProgressRepository(() => storage, LESSON_IDS);
    for (const raw of ["not JSON", '{"version":42,"profile":{}}']) {
      values.set(STORAGE_KEY, raw);
      expect(repository.load().status).toBe("invalid");
      expect(repository.restore(raw)).toBeNull();
      expect(values.get(STORAGE_KEY)).toBe(raw);
    }
  });
  it("handles denied storage access and full quota without breaking practice state", () => {
    const denied = createProgressRepository(() => {
      throw new Error("Denied");
    }, LESSON_IDS);
    expect(denied.load()).toEqual({
      state: DEFAULT_STATE,
      status: "unavailable",
    });
    expect(denied.save(DEFAULT_STATE)).toBe(false);
    const full = createProgressRepository(
      () => ({
        getItem: () => null,
        setItem: () => {
          throw new Error("Quota");
        },
      }),
      LESSON_IDS,
    );
    expect(full.save(DEFAULT_STATE)).toBe(false);
    expect(full.restore(full.backup(DEFAULT_STATE))).toEqual(DEFAULT_STATE);
  });
  it("bounds backup byte size even when non-ASCII characters use multiple bytes", () => {
    const { storage } = memoryStorage();
    const repository = createProgressRepository(() => storage, LESSON_IDS);
    const oversized = JSON.stringify({
      ...DEFAULT_STATE,
      padding: "🎺".repeat(260_000),
    });
    expect(oversized.length).toBeLessThan(1_000_000);
    expect(repository.restore(oversized)).toBeNull();
  });
});
