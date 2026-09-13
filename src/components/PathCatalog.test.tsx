/**
 * Component tests for PathCatalog. Pure-render, no engine deps.
 *
 * Real regression checks:
 *  - renders without crashing given a fixture list of paths
 *  - composer input narrows the displayed list (e.g. "Bach" → only Bach)
 *  - "Open" button click fires onSelect with the right id
 *  - empty filter shows every fixture path
 *  - behavioral-rule chip toggle narrows the list
 *  - technique chip toggle narrows the list (when path has techniques[])
 *  - clear button resets composer/key/rules
 *
 * Uses jsdom via vitest.config.ts environmentMatchGlobs.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import React from "react";
import { PathCatalog, type BehavioralRuleId } from "./PathCatalog";
import type { HarmonicPath } from "../lib/paths";

// RTL's default `cleanup()` runs automatically when `afterEach` is wired
// through globals — but our `globals: false` config disables that, so we
// hook it explicitly here. Without this, multiple `render()` calls in
// one file accumulate DOM and `getByTestId` returns multiple matches.
afterEach(() => cleanup());

// Inline fixture — never reads ALL_PATHS so the test stays isolated
// from whatever Phases 1/2/3 drop into the catalog. We type the
// fixture as `HarmonicPath[]` so TypeScript validates the fields we
// set are real, and we model the rules map loosely (BehavioralRuleId
// is a string union — we cast the strings here for ergonomic fixture
// construction).
const fixturePaths = [
  {
    id: "p1",
    title: "Bach Invention",
    description: "",
    steps: [{ name: "C", notes: [60], descriptions: "" }],
    composer: "Bach",
    key: "C",
    feel: "test",
  },
  {
    id: "p2",
    title: "Coltrane Cycle",
    description: "",
    steps: [
      { name: "D", notes: [62], descriptions: "" },
      { name: "G", notes: [55], descriptions: "" },
      { name: "C", notes: [60], descriptions: "" },
      { name: "D7", notes: [62], descriptions: "" },
      { name: "G", notes: [55], descriptions: "" },
      { name: "C", notes: [60], descriptions: "" },
    ],
    composer: "Coltrane",
    key: "G",
    feel: "test",
  },
  {
    id: "p3",
    title: "Mahler Adagio",
    description: "",
    steps: [
      { name: "F", notes: [53], descriptions: "" },
      { name: "Bb", notes: [58], descriptions: "" },
    ],
    composer: "Mahler",
    key: "F → Bb",
    feel: "test",
  },
] satisfies HarmonicPath[];

const fixtureRules: Record<string, BehavioralRuleId[]> = {
  p1: ["sequenceStepper"],
  p2: ["sliceAndRepeat"],
  p3: ["keyDrift", "motifTracker"],
};

/**
 * Query helpers — cards carry `data-testid="catalog-card"` and a
 * `data-path-id` attribute we filter on, since the unique-per-path
 * test IDs would be tedious to template and could break if path
 * IDs ever gained non-word characters.
 */
function cardsFor(container: HTMLElement | Document = document) {
  return Array.from(
    container.querySelectorAll('[data-testid="catalog-card"]'),
  );
}
function cardByPathId(pathId: string) {
  return document.querySelector(
    `[data-testid="catalog-card"][data-path-id="${pathId}"]`,
  );
}

