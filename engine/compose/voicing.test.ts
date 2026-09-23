/**
 * engine/compose/voicing.test.ts - PRD-001 Phase 4 Slice 3 (test plan
 * 2, D68). STRUCTURE pins for the sequential voice-lead engine: tone
 * map per quality (incl. the alt/maj9 5->4 drop-5th rule), register
 * containment over every Appendix D window, first-chord root position
 * + the inversionAwareness=false re-anchor, greedy movement <= naive
 * re-voicing on a ii-V-I corpus (the REQ-COMP-31 "smooth" pin),
 * rootless gating (allowed + eligible only), the spreadBias tie-break
 * flip, quartal coverage scoring + the counted close fallback, the
 * drop2 permutation identity vs the etude formula, and the unknown-
 * quality defensive path.
 */

import { describe, it, expect } from "vitest";
import {
  TONE_MAP,
  blockTriadMap,
  firstVoicing,
  greedyVoicing,
  toneMap,
  voiceSequence,
} from "./voicing";
import { QUALITY_INTERVALS } from "../core/chords";
import { createRng } from "../core/rng";
import { JAZZ_PROFILE } from "../styles/profiles/jazz";
import type { MidiRange, StyleProfile, VoicingProfile } from "../styles/types";
import { restCell, type ChordCell } from "./types";

function cell(rootPc: number, qualitySymbol: string, bassPc: number | null = null): ChordCell {
  return {
    rootPc,
    qualitySymbol,
    name: `${rootPc}:${qualitySymbol}`,
    bassPc,
    confidence: 1,
    alternatives: [],
    isRest: false,
  };
}

function profileWith(voicing: Partial<VoicingProfile>): StyleProfile {
  return {
    ...JAZZ_PROFILE,
    voicing: { ...JAZZ_PROFILE.voicing, ...voicing },
  };
}

const APPENDIX_D: Record<string, MidiRange> = {
  bass: [28, 48],
  chords: [48, 72],
  pad: [60, 84],
  melody: [60, 86],
};

describe("tone map (D68 rule 1)", () => {
  it("covers exactly the 17 shipped qualities", () => {
    expect(Object.keys(TONE_MAP).sort()).toEqual(Object.keys(QUALITY_INTERVALS).sort());
  });

  it("3-4 tones per quality; 5-tone qualities DROP the 5th (alt/maj9/dom9/min9)", () => {
    for (const [q, iv] of Object.entries(QUALITY_INTERVALS)) {
      const tones = toneMap(q);
      expect(tones, q).not.toBeNull();
      expect(tones!.length).toBeGreaterThanOrEqual(3);
      expect(tones!.length).toBeLessThanOrEqual(4);
      if (iv.length === 5) {
        expect(tones, q).toHaveLength(4); // exactly one dropped
        expect(tones!.includes(7), `${q}: 5th dropped`).toBe(false);
      }
    }
    expect(toneMap("alt")).toEqual([0, 4, 8, 10]); // b13 (20) folded, 5th gone
    expect(toneMap("maj9")).toEqual([0, 2, 4, 11]);
    expect(toneMap("dom9")).toEqual([0, 2, 4, 10]);
    expect(toneMap("min9")).toEqual([0, 2, 3, 10]);
  });

  it("root, 3rd-or-4th, 7th-if-present, ascending mod-12 pcs", () => {
    for (const [q, tones] of Object.entries(TONE_MAP)) {
      expect(tones[0], q).toBe(0);
      for (let i = 1; i < tones.length; i++) expect(tones[i], q).toBeGreaterThan(tones[i - 1]);
      const raw = QUALITY_INTERVALS[q].map((iv) => ((iv % 12) + 12) % 12);
      for (const t of tones) expect(raw, `${q} tone ${t}`).toContain(t);
    }
    expect(toneMap("sus4")).toEqual([0, 5, 7, 10]); // 4th, not 3rd
    expect(toneMap("maj7")).toEqual([0, 4, 7, 11]); // 7th present
    expect(toneMap("maj")).toEqual([0, 4, 7]); // no 7th to add
  });

  it("unknown quality -> null (defensive accessor)", () => {
    expect(toneMap("not-a-chord")).toBeNull();
    expect(toneMap("")).toBeNull();
  });

  it("block triad map: root + 3rd/4th + 5th/b5 only, extensions dropped", () => {
    expect(blockTriadMap("maj9")).toEqual([0, 4, 7]);
    expect(blockTriadMap("m7")).toEqual([0, 3, 7]);
    expect(blockTriadMap("sus4")).toEqual([0, 5, 7]);
    expect(blockTriadMap("dim7")).toEqual([0, 3, 6]);
    expect(blockTriadMap("alt")).toEqual([0, 4, 7]);
    expect(blockTriadMap("nope")).toBeNull();
  });
});

