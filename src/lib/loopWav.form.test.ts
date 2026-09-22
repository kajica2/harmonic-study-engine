/**
 * loopWav form-once + meter-parity tests (W2').
 *
 * Pinned contracts:
 *  (i)   renderPathToWav renders the detected form EXACTLY ONCE: a
 *        4-step phrase padded x4 (16 steps) schedules only 4 bars.
 *  (ii)  barSeconds/secPerStep match the live 16th-note grid in
 *        rhythm.ts (stepsPerMeasure table, mirrored below) for every
 *        supported TimeSignature.
 *  (iii) notesOverride replaces the scheduled pitches; a missing or
 *        too-short override falls back to the raw step.notes.
 *  (iv)  structural guard: the renderPathToWav opts surface carries
 *        NO loop-range / playhead / start-bar field. The renderer
 *        ALWAYS renders the whole detected form.
 *
 * Uses the recording OfflineAudioContext mock from
 * tests/loopWav-mock.ts (a helper module, not a test file). Schedule
 * inspection only -- we don't care about rendered samples.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  renderPathToWav,
  barSeconds,
  secPerStep,
} from "./loopWav";
import {
  installMockOfflineAudioContext,
} from "../../tests/loopWav-mock";
import type { HarmonicPath, HarmonicStep } from "./paths";

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

const FORM4: HarmonicStep[] = [
  { name: "Cmaj7", notes: [60, 64, 67, 71], descriptions: "" },
  { name: "Dm7", notes: [62, 65, 69, 72], descriptions: "" },
  { name: "Em7", notes: [64, 67, 71, 74], descriptions: "" },
  { name: "Fmaj7", notes: [65, 69, 72, 76], descriptions: "" },
];

/** 4-bar form cycled to 16 steps, exactly like padPath pads live. */
const PADDED_16: HarmonicPath = {
  id: "form4-padded-16",
  title: "4-bar form padded x4",
  description: "form-once render test",
  steps: Array.from({ length: 16 }, (_, i) => FORM4[i % 4]),
};

describe("renderPathToWav form-once (i)", () => {
  let handle: ReturnType<typeof installMockOfflineAudioContext>;

  beforeEach(() => {
    handle = installMockOfflineAudioContext();
  });
  afterEach(() => {
    handle.uninstall();
  });

  it("padded 16-step path renders exactly 4 bars (mono: 1 osc/bar)", async () => {
    await renderPathToWav(PADDED_16, {
      tempo: 120,
      instrument: "epiano",
      meter: "4/4",
      mode: "mono",
    });
    const mock = handle.getMock();
    expect(mock).not.toBeNull();
    // formLen = 4, 4/4 @ 120 = 2s/bar. Mono schedules 1 osc per bar.
    expect(mock!.oscillators.length).toBe(4);
    const starts = mock!.oscillators
      .map((o) => o.startTime)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(starts).toEqual([0, 2, 4, 6]);
    // totalSeconds = formLen * barSeconds + 1.25s tail.
    expect(mock!.length).toBe(Math.ceil((4 * 2 + 1.25) * 44100));
  });

  it("padded 16-step path renders exactly 4 bars (block mode)", async () => {
    await renderPathToWav(PADDED_16, {
      tempo: 120,
      instrument: "epiano",
      meter: "4/4",
      mode: "block",
    });
    const mock = handle.getMock();
    expect(mock).not.toBeNull();
    const starts = mock!.oscillators.map((o) => o.startTime).filter(
      (t): t is number => t !== null,
    );
    expect(starts.length).toBe(mock!.oscillators.length);
    // Nothing may start at or after the 4-bar form boundary (8s).
    for (const t of starts) {
      expect(t).toBeLessThan(8);
    }
    // And every one of the 4 form bars must have sound.
    for (let bar = 0; bar < 4; bar++) {
      const inBar = starts.filter((t) => t >= bar * 2 && t < (bar + 1) * 2);
      expect(inBar.length, `bar ${bar}`).toBeGreaterThan(0);
    }
  });
});