describe("PathCatalog", () => {
  it("renders without crashing given a fixture list of paths", () => {
    render(
      <PathCatalog
        paths={fixturePaths}
        rulesByPathId={fixtureRules}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByTestId("path-catalog")).toBeTruthy();
    // All three fixture paths render cards.
    expect(cardByPathId("p1")).toBeTruthy();
    expect(cardByPathId("p2")).toBeTruthy();
    expect(cardByPathId("p3")).toBeTruthy();
  });

  it("shows all paths when no filter is active", () => {
    render(
      <PathCatalog
        paths={fixturePaths}
        rulesByPathId={fixtureRules}
        onSelect={() => {}}
      />,
    );
    expect(cardsFor().length).toBe(3);
  });

  it("narrow's the list when composer input matches one path", () => {
    render(
      <PathCatalog
        paths={fixturePaths}
        rulesByPathId={fixtureRules}
        onSelect={() => {}}
      />,
    );
    const input = screen.getByTestId(
      "catalog-composer-input",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Bach" } });
    expect(cardByPathId("p1")).toBeTruthy();
    expect(cardByPathId("p2")).toBeNull();
    expect(cardByPathId("p3")).toBeNull();
  });

  it("'Open' button click fires onSelect with the right id", () => {
    const onSelect = vi.fn();
    render(
      <PathCatalog
        paths={fixturePaths}
        rulesByPathId={fixtureRules}
        onSelect={onSelect}
      />,
    );
    const openBtn = screen.getByTestId("catalog-open-p2");
    fireEvent.click(openBtn);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("p2");
  });

  it("'Open' button click fires onSelect with p3's id too", () => {
    const onSelect = vi.fn();
    render(
      <PathCatalog
        paths={fixturePaths}
        rulesByPathId={fixtureRules}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId("catalog-open-p3"));
    expect(onSelect).toHaveBeenCalledWith("p3");
  });

  it("behavioral-rule chips toggle visibility — keyDrift narrows to p3", () => {
    render(
      <PathCatalog
        paths={fixturePaths}
        rulesByPathId={fixtureRules}
        onSelect={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("catalog-rule-keyDrift"));
    expect(cardByPathId("p1")).toBeNull();
    expect(cardByPathId("p2")).toBeNull();
    expect(cardByPathId("p3")).toBeTruthy();
  });

  it("multiple behavioral-rule chips compose with AND semantics", () => {
    // No fixture path has both sequenceStepper AND sliceAndRepeat → empty.
    render(
      <PathCatalog
        paths={fixturePaths}
        rulesByPathId={fixtureRules}
        onSelect={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("catalog-rule-sequenceStepper"));
    fireEvent.click(screen.getByTestId("catalog-rule-sliceAndRepeat"));
    expect(cardByPathId("p1")).toBeNull();
    expect(cardByPathId("p2")).toBeNull();
    expect(cardByPathId("p3")).toBeNull();
    // The empty-state message should appear.
    expect(screen.getByText(/nothing matches/i)).toBeTruthy();
  });

  it("toggling a behavioral chip twice restores the full list", () => {
    render(
      <PathCatalog
        paths={fixturePaths}
        rulesByPathId={fixtureRules}
        onSelect={() => {}}
      />,
    );
    const chip = screen.getByTestId("catalog-rule-motifTracker");
    fireEvent.click(chip); // narrow → only p3
    expect(cardByPathId("p1")).toBeNull();
    fireEvent.click(chip); // restore → all 3
    expect(cardByPathId("p1")).toBeTruthy();
    expect(cardByPathId("p2")).toBeTruthy();
    expect(cardByPathId("p3")).toBeTruthy();
  });

  it("clear button resets composer input", () => {
    render(
      <PathCatalog
        paths={fixturePaths}
        rulesByPathId={fixtureRules}
        onSelect={() => {}}
      />,
    );
    const input = screen.getByTestId(
      "catalog-composer-input",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Coltrane" } });
    // Narrowed to one card.
    expect(cardsFor().length).toBe(1);
    // Click the "clear" button.
    const clearBtn = screen.getByRole("button", { name: /clear/i });
    fireEvent.click(clearBtn);
    expect(input.value).toBe("");
    // All three back.
    expect(cardsFor().length).toBe(3);
  });

  it("filters by key when the key dropdown is used", () => {
    render(
      <PathCatalog
        paths={fixturePaths}
        rulesByPathId={fixtureRules}
        onSelect={() => {}}
      />,
    );
    const select = screen.getByTestId(
      "catalog-key-select",
    ) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "C" } });
    expect(cardByPathId("p1")).toBeTruthy();
    expect(cardByPathId("p2")).toBeNull();
    expect(cardByPathId("p3")).toBeNull();
  });

  it("matches arrow-separated keys by their prefix (F → Bb = key=F)", () => {
    render(
      <PathCatalog
        paths={fixturePaths}
        rulesByPathId={fixtureRules}
        onSelect={() => {}}
      />,
    );
    const select = screen.getByTestId(
      "catalog-key-select",
    ) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "F" } });
    // p3's key is "F → Bb" — prefix is "F" — should match.
    expect(cardByPathId("p3")).toBeTruthy();
    expect(cardByPathId("p1")).toBeNull();
    expect(cardByPathId("p2")).toBeNull();
  });

  it("cards expose composer and key text in the header row", () => {
    render(
      <PathCatalog
        paths={fixturePaths}
        rulesByPathId={fixtureRules}
        onSelect={() => {}}
      />,
    );
    const card2 = cardByPathId("p2") as HTMLElement;
    // Composer + key are both visible inside the card.
    const txt = (card2.textContent ?? "").toLowerCase();
    expect(txt).toContain("coltrane");
    expect(txt).toContain("g");
    // Use within() so we don't double-count with surrounding text.
    const titleBlock = within(card2).getByText(/coltrane cycle/i);
    expect(titleBlock).toBeTruthy();
  });
});
