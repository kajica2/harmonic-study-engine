/**
 * src/lib/buildInfo.test.ts — pure-formatter tests for the build
 * stamp rendered by the page footer.
 */
import { describe, it, expect } from "vitest";
import { formatBuildStamp } from "./buildInfo";

describe("formatBuildStamp", () => {
  it("renders commit and timestamp in 'build X · YYYY-MM-DD HH:MM UTC' shape", () => {
    expect(formatBuildStamp("5ff516a", "2026-09-18T19:51:00Z")).toBe(
      "build 5ff516a · 2026-09-18 19:51 UTC",
    );
  });

  it("zero-pads single-digit months, days, hours, minutes", () => {
    expect(formatBuildStamp("abc1234", "2026-01-05T03:07:00Z")).toBe(
      "build abc1234 · 2026-01-05 03:07 UTC",
    );
  });

  it("renders in UTC regardless of the local timezone of the build host", () => {
    // 23:30 UTC = 19:30 EDT in summer. Formatter must not shift.
    expect(formatBuildStamp("fff9999", "2026-07-15T23:30:00Z")).toBe(
      "build fff9999 · 2026-07-15 23:30 UTC",
    );
  });

  it("falls back to commit-only when timestamp is empty (vitest / unbuilt)", () => {
    expect(formatBuildStamp("dev", "")).toBe("build dev");
  });

  it("falls back to commit-only when timestamp is unparseable", () => {
    expect(formatBuildStamp("abc1234", "not-a-date")).toBe("build abc1234");
  });

  it("preserves arbitrary commit strings without truncation", () => {
    // Long SHAs aren't trimmed — the caller is responsible for passing
    // a short SHA. This documents the contract.
    expect(
      formatBuildStamp("abcdef1234567890abcdef1234567890abcdef12", "2026-09-18T00:00:00Z"),
    ).toBe("build abcdef1234567890abcdef1234567890abcdef12 · 2026-09-18 00:00 UTC");
  });

  it("treats the 'dev' fallback commit like any other string", () => {
    expect(formatBuildStamp("dev", "2026-09-18T12:00:00Z")).toBe(
      "build dev · 2026-09-18 12:00 UTC",
    );
  });
});
