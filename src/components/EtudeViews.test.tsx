/**
 * EtudeViews.test.tsx - PRD-001 Phase 3 Slice 2 (T7) + fix round.
 *
 * jsdom via the src-components TSX glob in vitest.config.ts. Pins the tab
 * default (roll), the lazy staff boundary mounting on switch (abcjs
 * renderAbc under jsdom is proven by src/lib/sheetMusicExport.test.ts
 * + the component's own try/catch fallback), the staff container's
 * role=img + aria-label, a 32-bar etude rendering without crashing,
 * and - fix round (TESTER GAP-2) - the renderAbc THROW branch:
 * console.warn + text-summary fallback, no crash.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// GAP-2 (fix round): controllable abcjs seam. vi.mock is hoisted above
// all imports; the factory DELEGATES to the real module unless the
// hoisted flag is raised, so the existing staff tests keep proving
// real abcjs renders under jsdom while the new test pins the THROW
// branch of EtudeStaffView's try/catch.
const abcjsState = vi.hoisted(() => ({ fail: false }));
vi.mock("abcjs", async (importOriginal) => {
  const actual = (await importOriginal()) as {
    default: { renderAbc: (...args: unknown[]) => unknown };
  };
  const realRenderAbc = actual.default.renderAbc.bind(actual.default);
  return {
    ...actual,
    default: {
      ...actual.default,
      renderAbc: (...args: unknown[]): unknown => {
        if (abcjsState.fail) {
          throw new Error("forced abcjs failure (GAP-2 test seam)");
        }
        return realRenderAbc(...args);
      },
    },
  };
});

import { EtudeViews } from "./EtudeViews";
import {
  DEFAULT_ETUDE_CONSTRAINTS,
  generateEtudeFor,
} from "../lib/etudeEngine";

afterEach(() => {
  cleanup();
});

const MINI = generateEtudeFor({
  ...DEFAULT_ETUDE_CONSTRAINTS,
  bars: 8,
  seed: 13,
})!;

const BIG = generateEtudeFor({
  ...DEFAULT_ETUDE_CONSTRAINTS,
  bars: 32,
  seed: 909,
})!;

describe("EtudeViews", () => {
  it("defaults to the roll tab (staff not mounted)", () => {
    render(
      <EtudeViews
        etude={MINI}
        pathId="etu-test"
        transposeShift={0}
        activeBar={null}
      />,
    );
    expect(screen.getByTestId("etude-piano-roll")).toBeTruthy();
    expect(screen.queryByTestId("etude-staff-host")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Piano roll" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("switching to Staff mounts the lazy boundary + a11y container", async () => {
    render(
      <EtudeViews
        etude={MINI}
        pathId="etu-test"
        transposeShift={0}
        activeBar={null}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Staff" }));
    const host = await screen.findByTestId("etude-staff-host");
    expect(host.getAttribute("role")).toBe("img");
    expect(host.getAttribute("aria-label")).toContain("bar melody");
    // Roll unmounts when the staff tab is active.
    expect(screen.queryByTestId("etude-piano-roll")).toBeNull();
  });

  it("renders a 32-bar etude without crashing (roll + staff)", async () => {
    render(
      <EtudeViews
        etude={BIG}
        pathId="etu-big"
        transposeShift={3}
        activeBar={7}
      />,
    );
    const svg = screen.getByTestId("etude-piano-roll");
    expect(svg.querySelectorAll('[data-kind="column"]').length).toBe(32 * 8);
    expect(svg.querySelectorAll(".etu-roll-active-bar").length).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Staff" }));
    // Either a rendered score or the warned fallback - never a crash.
    expect(await screen.findByTestId("etude-staff-host")).toBeTruthy();
  });

  it("GAP-2: renderAbc THROW -> console.warn + text-summary fallback, no crash", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    abcjsState.fail = true;
    try {
      render(
        <EtudeViews
          etude={MINI}
          pathId="etu-throw"
          transposeShift={0}
          activeBar={null}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Staff" }));
      // The guarded catch surfaces the accessible text summary...
      const fallback = await screen.findByText(
        /Staff rendering is unavailable right now/,
      );
      expect(fallback.textContent).toContain("bar melody"); // melodySummary
      // ...warns through the error-reporting channel (console policy),
      // and keeps the host container mounted (progressive enhancement,
      // not a crash).
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[EtudeStaffView] abcjs render failed"),
        expect.anything(),
      );
      expect(screen.getByTestId("etude-staff-host")).toBeTruthy();
    } finally {
      abcjsState.fail = false;
      warnSpy.mockRestore();
    }
  });
});
