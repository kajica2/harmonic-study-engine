/**
 * src/components/IdeaCard.test.tsx - PRD-001 Phase 5 (checklist 8).
 * jsdom via the existing src/components glob (NO config edit).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { buildIdeaCards } from "../../engine/explore/cards";
import type { IdeaCard as IdeaCardData } from "../../engine/explore/types";
import { IdeaCard } from "./IdeaCard";

function progCard(): IdeaCardData {
  const [card] = buildIdeaCards("Dm7 G7 Cmaj7", "reharmonize", [
    {
      label: "Db7 for G7",
      description: "A tritone substitution.",
      rationale: "Db7 shares guide tones with G7.",
      conceptId: "tritone-sub",
      technique: "tritone-sub" as const,
      progression: ["Dm7", "Db7", "Cmaj7"],
      chord: null,
      melody: null,
    },
  ]);
  return card as IdeaCardData;
}

function chordOnlyCard(): IdeaCardData {
  const [card] = buildIdeaCards("Cmaj7", "expand", [
    {
      label: "Cmaj9 width",
      description: "An extension.",
      rationale: "Cmaj9 widens Cmaj7.",
      conceptId: null,
      technique: "extension" as const,
      progression: null,
      chord: "Cmaj9",
      melody: null,
    },
  ]);
  return card as IdeaCardData;
}

function renderCard(card: IdeaCardData, hearState: "idle" | "rendering" | "playing" = "idle") {
  const handlers = {
    onHear: vi.fn(),
    onStop: vi.fn(),
    onSendToCompose: vi.fn(),
    onSendToEtude: vi.fn(),
    onSave: vi.fn(),
    onOpenConcept: vi.fn(),
  };
  render(
    <IdeaCard
      card={card}
      hearState={hearState}
      conceptTitle={card.conceptId === null ? null : "Tritone Substitution"}
      {...handlers}
    />,
  );
  return handlers;
}

describe("IdeaCard", () => {
  it("concept link renders iff conceptId is present", () => {
    const card = progCard();
    const { onOpenConcept } = renderCard(card);
    const link = screen.getByTestId(`idea-concept-${card.id}`);
    fireEvent.click(link);
    expect(onOpenConcept).toHaveBeenCalledWith("tritone-sub");

    const bare = chordOnlyCard();
    renderCard(bare);
    expect(screen.queryByTestId(`idea-concept-${bare.id}`)).toBeNull();
  });

  it("progression-less card disables Send-to-Compose with an honest title", () => {
    const card = chordOnlyCard();
    renderCard(card);
    const btn = screen.getByTestId(`send-compose-${card.id}`) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toContain("Only progression cards");
    const progc = progCard();
    renderCard(progc);
    const ok = screen.getByTestId(`send-compose-${progc.id}`) as HTMLButtonElement;
    expect(ok.disabled).toBe(false);
  });

  it("Hear button mirrors hearState (data-preview + Stop arm)", () => {
    const card = progCard();
    const { onHear, onStop } = renderCard(card, "idle");
    const btn = screen.getByTestId(`hear-${card.id}`);
    expect(btn.getAttribute("data-preview")).toBe("idle");
    expect(btn.textContent).toBe("Hear");
    fireEvent.click(btn);
    expect(onHear).toHaveBeenCalledWith(card);
    expect(onStop).not.toHaveBeenCalled();
  });

  it("playing state shows Stop and routes to onStop", () => {
    const card = progCard();
    const { onHear, onStop } = renderCard(card, "playing");
    const btn = screen.getByTestId(`hear-${card.id}`);
    expect(btn.getAttribute("data-preview")).toBe("playing");
    expect(btn.textContent).toBe("Stop");
    fireEvent.click(btn);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onHear).not.toHaveBeenCalled();
  });
});
