/**
 * src/lib/srsStore.test.ts - PRD-001 Phase 6 (checklist 6).
 *
 * Node/jsdom storage contract: K-entry + registry row, corrupt
 * fallback, quota void, cap 10, nowMs param.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { K, STORAGE_KEYS } from "./storage";
import { loadSrs, saveSrs, getSrs, recordReview } from "./srsStore";

beforeEach(() => {
  localStorage.clear();
});

describe("srsStore contract", () => {
  it("K-entry exists + STORAGE_KEYS row present", () => {
    expect(K.pedagogySrs).toBe("pedagogy.srs");
    const row = STORAGE_KEYS.find((m) => m.key === K.pedagogySrs);
    expect(row).toBeDefined();
  });

  it("corrupt JSON -> fallback {}", () => {
    localStorage.setItem(K.pedagogySrs, "{oops");
    expect(loadSrs()).toEqual({});
  });

  it("missing concept -> fresh state", () => {
    const s = getSrs("ii-v-i");
    expect(s.conceptId).toBe("ii-v-i");
    expect(s.ease).toBe(2.5);
  });

  it("recordReview stamps nowMs param and persists", () => {
    const now = 1_700_000_000_000;
    const next = recordReview("ii-v-i", 5, now);
    expect(next.lastSeenMs).toBe(now);
    expect(next.intervalDays).toBe(1);
    expect(loadSrs()["ii-v-i"].intervalDays).toBe(1);
  });

  it("cap enforcement: 10 concepts (oldest dropped)", () => {
    const map: Record<string, ReturnType<typeof getSrs>> = {};
    for (let i = 0; i < 12; i++) {
      map[`c${i}`] = { ...getSrs(`c${i}`), conceptId: `c${i}` };
    }
    saveSrs(map);
    expect(Object.keys(loadSrs())).toHaveLength(10);
  });

  it("quota failure: save/record never throw, load falls back to {}", () => {
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    try {
      expect(() => saveSrs({ "ii-v-i": getSrs("ii-v-i") })).not.toThrow();
      expect(loadSrs()).toEqual({});
      expect(() => recordReview("ii-v-i", 5, 1_700_000_000_000)).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});
