/**
 * src/lib/noteInputBus.test.ts - PRD-001 Phase 7 S4 (D137) pins
 * (docs/PHASE-7-S4-INPUTS.md section 6.1): the synthetic "midin"
 * detail shape EXACTLY matches the midiIn.ts header contract
 * (field-by-field anti-drift law vs audit #2), the channel-0
 * sentinel, the velocity law, the inputId sentinels and the
 * no-throw philosophy.
 *
 * jsdom via JSDOM_FILES in vitest.config.ts (Vitest 5 IGNORES
 * per-file env comments - the AGENTS gotcha).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import {
  emitNoteInput,
  hseInputId,
  hseInputName,
  isHseInputId,
} from "./noteInputBus";
import type { MidiInEvent } from "./midiIn";

function captureOne(fn: () => void): CustomEvent<MidiInEvent> {
  let seen: CustomEvent<MidiInEvent> | null = null;
  const listener = (e: Event): void => {
    seen = e as CustomEvent<MidiInEvent>;
  };
  window.addEventListener("midin", listener);
  fn();
  window.removeEventListener("midin", listener);
  expect(seen).not.toBeNull();
  return seen as CustomEvent<MidiInEvent>;
}

const originalCustomEvent = window.CustomEvent;

afterEach(() => {
  // Restore any deleted globals (the no-throw pin).
  if (window.CustomEvent === undefined) {
    Object.defineProperty(window, "CustomEvent", {
      value: originalCustomEvent,
      configurable: true,
    });
  }
  vi.restoreAllMocks();
});

describe("noteInputBus (D137)", () => {
  it("noteon detail shape EXACTLY matches the midiIn.ts contract (field by field)", () => {
    const before = performance.now();
    const ev = captureOne(() => emitNoteInput(60, true, "keyboard"));
    const after = performance.now();
    const detail = ev.detail;
    // The MidiInEvent keys, verbatim (midiIn.ts:30-38).
    expect(Object.keys(detail).sort()).toEqual([
      "channel",
      "inputId",
      "inputName",
      "note",
      "timestamp",
      "type",
      "velocity",
    ]);
    expect(detail.note).toBe(60);
    expect(detail.type).toBe("noteon");
    expect(detail.timestamp).toBeGreaterThanOrEqual(before);
    expect(detail.timestamp).toBeLessThanOrEqual(after);
  });

  it("channel is ALWAYS 0 - the never-bass-excluded sentinel (audit #9)", () => {
    // The bass picker offers 1..16 only, so `detail.channel === bass`
    // can never match a synthetic event in either consumer.
    const on = captureOne(() => emitNoteInput(61, true, "screen"));
    const off = captureOne(() => emitNoteInput(61, false, "screen"));
    expect(on.detail.channel).toBe(0);
    expect(off.detail.channel).toBe(0);
  });

  it("velocity 100 on noteon, 0 on noteoff (midiIn's noteon law)", () => {
    const on = captureOne(() => emitNoteInput(62, true, "keyboard"));
    const off = captureOne(() => emitNoteInput(62, false, "keyboard"));
    expect(on.detail.velocity).toBe(100); // > 0: qualifies as noteon
    expect(off.detail.velocity).toBe(0);
    expect(on.detail.type).toBe("noteon");
    expect(off.detail.type).toBe("noteoff");
  });

  it("inputId sentinels + inputName per source (the source tag, D137)", () => {
    expect(hseInputId("keyboard")).toBe("hse-keyboard");
    expect(hseInputId("screen")).toBe("hse-screen");
    expect(hseInputName("keyboard")).toBe("Computer keyboard");
    expect(hseInputName("screen")).toBe("On-screen piano");
    const kb = captureOne(() => emitNoteInput(63, true, "keyboard"));
    const sc = captureOne(() => emitNoteInput(63, true, "screen"));
    expect(kb.detail.inputId).toBe("hse-keyboard");
    expect(kb.detail.inputName).toBe("Computer keyboard");
    expect(sc.detail.inputId).toBe("hse-screen");
    expect(sc.detail.inputName).toBe("On-screen piano");
  });

  it("isHseInputId: true for both sentinels, false for hardware ids / undefined", () => {
    expect(isHseInputId("hse-keyboard")).toBe(true);
    expect(isHseInputId("hse-screen")).toBe(true);
    // Real Web MIDI source ids are implementation strings - the
    // collision law (D137): hardware events can never look synthetic.
    expect(isHseInputId("test-in")).toBe(false);
    expect(isHseInputId("")).toBe(false);
    expect(isHseInputId(undefined)).toBe(false);
  });

  it("NEVER throws when CustomEvent is absent (midiIn's try/catch philosophy)", () => {
    Object.defineProperty(window, "CustomEvent", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(() => emitNoteInput(60, true, "keyboard")).not.toThrow();
    expect(() => emitNoteInput(60, false, "screen")).not.toThrow();
  });
});
