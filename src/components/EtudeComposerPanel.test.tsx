/**
 * EtudeComposerPanel.test.tsx - PRD-001 Phase 3 Slice 2 (T5).
 *
 * jsdom via the src-components TSX glob in vitest.config.ts.
 *
 * Note on the infeasible-combo case: the design's T5 sketch assumed
 * an endOn token could empty the template pool, but the shipped
 * engine's feasibilityOf filters ONLY allowedNumerals/allowedQualities
 * (both DEFERRED per D29 - no UI). The reachable blocking state from
 * the shipped controls is therefore a validation failure (bars out of
 * range, unparseable numeral). The test pins the same contract -
 * Generate disabled + the exact blocking message in title/status +
 * aria-describedby - via the bars=99 path.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { EtudeComposerPanel } from "./EtudeComposerPanel";
import { DEFAULT_ETUDE_CONSTRAINTS } from "../lib/etudeEngine";
import type { EtudeConstraints } from "../../engine/etude/types";

afterEach(() => {
  cleanup();
});

function panelProps(over: Partial<Parameters<typeof EtudeComposerPanel>[0]> = {}) {
  return {
    committed: null,
    loadedTitle: null,
    onAccept: vi.fn(),
    ...over,
  };
}

describe("EtudeComposerPanel core controls (REQ-ETU-1)", () => {
  it("all seven core controls are present with aria labels", () => {
    render(<EtudeComposerPanel {...panelProps()} />);
    expect(screen.getByLabelText("Etude style")).toBeTruthy();
    expect(screen.getByLabelText("Etude key")).toBeTruthy();
    expect(screen.getByLabelText("Tonal mode")).toBeTruthy();
    expect(screen.getByLabelText("Difficulty")).toBeTruthy();
    expect(screen.getByLabelText("Bars")).toBeTruthy();
    expect(screen.getByLabelText("Use style default tempo")).toBeTruthy();
    expect(screen.getByLabelText("Tempo BPM")).toBeTruthy();
    expect(screen.getByLabelText("Seed")).toBeTruthy();
  });

  it("Generate is enabled on the default draft and accepts it", () => {
    const onAccept = vi.fn();
    render(<EtudeComposerPanel {...panelProps({ onAccept })} />);
    const generate = screen.getByRole("button", { name: "Generate etude" });
    expect(generate.hasAttribute("disabled")).toBe(false);
    fireEvent.click(generate);
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept.mock.calls[0][1]).toBe("generate");
    expect(onAccept.mock.calls[0][0]).toEqual(DEFAULT_ETUDE_CONSTRAINTS);
  });
});

describe("EtudeComposerPanel gating (D29)", () => {
  it("bars=99 disables Generate and surfaces the blocking message", () => {
    render(<EtudeComposerPanel {...panelProps()} />);
    fireEvent.change(screen.getByLabelText("Bars"), { target: { value: "99" } });
    const generate = screen.getByRole("button", { name: "Generate etude" });
    expect(generate.hasAttribute("disabled")).toBe(true);
    expect(generate.getAttribute("title")).toMatch(/bars/);
    expect(generate.getAttribute("aria-describedby")).toBe(
      "etude-composer-status",
    );
    expect(document.getElementById("etude-composer-status")?.textContent).toMatch(
      /c\.bars must be an integer 4-32/,
    );
    // Clicking a disabled button must not accept anything.
    fireEvent.click(generate);
  });

  it("an unparseable startOn numeral blocks Generate with a message", () => {
    render(<EtudeComposerPanel {...panelProps()} />);
    fireEvent.click(screen.getByLabelText("Advanced etude constraints"));
    fireEvent.change(screen.getByLabelText("Start on numeral"), {
      target: { value: "not-a-numeral" },
    });
    const generate = screen.getByRole("button", { name: "Generate etude" });
    expect(generate.hasAttribute("disabled")).toBe(true);
    expect(document.getElementById("etude-composer-status")?.textContent).toMatch(
      /does not parse/,
    );
  });

  it("MED-001: a blocked draft ALSO gates Randomize - no silent seed-only no-op", () => {
    const onAccept = vi.fn();
    render(<EtudeComposerPanel {...panelProps({ onAccept })} />);
    fireEvent.change(screen.getByLabelText("Bars"), { target: { value: "99" } });
    const randomize = screen.getByLabelText("Randomize seed");
    // The button mirrors the Generate gate: disabled + blocking title
    // + aria-describedby (never a bare disabled affordance, PHASE-1-02).
    expect(randomize.hasAttribute("disabled")).toBe(true);
    expect(randomize.getAttribute("title")).toMatch(/bars/);
    expect(randomize.getAttribute("aria-describedby")).toBe("etude-composer-status");
    // Handler-level pin: strip the DOM guard and click anyway - the
    // early-return must still refuse to accept anything NOR mutate
    // the draft seed (the old code updated the seed and loaded
    // nothing - the silent no-op this fix kills).
    randomize.removeAttribute("disabled");
    fireEvent.click(randomize);
    expect(onAccept).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Seed") as HTMLInputElement).value).toBe("1");
  });
});

describe("EtudeComposerPanel seed + echo", () => {
  it("Randomize seed fires onAccept with origin reroll and a uint32 seed", () => {
    const onAccept = vi.fn();
    render(<EtudeComposerPanel {...panelProps({ onAccept })} />);
    fireEvent.click(screen.getByLabelText("Randomize seed"));
    expect(onAccept).toHaveBeenCalledTimes(1);
    const [constraints, origin] = onAccept.mock.calls[0];
    expect(origin).toBe("reroll");
    expect(Number.isInteger(constraints.seed)).toBe(true);
    expect(constraints.seed).toBeGreaterThanOrEqual(0);
    expect(constraints.seed).toBeLessThanOrEqual(4294967295);
  });

  it("a committed prop change re-seeds the draft", () => {
    const committed: EtudeConstraints = {
      ...DEFAULT_ETUDE_CONSTRAINTS,
      bars: 16,
      seed: 999,
    };
    const { rerender } = render(<EtudeComposerPanel {...panelProps()} />);
    expect((screen.getByLabelText("Seed") as HTMLInputElement).value).toBe("1");
    rerender(<EtudeComposerPanel {...panelProps({ committed })} />);
    expect((screen.getByLabelText("Seed") as HTMLInputElement).value).toBe("999");
    expect((screen.getByLabelText("Bars") as HTMLInputElement).value).toBe("16");
  });
});

describe("EtudeComposerPanel advanced section (D29)", () => {
  it("details is CLOSED by default, ships the six controls + deferral note", () => {
    render(<EtudeComposerPanel {...panelProps()} />);
    const details = document.querySelector("details");
    expect(details).not.toBeNull();
    expect((details as HTMLDetailsElement).open).toBe(false);
    // The six shipped advanced controls exist in the DOM.
    expect(screen.getByLabelText("Start on numeral")).toBeTruthy();
    expect(screen.getByLabelText("End on numeral")).toBeTruthy();
    expect(screen.getByLabelText("Require chromatic chord")).toBeTruthy();
    expect(screen.getByLabelText("Straight rhythms only")).toBeTruthy();
    expect(screen.getByLabelText("Chord tones on strong beats")).toBeTruthy();
    expect(screen.getByLabelText("Max melody interval semitones")).toBeTruthy();
    // Honest deferral note - no silent omissions.
    expect(details?.textContent).toMatch(/Not yet exposed/);
    expect(details?.textContent).toMatch(/allowedQualities/);
    expect(details?.textContent).toMatch(/allowedNumerals/);
    expect(details?.textContent).toMatch(/melody\n?\s*range/);
  });
});

describe("EtudeComposerPanel status line", () => {
  it("shows the loaded title when provided", () => {
    render(
      <EtudeComposerPanel {...panelProps({ loadedTitle: "Blue Frame in C Major (seed 5)" })} />,
    );
    const status = document.getElementById("etude-composer-status");
    expect(status?.getAttribute("role")).toBe("status");
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.textContent).toBe("Loaded: Blue Frame in C Major (seed 5)");
  });

  it("renders the MusicXML-with-melody button only when loaded + wired", () => {
    const { rerender } = render(
      <EtudeComposerPanel {...panelProps({ onDownloadMusicXml: vi.fn() })} />,
    );
    expect(
      screen.queryByRole("button", { name: /MusicXML \(with melody\)/ }),
    ).toBeNull();
    rerender(
      <EtudeComposerPanel
        {...panelProps({
          loadedTitle: "X (seed 1)",
          onDownloadMusicXml: vi.fn(),
        })}
      />,
    );
    expect(
      screen.getByRole("button", { name: /MusicXML \(with melody\)/ }),
    ).toBeTruthy();
  });
});
