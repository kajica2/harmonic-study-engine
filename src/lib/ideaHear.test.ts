/**
 * src/lib/ideaHear.test.ts - PRD-001 Phase 8 S1 (D148, doc 6.1).
 *
 * Node project (PURE builder only - the play path is the shipped
 * exploreHear machinery, pinned there; the true-arm of playIdea is
 * NEVER called here so no audio singleton is touched). 6 pins: the
 * three playable card shapes (chord/progression/melody, ids via
 * cardId), the scale/seed null carve (the honest-CTA law), and
 * playIdea false for the null-card kinds.
 */

import { describe, it, expect } from "vitest";
import { ideaToPlayCard, playIdea } from "./ideaHear";
import { cardId, type IdeaCard as IdeaCardData } from "../../engine/explore/types";
import type { Idea } from "../../engine/core/idea";

function idea(over: Partial<Idea>): Idea {
  return {
    id: "idea-test",
    instanceId: "inst-test",
    source: "etude",
    kind: "chord",
    chord: null,
    progression: null,
    scale: null,
    melody: null,
    seed: null,
    tags: null,
    createdAt: 1_700_000_000_000,
    version: 1,
    ...over,
  } as Idea;
}

describe("ideaToPlayCard (the carrier shapes)", () => {
  it("chord -> a one-bar progression card, id via cardId", () => {
    const card = ideaToPlayCard(idea({ kind: "chord", chord: "Cmaj7" }));
    expect(card).not.toBeNull();
    expect((card as IdeaCardData).progression).toEqual(["Cmaj7"]);
    expect((card as IdeaCardData).chord).toBe("Cmaj7");
    expect((card as IdeaCardData).id).toBe(cardId("Cmaj7", "substitute", 0));
    expect((card as IdeaCardData).technique).toBe("original"); // no-claim token (D99)
  });

  it("progression -> the full array card", () => {
    const card = ideaToPlayCard(
      idea({ kind: "progression", progression: ["ii", "V", "I"] }),
    );
    expect(card).not.toBeNull();
    expect((card as IdeaCardData).progression).toEqual(["ii", "V", "I"]);
    expect((card as IdeaCardData).id).toBe(cardId("ii V I", "substitute", 0));
  });

  it("melody -> the lead-arm card (melody array, no progression)", () => {
    const card = ideaToPlayCard(
      idea({ kind: "melody", melody: [60, 62, 64, 65] }),
    );
    expect(card).not.toBeNull();
    expect((card as IdeaCardData).melody).toEqual([60, 62, 64, 65]);
    expect((card as IdeaCardData).progression).toBeNull();
  });

  it("scale/seed -> null (the REQ-IO-52 honesty carve: the CTA is the truth)", () => {
    expect(ideaToPlayCard(idea({ kind: "scale", scale: "dorian" }))).toBeNull();
    expect(ideaToPlayCard(idea({ kind: "seed", seed: 42 }))).toBeNull();
  });

  it("empty payload slots -> null (a malformed idea never plays as silence)", () => {
    expect(ideaToPlayCard(idea({ kind: "chord", chord: null }))).toBeNull();
    expect(ideaToPlayCard(idea({ kind: "progression", progression: [] }))).toBeNull();
    expect(ideaToPlayCard(idea({ kind: "melody", melody: [] }))).toBeNull();
  });
});

describe("playIdea (the gate, not the audio)", () => {
  it("false for the null-card kinds - nothing is touched", () => {
    expect(playIdea(idea({ kind: "scale", scale: "blues" }))).toBe(false);
    expect(playIdea(idea({ kind: "seed", seed: 7 }))).toBe(false);
  });
});
