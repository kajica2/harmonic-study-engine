/**
 * src/lib/practiceLatency.test.ts - PRD-001 Phase 7 S3 (REQ-PRAC-41).
 *
 * Node env (localStorage polyfilled by tests/setup.ts).
 * normalize-garbage -> null (NEVER a fake 0), round-trip, and THE
 * single-sum law: compensationOf is the only place input + output
 * compose (double-subtraction risk, docs section 10).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { K } from "./storage";
import {
  compensationOf,
  loadLatency,
  saveLatency,
  type LatencyRecord,
} from "./practiceLatency";

function rec(over: Partial<LatencyRecord> = {}): LatencyRecord {
  return {
    version: 1,
    inputLatencyMs: 40,
    outputLatencyMs: 20,
    source: "midi",
    calibratedAtMs: 1_700_000_000_000,
    deviceName: "LPK88",
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("practiceLatency adapter", () => {
  it("K-entry + dotted namespace (D107)", () => {
    expect(K.practiceLatency).toBe("practice.latency");
  });

  it("round-trip survives JSON", () => {
    saveLatency(rec());
    expect(loadLatency()).toEqual(rec());
  });

  it("corrupt -> null (NEVER a silent 0 record)", () => {
    localStorage.setItem(K.practiceLatency, "{oops");
    expect(loadLatency()).toBeNull();
    localStorage.setItem(K.practiceLatency, JSON.stringify({ version: 2 }));
    expect(loadLatency()).toBeNull();
    localStorage.setItem(K.practiceLatency, JSON.stringify(rec({ inputLatencyMs: -5 })));
    expect(loadLatency()).toBeNull();
    localStorage.setItem(K.practiceLatency, JSON.stringify(rec({ source: "karaoke" })));
    expect(loadLatency()).toBeNull();
  });

  it("saveLatency normalizes at WRITE too: garbage never reaches storage", () => {
    saveLatency(rec({ inputLatencyMs: 9999 }));
    expect(loadLatency()).toBeNull();
  });

  it("empty deviceName normalizes to null", () => {
    saveLatency(rec({ deviceName: "" }));
    expect(loadLatency()?.deviceName).toBeNull();
  });
});

describe("compensationOf: THE single-sum law", () => {
  it("uncalibrated -> 0 (detection works uncompensated)", () => {
    expect(compensationOf(null)).toBe(0);
  });

  it("the sum is formed EXACTLY HERE: input + output", () => {
    expect(compensationOf(rec({ inputLatencyMs: 40, outputLatencyMs: 20 }))).toBe(60);
  });

  it("composition clamps at 800 (engine latency.ts law 4)", () => {
    expect(compensationOf(rec({ inputLatencyMs: 500, outputLatencyMs: 500 }))).toBe(800);
  });
});