describe("register containment (D68 rule 6, Appendix D property)", () => {
  const qualities = Object.keys(QUALITY_INTERVALS);
  for (const [name, reg] of Object.entries(APPENDIX_D)) {
    it(`every voice inside the ${name} window [${reg[0]}, ${reg[1]}] for all 17 qualities x 12 roots`, () => {
      for (const style of ["close", "drop2", "quartal", "spread", "block"] as const) {
        for (const q of qualities) {
          for (let root = 0; root < 12; root++) {
            const r = voiceSequence({
              cells: [[cell(root, q), cell((root + 2) % 12, q === "maj" ? "m7" : "maj")]],
              profile: profileWith({ style }),
              rng: createRng(1),
              allowRootless: false,
              register: reg,
            });
            for (const bar of r.voicings) {
              for (const v of bar) {
                expect(v, `${style} ${q}`).not.toBeNull();
                const voices = v as number[];
                expect(voices.length, `${style} ${q}`).toBeGreaterThanOrEqual(3);
                for (const p of voices) {
                  expect(p, `${style} ${q} root ${root}`).toBeGreaterThanOrEqual(reg[0]);
                  expect(p, `${style} ${q} root ${root}`).toBeLessThanOrEqual(reg[1]);
                }
                for (let i = 1; i < voices.length; i++) {
                  expect(voices[i], "ascending").toBeGreaterThan(voices[i - 1]);
                }
              }
            }
          }
        }
      }
    });
  }

  it("every Appendix D window spans >= 21 pitch slots (the feasibility math fact)", () => {
    for (const reg of Object.values(APPENDIX_D)) {
      expect(reg[1] - reg[0] + 1).toBeGreaterThanOrEqual(21);
    }
  });
});

describe("first-chord + re-anchor rules (D68 rule 2)", () => {
  it("first chord is root position: root pc at the bottom, tones ascending", () => {
    const r = voiceSequence({
      cells: [[cell(2, "m7")]], // Dm7
      profile: profileWith({ style: "close", spreadBias: 0, inversionAwareness: true }),
      rng: createRng(7),
      allowRootless: false,
      register: [60, 72],
    });
    const v = r.voicings[0][0] as number[];
    expect(v.map((p) => p % 12)).toEqual([2, 5, 9, 0]); // D F A C ascending
    expect(v[0]).toBe(62); // spreadBias 0 -> anchor = regLo -> D at 62
  });

  it("inversionAwareness + bassPc -> bassPc bottoms the stack", () => {
    const r = voiceSequence({
      cells: [[cell(0, "maj7", 7)]], // Cmaj7/G
      profile: profileWith({ style: "close", spreadBias: 0, inversionAwareness: true }),
      rng: createRng(7),
      allowRootless: false,
      register: [48, 72],
    });
    const v = r.voicings[0][0] as number[];
    expect(v[0] % 12).toBe(7);
  });

  it("inversionAwareness FALSE re-anchors root position at EVERY chord (pop parallel)", () => {
    const cells = [[cell(0, "maj")], [cell(2, "min")], [cell(7, "maj")]];
    const aware = voiceSequence({
      cells,
      profile: profileWith({ style: "close", inversionAwareness: true }),
      rng: createRng(3),
      allowRootless: false,
      register: [48, 72],
    });
    const naive = voiceSequence({
      cells,
      profile: profileWith({ style: "close", inversionAwareness: false }),
      rng: createRng(3),
      allowRootless: false,
      register: [48, 72],
    });
    // Every chord keeps its ROOT at the bottom (parallel shapes).
    for (let i = 0; i < cells.length; i++) {
      const v = naive.voicings[i][0] as number[];
      expect(v[0] % 12, `chord ${i}`).toBe(cells[i][0].rootPc);
    }
    // ...while the aware pass voice-leads (at least one differs).
    const same = aware.voicings.every((b, i) =>
      (b[0] as number[]).join() === (naive.voicings[i][0] as number[]).join(),
    );
    expect(same).toBe(false);
  });

  it("post-rest re-anchor: the chord after a rest is root position again", () => {
    const r = voiceSequence({
      cells: [[cell(0, "maj7"), restCell(), cell(0, "maj7")]],
      profile: profileWith({ style: "close", spreadBias: 0, inversionAwareness: true }),
      rng: createRng(1),
      allowRootless: false,
      register: [60, 72],
    });
    expect(r.voicings[0][1]).toBeNull();
    expect(r.voicings[0][0]).toEqual(r.voicings[0][2]);
  });
});

