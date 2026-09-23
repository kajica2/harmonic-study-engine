/**
 * src/hooks/useKeyDown.test.ts - HIGH-001 pin: the 1/2/3 mode
 * shortcuts must yield to Cmd / Ctrl / Alt + digit so the browser's
 * native tab-switch / menu behavior survives.
 */

import { describe, it, expect } from "vitest";
import {
  isModeShortcutModifierKey,
  classifyTransposeKey,
} from "./useKeyDown";

describe("isModeShortcutModifierKey", () => {
  it("returns true for Cmd + 1 (the reviewer's canonical case)", () => {
    const e = { metaKey: true, ctrlKey: false, altKey: false };
    expect(isModeShortcutModifierKey(e as KeyboardEvent)).toBe(true);
  });

  it("returns false for a bare digit (no modifiers held)", () => {
    const e = { metaKey: false, ctrlKey: false, altKey: false };
    expect(isModeShortcutModifierKey(e as KeyboardEvent)).toBe(false);
  });
});

/**
 * PRD-001 Phase 2 (D14) pins: transpose key classification is by
 * e.code + e.shiftKey - NEVER e.key. The "{" trap test below is the
 * regression this rule exists for: Shift+[ arrives as e.key === "{",
 * so any key-based matcher silently misses the octave binding.
 */
describe("classifyTransposeKey", () => {
  const ev = (
    code: string,
    opts: Partial<{
      shiftKey: boolean;
      metaKey: boolean;
      ctrlKey: boolean;
      altKey: boolean;
    }> = {},
  ) =>
    ({
      code,
      shiftKey: opts.shiftKey ?? false,
      metaKey: opts.metaKey ?? false,
      ctrlKey: opts.ctrlKey ?? false,
      altKey: opts.altKey ?? false,
    }) as KeyboardEvent;

  it("brackets without shift classify as +/-1", () => {
    expect(classifyTransposeKey(ev("BracketLeft"))).toBe("down1");
    expect(classifyTransposeKey(ev("BracketRight"))).toBe("up1");
  });

  it("Shift + brackets classify as +/-12", () => {
    expect(classifyTransposeKey(ev("BracketLeft", { shiftKey: true }))).toBe(
      "down12",
    );
    expect(classifyTransposeKey(ev("BracketRight", { shiftKey: true }))).toBe(
      "up12",
    );
  });

  it('the "{" trap: Shift+[ arrives with e.key === "{" but code matching still works', () => {
    // Simulate the US-layout event: key is the shifted glyph, code
    // is the physical bracket. A key-based matcher would see "{" and
    // miss the binding entirely.
    const e = { ...ev("BracketLeft", { shiftKey: true }), key: "{" };
    expect(e.key).toBe("{");
    expect(classifyTransposeKey(e as KeyboardEvent)).toBe("down12");
  });

  it("meta / ctrl / alt held -> null (yield to the browser)", () => {
    expect(classifyTransposeKey(ev("BracketLeft", { metaKey: true }))).toBeNull();
    expect(classifyTransposeKey(ev("BracketRight", { ctrlKey: true }))).toBeNull();
    expect(classifyTransposeKey(ev("BracketLeft", { altKey: true }))).toBeNull();
    // Shift alone passes - it is the octave modifier (D14).
    expect(classifyTransposeKey(ev("BracketRight", { shiftKey: true }))).toBe("up12");
  });

  it("non-bracket codes -> null (incl. comma/period tempo keys)", () => {
    expect(classifyTransposeKey(ev("KeyA"))).toBeNull();
    expect(classifyTransposeKey(ev("Comma"))).toBeNull();
    expect(classifyTransposeKey(ev("Period"))).toBeNull();
    expect(classifyTransposeKey(ev("Space"))).toBeNull();
  });
});