/**
 * engine/core/ids.test.ts - pins REQ-FND-6.
 */

import { describe, it, expect } from "vitest";
import {
  canonicalize,
  deriveCanonicalId,
  makeInstanceId,
  asCanonicalId,
  asInstanceId,
} from "./ids";

describe("canonicalize", () => {
  it("is independent of object key insertion order (nested too)", () => {
    const a = { b: 1, a: { d: 2, c: 3 } };
    const b = { a: { c: 3, d: 2 }, b: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it("preserves array order", () => {
    expect(canonicalize([1, 2, 3])).toBe("[1,2,3]");
    expect(canonicalize([1, 2])).not.toBe(canonicalize([2, 1]));
  });

  it("drops undefined-valued keys and maps undefined to null", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canonicalize(undefined)).toBe("null");
  });

  it("escapes strings like JSON.stringify", () => {
    expect(canonicalize('a"b')).toBe('"a\\"b"');
  });
});

describe("deriveCanonicalId", () => {
  it("is deterministic and constraint-order independent", () => {
    const id1 = deriveCanonicalId("etu", 7, { tempo: 140, style: "jazz" });
    const id2 = deriveCanonicalId("etu", 7, { style: "jazz", tempo: 140 });
    expect(id1).toBe(id2);
  });

  it("is seed-sensitive", () => {
    expect(deriveCanonicalId("etu", 1, {})).not.toBe(deriveCanonicalId("etu", 2, {}));
  });

  it("is constraint-sensitive", () => {
    expect(deriveCanonicalId("etu", 1, { a: 1 })).not.toBe(deriveCanonicalId("etu", 1, { a: 2 }));
  });

  it("matches the '<kind>-<base36>' format", () => {
    const id = deriveCanonicalId("etu", 42, { x: 1 });
    expect(id).toMatch(/^etu-[0-9a-z]+$/);
    expect(asCanonicalId(id)).toBe(id); // escape hatch is identity
  });
});

describe("makeInstanceId", () => {
  it("uses the caller-supplied clock (engine never reads Date.now)", () => {
    const id = makeInstanceId(1_700_000_000_000, 1);
    expect(id).toMatch(/^i-[0-9a-z]+-0001$/);
  });

  it("pads seq to at least 4 base36 chars and is stable", () => {
    expect(makeInstanceId(1000, 0).endsWith("-0000")).toBe(true);
    expect(makeInstanceId(1000, 46_655)).toBe(makeInstanceId(1000, 46_655));
    expect(asInstanceId(makeInstanceId(1, 1))).toBe("i-1-0001");
  });

  it("disambiguates same-timestamp instantiations via seq", () => {
    expect(makeInstanceId(999, 1)).not.toBe(makeInstanceId(999, 2));
  });
});
