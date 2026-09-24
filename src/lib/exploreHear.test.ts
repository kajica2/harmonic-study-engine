/**
 * src/lib/exploreHear.test.ts - PRD-001 Phase 5 (D96, checklist 7).
 *
 * Node-only: the PURE builder. No AudioContext anywhere (guarded by
 * source scan below); the render path is browser-pinned via the e2e
 * Hear leg + manual (loopWav precedent).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildIdeaCards } from "../../engine/explore/cards";
import type { IdeaCard } from "../../engine/explore/types";
import {
  cardToHearInput,
  MAX_HEAR_BARS,
  previewFullSec,
  PREVIEW_CAP_SEC,
} from "./exploreHear";

const C_KEY = { tonicPc: 0, mode: "major" as const, correlation: 1 };

function chordCard(): IdeaCard {
  const [card] = buildIdeaCards("Dm7 G7 Cmaj7", "reharmonize", [
    {
      label: "Reharm 1",
      description: "An alternative harmonization.",
      rationale: "Db7 substitutes for G7.",
      conceptId: "tritone-sub",
      technique: "tritone-sub" as const,
      progression: ["Dm7", "Db7", "Cmaj7"],
      chord: null,
      melody: null,
    },
  ]);
  return card as IdeaCard;
}

function melodyCard(): IdeaCard {
  const [card] = buildIdeaCards("60 64 67", "vary", [
    {
      label: "Retrograde",
      description: "The line reversed.",
      rationale: "Exact reversal of the seed pitches.",
      conceptId: null,
      technique: "retrograde" as const,
      progression: ["Cmaj7"],
      chord: null,
      melody: [67, 64, 60],
    },
  ]);
  return card as IdeaCard;
}

describe("cardToHearInput shapes", () => {
  it("project is ppq 480 with a single 4/4 tempo 120", () => {
    const { project } = cardToHearInput(chordCard(), C_KEY);
    expect(project.ppq).toBe(480);
    expect(project.tempos).toEqual([{ tick: 0, bpm: 120 }]);
    expect(project.timeSignatures).toEqual([
      { tick: 0, numerator: 4, denominator: 4 },
    ]);
    expect(project.endTick).toBe(3 * 1920);
  });

  it("result is chords-only without melody; notes tick-ascending", () => {
    const { result, lead } = cardToHearInput(chordCard(), C_KEY);
    expect(result.generated.bass).toEqual([]);
    expect(result.generated.pad).toEqual([]);
    expect(result.generated.chords.length).toBeGreaterThan(0);
    expect(lead).toEqual([]);
    const ticks = result.generated.chords.map((n) => n.tick);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
  });

  it("melody cards voice a lead line on top of the chords", () => {
    const { result, lead } = cardToHearInput(melodyCard(), C_KEY);
    expect(result.generated.chords.length).toBeGreaterThan(0);
    expect(lead.length).toBe(3);
    for (const n of lead) expect(n.voice).toBe("lead");
    const ticks = lead.map((n) => n.tick);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
  });

  it("audition duration stays under the preview cap (no truncation label needed)", () => {
    const input = cardToHearInput(chordCard(), C_KEY);
    expect(previewFullSec(input.project, input.result.meta.endTick)).toBeLessThan(
      PREVIEW_CAP_SEC,
    );
    // Even a 32-bar card (the Etude maximum) stays under 90s at 2s/bar.
    const big = cardToHearInput(
      {
        ...chordCard(),
        progression: Array.from({ length: 32 }, () => "Cmaj7"),
      },
      C_KEY,
    );
    expect(previewFullSec(big.project, big.result.meta.endTick)).toBeLessThan(
      PREVIEW_CAP_SEC,
    );
  });

  it("clamps unbounded vary-text melodies to MAX_HEAR_BARS (LOW-001)", () => {
    // Vary cards carry progression: null + manual melody (runVary shape);
    // a 2000-int paste would otherwise yield 250 bars, silently
    // truncated past PREVIEW_CAP_SEC. Clamp keeps it at 32 bars / 65s.
    const adversarial: IdeaCard = {
      ...melodyCard(),
      progression: null,
      melody: Array.from({ length: 2000 }, (_, i) => 60 + (i % 12)),
    };
    const input = cardToHearInput(adversarial, C_KEY);
    expect(MAX_HEAR_BARS).toBe(32);
    expect(input.result.meta.bars).toBe(32);
    expect(input.project.endTick).toBe(32 * 1920);
    expect(input.lead.length).toBe(2000);
    expect(previewFullSec(input.project, input.result.meta.endTick)).toBeLessThan(
      PREVIEW_CAP_SEC,
    );
    // Engine-built cards stay unaffected (below the clamp floor).
    const small = cardToHearInput(melodyCard(), C_KEY);
    expect(small.result.meta.bars).toBe(1);
    expect(small.project.endTick).toBe(1 * 1920);
    const chord = cardToHearInput(chordCard(), C_KEY);
    expect(chord.result.meta.bars).toBe(3);
    expect(chord.project.endTick).toBe(3 * 1920);
  });
});

describe("no AudioContext in the adapter source", () => {
  it("imports composePreview + engine voicing only; never touches audio contexts", () => {
    const raw = readFileSync("src/lib/exploreHear.ts", "utf8");
    // Comment-aware: header prose may NAME the contexts it refuses to
    // create; the guard pins code, not documentation.
    const src = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(src).not.toMatch(/AudioContext/);
    expect(src).toMatch(/from "\.\/composePreview"/);
    expect(src).toMatch(/engine\/compose\/voicing/);
    for (const match of src.matchAll(/from "([^"]+)"/g)) {
      const spec = match[1] as string;
      const ok =
        spec.startsWith("./") ||
        spec.startsWith("../") ||
        spec.startsWith("../../engine/");
      expect(ok, `import '${spec}'`).toBe(true);
    }
  });
});
