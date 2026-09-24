/**
 * engine/explore/modulate.test.ts - PRD-001 Phase 5 (D94 deferral pin).
 */

import { describe, it, expect } from "vitest";
import { planModulation } from "./modulate";

describe("planModulation (deferred)", () => {
  it("always returns the unsupported arm with the TD-EXP-MOD message", () => {
    const from = { tonicPc: 0, mode: "major" as const, correlation: 1 };
    const to = { tonicPc: 7, mode: "major" as const, correlation: 1 };
    const out = planModulation(from, to);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("unsupported");
      expect(out.error.message).toContain("TD-EXP-MOD");
    }
  });
});
