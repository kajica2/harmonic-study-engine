/**
 * src/hooks/useKeyDown.test.ts - HIGH-001 pin: the 1/2/3 mode
 * shortcuts must yield to Cmd / Ctrl / Alt + digit so the browser's
 * native tab-switch / menu behavior survives.
 */

import { describe, it, expect } from "vitest";
import {
  isModeShortcutModifierKey,
  classifyTransposeKey,
  classifyNoteKey,
  NOTE_KEY_SEMITONES_BY_CODE,
  type NoteKeyAction,
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

/**
 * PRD-001 Phase 7 S4 (REQ-IO-5, D139) pins: the computer-keyboard
 * note mapping. The PHASE-1-01 modifier-guard pin is the whole
 * slice's safety law - meta/ctrl/alt must return null BEFORE any key
 * branch. Matching is by e.code, NEVER e.key (the D14 law).
 */
describe("classifyNoteKey (S4, D139)", () => {
  const ev = (
    code: string,
    opts: Partial<{
      key: string;
      metaKey: boolean;
      ctrlKey: boolean;
      altKey: boolean;
      shiftKey: boolean;
    }> = {},
  ) =>
    ({
      code,
      key: opts.key ?? "?",
      metaKey: opts.metaKey ?? false,
      ctrlKey: opts.ctrlKey ?? false,
      altKey: opts.altKey ?? false,
      shiftKey: opts.shiftKey ?? false,
    }) as KeyboardEvent;

  const note = (semitones: number): NoteKeyAction => ({
    kind: "note",
    semitones,
  });

  it("every mapped code returns its semitone (table-driven, all 13)", () => {
    const TABLE: [string, number][] = [
      ["KeyA", 0], ["KeyW", 1], ["KeyS", 2], ["KeyE", 3], ["KeyD", 4],
      ["KeyF", 5], ["KeyT", 6], ["KeyG", 7], ["KeyY", 8], ["KeyH", 9],
      ["KeyU", 10], ["KeyJ", 11], ["KeyK", 12],
    ];
    for (const [code, semitones] of TABLE) {
      expect(classifyNoteKey(ev(code))).toEqual(note(semitones));
    }
  });

  it("the table constant matches the REQ-IO-5 literal order exactly", () => {
    expect(Object.keys(NOTE_KEY_SEMITONES_BY_CODE)).toEqual([
      "KeyA", "KeyW", "KeyS", "KeyE", "KeyD", "KeyF", "KeyT",
      "KeyG", "KeyY", "KeyH", "KeyU", "KeyJ", "KeyK",
    ]);
    expect(Object.values(NOTE_KEY_SEMITONES_BY_CODE)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it("PHASE-1-01 PIN: metaKey + KeyA returns null BEFORE any key branch", () => {
    expect(classifyNoteKey(ev("KeyA", { metaKey: true }))).toBeNull();
    expect(classifyNoteKey(ev("KeyK", { metaKey: true }))).toBeNull();
    expect(classifyNoteKey(ev("KeyZ", { metaKey: true }))).toBeNull();
  });

  it("ctrlKey / altKey held -> null on mapped codes too (browser yields)", () => {
    expect(classifyNoteKey(ev("KeyA", { ctrlKey: true }))).toBeNull();
    expect(classifyNoteKey(ev("KeyW", { altKey: true }))).toBeNull();
    expect(classifyNoteKey(ev("KeyX", { ctrlKey: true }))).toBeNull();
  });

  it("shift PASSES (D139: no mapping key uses shift semantics)", () => {
    expect(classifyNoteKey(ev("KeyA", { shiftKey: true }))).toEqual(note(0));
    expect(classifyNoteKey(ev("KeyT", { shiftKey: true }))).toEqual(note(6));
  });

  it("unmapped codes -> null (incl. the bound M + brackets + digits)", () => {
    expect(classifyNoteKey(ev("KeyM"))).toBeNull();
    expect(classifyNoteKey(ev("BracketLeft"))).toBeNull();
    expect(classifyNoteKey(ev("Space"))).toBeNull();
    expect(classifyNoteKey(ev("Digit1"))).toBeNull();
    expect(classifyNoteKey(ev("Escape"))).toBeNull();
  });

  it("KeyZ -> octave -1, KeyX -> octave +1", () => {
    expect(classifyNoteKey(ev("KeyZ"))).toEqual({ kind: "octave", delta: -1 });
    expect(classifyNoteKey(ev("KeyX"))).toEqual({ kind: "octave", delta: 1 });
  });

  it("e.key is NEVER consulted: mismatched key/code still classifies by code", () => {
    // A Dvorak/COLEMAP-style mismatch: physical KeyA carrying some
    // other glyph must map to semitone 0; a "q" glyph on KeyZ is an
    // octave shift, NOT a note. Any e.key matcher breaks here.
    expect(classifyNoteKey(ev("KeyA", { key: "q" }))).toEqual(note(0));
    expect(classifyNoteKey(ev("KeyZ", { key: "a" }))).toEqual({
      kind: "octave",
      delta: -1,
    });
    expect(classifyNoteKey(ev("KeyM", { key: "a" }))).toBeNull();
  });

  it("prototype keys are not notes: code 'toString'/'constructor' -> null", () => {
    // The lookup table is a plain object; inherited members must not
    // classify as mapped (the typeof === number guard is the law).
    expect(classifyNoteKey(ev("toString"))).toBeNull();
    expect(classifyNoteKey(ev("constructor"))).toBeNull();
  });

  it("the mapping steals nothing: M/brackets/space/digits stay unclassified", () => {
    // Collision-audit regression (section 0 #3): the ONLY letters in
    // the table are A W S E D F T G Y H U J K Z X - M stays free for
    // the shipped melody-mute binding.
    for (const code of ["KeyM", "KeyB", "KeyC", "KeyV", "KeyQ", "KeyR", "KeyI", "KeyO", "KeyP", "KeyL"]) {
      expect(classifyNoteKey(ev(code))).toBeNull();
    }
  });
});