describe("greedy movement (REQ-COMP-31 smooth pin)", () => {
  const iiVI: readonly ChordCell[][] = [
    [cell(2, "m7")],
    [cell(7, "dom7")],
    [cell(0, "maj7")],
    [cell(4, "dom7", 9)],
    [cell(5, "m7")],
    [cell(9, "dom7")],
    [cell(0, "maj7")],
    [cell(2, "m7")],
  ];

  function totalMotion(bars: readonly (readonly ChordCell[])[], profile: StyleProfile): number {
    const r = voiceSequence({
      cells: bars,
      profile,
      rng: createRng(11),
      allowRootless: false,
      register: [48, 72],
    });
    let sum = 0;
    let prev: readonly number[] | null = null;
    for (const bar of r.voicings) {
      const v = bar[0];
      if (v === null) continue;
      if (prev !== null && prev.length === v.length) {
        for (let i = 0; i < v.length; i++) sum += Math.abs(v[i] - prev[i]);
      }
      prev = v;
    }
    return sum;
  }

  it("greedy lead moves LESS than naive per-chord re-voicing on a ii-V-I corpus", () => {
    const aware = profileWith({ style: "close", inversionAwareness: true });
    const naive = profileWith({ style: "close", inversionAwareness: false });
    expect(totalMotion(iiVI, aware)).toBeLessThan(totalMotion(iiVI, naive));
  });

  it("tie-break: equal distance -> LOWER pitch; spreadBias >= 0.5 -> HIGHER", () => {
    const reg: MidiRange = [48, 84];
    // prev voice 72 sits exactly between pc 4 (68/76) and pc 8 (68/80):
    // the 3-semitone tie on the UPPER voice flips with spreadBias.
    const low = greedyVoicing([67, 72], [4, 8], profileWith({ spreadBias: 0.4 }), reg);
    const high = greedyVoicing([67, 72], [4, 8], profileWith({ spreadBias: 0.6 }), reg);
    expect(low).toEqual([64, 68]); // tie -> lower pitch
    expect(high).toEqual([68, 76]); // tie -> higher pitch
  });
});

