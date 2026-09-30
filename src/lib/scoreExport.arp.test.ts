/**
 * scoreExport arp tests - MusicXML arpeggiation parity.
 * Pure logic, node project (no JSDOM needed).
 */

import { describe, it, expect, vi } from "vitest";
import {
  toMusicXml,
  prepareArpNotes,
  allocateArpDurations,
} from "./scoreExport";
import type { HarmonicPath } from "./paths";
import type { EtudeNote } from "../../engine/etude/types";

const TEST_PATH: HarmonicPath = {
  id: "test-1",
  title: "Test Progression",
  description: "ii-V-I for export tests",
  steps: [
    { name: "Dm7", notes: [50, 53, 57, 60], descriptions: "" },
    { name: "G7", notes: [55, 59, 62, 65], descriptions: "" },
    { name: "Cmaj7", notes: [48, 52, 55, 59], descriptions: "" },
  ],
};

const MELODY: readonly EtudeNote[] = [
  { slot: 0, midi: 60, durationSlots: 6, velocity: 0.85, strongBeat: true, syncopated: false },
  { slot: 6, midi: 62, durationSlots: 4, velocity: 0.65, strongBeat: true, syncopated: false },
  { slot: 12, midi: 64, durationSlots: 4, velocity: 0.85, strongBeat: true, syncopated: false },
];

function p1Section(xml: string): string {
  const start = xml.indexOf('<part id="P1">');
  const end = xml.indexOf("</part>", start);
  return xml.slice(start, end + 7);
}

function dataMeasures(p1: string): string[] {
  const all = p1.match(/<measure number="\d+">[\s\S]*?<\/measure>/g) ?? [];
  return all.filter((m) => !m.includes('number="0"'));
}

function sumDurations(measureXml: string): number {
  return [...measureXml.matchAll(/<duration>(\d+)<\/duration>/g)]
    .map((d) => Number(d[1]))
    .reduce((a, b) => a + b, 0);
}

function countTag(measureXml: string, tag: string): number {
  const re = new RegExp(tag, "g");
  return (measureXml.match(re) ?? []).length;
}

function makePathWithNotes(n: number): HarmonicPath {
  const pool = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77];
  return {
    id: "n-test",
    title: "N Test",
    description: "",
    steps: [{ name: "C", notes: pool.slice(0, n), descriptions: "" }],
  };
}

describe("arp default parity", () => {
  it("default output equals explicit block and has no type tags", () => {
    const def = toMusicXml(TEST_PATH);
    const block = toMusicXml(TEST_PATH, { voiceStyle: "block" });
    const explicitDefault = toMusicXml(TEST_PATH, {
      voiceStyle: undefined,
      trimToForm: false,
    });
    expect(block).toBe(def);
    expect(explicitDefault).toBe(def);
    expect(def).toContain("<divisions>1</divisions>");
    expect(def).not.toContain("<type>");
  });

  it("empty melody stays byte-identical in both styles default", () => {
    const def = toMusicXml(TEST_PATH);
    expect(toMusicXml(TEST_PATH, { melody: [] })).toBe(def);
    expect(
      toMusicXml(TEST_PATH, { melody: [], voiceStyle: "block" }),
    ).toBe(def);
  });

  it("block harmony markers survive in arp mode", () => {
    const arp = toMusicXml(TEST_PATH, { voiceStyle: "arp" });
    expect(arp).toContain('kind text="Dm7"');
    expect(arp).toContain('kind text="G7"');
    expect(arp).toContain('kind text="Cmaj7"');
    expect(arp).not.toContain("<chord/>");
  });
});

describe("arp 4-note exact sum", () => {
  it("renders 4 quarters with sum 8 and divisions 2", () => {
    const xml = toMusicXml(TEST_PATH, { voiceStyle: "arp" });
    expect(xml).toContain("<divisions>2</divisions>");
    const measures = dataMeasures(p1Section(xml));
    expect(measures.length).toBe(3);
    for (const m of measures) {
      expect(sumDurations(m)).toBe(8);
      expect(countTag(m, "<type>quarter</type>")).toBe(4);
      expect(countTag(m, "<type>eighth</type>")).toBe(0);
      expect(countTag(m, "<rest/>")).toBe(0);
      expect(countTag(m, "<pitch>")).toBe(4);
    }
  });
});

