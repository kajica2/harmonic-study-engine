/**
 * src/hooks/useKeyDown.test.ts - HIGH-001 pin: the 1/2/3 mode
 * shortcuts must yield to Cmd / Ctrl / Alt + digit so the browser's
 * native tab-switch / menu behavior survives.
 */

import { describe, it, expect } from "vitest";
import { isModeShortcutModifierKey } from "./useKeyDown";

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