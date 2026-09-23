/**
 * MetronomeControls.test.tsx - PRD-001 Phase 3 Slice 3 (T6).
 *
 * jsdom via the src/components TSX glob in vitest.config.ts
 * (JSDOM_FILES line 14) - auto-registered, no config edit.
 *
 * Pins the five control groups (volume / preset / subdivision /
 * accents / count-in), the meter-driven accent-chip count, and the
 * COMPLETE-Payload contract: every onChange emits a full
 * MetronomeConfig (the blob is written as one JSON unit - D32).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MetronomeControls } from "./MetronomeControls";
import { DEFAULT_METRONOME_CONFIG } from "../lib/metronomePatterns";
import type { MetronomeConfig } from "../lib/metronomePatterns";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderControls = (
  config: MetronomeConfig = DEFAULT_METRONOME_CONFIG,
  timeSignature: "4/4" | "6/8" | "7/8" | "11/4" | "tintal" = "4/4",
) => {
  const onChange = vi.fn();
  render(
    <MetronomeControls
      config={config}
      timeSignature={timeSignature}
      onChange={onChange}
    />,
  );
  return { onChange };
};

describe("MetronomeControls (T6)", () => {
  it("renders all five control groups", () => {
    renderControls();
    expect(screen.getByLabelText("Click volume")).toBeTruthy();
    expect(screen.getByLabelText("Click sound")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Subdivision 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accent beat 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No count-in" })).toBeTruthy();
  });

  it("volume range is 0..100 and emits a COMPLETE config", () => {
    const { onChange } = renderControls();
    const range = screen.getByLabelText("Click volume") as HTMLInputElement;
    expect(range.min).toBe("0");
    expect(range.max).toBe("100");
    fireEvent.change(range, { target: { value: "42" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const payload = onChange.mock.calls[0][0] as MetronomeConfig;
    expect(payload).toEqual({ ...DEFAULT_METRONOME_CONFIG, volume: 42 });
    // Completeness: every field present, not a partial patch.
    expect(Object.keys(payload).sort()).toEqual([
      "accentBeats",
      "countInBars",
      "preset",
      "subdivision",
      "volume",
    ]);
  });

  it("preset select offers exactly the three syntheses", () => {
    renderControls();
    const select = screen.getByLabelText("Click sound") as HTMLSelectElement;
    expect(select.options).toHaveLength(3);
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      "beep",
      "click",
      "shaker",
    ]);
  });

  it("subdivision: four segmented buttons, aria-pressed tracks the config", () => {
    renderControls({ ...DEFAULT_METRONOME_CONFIG, subdivision: 3 });
    for (const s of [1, 2, 3, 4]) {
      const btn = screen.getByRole("button", { name: `Subdivision ${s}` });
      expect(btn.getAttribute("aria-pressed")).toBe(s === 3 ? "true" : "false");
    }
  });

  it("accent chips re-derive from the meter: 4 in 4/4, 6 in 6/8, 16 in tintal", () => {
    const { unmount } = render(
      <MetronomeControls
        config={DEFAULT_METRONOME_CONFIG}
        timeSignature="4/4"
        onChange={() => {}}
      />,
    );
    expect(
      screen.getAllByRole("button", { name: /^Accent beat/ }),
    ).toHaveLength(4);
    unmount();

    const view68 = render(
      <MetronomeControls
        config={DEFAULT_METRONOME_CONFIG}
        timeSignature="6/8"
        onChange={() => {}}
      />,
    );
    expect(
      screen.getAllByRole("button", { name: /^Accent beat/ }),
    ).toHaveLength(6);
    view68.unmount();

    render(
      <MetronomeControls
        config={DEFAULT_METRONOME_CONFIG}
        timeSignature="tintal"
        onChange={() => {}}
      />,
    );
    expect(
      screen.getAllByRole("button", { name: /^Accent beat/ }),
    ).toHaveLength(16);
  });

  it("accent chip toggle adds AND removes beats, emitting the next config", () => {
    const onChange = vi.fn();
    const view = render(
      <MetronomeControls
        config={DEFAULT_METRONOME_CONFIG}
        timeSignature="4/4"
        onChange={onChange}
      />,
    );
    // Add beat 3 (index 2) to the default [0].
    fireEvent.click(screen.getByRole("button", { name: "Accent beat 3" }));
    const afterAdd = (onChange.mock.calls[0][0] as MetronomeConfig).accentBeats;
    expect(afterAdd).toEqual([0, 2]);
    // Simulate the parent applying the change, then REMOVE the
    // downbeat: the component is stateless, so the next emission is
    // computed against the re-rendered config ([0,2] -> [2]).
    view.rerender(
      <MetronomeControls
        config={{ ...DEFAULT_METRONOME_CONFIG, accentBeats: afterAdd }}
        timeSignature="4/4"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Accent beat 1" }));
    expect((onChange.mock.calls[1][0] as MetronomeConfig).accentBeats).toEqual(
      [2],
    );
  });

  it("count-in offers 0/1/2 with the default pressed", () => {
    renderControls();
    expect(
      screen.getByRole("button", { name: "No count-in" }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Count in 1 bar" }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("false");
    expect(
      screen.getByRole("button", { name: "Count in 2 bars" }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("false");
  });
});
