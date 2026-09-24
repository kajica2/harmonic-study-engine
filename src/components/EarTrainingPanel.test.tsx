/**
 * src/components/EarTrainingPanel.test.tsx - PRD-001 Phase 6 (checklist 10).
 *
 * jsdom via the src/components TSX glob (auto-registered, no config edit).
 */

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { EarTrainingPanel } from "./EarTrainingPanel";
import { createRng } from "../../engine/core/rng";
import { generateEarPrompt } from "../../engine/ear-training/generate";
import { CONCEPT_IDS } from "../../engine/pedagogy/concepts";
import { saveSrs } from "../lib/srsStore";
import type { SrsState } from "../../engine/pedagogy/srs";
import { useSessionStore } from "../state/sessionStore";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  localStorage.clear();
  useSessionStore.getState().resetModeSlice();
});

function generateDefault(): void {
  fireEvent.click(screen.getByTestId("ear-generate"));
}

describe("EarTrainingPanel", () => {
  it("generate renders prompt + 4 options", () => {
    render(<EarTrainingPanel />);
    generateDefault();
    expect(screen.getByTestId("ear-prompt")).toBeTruthy();
    expect(screen.getByTestId("ear-option-0")).toBeTruthy();
    expect(screen.getByTestId("ear-option-3")).toBeTruthy();
  });

  it("submit correct shows accuracy streak copy + SRS line (Q10 honesty string)", () => {
    render(<EarTrainingPanel />);
    generateDefault();
    const expected = generateEarPrompt({ type: "interval", difficulty: 1, seed: 1, rng: createRng(1) });
    const buttons = [0, 1, 2, 3].map((i) => screen.getByTestId(`ear-option-${i}`));
    const correct = buttons.find((b) => b.textContent === expected.answerKey);
    expect(correct).toBeDefined();
    fireEvent.click(correct as HTMLElement);
    const feedback = screen.getByTestId("ear-feedback");
    expect(feedback.textContent).toContain("Correct");
    const streak = screen.getByTestId("ear-streak");
    // Honesty string: "1/1 correct (100%) - streak 1".
    expect(streak.textContent).toMatch(/correct.*streak/);
    expect(streak.textContent).not.toMatch(/level|xp|points/i);
    expect(streak.textContent).toContain("SRS");
  });

  it("submit incorrect shows concept offer button opening the drawer", () => {
    render(<EarTrainingPanel />);
    generateDefault();
    const expected = generateEarPrompt({ type: "interval", difficulty: 1, seed: 1, rng: createRng(1) });
    const buttons = [0, 1, 2, 3].map((i) => screen.getByTestId(`ear-option-${i}`));
    const wrong = buttons.find((b) => b.textContent !== expected.answerKey);
    expect(wrong).toBeDefined();
    fireEvent.click(wrong as HTMLElement);
    const offer = screen.getByTestId("ear-concept-offer");
    expect(offer.textContent).toContain("What is");
    fireEvent.click(offer);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("Hear button mirrors hearState (data-preview idle initially)", () => {
    render(<EarTrainingPanel />);
    generateDefault();
    expect(screen.getByTestId("ear-hear").getAttribute("data-preview")).toBe("idle");
  });

  it("answer submit leaves dirty.etude unchanged (D106 pin)", () => {
    render(<EarTrainingPanel />);
    const before = useSessionStore.getState().dirty.etude;
    generateDefault();
    const expected = generateEarPrompt({ type: "interval", difficulty: 1, seed: 1, rng: createRng(1) });
    const buttons = [0, 1, 2, 3].map((i) => screen.getByTestId(`ear-option-${i}`));
    const correct = buttons.find((b) => b.textContent === expected.answerKey);
    fireEvent.click(correct as HTMLElement);
    expect(useSessionStore.getState().dirty.etude).toBe(before);
    expect(localStorage.getItem("pedagogy.srs")).toContain(expected.conceptId);
    expect(localStorage.getItem("pedagogy.log")).toContain("ear");
  });

  it("MED-001 Practice due: single due concept surfaces its drill", () => {
    const now = Date.now();
    const day = 86400e3;
    const map: Record<string, SrsState> = {};
    for (const id of CONCEPT_IDS) {
      if (id === "ii-v-i") continue; // unseen -> the only due concept
      map[id] = {
        version: 1,
        conceptId: id,
        lastSeenMs: now - day,
        intervalDays: 10,
        ease: 2.5,
        streak: 1,
        nextDueMs: now + 10 * day,
      };
    }
    saveSrs(map);
    render(<EarTrainingPanel />);
    const dueBtn = screen.getByTestId("ear-practice-due") as HTMLButtonElement;
    expect(dueBtn.disabled).toBe(false);
    fireEvent.click(dueBtn);
    expect(screen.getByTestId("ear-prompt")).toBeTruthy();
    // ii-v-i maps to the progression drill.
    expect((screen.getByTestId("ear-type") as HTMLSelectElement).value).toBe("progression");
  });

  it("MED-001 Practice due: nothing due -> disabled with tomorrow title", () => {
    const now = Date.now();
    const day = 86400e3;
    const map: Record<string, SrsState> = {};
    for (const id of CONCEPT_IDS) {
      map[id] = {
        version: 1,
        conceptId: id,
        lastSeenMs: now - day,
        intervalDays: 10,
        ease: 2.5,
        streak: 1,
        nextDueMs: now + 10 * day,
      };
    }
    saveSrs(map);
    render(<EarTrainingPanel />);
    const dueBtn = screen.getByTestId("ear-practice-due") as HTMLButtonElement;
    expect(dueBtn.disabled).toBe(true);
    expect(dueBtn.title).toBe("Nothing due - come back tomorrow");
  });
});
