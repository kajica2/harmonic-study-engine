/**
 * src/components/NoteInputPiano.test.tsx - PRD-001 Phase 7 S4
 * (REQ-IO-4/6, D140) pins (docs/PHASE-7-S4-INPUTS.md section 6.1):
 * the pointer-only press/release contract, the no-retrigger (no
 * gliss) law, letter chips, the octave affordances, the a11y labels,
 * the Space/Enter keyAccess LAW and the REQ-IO-6 geometry floor.
 *
 * jsdom via the components glob in vitest.config.ts (AUTO-COVERED by
 * the src/components test.tsx glob - deliberately NOT added to
 * JSDOM_FILES twice).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NoteInputPiano, type NoteInputPianoProps } from "./NoteInputPiano";

const LABELS: Record<number, string> = {
  60: "A", 61: "W", 62: "S", 63: "E", 64: "D", 65: "F", 66: "T",
  67: "G", 68: "Y", 69: "H", 70: "U", 71: "J", 72: "K",
};

function renderPiano(over: Partial<NoteInputPianoProps> = {}) {
  const onNote = vi.fn();
  const onOctaveShift = over.onOctaveShift === undefined ? undefined : over.onOctaveShift;
  const utils = render(
    <NoteInputPiano
      rootMidi={60}
      keyLabels={LABELS}
      onNote={onNote}
      onOctaveShift={onOctaveShift}
      {...over}
    />,
  );
  return { onNote, ...utils };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NoteInputPiano (D140)", () => {
  it("pointerdown/pointerup emit onNote down+up; data-note-down toggles; no retrigger while held", () => {
    const { onNote } = renderPiano();
    const key = screen.getByTestId("note-key-60");
    fireEvent.pointerDown(key, { pointerId: 1 });
    expect(onNote).toHaveBeenLastCalledWith(60, true);
    expect(key.getAttribute("data-note-down")).toBe("1");
    // NO GLISSANDANDO: a second down on the SAME held key is inert.
    fireEvent.pointerDown(key, { pointerId: 2 });
    expect(onNote).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(key, { pointerId: 1 });
    expect(onNote).toHaveBeenCalledTimes(2);
    expect(onNote).toHaveBeenLastCalledWith(60, false);
    expect(key.getAttribute("data-note-down")).toBeNull();
    // A release for a note we never started is inert (unknown-up).
    fireEvent.pointerUp(screen.getByTestId("note-key-64"), { pointerId: 5 });
    expect(onNote).toHaveBeenCalledTimes(2);
  });

  it("pointercancel + lostpointercapture release (stuck-note guards)", () => {
    const { onNote } = renderPiano();
    const key = screen.getByTestId("note-key-62");
    fireEvent.pointerDown(key, { pointerId: 1 });
    fireEvent.pointerCancel(key, { pointerId: 1 });
    expect(onNote).toHaveBeenLastCalledWith(62, false);
    fireEvent.pointerDown(key, { pointerId: 2 });
    fireEvent.lostPointerCapture(key, { pointerId: 2 });
    expect(onNote).toHaveBeenLastCalledWith(62, false);
    expect(key.getAttribute("data-note-down")).toBeNull();
  });

  it("letter chips render (data-key-label + visible text) and plain keys omit them", () => {
    renderPiano();
    const a = screen.getByTestId("note-key-60");
    expect(a.getAttribute("data-key-label")).toBe("A");
    expect(a.textContent).toContain("A");
    expect(a.textContent).toContain("C4");
    // Beyond the 13-key span the strip renders plain (no chip).
    const plain = screen.getByTestId("note-key-76"); // E5, outside LABELS
    expect(plain.hasAttribute("data-key-label")).toBe(false);
  });

  it("octave buttons render IFF the callback is set, flank the strip and fire", () => {
    const shift = vi.fn();
    const { unmount } = renderPiano({ onOctaveShift: shift });
    expect(screen.getByTestId("noteinput-octave-down").textContent).toBe("-");
    expect(screen.getByTestId("noteinput-octave-up").textContent).toBe("+");
    expect(screen.getByTestId("noteinput-root-label").textContent).toBe("Root C4");
    fireEvent.click(screen.getByTestId("noteinput-octave-down"));
    fireEvent.click(screen.getByTestId("noteinput-octave-up"));
    expect(shift.mock.calls).toEqual([[-1], [1]]);
    unmount();
    renderPiano(); // no callback -> no buttons, no label
    expect(screen.queryByTestId("noteinput-octave-down")).toBeNull();
    expect(screen.queryByTestId("noteinput-octave-up")).toBeNull();
    expect(screen.queryByTestId("noteinput-root-label")).toBeNull();
  });

  it("a11y: group label, role=button keys, aria-label with the key letter", () => {
    renderPiano();
    const group = screen.getByTestId("note-input-piano");
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("Note input piano");
    const a = screen.getByTestId("note-key-60");
    expect(a.getAttribute("role")).toBe("button");
    expect(a.getAttribute("tabindex")).toBe("0");
    expect(a.getAttribute("aria-label")).toBe("Play C4, keyboard key A");
    expect(screen.getByTestId("note-key-64").getAttribute("aria-label")).toBe(
      "Play E4, keyboard key D",
    );
  });

  it("Space/Enter on a focused key plays; keyup/blur release (the keyAccess law)", () => {
    const { onNote } = renderPiano();
    const key = screen.getByTestId("note-key-67"); // G4, chip G
    fireEvent.keyDown(key, { key: " " });
    expect(onNote).toHaveBeenLastCalledWith(67, true);
    fireEvent.keyUp(key, { key: " " });
    expect(onNote).toHaveBeenLastCalledWith(67, false);
    fireEvent.keyDown(key, { key: "Enter" });
    expect(onNote).toHaveBeenLastCalledWith(67, true);
    fireEvent.blur(key); // focus stolen mid-note -> release
    expect(onNote).toHaveBeenLastCalledWith(67, false);
    expect(key.getAttribute("data-note-down")).toBeNull();
  });

  it("MED-002: metaKey+Space / ctrlKey+Enter on a focused key never press (release paths stay ungated)", () => {
    const { onNote } = renderPiano();
    const key = screen.getByTestId("note-key-67"); // same key as the happy-path pin
    key.focus();
    fireEvent.keyDown(key, { key: " ", metaKey: true });
    fireEvent.keyDown(key, { key: "Enter", ctrlKey: true });
    expect(onNote).not.toHaveBeenCalled();
  });

  it("POINTER-ONLY LAW: no onMouse*/onTouch* props anywhere on the keys", () => {
    renderPiano();
    const els = document.querySelectorAll("[data-testid^='note-key-']");
    expect(els.length).toBeGreaterThan(0);
    for (const el of els) {
      const propsKey = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
      expect(propsKey, "React props bag present").toBeTruthy();
      const props = (el as unknown as Record<string, Record<string, unknown>>)[propsKey!];
      for (const name of Object.keys(props)) {
        expect(name, `element carries ${name}`).not.toMatch(/^onMouse/);
        expect(name, `element carries ${name}`).not.toMatch(/^onTouch/);
      }
    }
  });

  it("REQ-IO-6 geometry: 44px white-key floor + scroll escape + touch-none + >=56px strip", () => {
    renderPiano();
    const strip = screen.getByTestId("note-input-piano").querySelector(".overflow-x-auto");
    expect(strip, "horizontal scroll wrapper").toBeTruthy();
    expect(strip!.className).toContain("touch-none"); // no browser gestures
    const inner = strip!.querySelector(".h-24"); // 96px >= 56px floor
    expect(inner, "96px-tall key strip").toBeTruthy();
    const whites = [60, 62, 64, 65, 67, 69, 71, 72]; // natural notes of the span
    for (const m of whites) {
      const el = screen.getByTestId(`note-key-${m}`) as HTMLElement;
      expect(el.style.minWidth).toBe("44px");
    }
    // 2 octaves from C4 = root..C6 (25 notes, 15 whites) - the strip's
    // min-width math (15 x 44 = 660px) is the scroll trigger.
    expect(screen.getByTestId("note-key-84")).toBeTruthy(); // C6 endpoint included
    expect(screen.queryByTestId("note-key-85")).toBeNull();
  });
});
