/**
 * Smoke test — confirms vitest infrastructure is wired and that
 * the source maps + tsconfig aliases resolve. Real coverage goes
 * in the session-C tests (theory.test.ts, paths.test.ts, etc.).
 *
 * Picked the simplest testable export to validate setup. If this
 * passes, every subsequent test file in the codebase will load.
 */

import { describe, it, expect } from "vitest";
import { applyVoiceLeading } from "../src/lib/theory";

describe("test infrastructure smoke", () => {
  it("exports a function from src/lib", () => {
    expect(typeof applyVoiceLeading).toBe("function");
  });

  it("runs a trivial assertion", () => {
    expect(1 + 1).toBe(2);
  });
});