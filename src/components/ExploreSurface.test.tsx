/**
 * src/components/ExploreSurface.test.tsx - PRD-001 Phase 5 (checklist 9).
 * jsdom via the existing src/components glob (NO config edit).
 *
 * Pins: seed commit renders cards; free seeds show the empty state
 * (no cards); the DIRTY Form* components still render (presence pin -
 * their files are never edited).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { ExploreSurface } from "./ExploreSurface";
import { useSessionStore } from "../state/sessionStore";
import { parseChordChart } from "../../engine/compose/chordchart";
import { ideaFromChord } from "../../engine/core/idea";
import { copyShareUrl } from "../lib/shareUrl";

// PRD-001 Phase 8 S1: the share seam is pinned at its own module
// (shareUrl.test.ts); here we only pin that the BUTTON routes
// through it. The mock keeps the DOM test clipboard-free.
vi.mock("../lib/shareUrl", () => ({
  copyShareUrl: vi.fn(async () => "copied" as const),
  shareStatusText: (s: string) => `status:${s}`,
}));

beforeEach(() => {
  localStorage.clear();
  useSessionStore.getState().resetModeSlice();
  // Phase 8 S1: exploreSeedUrl is EPHEMERAL (outside resetModeSlice
  // by design) - reset it here so boot precedence is order-independent.
  useSessionStore.getState().setExploreSeedUrl(null);
  window.history.replaceState({}, "", "/");
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

// ---------------------------------------------------------------------------
// PRD-001 Phase 8 S1 (D146/D149): the eseed plumbing - push mirror, boot
// precedence, governor notice, and the Share button seam. 4 pins.
// ---------------------------------------------------------------------------

describe("ExploreSurface Phase 8 S1: eseed push / boot / notice / share", () => {
  it("seedText edits push the ephemeral store mirror (skip-when-equal)", () => {
    commitSeed("Cmaj7");
    expect(useSessionStore.getState().exploreSeedUrl).toBe("Cmaj7");
    // Re-committing the SAME text: seedText is unchanged -> the push
    // effect's deps are unchanged -> NO second store write (churn law).
    let writes = 0;
    const unsub = useSessionStore.subscribe((s, prev) => {
      if (s.exploreSeedUrl !== prev.exploreSeedUrl) writes++;
    });
    fireEvent.change(screen.getByTestId("seed-input"), {
      target: { value: "Cmaj7" },
    });
    fireEvent.keyDown(screen.getByTestId("seed-input"), { key: "Enter" });
    unsub();
    expect(writes).toBe(0);
  });

  it("boot precedence: eseed (URL deep link) wins over the carried idea", () => {
    useSessionStore
      .getState()
      .setCurrentIdea(ideaFromChord("etude", "Am7", 1_700_000_000_000, 0));
    window.history.replaceState({}, "", "/?eseed=Dm7%20G7");
    render(<ExploreSurface />);
    // idea-only boot would show "Am7" (the shipped channel); the deep
    // link must win (D146 pin).
    expect((screen.getByTestId("seed-input") as HTMLInputElement).value).toBe(
      "Dm7 G7",
    );
  });

  it("a >200-char seed renders the honest explore-url-notice (governor)", () => {
    commitSeed(`Cmaj7 ${"x".repeat(200)}`);
    const notice = screen.getByTestId("explore-url-notice");
    expect(notice.textContent).toContain(
      "Seed too long for the share URL (200 chars max) - the link opens without it.",
    );
  });

  it("the Share button routes through copyShareUrl (the flush-before-copy seam)", async () => {
    commitSeed("Cmaj7");
    fireEvent.click(screen.getByTestId("share-url-button"));
    await waitFor(() => {
      expect(screen.getByTestId("share-url-status").textContent).toBe(
        "status:copied",
      );
    });
    expect(copyShareUrl).toHaveBeenCalledTimes(1);
  });
});
