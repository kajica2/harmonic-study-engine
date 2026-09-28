/**
 * src/hooks/useNoteInput.test.ts - PRD-001 Phase 7 S4 (D139) pins
 * (docs/PHASE-7-S4-INPUTS.md section 6.1): the guard stack ORDER
 * (PHASE-1-01), the bus emit, keyup/blur release laws and the
 * preventDefault-only-on-handled-keys law.
 *
 * jsdom via JSDOM_FILES in vitest.config.ts (Vitest 5 IGNORES
 * per-file env comments - the AGENTS gotcha).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNoteInput, type UseNoteInputArgs } from "./useNoteInput";
import type { MidiInEvent } from "../lib/midiIn";

function key(
  type: "keydown" | "keyup",
  code: string,
  opts: {
    key?: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
    repeat?: boolean;
    target?: EventTarget;
  } = {},
): KeyboardEvent {
  const e = new KeyboardEvent(type, {
    code,
    key: opts.key ?? code,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    altKey: opts.altKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    repeat: opts.repeat ?? false,
    bubbles: true,
    cancelable: true,
  });
  (opts.target ?? window).dispatchEvent(e);
  return e; // .defaultPrevented is the preventDefault pin
}

function setup(over: Partial<UseNoteInputArgs> = {}) {
  const onNote = vi.fn();
  const onOctaveShift = vi.fn();
  const midin: MidiInEvent[] = [];
  const bus = (e: Event): void => {
    midin.push((e as CustomEvent<MidiInEvent>).detail);
  };
  window.addEventListener("midin", bus);
  const hook = renderHook(() =>
    useNoteInput({
      enabled: true,
      rootOctave: 4,
      onNote,
      onOctaveShift,
      ...over,
    }),
  );
  return { onNote, onOctaveShift, midin, hook, unmount: hook.unmount };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useNoteInput (D139)", () => {
  it("armed iff enabled: inert while disabled, exact add/remove inverses", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const rmSpy = vi.spyOn(window, "removeEventListener");
    const off = setup({ enabled: false });
    const addedWhileDisabled = addSpy.mock.calls.filter(([t]) => t === "keydown").length;
    act(() => {
      key("keydown", "KeyA");
    });
    expect(off.onNote).not.toHaveBeenCalled();
    expect(off.midin.length).toBe(0);
    off.unmount();

    addSpy.mockClear();
    rmSpy.mockClear();
    const on = setup({ enabled: true });
    expect(addSpy.mock.calls.filter(([t]) => t === "keydown")).toHaveLength(1);
    expect(addSpy.mock.calls.filter(([t]) => t === "keyup")).toHaveLength(1);
    expect(addSpy.mock.calls.filter(([t]) => t === "blur")).toHaveLength(1);
    on.unmount();
    expect(rmSpy.mock.calls.filter(([t]) => t === "keydown")).toHaveLength(1);
    expect(rmSpy.mock.calls.filter(([t]) => t === "keyup")).toHaveLength(1);
    expect(rmSpy.mock.calls.filter(([t]) => t === "blur")).toHaveLength(1);
    expect(addedWhileDisabled).toBe(0);
  });

  it("GUARD 1 (typing, FIRST): keydown on an input target -> nothing", () => {
    const el = document.createElement("input");
    document.body.appendChild(el);
    const { onNote, midin } = setup();
    act(() => {
      const e = key("keydown", "KeyA", { target: el });
      expect(e.defaultPrevented).toBe(false); // falls through untouched
    });
    expect(onNote).not.toHaveBeenCalled();
    expect(midin.length).toBe(0);
  });

  it("GUARD 2 (metaKey, before any key branch): no note, NO preventDefault", () => {
    const { onNote, onOctaveShift, midin } = setup();
    act(() => {
      const e = key("keydown", "KeyA", { metaKey: true });
      expect(e.defaultPrevented).toBe(false); // browser tab-switch survives
    });
    act(() => {
      key("keydown", "KeyZ", { metaKey: true });
    });
    expect(onNote).not.toHaveBeenCalled();
    expect(onOctaveShift).not.toHaveBeenCalled();
    expect(midin.length).toBe(0);
  });

  it("GUARD 2 (ctrl/alt): every mapping key yields to the browser", () => {
    const { onNote, onOctaveShift } = setup();
    act(() => {
      key("keydown", "KeyA", { ctrlKey: true });
      key("keydown", "KeyW", { altKey: true });
      key("keydown", "KeyX", { ctrlKey: true });
    });
    expect(onNote).not.toHaveBeenCalled();
    expect(onOctaveShift).not.toHaveBeenCalled();
  });

  it("SHIFT PASSES (D139): shift-while-playing is a note, not a guard hit", () => {
    const { onNote, midin } = setup();
    act(() => {
      const e = key("keydown", "KeyA", { shiftKey: true, key: "A" });
      expect(e.defaultPrevented).toBe(true);
    });
    expect(onNote).toHaveBeenCalledWith(60, true);
    expect(midin.length).toBe(1);
  });

  it("GUARD 3 (e.repeat): auto-repeat machine-gunning yields ONE noteon", () => {
    const { onNote, midin } = setup();
    act(() => {
      key("keydown", "KeyA");
      key("keydown", "KeyA", { repeat: true });
      key("keydown", "KeyA", { repeat: true });
    });
    expect(onNote).toHaveBeenCalledTimes(1);
    expect(midin.length).toBe(1);
    act(() => {
      key("keyup", "KeyA");
    });
    expect(onNote).toHaveBeenCalledTimes(2); // the paired release still works
  });

  it("keydown/keyup pairing: noteoff ONLY for codes the hook started", () => {
    const { onNote, midin } = setup();
    act(() => {
      key("keyup", "KeyA"); // never pressed -> ignored
    });
    expect(onNote).not.toHaveBeenCalled();
    expect(midin.length).toBe(0);
    act(() => {
      key("keydown", "KeyS");
    });
    act(() => {
      key("keyup", "KeyD"); // unstarted code while one IS held
    });
    expect(onNote).toHaveBeenCalledTimes(1); // only the note-on
    act(() => {
      key("keyup", "KeyS");
    });
    expect(onNote).toHaveBeenLastCalledWith(62, false);
    expect(midin.map((d) => d.type)).toEqual(["noteon", "noteoff"]);
    expect(midin[1].note).toBe(62);
  });

  it("window blur releases ALL held notes (stuck-note guard)", () => {
    const { onNote, midin } = setup();
    act(() => {
      key("keydown", "KeyA");
      key("keydown", "KeyD");
      key("keydown", "KeyK");
    });
    expect(onNote).toHaveBeenCalledTimes(3);
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(onNote).toHaveBeenCalledTimes(6); // three releases
    expect(midin.filter((d) => d.type === "noteoff").map((d) => d.note).sort()).toEqual([
      60, 64, 72,
    ]);
    // Held set is now empty: a second blur is a no-op.
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(onNote).toHaveBeenCalledTimes(6);
  });

  it("octave keys route to onOctaveShift, NEVER onNote (Z -1, X +1)", () => {
    const { onNote, onOctaveShift, midin } = setup();
    act(() => {
      key("keydown", "KeyZ");
      key("keydown", "KeyX");
      key("keyup", "KeyZ"); // unstarted note - no release
    });
    expect(onOctaveShift.mock.calls).toEqual([[-1], [1]]);
    expect(onNote).not.toHaveBeenCalled();
    expect(midin.length).toBe(0); // octave is not a note event
  });

  it("root octave maps through: octave 3 shifts the whole span; the bus stamps hse-keyboard; unhandled keys fall through", () => {
    const { onNote, midin } = setup({ rootOctave: 3 });
    act(() => {
      key("keydown", "KeyA"); // (3+1)*12 + 0 = 48
      key("keyup", "KeyA");
      key("keydown", "KeyK"); // +12 -> 60
      const unhandled = key("keydown", "KeyM"); // the bound letter stays free
      expect(unhandled.defaultPrevented).toBe(false);
    });
    expect(onNote.mock.calls).toEqual([
      [48, true],
      [48, false],
      [60, true],
    ]);
    expect(midin.map((d) => [d.inputId, d.type])).toEqual([
      ["hse-keyboard", "noteon"],
      ["hse-keyboard", "noteoff"],
      ["hse-keyboard", "noteon"],
    ]);
  });
});
