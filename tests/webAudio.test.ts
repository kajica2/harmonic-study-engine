import { describe, it, expect, vi, afterEach } from "vitest";
import { newAudioContext } from "../src/lib/webAudio";

/**
 * webAudio — typed WebKit AudioContext shim.
 *
 * The shim exists so we don't need `(window as any).webkitAudioContext`
 * at every call site — old Safari / iOS WebViews still ship only the
 * `webkit`-prefixed constructor. These tests pin the lookup behavior
 * so the contract doesn't drift.
 */

afterEach(() => {
  vi.restoreAllMocks();
  // Reset the window extensions after each test so a test that
  // adds `webkitAudioContext` doesn't leak into the next.
  delete (window as { webkitAudioContext?: unknown }).webkitAudioContext;
});

describe("newAudioContext", () => {
  it("uses the standard AudioContext when both are available", () => {
    const standard = class {
      // bare marker so we can tell which constructor was invoked
      readonly kind = "standard";
    };
    (window as Window & { AudioContext: typeof AudioContext }).AudioContext =
      standard as unknown as typeof AudioContext;
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext =
      class {
        readonly kind = "webkit";
      } as unknown as typeof AudioContext;

    const ctx = newAudioContext();
    expect((ctx as unknown as { kind: string }).kind).toBe("standard");
  });

  it("falls back to webkitAudioContext when AudioContext is absent", () => {
    // jsdom exposes window.AudioContext by default; delete it for this
    // test so the fallback path is exercised.
    const w = window as Window & { AudioContext?: typeof AudioContext };
    const original = w.AudioContext;
    delete w.AudioContext;

    const webkit = class {
      readonly kind = "webkit";
    };
    w.webkitAudioContext = webkit as unknown as typeof AudioContext;

    try {
      const ctx = newAudioContext();
      expect((ctx as unknown as { kind: string }).kind).toBe("webkit");
    } finally {
      // restore so other tests don't see a deleted AudioContext
      w.AudioContext = original;
    }
  });

  it("throws a descriptive error when neither constructor is available", () => {
    const w = window as Window & {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const a = w.AudioContext;
    const b = w.webkitAudioContext;
    delete w.AudioContext;
    delete w.webkitAudioContext;

    try {
      expect(() => newAudioContext()).toThrow(/Web Audio API is not available/);
    } finally {
      if (a !== undefined) w.AudioContext = a;
      if (b !== undefined) w.webkitAudioContext = b;
    }
  });
});