describe("arp overflow table N=5..9", () => {
  it.each([5, 6, 7, 8])(
    "N=%i splits into quarters plus eighths with sum 8",
    (n) => {
      const xml = toMusicXml(makePathWithNotes(n), { voiceStyle: "arp" });
      const measures = dataMeasures(p1Section(xml));
      expect(measures.length).toBe(1);
      const m = measures[0];
      expect(sumDurations(m)).toBe(8);
      const expectedQ = 8 - n;
      const expectedE = 2 * n - 8;
      expect(countTag(m, "<type>quarter</type>")).toBe(expectedQ);
      expect(countTag(m, "<type>eighth</type>")).toBe(expectedE);
      expect(countTag(m, "<pitch>")).toBe(n);
      expect(countTag(m, "<rest/>")).toBe(0);
    },
  );

  it("N=9 truncates to 8 with console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const xml = toMusicXml(makePathWithNotes(9), { voiceStyle: "arp" });
      const measures = dataMeasures(p1Section(xml));
      expect(measures.length).toBe(1);
      const m = measures[0];
      expect(sumDurations(m)).toBe(8);
      expect(countTag(m, "<pitch>")).toBe(8);
      expect(countTag(m, "<type>quarter</type>")).toBe(0);
      expect(countTag(m, "<type>eighth</type>")).toBe(8);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("arp underfull", () => {
  it("N=2 renders 2 quarters plus rest 4", () => {
    const xml = toMusicXml(makePathWithNotes(2), { voiceStyle: "arp" });
    const m = dataMeasures(p1Section(xml))[0];
    expect(sumDurations(m)).toBe(8);
    expect(countTag(m, "<type>quarter</type>")).toBe(2);
    expect(countTag(m, "<type>eighth</type>")).toBe(0);
    expect(countTag(m, "<rest/>")).toBe(1);
    expect(m).toContain("<duration>4</duration>");
  });

  it("N=1 renders 1 quarter plus rest 6", () => {
    const xml = toMusicXml(makePathWithNotes(1), { voiceStyle: "arp" });
    const m = dataMeasures(p1Section(xml))[0];
    expect(sumDurations(m)).toBe(8);
    expect(countTag(m, "<type>quarter</type>")).toBe(1);
    expect(m).toContain("<duration>6</duration>");
  });

  it("empty notes render rest only with sum 8", () => {
    const path: HarmonicPath = {
      id: "empty-notes",
      title: "Empty Notes",
      description: "",
      steps: [{ name: "C", notes: [], descriptions: "" }],
    };
    const xml = toMusicXml(path, { voiceStyle: "arp" });
    const m = dataMeasures(p1Section(xml))[0];
    expect(sumDurations(m)).toBe(8);
    expect(countTag(m, "<pitch>")).toBe(0);
    expect(countTag(m, "<rest/>")).toBe(1);
  });

  it("allocateArpDurations underfull math", () => {
    expect(allocateArpDurations(2, 4)).toMatchObject({
      quarters: 2,
      eighths: 0,
      restDiv: 4,
    });
    expect(allocateArpDurations(0, 4)).toMatchObject({
      quarters: 0,
      eighths: 0,
      restDiv: 8,
    });
    expect(allocateArpDurations(4, 4)).toMatchObject({
      quarters: 4,
      eighths: 0,
      restDiv: 0,
    });
  });
});

describe("arp allocate direct", () => {
  it("overflow math Q=2B-N E=2N-2B", () => {
    expect(allocateArpDurations(5, 4)).toMatchObject({
      quarters: 3,
      eighths: 2,
      restDiv: 0,
      truncated: false,
    });
    expect(allocateArpDurations(8, 4)).toMatchObject({
      quarters: 0,
      eighths: 8,
    });
  });

  it("fractional budget 1.5 handles B=3 S=2 split", () => {
    expect(allocateArpDurations(1, 1.5)).toMatchObject({
      quarters: 1,
      eighths: 0,
      restDiv: 1,
    });
    expect(allocateArpDurations(2, 1.5)).toMatchObject({
      quarters: 1,
      eighths: 1,
      restDiv: 0,
    });
    expect(allocateArpDurations(3, 1.5)).toMatchObject({
      quarters: 0,
      eighths: 3,
    });
  });
});

describe("arp B/S variants exact sum", () => {
  it("B=3 S=1 sums to 6", () => {
    const xml = toMusicXml(TEST_PATH, {
      voiceStyle: "arp",
      beatsPerMeasure: 3,
    });
    const measures = dataMeasures(p1Section(xml));
    expect(measures.length).toBe(3);
    for (const m of measures) {
      expect(sumDurations(m)).toBe(6);
    }
    const first = measures[0];
    expect(countTag(first, "<type>quarter</type>")).toBe(2);
    expect(countTag(first, "<type>eighth</type>")).toBe(2);
  });

  it("B=4 S=2 shares one measure across two steps", () => {
    const path: HarmonicPath = {
      id: "s2",
      title: "S2",
      description: "",
      steps: [
        { name: "C", notes: [60, 64], descriptions: "" },
        { name: "G", notes: [55, 59], descriptions: "" },
      ],
    };
    const xml = toMusicXml(path, {
      voiceStyle: "arp",
      beatsPerMeasure: 4,
      stepsPerMeasure: 2,
    });
    const measures = dataMeasures(p1Section(xml));
    expect(measures.length).toBe(1);
    expect(sumDurations(measures[0])).toBe(8);
    expect(countTag(measures[0], "<type>quarter</type>")).toBe(4);
  });

  it("B=4 S=3 floors plus last absorbs remainder", () => {
    const path: HarmonicPath = {
      id: "s3",
      title: "S3",
      description: "",
      steps: [
        { name: "C", notes: [60], descriptions: "" },
        { name: "F", notes: [65], descriptions: "" },
        { name: "G", notes: [67], descriptions: "" },
      ],
    };
    const xml = toMusicXml(path, {
      voiceStyle: "arp",
      beatsPerMeasure: 4,
      stepsPerMeasure: 3,
    });
    const measures = dataMeasures(p1Section(xml));
    expect(measures.length).toBe(1);
    expect(sumDurations(measures[0])).toBe(8);
    expect(countTag(measures[0], "<pitch>")).toBe(3);
    expect(countTag(measures[0], "<type>quarter</type>")).toBe(3);
  });

  it("B=3 S=2 splits 6 divisions into 3 plus 3", () => {
    const path: HarmonicPath = {
      id: "b3s2",
      title: "B3S2",
      description: "",
      steps: [
        { name: "C", notes: [60, 64], descriptions: "" },
        { name: "G", notes: [55, 59], descriptions: "" },
      ],
    };
    const xml = toMusicXml(path, {
      voiceStyle: "arp",
      beatsPerMeasure: 3,
      stepsPerMeasure: 2,
    });
    const measures = dataMeasures(p1Section(xml));
    expect(measures.length).toBe(1);
    expect(sumDurations(measures[0])).toBe(6);
    expect(countTag(measures[0], "<type>quarter</type>")).toBe(2);
    expect(countTag(measures[0], "<type>eighth</type>")).toBe(2);
  });
});

describe("arp transpose plus clamp parity", () => {
  it("prepareArpNotes dedups sorts transposes clamps and resorts", () => {
    expect(prepareArpNotes([64, 60, 60, 67], 0)).toEqual([60, 64, 67]);
    expect(prepareArpNotes([60, 64, 67], 2)).toEqual([62, 66, 69]);
    const low = prepareArpNotes([30], 0);
    expect(low.length).toBe(1);
    expect(low[0]).toBeGreaterThanOrEqual(48);
    expect(low[0]).toBeLessThanOrEqual(84);
    const high = prepareArpNotes([96], 0);
    expect(high[0]).toBeGreaterThanOrEqual(48);
    expect(high[0]).toBeLessThanOrEqual(84);
    const reorder = prepareArpNotes([80, 36], 0);
    expect(reorder).toEqual([...reorder].sort((a, b) => a - b));
    expect(reorder[0]).toBeGreaterThanOrEqual(48);
  });

  it("arp single shift matches block when in range", () => {
    const block = toMusicXml(TEST_PATH, { transpose: 2 });
    const arp = toMusicXml(TEST_PATH, {
      transpose: 2,
      voiceStyle: "arp",
    });
    const blockPitches = block.match(/<pitch>[^<]+<\/pitch>/g) ?? [];
    const arpPitches = p1Section(arp).match(/<pitch>[^<]+<\/pitch>/g) ?? [];
    expect(blockPitches.length).toBe(arpPitches.length);
    expect(arpPitches).toEqual(blockPitches);
  });

  it("arp clamps out of range while block does not", () => {
    const path: HarmonicPath = {
      id: "low",
      title: "Low",
      description: "",
      steps: [{ name: "C", notes: [30, 36], descriptions: "" }],
    };
    const block = toMusicXml(path);
    const arp = toMusicXml(path, { voiceStyle: "arp" });
    expect(block).not.toBe(arp);
    const arpPitches = p1Section(arp).match(/<pitch>[^<]+<\/pitch>/g) ?? [];
    expect(arpPitches.length).toBe(2);
    const prepared = prepareArpNotes([30, 36], 0);
    expect(prepared[0]).toBeGreaterThanOrEqual(48);
  });
});

describe("arp melody combo", () => {
  it("P1 arp plus P2 melody both sum correctly", () => {
    const xml = toMusicXml(TEST_PATH, {
      voiceStyle: "arp",
      melody: MELODY,
      tempo: 120,
    });
    expect(xml).toContain(
      '<score-part id="P2"><part-name>Melody</part-name></score-part>',
    );
    expect(xml).toContain("<divisions>2</divisions>");
    const p1 = p1Section(xml);
    for (const m of dataMeasures(p1)) {
      expect(sumDurations(m)).toBe(8);
    }
    expect(p1).toContain("<type>quarter</type>");
    const p2Start = xml.indexOf('<part id="P2">');
    expect(p2Start).toBeGreaterThanOrEqual(0);
    const p2 = xml.slice(p2Start);
    const p2Measures = (p2.match(/<measure number="\d+">[\s\S]*?<\/measure>/g) ?? []).filter(
      (m) => !m.includes('number="0"'),
    );
    expect(p2Measures.length).toBe(2);
    for (const m of p2Measures) {
      expect(sumDurations(m)).toBe(8);
    }
  });
});

describe("arp trimToForm", () => {
  const padded: HarmonicPath = {
    id: "padded",
    title: "Padded",
    description: "",
    steps: [
      { name: "Dm7", notes: [50, 53, 57, 60], descriptions: "" },
      { name: "G7", notes: [55, 59, 62, 65], descriptions: "" },
      { name: "Dm7", notes: [50, 53, 57, 60], descriptions: "" },
      { name: "G7", notes: [55, 59, 62, 65], descriptions: "" },
      { name: "Dm7", notes: [50, 53, 57, 60], descriptions: "" },
      { name: "G7", notes: [55, 59, 62, 65], descriptions: "" },
    ],
  };

  it("trim false keeps all bars, trim true keeps one form", () => {
    const full = toMusicXml(padded, { voiceStyle: "arp" });
    expect(dataMeasures(p1Section(full)).length).toBe(6);
    const trimmed = toMusicXml(padded, {
      voiceStyle: "arp",
      trimToForm: true,
    });
    const measures = dataMeasures(p1Section(trimmed));
    expect(measures.length).toBe(2);
    for (const m of measures) {
      expect(sumDurations(m)).toBe(8);
    }
  });

  it("trim works in block mode too", () => {
    const full = toMusicXml(padded);
    expect(dataMeasures(p1Section(full)).length).toBe(6);
    const trimmed = toMusicXml(padded, { trimToForm: true });
    expect(dataMeasures(p1Section(trimmed)).length).toBe(2);
  });
});

describe("arp empty path", () => {
  it("throws on empty path in arp mode", () => {
    expect(() =>
      toMusicXml(
        { id: "empty", title: "Empty", description: "", steps: [] },
        { voiceStyle: "arp" },
      ),
    ).toThrow(/empty/);
  });

  it("throws on empty path with trim", () => {
    expect(() =>
      toMusicXml(
        { id: "empty", title: "Empty", description: "", steps: [] },
        { voiceStyle: "arp", trimToForm: true },
      ),
    ).toThrow(/empty/);
  });
});
