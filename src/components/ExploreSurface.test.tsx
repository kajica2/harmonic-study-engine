/**
 * src/components/ExploreSurface.test.tsx - PRD-001 Phase 5 (checklist 9).
 * jsdom via the existing src/components glob (NO config edit).
 *
 * Pins: seed commit renders cards; free seeds show the empty state
 * (no cards); the DIRTY Form* components still render (presence pin -
 * their files are never edited).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ExploreSurface } from "./ExploreSurface";
import { useSessionStore } from "../state/sessionStore";
import { parseChordChart } from "../../engine/compose/chordchart";

beforeEach(() => {
  localStorage.clear();
  useSessionStore.getState().resetModeSlice();
});

function commitSeed(text: string): void {
  render(<ExploreSurface />);
  fireEvent.change(screen.getByTestId("seed-input"), {
    target: { value: text },
  });
  fireEvent.keyDown(screen.getByTestId("seed-input"), { key: "Enter" });
}

describe("ExploreSurface", () => {
  it("seed commit renders cards with rationales + Hear buttons", () => {
    commitSeed("Dm7 G7 Cmaj7");
    const grid = screen.getByTestId("explore-cards");
    const cards = within(grid).getAllByTestId(/^idea-card-/);
    expect(cards.length).toBeGreaterThanOrEqual(3);
    // Every card carries a technique chip + a Hear button.
    for (const card of cards) {
      const id = card.getAttribute("data-testid")?.replace("idea-card-", "") ?? "";
      expect(within(grid).getByTestId(`idea-technique-${id}`)).toBeTruthy();
      expect(within(grid).getByTestId(`hear-${id}`)).toBeTruthy();
    }
  });

  it("free seed shows presets with no cards (never a dead end)", () => {
    commitSeed("hello world");
    expect(screen.getByTestId("explore-empty")).toBeTruthy();
    expect(screen.queryByTestId("explore-cards")).toBeNull();
    expect(screen.getByTestId("seed-chip-0")).toBeTruthy();
  });

  it("FormTemplatePicker + FormPlanner still render (dirty-presence pin)", () => {
    commitSeed("Cmaj7");
    expect(
      screen.getByRole("region", { name: "Form templates" }),
    ).toBeTruthy();
    expect(screen.getByRole("region", { name: "Form" })).toBeTruthy();
  });

  it("Send-to-Compose lands a chart session in the store", () => {
    commitSeed("Dm7 G7 Cmaj7");
    const grid = screen.getByTestId("explore-cards");
    const first = within(grid).getAllByTestId(/^idea-card-/)[0];
    const id = first.getAttribute("data-testid")?.replace("idea-card-", "") ?? "";
    fireEvent.click(within(grid).getByTestId(`send-compose-${id}`));
    const s = useSessionStore.getState();
    expect(s.mode).toBe("compose");
    // The first card is a reharmonize alternative - assert the landing
    // structurally: a 3-bar chart session reached the store.
    const text = s.composeSession?.chartText ?? "";
    expect(parseChordChart(text).ok).toBe(true);
    const parsed = parseChordChart(text);
    if (parsed.ok) expect(parsed.value.grid.bars).toHaveLength(3);
  });

  it("Send-to-Etude carries constraints (bars clamp 3 -> 4, honest copy on title)", () => {
    commitSeed("Dm7 G7 Cmaj7");
    const grid = screen.getByTestId("explore-cards");
    const first = within(grid).getAllByTestId(/^idea-card-/)[0];
    const id = first.getAttribute("data-testid")?.replace("idea-card-", "") ?? "";
    const btn = within(grid).getByTestId(`send-etude-${id}`) as HTMLButtonElement;
    expect(btn.title).toContain("Practice in this key");
    fireEvent.click(btn);
    const s = useSessionStore.getState();
    expect(s.mode).toBe("etude");
    expect(s.etudeConstraints?.bars).toBe(4);
  });
});
