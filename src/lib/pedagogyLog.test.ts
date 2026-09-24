/**
 * src/lib/pedagogyLog.test.ts - PRD-001 Phase 6 (checklist 6).
 *
 * Node: append + summarize (nowMs-injected).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { K, STORAGE_KEYS } from "./storage";
import { loadLog, appendLog, summarize, PEDAGOGY_LOG_CAP } from "./pedagogyLog";

const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);

beforeEach(() => {
  localStorage.clear();
});

describe("pedagogyLog contract", () => {
  it("K-entry exists + STORAGE_KEYS row present", () => {
    expect(K.pedagogyLog).toBe("pedagogy.log");
    expect(STORAGE_KEYS.find((m) => m.key === K.pedagogyLog)).toBeDefined();
    expect(PEDAGOGY_LOG_CAP).toBe(500);
  });

  it("corrupt JSON -> fallback []", () => {
    localStorage.setItem(K.pedagogyLog, "{oops");
    expect(loadLog()).toEqual([]);
  });

  it("append + summarize (nowMs-injected)", () => {
    appendLog({ atMs: NOW - 1000, mode: "ear", refId: "ear-x", outcome: "correct", durationSec: 60, conceptId: "ii-v-i" });
    appendLog({ atMs: NOW - 500, mode: "ear", refId: "ear-y", outcome: "incorrect", durationSec: 30, conceptId: null });
    expect(loadLog()).toHaveLength(2);
    const summary = summarize(NOW);
    expect(summary.totalAttempts).toBe(2);
    expect(summary.rollingAccuracy).toBeCloseTo(0.5, 5);
    expect(summary.conceptCounts["ii-v-i"]).toBe(1);
  });

  it("cap enforcement trims to 500", () => {
    for (let i = 0; i < 502; i++) {
      appendLog({ atMs: NOW - (502 - i), mode: "ear", refId: `r${i}`, outcome: "correct", durationSec: 1, conceptId: null });
    }
    expect(loadLog()).toHaveLength(500);
  });

  it("quota failure: append never throws, load falls back to []", () => {
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    try {
      let stored = null;
      expect(() => {
        stored = appendLog({ atMs: NOW, mode: "ear", refId: "quota-x", outcome: "correct", durationSec: 60, conceptId: null });
      }).not.toThrow();
      expect(stored).toMatchObject({ refId: "quota-x" });
      expect(loadLog()).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
