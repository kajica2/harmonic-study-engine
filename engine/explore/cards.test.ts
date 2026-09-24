/**
 * engine/explore/cards.test.ts - PRD-001 Phase 5 (checklist 4).
 *
 * Envelope pins (label budget, conceptId resolution, id stability) +
 * crossover round-trips (progression -> text -> grid symbols;
 * card -> constraints passes validateEtudeConstraints).
 */

import { describe, it, expect } from "vitest";
import { parseChordChart } from "../compose/chordchart";
import { parseChordSymbol } from "../compose/chordsym";
import { validateEtudeConstraints } from "../etude/types";
import type { EtudeConstraints } from "../etude/types";
import { getConcept } from "../pedagogy/concepts";
import {
  buildIdeaCards,
  cardToEtudeConstraints,
  cardToIdea,
  progressionToChartText,
} from "./cards";
import { ideaFromChord } from "../core/idea";

const C_KEY = { tonicPc: 0, mode: "major" as const, correlation: 1 };

/** Valid EtudeConstraints base (mirrors DEFAULT_ETUDE_CONSTRAINTS). */
const DEFAULT_SHAPE: EtudeConstraints = {
  version: 1,
  styleId: "jazz",
  key: 0,
  mode: "major",
  difficulty: 3,
  bars: 8,
  tempo: null,
  seed: 1,
  harmony: {
    allowedQualities: null,
    allowedNumerals: null,
    startOn: null,
    endOn: null,
    requireChromaticism: false,
  },
  melody: {
    maxIntervalSemitones: null,
    chordTonesOnStrongBeats: false,
    range: null,
  },
  rhythm: { straightRhythmsOnly: false },
};

describe("buildIdeaCards envelope", () => {
  it("labels fit the 40-char chip budget; ids stable across calls", () => {
    const items = [
      {
        label: "Db7 for G7 (tritone)",
        description: "A tritone substitution.",
        rationale: "Db7 shares guide tones with G7.",
        conceptId: "tritone-sub",
        technique: "tritone-sub" as const,
        progression: ["Db7", "Cmaj7"],
        chord: null,
        melody: null,
      },
    ];
    const a = buildIdeaCards("Dm7 G7 Cmaj7", "reharmonize", items);
    const b = buildIdeaCards("Dm7 G7 Cmaj7", "reharmonize", items);
    expect(a[0]?.id).toBe(b[0]?.id);
    expect(a[0]?.id).toMatch(/^exp-reharmonize-[0-9a-z]+$/);
    expect(a[0]?.version).toBe(1);
    expect((a[0]?.label as string).length).toBeLessThanOrEqual(40);
  });

  it("over-long labels throw (programmer error, rng.ts precedent)", () => {
    expect(() =>
      buildIdeaCards("x", "substitute", [
        {
          label: "this label is far too long for the chip budget, truly",
          description: "d",
          rationale: "r",
          conceptId: null,
          technique: "original" as const,
          progression: ["C"],
          chord: null,
          melody: null,
        },
      ]),
    ).toThrow(RangeError);
  });

  it("every non-null conceptId resolves in the 10-id registry", () => {
    const cards = buildIdeaCards("seed", "expand", [
      {
        label: "a",
        description: "d",
        rationale: "r",
        conceptId: "tritone-sub",
        technique: "tritone-sub" as const,
        progression: ["Db7"],
        chord: null,
        melody: null,
      },
      {
        label: "b",
        description: "d",
        rationale: "r",
        conceptId: null,
        technique: "extension" as const,
        progression: ["Cmaj9"],
        chord: null,
        melody: null,
      },
    ]);
    for (const card of cards) {
      if (card.conceptId !== null) {
        expect(getConcept(card.conceptId)).not.toBeNull();
      }
    }
  });
});

describe("progressionToChartText round-trip (D97)", () => {
  it("progression -> text -> grid symbols equality (modulo spelling family)", () => {
    const progression = ["Dm7", "G7", "Cmaj7"];
    const text = progressionToChartText(progression, C_KEY);
    expect(text).toContain("{key: C major}");
    const parsed = parseChordChart(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const grid = parsed.value.grid;
    expect(grid.bars).toHaveLength(3);
    grid.bars.forEach((bar, i) => {
      expect(bar.slots).toHaveLength(1);
      const want = parseChordSymbol(progression[i] as string);
      const got = bar.slots[0];
      expect(want).not.toBeNull();
      expect(got?.isRest).toBe(false);
      expect(got?.rootPc).toBe(want?.rootPc);
      expect(got?.qualitySymbol).toBe(want?.qualitySymbol);
    });
  });

  it("rests travel as - and null keys emit no directive", () => {
    const text = progressionToChartText(["C", "-", "G"], null);
    expect(text).toBe("C - G");
    const parsed = parseChordChart(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.grid.bars[1]?.slots[0]?.isRest).toBe(true);
  });
});

describe("cardToEtudeConstraints carry (D97b)", () => {
  it("chord/progression/scale/melody cards all validate", () => {
    const base = DEFAULT_SHAPE;
    const prog = cardToEtudeConstraints(
      { id: "exp-reharmonize-abc", progression: ["Dm7", "G7", "Cmaj7"], melody: null },
      base,
    );
    expect(prog.bars).toBe(4); // 3 clamped to the 4 minimum
    expect(validateEtudeConstraints(prog).ok).toBe(true);
    const long = cardToEtudeConstraints(
      { id: "exp-x", progression: ["C", "F", "G", "C", "F", "G", "C", "F", "G"], melody: null },
      base,
    );
    expect(long.bars).toBe(9);
    expect(validateEtudeConstraints(long).ok).toBe(true);
    const mel = cardToEtudeConstraints(
      { id: "exp-y", progression: null, melody: [60, 64, 67] },
      base,
    );
    expect(mel.bars).toBe(4);
    expect(validateEtudeConstraints(mel).ok).toBe(true);
    // Key/mode/style ride the base (carry, never transplant).
    expect(prog.key).toBe(base.key);
    expect(prog.mode).toBe(base.mode);
    expect(prog.styleId).toBe(base.styleId);
  });
});

describe("cardToIdea (D100 clock-as-parameter)", () => {
  it("chord-kind ids are byte-identical to ideaFromChord (dedup holds)", () => {
    const [card] = buildIdeaCards("Cmaj7", "substitute", [
      {
        label: "Db7 for Cmaj7",
        description: "d",
        rationale: "r",
        conceptId: "tritone-sub",
        technique: "tritone-sub" as const,
        progression: null,
        chord: "Db7",
        melody: null,
      },
    ]);
    const fromCard = cardToIdea(card as never as Parameters<typeof cardToIdea>[0], "explore", 1000, 0);
    const direct = ideaFromChord("explore", "Db7", 1000, 0);
    expect(fromCard.id).toBe(direct.id);
    expect(fromCard.createdAt).toBe(1000);
    expect(fromCard.kind).toBe("chord");
  });
});
