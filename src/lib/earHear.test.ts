/**
 * src/lib/earHear.test.ts - PRD-001 Phase 6 (checklist 6).
 *
 * Node-only: the PURE builders. No AudioContext anywhere (guarded by
 * source scan below); the render path is browser-pinned via the e2e
 * Hear leg + manual (loopWav precedent).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createRng } from "../../engine/core/rng";
import { generateEarPrompt } from "../../engine/ear-training/generate";
import {
  promptToHearInput,
  numeralsToHearInput,
  previewFullSec,
  PREVIEW_CAP_SEC,
} from "./earHear";

describe("promptToHearInput shapes", () => {
  it("project is ppq 480 with a single 4/4 tempo 120", () => {
    const prompt = generateEarPrompt({ type: "interval", difficulty: 1, seed: 1, rng: createRng(1) });
    const { project } = promptToHearInput(prompt);
    expect(project.ppq).toBe(480);
    expect(project.tempos).toEqual([{ tick: 0, bpm: 120 }]);
    expect(project.timeSignatures).toEqual([{ tick: 0, numerator: 4, denominator: 4 }]);
  });

  it("result is chords-only without melody for block prompts; notes tick-ascending", () => {
    const prompt = generateEarPrompt({ type: "chord-quality", difficulty: 1, seed: 2, rng: createRng(2) });
    const { result, lead } = promptToHearInput(prompt);
    expect(result.generated.bass).toEqual([]);
    expect(result.generated.pad).toEqual([]);
    expect(result.generated.chords.length).toBeGreaterThan(0);
    expect(lead).toEqual([]);
    const ticks = result.generated.chords.map((n) => n.tick);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
  });

  it("sequential types use eighth offsets (intervals [0,480], scales ascending eighths)", () => {
    const interval = generateEarPrompt({ type: "interval", difficulty: 1, seed: 3, rng: createRng(3) });
    const ii = promptToHearInput(interval);
    expect(ii.result.generated.chords.map((n) => n.tick)).toEqual([0, 480]);
    const scale = generateEarPrompt({ type: "scale", difficulty: 1, seed: 4, rng: createRng(4) });
    const si = promptToHearInput(scale);
    const ticks = si.result.generated.chords.map((n) => n.tick);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i] - ticks[i - 1]).toBe(240);
    }
  });

  it("dictations voice a lead arm on top", () => {
    const prompt = generateEarPrompt({ type: "melodic-dictation", difficulty: 3, seed: 5, rng: createRng(5) });
    const { lead } = promptToHearInput(prompt);
    expect(lead.length).toBeGreaterThan(0);
    for (const n of lead) expect(n.voice).toBe("lead");
    const ticks = lead.map((n) => n.tick);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
  });

  it("audition duration stays under the preview cap (no truncation label needed)", () => {
    const prog = generateEarPrompt({ type: "progression", difficulty: 5, seed: 6, rng: createRng(6) });
    const input = promptToHearInput(prog);
    expect(previewFullSec(input.project, input.result.meta.endTick)).toBeLessThan(PREVIEW_CAP_SEC);
  });

  it("numeralsToHearInput realizes 1 bar per numeral in C", () => {
    const input = numeralsToHearInput(["ii7", "V7", "Imaj7"]);
    expect(input.project.endTick).toBe(3 * 1920);
    expect(input.result.generated.chords.length).toBeGreaterThan(0);
    expect(input.lead).toEqual([]);
  });
});

describe("no AudioContext in the adapter source", () => {
  it("imports composePreview + engine voicing only; never touches audio contexts", () => {
    const raw = readFileSync("src/lib/earHear.ts", "utf8");
    const src = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(src).not.toMatch(/AudioContext/);
    expect(src).toMatch(/from "\.\/composePreview"/);
    expect(src).toMatch(/engine\/compose\/voicing/);
  });
});