describe("rootless gating (D68 rule 5)", () => {
  const bars: readonly ChordCell[][] = [[cell(2, "m7")], [cell(7, "dom7")], [cell(0, "maj7")]];

  it("never drawn when the bass role is off (allowRootless false) - zero draws", () => {
    const r = voiceSequence({
      cells: bars,
      profile: profileWith({ rootlessRate: 1 }),
      rng: createRng(5),
      allowRootless: false,
      register: [48, 72],
    });
    expect(r.drawCount).toBe(0);
    expect(r.rootlessFlags.flat().some(Boolean)).toBe(false);
    // Every voicing keeps the root pc.
    for (const bar of r.voicings) {
      const v = bar[0] as number[];
      expect(v.map((p) => p % 12)).toContain(bars[r.voicings.indexOf(bar)][0].rootPc);
    }
  });

  it("rate 1 + allowed -> every 4+-tone cell rootless; triads NEVER", () => {
    const r = voiceSequence({
      cells: [[cell(2, "m7")], [cell(0, "maj")]],
      profile: profileWith({ rootlessRate: 1 }),
      rng: createRng(5),
      allowRootless: true,
      register: [48, 72],
    });
    expect(r.drawCount).toBe(1); // only the m7 is eligible
    expect(r.rootlessFlags[0][0]).toBe(true);
    expect(r.rootlessFlags[1][0]).toBe(false);
    const v = r.voicings[0][0] as number[];
    expect(v.map((p) => p % 12)).not.toContain(2); // Dm7 rootless: no D
    expect(v).toHaveLength(3); // F A C
  });

  it("rate 0 -> no draws at all (classical profile shape)", () => {
    const r = voiceSequence({
      cells: bars,
      profile: profileWith({ rootlessRate: 0 }),
      rng: createRng(5),
      allowRootless: true,
      register: [48, 72],
    });
    expect(r.drawCount).toBe(0);
  });

  it("MED-3: rest insertion BEFORE drawing cells consumes zero draws (stream identity)", () => {
    // Voicing-side twin of the bass.test.ts GAP-1 pin: a rest must not
    // shift the rootless-decision stream. The DISCRIMINATIVE core is
    // the post-call stream position (next draw identical) - flag/
    // voicing equality alone can survive a stream shift by seed
    // coincidence (verified: seed 11 under a draw-on-rest mutation),
    // the position check cannot.
    const rngWith = createRng(11);
    const rngNo = createRng(11);
    const withRest = voiceSequence({
      cells: [[restCell(), cell(2, "m7")], [cell(7, "dom7")]],
      profile: profileWith({ rootlessRate: 0.5 }),
      rng: rngWith,
      allowRootless: true,
      register: [48, 72],
    });
    const noRest = voiceSequence({
      cells: [[cell(2, "m7")], [cell(7, "dom7")]],
      profile: profileWith({ rootlessRate: 0.5 }),
      rng: rngNo,
      allowRootless: true,
      register: [48, 72],
    });
    expect(withRest.voicings[0][0]).toBeNull(); // the rest: no voicing
    expect(withRest.rootlessFlags[0][0]).toBe(false); // the rest: no decision
    expect(withRest.drawCount).toBe(noRest.drawCount);
    expect(withRest.drawCount).toBe(2); // two eligible 4-tone cells; the rest adds none
    // THE position pin: the rest consumed NOTHING from the stream.
    expect(rngWith.next()).toBe(rngNo.next());
    expect(withRest.rootlessFlags[0][1]).toEqual(noRest.rootlessFlags[0][0]);
    expect(withRest.rootlessFlags[1]).toEqual(noRest.rootlessFlags[1]);
    expect(withRest.voicings[0][1]).toEqual(noRest.voicings[0][0]);
    expect(withRest.voicings[1]).toEqual(noRest.voicings[1]);
  });
});

