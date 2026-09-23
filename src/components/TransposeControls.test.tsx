/**
 * TransposeControls.test.tsx - PRD-001 Phase 2 component test.
 *
 * Runs under jsdom via JSDOM_FILES in vitest.config.ts (vitest 5
 * ignores per-file environment comments in multi-project mode).
 *
 * Pins: the global row writes globalTranspose; the exercise row
 * accumulates through the FUNCTIONAL-update path (nudgeExercise-
 * Transpose - two rapid +1 clicks land on +2 without a re-render
 * between them); the cycle toggle flips keyCycleActive; the exercise
 * row is Etude-only (showExercise=false hides it).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { TransposeControls } from "./TransposeControls";
import { useSessionStore } from "../state/sessionStore";

beforeEach(() => {
  localStorage.clear();
  useSessionStore.getState().resetModeSlice();
});

afterEach(() => {
  cleanup();
});

describe("TransposeControls - global row", () => {
  it("buttons write through to the store's globalTranspose", () => {
    render(<TransposeControls showExercise={false} />);
    const group = screen.getByRole("group", { name: "Global transpose" });
    fireEvent.click(within(group).getByRole("button", { name: "+12" }));
    expect(useSessionStore.getState().globalTranspose).toBe(12);
    fireEvent.click(within(group).getByRole("button", { name: "-1" }));
    expect(useSessionStore.getState().globalTranspose).toBe(11);
    fireEvent.click(within(group).getByRole("button", { name: "0" }));
    expect(useSessionStore.getState().globalTranspose).toBe(0);
  });

  it("respects the +/-24 global clamp", () => {
    render(<TransposeControls showExercise={false} />);
    const group = screen.getByRole("group", { name: "Global transpose" });
    const up12 = within(group).getByRole("button", { name: "+12" });
    fireEvent.click(up12);
    fireEvent.click(up12);
    expect(useSessionStore.getState().globalTranspose).toBe(24);
  });

  it("hides the Etude row when showExercise is false", () => {
    render(<TransposeControls showExercise={false} />);
    expect(
      screen.queryByRole("group", { name: "Etude transpose" }),
    ).toBeNull();
  });
});

describe("TransposeControls - Etude row + cycle (D13)", () => {
  it("renders both rows inside the Etude surface", () => {
    render(<TransposeControls showExercise />);
    expect(
      screen.getByRole("group", { name: "Global transpose" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("group", { name: "Etude transpose" }),
    ).toBeTruthy();
  });

  it("exercise buttons accumulate via the functional-update path", () => {
    render(<TransposeControls showExercise />);
    const group = screen.getByRole("group", { name: "Etude transpose" });
    const up = within(group).getByRole("button", { name: "+1" });
    fireEvent.click(up);
    fireEvent.click(up);
    fireEvent.click(up);
    expect(useSessionStore.getState().exerciseTranspose).toBe(3);
    // Global stays untouched (rows are independent, D15).
    expect(useSessionStore.getState().globalTranspose).toBe(0);
  });

  it("exercise reset zeroes only the exercise offset", () => {
    useSessionStore.getState().setGlobalTranspose(5);
    useSessionStore.getState().setExerciseTranspose(-4);
    render(<TransposeControls showExercise />);
    const group = screen.getByRole("group", { name: "Etude transpose" });
    fireEvent.click(within(group).getByRole("button", { name: "0" }));
    expect(useSessionStore.getState().exerciseTranspose).toBe(0);
    expect(useSessionStore.getState().globalTranspose).toBe(5);
  });

  it("cycle toggle flips keyCycleActive + reflects it via aria-pressed", () => {
    render(<TransposeControls showExercise />);
    const cycle = screen.getByRole("button", { name: "Cycle 12" });
    expect(cycle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(cycle);
    expect(useSessionStore.getState().keyCycleActive).toBe(true);
    expect(cycle.getAttribute("aria-pressed")).toBe("true");
  });
});
