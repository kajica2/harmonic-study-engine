/**
 * engine/core/idea.test.ts - pins PRD-001 REQ-IDEA-1.
 *
 * Verifies the Idea discriminated union, brand typing, canonical-id
 * determinism, purity contract, and the isIdea trust-boundary guard.
 * Runs under the node project (engine/ is node-only per ADR-003-02).
 */

import { describe, it, expect } from "vitest";
import {
  ideaFromChord,
  isIdea,
  type Idea,
  type IdeaKind,
  type IdeaSource,
} from "./idea";
import { makeInstanceId } from "./ids";

describe("ideaFromChord", () => {
  it("populates the chord slot and nulls every other payload slot", () => {
    const idea = ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 1);
    expect(idea.kind).toBe("chord");
    expect(idea.chord).toBe("Cmaj7");
    expect(idea.progression).toBeNull();
    expect(idea.scale).toBeNull();
    expect(idea.melody).toBeNull();
    expect(idea.seed).toBeNull();
    expect(idea.tags).toBeNull();
  });

  it("is pure: same (source, chord, nowMs) -> same canonical id", () => {
    const a = ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0);
    const b = ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0);
    expect(a.id).toBe(b.id);
    expect(a.instanceId).toBe(b.instanceId);
  });

  it("is canonical-id stable across seq differences (same payload, different time)", () => {
    const a = ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0);
    const b = ideaFromChord("etude", "Cmaj7", 1_700_000_001_000, 5);
    expect(a.id).toBe(b.id);
    expect(a.instanceId).not.toBe(b.instanceId);
  });

  it("canonical id is source+kind+payload sensitive (different chord => different id)", () => {
    const c = ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0);
    const d = ideaFromChord("etude", "Dm7", 1_700_000_000_000, 0);
    expect(c.id).not.toBe(d.id);
  });

  it("canonical id is source-sensitive (same chord, different source => different id)", () => {
    const a = ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0);
    const b = ideaFromChord("compose", "Cmaj7", 1_700_000_000_000, 0);
    expect(a.id).not.toBe(b.id);
  });

  it("embeds version=1 and matches Versioned shape", () => {
    const idea = ideaFromChord("explore", "G7", 1, 0);
    expect(idea.version).toBe(1);
    expect(Number.isInteger(idea.version)).toBe(true);
  });

  it("instanceId matches the engine's makeInstanceId format", () => {
    const idea = ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 1);
    expect(idea.instanceId).toBe(makeInstanceId(1_700_000_000_000, 1));
  });

  it("accepts the three IdeaSource values", () => {
    const sources: IdeaSource[] = ["compose", "etude", "explore"];
    for (const s of sources) {
      const i = ideaFromChord(s, "C", 0, 0);
      expect(i.source).toBe(s);
    }
  });
});

describe("isIdea (trust boundary)", () => {
  function idea(): Idea {
    return ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0);
  }

  it("accepts a valid Idea", () => {
    expect(isIdea(idea())).toBe(true);
  });

  it("rejects null / non-object", () => {
    expect(isIdea(null)).toBe(false);
    expect(isIdea(42)).toBe(false);
    expect(isIdea("string")).toBe(false);
  });

  it("rejects unknown source / kind", () => {
    const base = idea() as unknown as Record<string, unknown>;
    expect(isIdea({ ...base, source: "wat" })).toBe(false);
    expect(isIdea({ ...base, kind: "wat" })).toBe(false);
  });

  it("rejects malformed payload slots", () => {
    const base = idea() as unknown as Record<string, unknown>;
    expect(isIdea({ ...base, chord: 42 })).toBe(false);
    expect(isIdea({ ...base, melody: "not array" })).toBe(false);
    expect(isIdea({ ...base, version: "v1" })).toBe(false);
    expect(isIdea({ ...base, createdAt: "now" })).toBe(false);
  });

  it("accepts every IdeaKind literal", () => {
    const kinds: IdeaKind[] = [
      "chord",
      "progression",
      "scale",
      "melody",
      "seed",
    ];
    for (const k of kinds) {
      const stub = { ...idea(), kind: k };
      // sanity: only the chord slot is populated; the others stay null
      // (the guard validates shape, not slot/kind alignment).
      expect(isIdea(stub)).toBe(true);
    }
  });
});