describe("style shapes (REQ-COMP-32)", () => {
  it("drop2 permutation identity vs the etude formula [n2-12, n0, n1, n3]", () => {
    const profile = profileWith({ style: "close", spreadBias: 0.6 });
    const close = voiceSequence({
      cells: [[cell(0, "maj7")]],
      profile,
      rng: createRng(1),
      allowRootless: false,
      register: [48, 72],
    });
    const c = close.voicings[0][0] as number[];
    const etudeFormula = [c[2] - 12, c[0], c[1], c[3]].sort((a, b) => a - b);
    const drop2 = voiceSequence({
      cells: [[cell(0, "maj7")]],
      profile: profileWith({ style: "drop2", spreadBias: 0.6 }),
      rng: createRng(1),
      allowRootless: false,
      register: [48, 72],
    });
    expect(drop2.voicings[0][0]).toEqual(etudeFormula);
    expect(drop2.firstDrop2Bar).toBe(0);
  });

  it("drop2 on < 4 voices is a no-op (firstDrop2Bar stays null)", () => {
    const r = voiceSequence({
      cells: [[cell(0, "maj")]],
      profile: profileWith({ style: "drop2" }),
      rng: createRng(1),
      allowRootless: false,
      register: [48, 72],
    });
    expect(r.voicings[0][0]).toHaveLength(3);
    expect(r.firstDrop2Bar).toBeNull();
  });

  it("quartal: 4ths stack on m7 (coverage >= 3); close fallback counted on maj", () => {
    const q = voiceSequence({
      cells: [[cell(2, "m7")]], // D F A C -> F-B-E-A stack covers F A C? score 3
      profile: profileWith({ style: "quartal" }),
      rng: createRng(1),
      allowRootless: false,
      register: [48, 72],
    });
    expect(q.quartalFallbackCount).toBe(0);
    const v = q.voicings[0][0] as number[];
    expect(v.length).toBe(4);
    for (let i = 1; i < v.length; i++) expect(v[i] - v[i - 1]).toBe(5); // pure 4ths

    const f = voiceSequence({
      cells: [[cell(0, "maj")]], // triad -> max coverage 2
      profile: profileWith({ style: "quartal" }),
      rng: createRng(1),
      allowRootless: false,
      register: [48, 72],
    });
    expect(f.quartalFallbackCount).toBe(1);
    expect(f.voicings[0][0]).toHaveLength(3); // close triad, never silent
  });

  it("spread: minimum 5-semitone inter-voice gap (feasible window)", () => {
    const r = voiceSequence({
      cells: [[cell(0, "maj7")], [cell(5, "dom7")]],
      profile: profileWith({ style: "spread" }),
      rng: createRng(1),
      allowRootless: false,
      register: [48, 80],
    });
    for (const bar of r.voicings) {
      const v = bar[0] as number[];
      for (let i = 1; i < v.length; i++) expect(v[i] - v[i - 1]).toBeGreaterThanOrEqual(5);
    }
  });

  it("block: triad-only, root always bottom, extensions dropped", () => {
    const r = voiceSequence({
      cells: [[cell(0, "maj9")], [cell(2, "m7")]],
      profile: profileWith({ style: "block", inversionAwareness: false }),
      rng: createRng(1),
      allowRootless: true,
      register: [48, 72],
    });
    for (let i = 0; i < 2; i++) {
      const v = r.voicings[i][0] as number[];
      expect(v).toHaveLength(3);
      expect(v[0] % 12).toBe(i === 0 ? 0 : 2); // root bottom (parallel)
    }
    // The rootless DRAW still fires (eligibility is per-cell tone
    // count, style-INDEPENDENT - stream identity), but block never
    // APPLIES it: roots stay in every voicing, flags stay false.
    expect(r.drawCount).toBe(2);
    expect(r.rootlessFlags.flat()).toEqual([false, false]);
  });
});

describe("defensive paths (D68 rule 7, D49 pattern)", () => {
  it("unknown quality -> null voicing + counted, never throws", () => {
    const r = voiceSequence({
      cells: [[cell(0, "totally-made-up")]],
      profile: profileWith({}),
      rng: createRng(1),
      allowRootless: true,
      register: [48, 72],
    });
    expect(r.voicings[0][0]).toBeNull();
    expect(r.unknownQualityCount).toBe(1);
    expect(r.drawCount).toBe(0); // unknown consumes nothing
  });

  it("empty grid -> empty result, zero draws", () => {
    const r = voiceSequence({
      cells: [],
      profile: profileWith({}),
      rng: createRng(1),
      allowRootless: true,
      register: [48, 72],
    });
    expect(r.voicings).toEqual([]);
    expect(r.drawCount).toBe(0);
  });
});
