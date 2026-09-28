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
  compensationOfFallback,
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
    // S4 (D141): the fallback pair defaults to uncalibrated - legacy
    // shape round-trips through normalize with these nulls.
    fallbackInputLatencyMs: null,
    fallbackCalibratedAtMs: null,
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

/**
 * PRD-001 Phase 7 S4 (D141): the record widens IN PLACE (version
 * stays 1, defaults-at-read, no migration) so a fallback-only
 * calibration can express itself next to a MIDI one.
 */
describe("practiceLatency S4 widening (D141)", () => {
  it("LEGACY record (no fallback keys) normalizes with fallback null - the no-migration pin", () => {
    // A shipped-S3 payload verbatim on disk: five fields, no
    // fallback keys. It must LOAD (not reject, not migrate).
    const legacy = {
      version: 1,
      inputLatencyMs: 42,
      outputLatencyMs: 10,
      source: "manual",
      calibratedAtMs: 1_700_000_000_000,
      deviceName: null,
    };
    localStorage.setItem(K.practiceLatency, JSON.stringify(legacy));
    const r = loadLatency();
    expect(r).not.toBeNull();
    expect(r?.inputLatencyMs).toBe(42); // MIDI field survives
    expect(r?.fallbackInputLatencyMs).toBeNull();
    expect(r?.fallbackCalibratedAtMs).toBeNull();
    // Re-saving round-trips the MIDI fields UNCHANGED (no v5).
    saveLatency(r!);
    expect(loadLatency()).toEqual(r);
  });

  it("inputLatencyMs null is ACCEPTED (a fallback-only record is legal)", () => {
    saveLatency(
      rec({
        inputLatencyMs: null,
        source: "manual",
        deviceName: null,
        fallbackInputLatencyMs: 37,
        fallbackCalibratedAtMs: 1_700_000_000_500,
      }),
    );
    const r = loadLatency();
    expect(r?.inputLatencyMs).toBeNull();
    expect(r?.fallbackInputLatencyMs).toBe(37);
    expect(r?.fallbackCalibratedAtMs).toBe(1_700_000_000_500);
    // The MIDI compensation reads 0 for a null field (never NaN).
    expect(compensationOf(r)).toBe(0);
  });

  it("garbage fallback fields -> null, NEVER a fake 0 (honesty law)", () => {
    localStorage.setItem(
      K.practiceLatency,
      JSON.stringify({
        version: 1,
        inputLatencyMs: 40,
        outputLatencyMs: 20,
        source: "midi",
        calibratedAtMs: 1_700_000_000_000,
        deviceName: "LPK88",
        fallbackInputLatencyMs: "quick",
        fallbackCalibratedAtMs: Number.NaN,
      }),
    );
    const r = loadLatency();
    expect(r).not.toBeNull(); // the MIDI half still loads
    expect(r?.fallbackInputLatencyMs).toBeNull();
    expect(r?.fallbackCalibratedAtMs).toBeNull();
    // Out-of-range is garbage too (not clamped to 0/500).
    saveLatency(rec({ fallbackInputLatencyMs: 9999 }));
    expect(loadLatency()?.fallbackInputLatencyMs).toBeNull();
  });

  it("compensationOf(null / null-field) -> 0", () => {
    expect(compensationOf(null)).toBe(0);
    expect(compensationOf(rec({ inputLatencyMs: null }))).toBe(0);
  });

  it("compensationOfFallback: null record 0, uncalibrated 0, calibrated = input+output clamp law", () => {
    expect(compensationOfFallback(null)).toBe(0);
    expect(compensationOfFallback(rec())).toBe(0); // fallback null
    // The single-sum law for the fallback path (same clamp ceiling).
    expect(
      compensationOfFallback(
        rec({ fallbackInputLatencyMs: 37, outputLatencyMs: 20 }),
      ),
    ).toBe(57);
    expect(
      compensationOfFallback(
        rec({ fallbackInputLatencyMs: 500, outputLatencyMs: 500 }),
      ),
    ).toBe(800);
    // 0 is a REAL number, not absent: fallback 0 + output 20 -> 20.
    expect(
      compensationOfFallback(rec({ fallbackInputLatencyMs: 0 })),
    ).toBe(20);
  });

  it("save/load roundtrip with BOTH fields: MIDI and fallback coexist", () => {
    const both = rec({
      inputLatencyMs: 40,
      outputLatencyMs: 20,
      source: "midi",
      deviceName: "LPK88",
      fallbackInputLatencyMs: 37,
      fallbackCalibratedAtMs: 1_700_000_000_900,
    });
    saveLatency(both);
    const r = loadLatency();
    expect(r).toEqual(both);
    // Each source keeps ITS OWN number (D141: one shared output,
    // separate inputs - no cross-application).
    expect(compensationOf(r)).toBe(60);
    expect(compensationOfFallback(r)).toBe(57);
  });
});
