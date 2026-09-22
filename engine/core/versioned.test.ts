/**
 * engine/core/versioned.test.ts - pins isVersioned (REQ-FND-5 / REQ-NFR-6).
 *
 * Phase 0 left versioned.ts at 0% coverage: isVersioned is the runtime
 * narrowing that guards migration dispatch on parsed JSON. It accepts ONLY
 * plain objects (and object-like payloads) carrying a positive-integer
 * `version` field. Non-integers, zero, negatives, and non-objects must be
 * rejected so the migration runner never receives garbage it cannot
 * version-check.
 */

import { describe, it, expect } from "vitest";
import { isVersioned } from "./versioned";

describe("isVersioned", () => {
  it("accepts objects with a positive integer version", () => {
    expect(isVersioned({ version: 1 })).toBe(true);
    expect(isVersioned({ version: 42, extra: "fields" })).toBe(true);
  });

  it("rejects missing, non-integer, zero, and negative versions", () => {
    expect(isVersioned({})).toBe(false);
    expect(isVersioned({ version: undefined })).toBe(false);
    expect(isVersioned({ version: "1" })).toBe(false);
    expect(isVersioned({ version: 1.5 })).toBe(false);
    expect(isVersioned({ version: NaN })).toBe(false);
    expect(isVersioned({ version: Infinity })).toBe(false);
    expect(isVersioned({ version: 0 })).toBe(false);
    expect(isVersioned({ version: -1 })).toBe(false);
  });

  it("rejects non-object payloads", () => {
    for (const bad of [null, undefined, 0, 1, "", "str", true, [], [1]]) {
      expect(isVersioned(bad)).toBe(false);
    }
  });
});