describe("barSeconds / secPerStep meter parity (ii)", () => {
  // Mirrors the stepsPerMeasure table in src/lib/rhythm.ts
  // (16th-note steps per measure per supported TimeSignature).
  const LIVE_16TH_STEPS: Record<string, number> = {
    "4/4": 16,
    "6/8": 12,
    "7/8": 14,
    "11/4": 44,
    tintal: 64,
  };

  it("pins the exact values at 120 BPM", () => {
    expect(barSeconds(120, "4/4")).toBe(2); // unchanged vs the old math
    expect(barSeconds(120, "6/8")).toBe(1.5); // was 3s (2x too long)
    expect(barSeconds(120, "7/8")).toBe(1.75);
    expect(barSeconds(120, "11/4")).toBe(5.5);
    expect(barSeconds(120, "tintal")).toBe(8); // was 2s (4x too fast)
  });

  it("matches the live 16th-note grid for every supported meter", () => {
    for (const [meter, stepsPerMeasure] of Object.entries(LIVE_16TH_STEPS)) {
      for (const tempo of [80, 96, 120]) {
        const live = stepsPerMeasure * (60 / tempo / 4);
        expect(barSeconds(tempo, meter), `${meter} @ ${tempo}`).toBeCloseTo(
          live,
          10,
        );
      }
    }
  });

  it("secPerStep picks the meter's beat unit, quarter as fallback", () => {
    expect(secPerStep(120, "4/4")).toBe(0.5); // quarter
    expect(secPerStep(120, "6/8")).toBe(0.25); // eighth
    expect(secPerStep(120, "3/2")).toBe(1); // half
    expect(secPerStep(120, "tintal")).toBe(0.5); // unparseable -> quarter
    expect(secPerStep(120, "gibberish")).toBe(0.5); // ditto
  });
});

describe("notesOverride pitch fidelity (iii)", () => {
  let handle: ReturnType<typeof installMockOfflineAudioContext>;

  beforeEach(() => {
    handle = installMockOfflineAudioContext();
  });
  afterEach(() => {
    handle.uninstall();
  });

  const monoStartsAndFreqs = () => {
    const mock = handle.getMock();
    expect(mock).not.toBeNull();
    return mock!.oscillators
      .slice()
      .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
      .map((o) => o.frequency.value);
  };

  it("schedules override pitches when override covers the form", async () => {
    const override = [[72], [74], [76], [77]]; // all differ from raw tops
    await renderPathToWav(PADDED_16, {
      tempo: 120,
      instrument: "epiano",
      meter: "4/4",
      mode: "mono",
      notesOverride: override,
    });
    expect(monoStartsAndFreqs()).toEqual(override.map(([m]) => midiToFreq(m)));
  });

  it("ignores an override that is shorter than the detected form", async () => {
    await renderPathToWav(PADDED_16, {
      tempo: 120,
      instrument: "epiano",
      meter: "4/4",
      mode: "mono",
      notesOverride: [[100], [100], [100]], // length 3 < formLen 4
    });
    // Raw tops: Cmaj7=71, Dm7=72, Em7=74, Fmaj7=76.
    expect(monoStartsAndFreqs()).toEqual([71, 72, 74, 76].map(midiToFreq));
  });

  it("falls back to raw step.notes when no override is given", async () => {
    await renderPathToWav(PADDED_16, {
      tempo: 120,
      instrument: "epiano",
      meter: "4/4",
      mode: "mono",
    });
    expect(monoStartsAndFreqs()).toEqual([71, 72, 74, 76].map(midiToFreq));
  });
});

describe("structural guard: opts surface has no loop-range fields (iv)", () => {
  it("renderPathToWav opts whitelist excludes any start/playhead/loop knobs", () => {
    const src = readFileSync(new URL("./loopWav.ts", import.meta.url), "utf8");
    const sig =
      /export async function renderPathToWav\([\s\S]*?opts: \{([\s\S]*?)\} = \{\}/.exec(
        src,
      );
    expect(sig, "renderPathToWav opts block").not.toBeNull();
    const optsBlock = sig![1];
    const fields = [...optsBlock.matchAll(/^\s*(\w+)\??:/gm)].map(
      (m) => m[1],
    );
    // Whitelist: the renderer takes tempo/instrument/sampleRate/meter/
    // mode plus the pitch override ONLY. Adding a loop-range, playhead
    // or start-bar field here is the regression this guard exists to
    // catch -- the mandate is "whole form, exactly once, always".
    expect(fields.slice().sort()).toEqual([
      "instrument",
      "meter",
      "mode",
      "notesOverride",
      "sampleRate",
      "tempo",
    ]);
    for (const field of fields) {
      expect(field).not.toMatch(
        /start|end|from|playhead|offset|range|loop|bar|first|last/i,
      );
    }
  });
});
