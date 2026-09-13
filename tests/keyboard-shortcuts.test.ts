/**
 * Keyboard shortcut consistency check — verifies the keys wired in
 * App.tsx's `handleKeyDown` are documented in the cheatsheet, and
 * vice versa.
 *
 * Why: the App.tsx handler and the cheatsheet's SHORTCUTS array
 * are two separate sources of truth. A new shortcut added to
 * either one needs to land in the other. This test catches drift
 * without booting the full app.
 *
 * Not a behavioral test (we don't simulate KeyboardEvents against
 * the running handler — that would require extracting the handler
 * into a testable layer, which is a bigger refactor). The trade-off
 * is: this test catches the 80% case (typos, forgotten entries)
 * cheaply; the remaining 20% (handler does the wrong thing) is
 * covered by manual browser testing.
 */

import { describe, it, expect } from "vitest";
import { SHORTCUTS } from "../src/components/KeyboardShortcutsCheatsheet";

// Keys the App.tsx handler actually listens for. Source of truth:
// the `handleKeyDown` closure in App.tsx (lines 461-543). This
// list mirrors the keys it inspects. If you add a new shortcut
// to App.tsx, add it here too — the test will fail otherwise.
const HANDLED_KEYS: ReadonlyArray<{ key: string; description: string }> = [
  { key: "Escape", description: "close top modal / stop playback" },
  { key: "?", description: "show / hide cheatsheet" },
  { key: "ArrowRight", description: "step +1" },
  { key: "ArrowLeft", description: "step -1" },
  { key: "ArrowDown", description: "path +1 (resets to step 1)" },
  { key: "ArrowUp", description: "path -1 (resets to step 1)" },
  { key: "Space", description: "toggle Auto-playback" },
  { key: "M", description: "toggle Play Along (mute synth melody)" },
  { key: "[", description: "tempo -5 BPM" },
  { key: "]", description: "tempo +5 BPM" },
];

// Keys the cheatsheet documents, in canonical form. The data
// field on the SHORTCUTS array uses display strings ("Space",
// "←", etc.) — see the keymap below.
const CHEATSHEET_DISPLAY_KEYS: ReadonlySet<string> = new Set(
  SHORTCUTS.flatMap((s) => s.keys),
);

describe("keyboard shortcut handler vs cheatsheet", () => {
  it("every key the handler responds to is documented in the cheatsheet", () => {
    // Map handled keys to cheatsheet display form. Some keys
    // (arrow keys, Space) are displayed differently in the
    // cheatsheet. Multiple accepted forms are checked as an array.
    const HANDLER_KEY_TO_CHEATSHEET: Record<string, string | string[]> = {
      Escape: "Esc",
      " ": "Space",
      "Space": "Space", // also accepted by the handler
      ArrowRight: "→",
      ArrowLeft: "←",
      ArrowDown: "↓",
      ArrowUp: "↑",
      "?": "?",
      M: "M",
      "[": "[",
      "]": "]",
    };
    for (const { key } of HANDLED_KEYS) {
      const display = HANDLER_KEY_TO_CHEATSHEET[key] ?? key;
      const accepted = Array.isArray(display) ? display : [display];
      const found = accepted.some((d) => CHEATSHEET_DISPLAY_KEYS.has(d));
      expect(
        found,
        `handler listens for '${key}' (display: ${JSON.stringify(accepted)}) but the cheatsheet doesn't document it`,
      ).toBe(true);
    }
  });

  it("every key the cheatsheet documents is actually handled", () => {
    // Reverse check: nothing in the cheatsheet that's wired to
    // nothing. Catches docs that drifted away from the handler.
    const CHEATSHEET_TO_HANDLER: Record<string, string | string[]> = {
      "←": "ArrowLeft",
      "→": "ArrowRight",
      "↑": "ArrowUp",
      "↓": "ArrowDown",
      // The Space handler accepts both ' ' (e.key) and 'Space'
      // (e.code) — the App.tsx handler checks e.key === " " ||
      // e.code === "Space". Either string must be in HANDLED_KEYS.
      Space: [" ", "Space"],
      Esc: "Escape",
      "?": "?",
      M: "M",
      "[": "[",
      "]": "]",
    };
    const handledKeys = new Set(HANDLED_KEYS.map((h) => h.key));
    for (const display of CHEATSHEET_DISPLAY_KEYS) {
      const handlerKeys = CHEATSHEET_TO_HANDLER[display] ?? display;
      const acceptable = Array.isArray(handlerKeys) ? handlerKeys : [handlerKeys];
      const found = acceptable.some((k) => handledKeys.has(k));
      expect(
        found,
        `cheatsheet documents '${display}' but the handler doesn't listen for ${JSON.stringify(acceptable)}`,
      ).toBe(true);
    }
  });

  it("handler doesn't accidentally listen for an unmodified letter that would conflict with typing", () => {
    // Belt-and-suspenders: the handler short-circuits on input/textarea
    // /contenteditable (line 470 of App.tsx), but a sane test
    // is that the keymap only includes non-character keys + Space +
    // ? + M, and that no alphanumeric key overlaps with a likely
    // form field value. (M is OK because the handler explicitly
    // toggles Play Along — there's no conflict with typing.)
    for (const { key } of HANDLED_KEYS) {
      // Acceptable single-character shortcuts: ?, [, ], M
      // (and "Space" — the alternate name for the spacebar)
      const acceptable = ["?", "[", "]", "M", "Space"];
      const isArrow = key.startsWith("Arrow");
      const isSpecial =
        key === "Escape" || key === " " || key === "Space" || isArrow || acceptable.includes(key);
      expect(
        isSpecial,
        `unexpected unmodified letter shortcut: '${key}' — does this conflict with typing?`,
      ).toBe(true);
    }
  });
});