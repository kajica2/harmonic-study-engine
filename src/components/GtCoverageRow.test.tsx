/**
 * GtCoverageRow.test.tsx — jsdom tests for the path-level guide-tone
 * coverage map row (FUTURE_PLANNING near-term #3 wiring).
 *
 * AC1: raw parity incl first-step-wins (matches gtTargetsForPath).
 * AC2: glyphs ✓ iff hasGuideTone else — (never ✗, never green/red).
 * AC3: cell count == totalBars incl padded-24 + shared-scroller contract.
 * AC4: a11y roles/labels, zero focusable, no aria-current double-announce.
 * AC5: transpose / key-drift invariance (raw intervals, not key names).
 * AC6: loop range never filters bars (visual band only).
 * AC7: empty placeholder + memo stability.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { GtCoverageRow } from "./GtCoverageRow";
import { gtTargetsForPath } from "../lib/gtTargets";
import { padPath } from "../lib/paths";
import type { HarmonicPath, HarmonicStep } from "../lib/paths";

function pathFromBars(bars: number[][]): HarmonicPath {
  const steps: HarmonicStep[] = [];
  for (const barNotes of bars) {
    for (let beat = 0; beat < 4; beat++) {
      steps.push({
        name: `bar-${steps.length / 4}`,
        notes: barNotes,
        descriptions: "",
      });
    }
  }
  return {
    id: "test-gt-row",
    title: "Test Path",
    description: "",
    steps,
  };
}

const Dm7 = [50, 53, 57, 60];
const G7 = [55, 59, 62, 65];
const Cmaj7 = [48, 52, 55, 59];
const C5 = [48, 55];
const Csus4 = [48, 65, 67];

function glyphs(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll('[role="listitem"]'),
  ).map((el) => (el.textContent ?? "").trim());
}

describe("GtCoverageRow AC1 — raw parity incl first-step-wins", () => {
  it("renders ✓/— glyphs matching gtTargetsForPath across a mixed cadence", () => {
    const path = pathFromBars([Dm7, Csus4, G7, C5]);
    const targets = gtTargetsForPath(path);
    const { container } = render(
      <GtCoverageRow targets={targets} currentBar={1} />,
    );
    const items = container.querySelectorAll('[role="listitem"]');
    expect(items.length).toBe(targets.length);
    targets.forEach((t, i) => {
      const text = items[i]?.textContent ?? "";
      if (t.hasGuideTone) {
        expect(text).toContain("✓");
        expect(text).not.toContain("—");
      } else {
        expect(text).toContain("—");
        expect(text).not.toContain("✓");
      }
    });
  });

  it("uses the bar first step only (mid-bar changes do not create slots)", () => {
    // Bar 0 opens on Csus4 (no guide) then moves to Dm7; bar 1 opens on
    // Dm7 then moves to Csus4. One target per bar, aligned to the first
    // step — the mid-bar chord is intentionally invisible here.
    const steps: HarmonicStep[] = [
      { name: "sus-a", notes: Csus4, descriptions: "" },
      { name: "sus-b", notes: Csus4, descriptions: "" },
      { name: "dm-c", notes: Dm7, descriptions: "" },
      { name: "dm-d", notes: Dm7, descriptions: "" },
      { name: "dm-a", notes: Dm7, descriptions: "" },
      { name: "dm-b", notes: Dm7, descriptions: "" },
      { name: "sus-c", notes: Csus4, descriptions: "" },
      { name: "sus-d", notes: Csus4, descriptions: "" },
    ];
    const path: HarmonicPath = {
      id: "first-step-wins",
      title: "First step wins",
      description: "",
      steps,
    };
    const targets = gtTargetsForPath(path);
    expect(targets[0]?.hasGuideTone).toBe(false);
    expect(targets[1]?.hasGuideTone).toBe(true);
    const { container } = render(
      <GtCoverageRow targets={targets} currentBar={1} />,
    );
    const g = glyphs(container);
    expect(g[0]).toContain("—");
    expect(g[1]).toContain("✓");
  });
});

describe("GtCoverageRow AC2 — glyphs (no ✗, muted neutrals)", () => {
  it("never renders ✗ anywhere in the row", () => {
    const path = pathFromBars([Dm7, Csus4, G7, C5, Cmaj7]);
    const targets = gtTargetsForPath(path);
    const { container } = render(
      <GtCoverageRow targets={targets} currentBar={2} />,
    );
    expect(container.textContent).not.toContain("✗");
    expect(container.textContent).not.toContain("×");
    // Only the two sanctioned glyphs appear inside cells.
    for (const text of glyphs(container)) {
      expect(text === "✓" || text === "—").toBe(true);
    }
  });

  it("uses muted neutrals — never green/red channels", () => {
    const path = pathFromBars([Dm7, Csus4]);
    const targets = gtTargetsForPath(path);
    const { container } = render(
      <GtCoverageRow targets={targets} currentBar={1} />,
    );
    const html = container.innerHTML.toLowerCase();
    expect(html).not.toMatch(/text-(green|red|emerald)-/);
    expect(html).not.toMatch(/bg-(green|red|emerald)-/);
    expect(html).not.toMatch(/border-(green|red|emerald)-/);
    // The "no guide tone" glyph is explicitly muted.
    const items = container.querySelectorAll('[role="listitem"]');
    const emptyCell = items[1];
    const glyphSpan = emptyCell?.querySelector("span");
    expect(glyphSpan?.className ?? "").toMatch(/text-neutral-400/);
  });

  it("titles name the target set + not-your-hits disclaimer", () => {
    const path = pathFromBars([Dm7, [48, 52, 55], Csus4]);
    const targets = gtTargetsForPath(path);
    const { container } = render(
      <GtCoverageRow targets={targets} currentBar={1} />,
    );
    const items = container.querySelectorAll('[role="listitem"]');
    expect(items[0]?.getAttribute("title")).toMatch(/3rd \+ 7th/);
    expect(items[0]?.getAttribute("title")).toMatch(/not your hits/);
    expect(items[1]?.getAttribute("title")).toMatch(/3rd only/);
    expect(items[2]?.getAttribute("title")).toMatch(/no 3rd\/7th/);
  });
});

describe("GtCoverageRow AC3 — count == totalBars incl padded 24 + shared scroller", () => {
  it("renders exactly one cell per target", () => {
    const path = pathFromBars([Dm7, G7, Cmaj7]);
    const targets = gtTargetsForPath(path);
    const { container } = render(
      <GtCoverageRow targets={targets} currentBar={1} />,
    );
    expect(
      container.querySelectorAll('[role="listitem"]').length,
    ).toBe(3);
  });

  it("covers a padded 24-bar path end to end", () => {
    const short = pathFromBars([Dm7, G7]);
    const padded = padPath(short);
    const bars = padded.steps.length / 4;
    expect(bars).toBe(24);
    const targets = gtTargetsForPath(padded);
    expect(targets).toHaveLength(24);
    const { container } = render(
      <GtCoverageRow targets={targets} currentBar={1} />,
    );
    expect(
      container.querySelectorAll('[role="listitem"]').length,
    ).toBe(24);
  });

  it("delegates scrolling to the parent (no own overflow-x-auto) and mirrors strip metrics", () => {
    const path = pathFromBars([Dm7, G7]);
    const targets = gtTargetsForPath(path);
    const { container } = render(
      <GtCoverageRow targets={targets} currentBar={1} />,
    );
    const list = container.querySelector('[role="list"]');
    expect(list).toBeTruthy();
    expect(list?.className ?? "").not.toMatch(/overflow-x-auto/);
    // Root mirrors the strip gap + fixed min-h (CLS guard).
    expect(list?.className ?? "").toMatch(/gap-1/);
    expect(list?.className ?? "").toMatch(/min-h-/);
    // Cells mirror the strip column metrics.
    const cells = container.querySelectorAll('[role="listitem"]');
    for (const cell of Array.from(cells)) {
      expect((cell as HTMLElement).className).toMatch(/flex-1/);
      expect((cell as HTMLElement).className).toMatch(/min-w-\[60px\]/);
    }
  });
});

describe("GtCoverageRow AC4 — a11y roles/labels, zero focusable", () => {
  it("exposes role=list with label and per-bar listitem labels", () => {
    const path = pathFromBars([Dm7, Csus4]);
    const targets = gtTargetsForPath(path);
    const { container } = render(
      <GtCoverageRow targets={targets} currentBar={1} />,
    );
    const list = container.querySelector('[role="list"]');
    expect(list?.getAttribute("aria-label")).toBe(
      "Guide-tone targets per bar",
    );
    const items = container.querySelectorAll('[role="listitem"]');
    expect(items[0]?.getAttribute("aria-label")).toMatch(/^Bar 1:/);
    expect(items[1]?.getAttribute("aria-label")).toMatch(/^Bar 2:/);
  });

  it("has zero focusable descendants and cells are DIVs, not buttons", () => {
    const path = pathFromBars([Dm7, G7, Csus4]);
    const targets = gtTargetsForPath(path);
    const { container } = render(
      <GtCoverageRow targets={targets} currentBar={2} />,
    );
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("select")).toBeNull();
    expect(container.querySelector("[tabindex]:not([tabindex='-1'])")).toBeNull();
    for (const cell of Array.from(
      container.querySelectorAll('[role="listitem"]'),
    )) {
      expect((cell as HTMLElement).tagName).toBe("DIV");
    }
  });

  it("never uses aria-current on the active bar (no double-announce)", () => {
    const path = pathFromBars([Dm7, G7]);
    const targets = gtTargetsForPath(path);
    const { container } = render(
      <GtCoverageRow targets={targets} currentBar={2} />,
    );
    expect(container.querySelector("[aria-current]")).toBeNull();
  });
});

describe("GtCoverageRow AC5 — transpose / key-drift invariance", () => {
  it("produces identical glyphs after a global semitone transpose", () => {
    const path = pathFromBars([Dm7, Csus4, G7]);
    const shifted: HarmonicPath = {
      ...path,
      id: "transposed",
      steps: path.steps.map((s) => ({
        ...s,
        notes: s.notes.map((n) => n + 2),
      })),
    };
    const base = gtTargetsForPath(path);
    const moved = gtTargetsForPath(shifted);
    expect(moved).toEqual(base);
    const a = render(<GtCoverageRow targets={base} currentBar={1} />);
    const b = render(<GtCoverageRow targets={moved} currentBar={1} />);
    expect(glyphs(b.container)).toEqual(glyphs(a.container));
    a.unmount();
    b.unmount();
  });

  it("ignores key-name drift (D minor → C major labels do not change targets)", () => {
    const bars = [Dm7, G7];
    const inC: HarmonicPath = { ...pathFromBars(bars), key: "C" };
    const drifted: HarmonicPath = {
      ...pathFromBars(bars),
      key: "D minor → C major",
    };
    expect(gtTargetsForPath(drifted)).toEqual(gtTargetsForPath(inC));
    const { container } = render(
      <GtCoverageRow targets={gtTargetsForPath(drifted)} currentBar={1} />,
    );
    expect(glyphs(container)).toEqual(["✓", "✓"]);
  });
});

describe("GtCoverageRow AC6 — loop range never filters", () => {
  it("renders every bar with and without a loop band", () => {
    const path = pathFromBars([Dm7, Csus4, G7, C5]);
    const targets = gtTargetsForPath(path);
    const plain = render(
      <GtCoverageRow targets={targets} currentBar={1} />,
    );
    const looped = render(
      <GtCoverageRow
        targets={targets}
        loopStartBar={1}
        loopEndBar={2}
        currentBar={1}
      />,
    );
    expect(
      looped.container.querySelectorAll('[role="listitem"]').length,
    ).toBe(plain.container.querySelectorAll('[role="listitem"]').length);
    expect(
      looped.container.querySelectorAll('[role="listitem"]').length,
    ).toBe(4);
    // Glyphs are unchanged by the loop overlay.
    expect(glyphs(looped.container)).toEqual(glyphs(plain.container));
    plain.unmount();
    looped.unmount();
  });
});

describe("GtCoverageRow AC7 — empty placeholder + memo stability", () => {
  it("renders a placeholder with list semantics when there are no targets", () => {
    const { container } = render(
      <GtCoverageRow targets={[]} currentBar={1} />,
    );
    const list = container.querySelector('[role="list"]');
    expect(list).toBeTruthy();
    expect(list?.getAttribute("aria-label")).toBe(
      "Guide-tone targets per bar",
    );
    expect(container.querySelectorAll('[role="listitem"]').length).toBe(0);
    expect(container.textContent).toMatch(/No guide-tone targets/);
    // Fixed min-h is preserved so the strip does not jump (no CLS).
    expect(list?.className ?? "").toMatch(/min-h-/);
  });

  it("is memo-wrapped and renders stably across identical rerenders", () => {
    expect(
      (GtCoverageRow as unknown as { $$typeof: symbol }).$$typeof.toString(),
    ).toContain("memo");
    const path = pathFromBars([Dm7, Csus4]);
    const targets = gtTargetsForPath(path);
    const { container, rerender } = render(
      <GtCoverageRow targets={targets} currentBar={1} />,
    );
    const before = glyphs(container);
    rerender(<GtCoverageRow targets={targets} currentBar={1} />);
    expect(glyphs(container)).toEqual(before);
    // A new array with identical content renders identically.
    rerender(
      <GtCoverageRow targets={[...targets]} currentBar={1} />,
    );
    expect(glyphs(container)).toEqual(before);
  });
});
