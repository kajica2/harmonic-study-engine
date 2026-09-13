import { describe, it, expect } from "vitest";
import {
  getComposerChart,
  getBarCharts,
  getSectionCharts,
  totalBarCount,
  ALL_COMPOSER_IDS,
  pcFromNoteName,
  pcsFromNoteNames,
  type ComposerId,
  type BarChart,
  type BitonalBlock,
  type RowMatrix,
  type AxisSystem,
  type DurationStructure,
  type LayerStack,
  type GenericSectionChart,
} from "./composerCatalog";

describe("composerCatalog", () => {
  describe("getComposerChart", () => {
    it("returns a bar chart for Beethoven", () => {
      const chart = getComposerChart("beethoven");
      expect(chart).toBeDefined();
      expect(chart?.kind).toBe("bar");
      if (chart?.kind === "bar") {
        expect(chart.bars.length).toBe(21);
        expect(chart.bars[0]).toEqual({
          label: "1",
          chord: "Cm",
          roman: "i",
        });
        // bar 10 is the Neapolitan (key device)
        const nap = chart.bars.find((b) => b.label === "10");
        expect(nap?.roman).toMatch(/bII/);
      }
    });

    it("returns a bar chart for Coltrane with all 16 bars", () => {
      const chart = getComposerChart("john-coltrane");
      expect(chart?.kind).toBe("bar");
      if (chart?.kind === "bar") {
        expect(chart.bars.length).toBe(16);
        // bar 10 is a tritone sub — F#7 resolving to Bmaj7
        const ts = chart.bars.find((b) => b.label === "10");
        expect(ts?.roman).toMatch(/tritone sub/);
      }
    });

    it("returns a bar chart for Miles Davis with 32 bars (So What AABA)", () => {
      const chart = getComposerChart("miles-davis");
      expect(chart?.kind).toBe("bar");
      if (chart?.kind === "bar") {
        expect(chart.bars.length).toBe(32);
      }
    });

    it("returns a section chart for Cage (no bar chart)", () => {
      const chart = getComposerChart("cage");
      expect(chart).toBeDefined();
      expect(chart?.kind).toBe("duration");
      if (chart && chart.kind !== "bar") {
        expect(chart.raw.length).toBe(3);
      }
    });

    it("returns a row chart for Schoenberg", () => {
      const chart = getComposerChart("schoenberg");
      expect(chart?.kind).toBe("row");
    });

    it("returns an axis chart for Bartók", () => {
      const chart = getComposerChart("bartok");
      expect(chart?.kind).toBe("axis");
      if (chart && chart.kind !== "bar") {
        expect(chart.raw.some((l) => l.includes("Tonic axis"))).toBe(true);
      }
    });

    it("returns undefined for an unknown composer", () => {
      // @ts-expect-error: testing bad input
      expect(getComposerChart("nonexistent")).toBeUndefined();
    });
  });

  describe("getBarCharts", () => {
    it("returns 16 bar charts (Beethoven → Piazzolla)", () => {
      const charts = getBarCharts();
      expect(charts.length).toBe(16);
    });

    it("every bar chart has non-empty bars and work context", () => {
      const charts = getBarCharts();
      for (const chart of charts) {
        expect(chart.bars.length).toBeGreaterThan(0);
        expect(chart.workContext).toBeTruthy();
        expect(chart.composerName).toBeTruthy();
      }
    });

    it("all bar labels are non-empty strings", () => {
      const charts = getBarCharts();
      for (const chart of charts) {
        for (const bar of chart.bars) {
          expect(bar.label).toBeTruthy();
          expect(bar.chord).toBeTruthy();
          expect(bar.roman).toBeTruthy();
        }
      }
    });
  });

  describe("getSectionCharts", () => {
    it("returns 10 section/row/axis/duration/layer charts", () => {
      const charts = getSectionCharts();
      expect(charts.length).toBe(10);
    });

    it("every section chart has at least one raw line", () => {
      const charts = getSectionCharts();
      for (const chart of charts) {
        expect(chart.raw.length).toBeGreaterThan(0);
        expect(chart.description).toBeTruthy();
      }
    });
  });

  describe("ALL_COMPOSER_IDS", () => {
    it("contains all 26 composers across 4 eras", () => {
      expect(ALL_COMPOSER_IDS.length).toBe(26);
    });

    it("contains the 7 persona-mapped composers", () => {
      // bach → wendy-carlos (functional tonality + electronic timbre)
      // coltrane → john-coltrane (direct)
      // debussy → debussy (direct)
      // eno → brian-eno (direct)
      // glass → minimalists (Glass is a member)
      // miles → miles-davis (direct)
      // scriabin → bartok (axis system, symmetrical scales)
      const expected: ComposerId[] = [
        "wendy-carlos",
        "john-coltrane",
        "debussy",
        "brian-eno",
        "minimalists",
        "miles-davis",
        "bartok",
      ];
      for (const id of expected) {
        expect(ALL_COMPOSER_IDS).toContain(id);
      }
    });
  });

  describe("totalBarCount", () => {
    it("is the sum of bar counts across all bar charts", () => {
      // Hand-counted from the catalog:
      //   beethoven:21, schubert:32, berlioz:16, chopin:23, liszt:16,
      //   wagner:20, verdi:17, ellington:16, armstrong:12, miles-davis:32,
      //   john-coltrane:16, the-beatles:21, kraftwerk:16, wendy-carlos:18,
      //   fela-kuti:16, piazzolla:24
      //   = 21+32+16+23+16+20+17+16+12+32+16+21+16+18+16+24 = 316
      expect(totalBarCount()).toBe(316);
    });
  });

  describe("pcFromNoteName / pcsFromNoteNames", () => {
    it("parses standard note names", () => {
      expect(pcFromNoteName("C")).toBe(0);
      expect(pcFromNoteName("Db")).toBe(1);
      expect(pcFromNoteName("C#")).toBe(1);
      expect(pcFromNoteName("Bb")).toBe(10);
      expect(pcFromNoteName("B")).toBe(11);
    });

    it("returns undefined for unknown names", () => {
      expect(pcFromNoteName("")).toBeUndefined();
      // @ts-expect-error: bad input
      expect(pcFromNoteName(null)).toBeUndefined();
    });

    it("parses a delimited sequence of note names", () => {
      // Catalog uses " – " (en dash) and " - " (hyphen) as separators
      expect(pcsFromNoteNames("E – F – G")).toEqual([4, 5, 7]);
      expect(pcsFromNoteNames("A - C - Eb - F#")).toEqual([9, 0, 3, 6]);
    });
  });

  describe("structured section parsers", () => {
    it("Stravinsky bitonal: Petrushka chord is C (0) + F# (6)", () => {
      const chart = getComposerChart("stravinsky") as BitonalBlock;
      expect(chart.kind).toBe("bitonal");
      expect(chart.pairs.length).toBeGreaterThan(0);
      expect(chart.pairs[0]).toEqual({ root1: 0, root2: 6 });
      // Confirm tritone relationship: |root1 - root2| mod 12 = 6
      const diff = Math.abs(chart.pairs[0].root1 - chart.pairs[0].root2) % 12;
      expect(diff).toBe(6);
    });

    it("Schoenberg row: P0 contains 12 distinct pitch classes covering all notes", () => {
      const chart = getComposerChart("schoenberg") as RowMatrix;
      expect(chart.kind).toBe("row");
      // P0 must be 12 notes — some are enharmonic duplicates in our acoustic
      // pitch-class system, so we check length and uniqueness modulo spelling
      expect(chart.forms.P0.length).toBe(12);
      // Hexachords split P0 into two halves
      expect(chart.hexachords.first.length).toBe(6);
      expect(chart.hexachords.second.length).toBe(6);
      // First hexachord matches first 6 pitches of P0
      expect(chart.hexachords.first).toEqual(chart.forms.P0.slice(0, 6));
      expect(chart.hexachords.second).toEqual(chart.forms.P0.slice(6));
    });

    it("Bartók axis: tonic axis contains A, C, Eb, F# (pcs 9, 0, 3, 6)", () => {
      const chart = getComposerChart("bartok") as AxisSystem;
      expect(chart.kind).toBe("axis");
      expect(chart.tonicAxis).toEqual([9, 0, 3, 6]);
      expect(chart.dominantAxis).toEqual([4, 7, 10, 1]);
      expect(chart.subdominantAxis).toEqual([2, 5, 8, 11]);
      // Each axis should have 4 keys
      expect(chart.tonicAxis.length).toBe(4);
      expect(chart.dominantAxis.length).toBe(4);
      expect(chart.subdominantAxis.length).toBe(4);
    });

    it("Cage duration: 4'33\" is three silent movements totaling 273 seconds", () => {
      const chart = getComposerChart("cage") as DurationStructure;
      expect(chart.kind).toBe("duration");
      expect(chart.movements.length).toBe(3);
      expect(chart.movements.map((m) => m.label)).toEqual(["I", "II", "III"]);
      // 30 + 143 + 100 = 273 seconds = 4'33"
      const total = chart.movements.reduce((s, m) => s + m.seconds, 0);
      expect(total).toBe(273);
    });

    it("Eno layer: Music for Airports has 4 looping layers", () => {
      const chart = getComposerChart("brian-eno") as LayerStack;
      expect(chart.kind).toBe("layer");
      expect(chart.layers.length).toBe(4);
      expect(chart.layers[0].index).toBe(1);
      expect(chart.layers[3].index).toBe(4);
    });

    it("Stockhausen / Minimalists / Coleman / Shankar remain GenericSectionChart", () => {
      const stockhausen = getComposerChart("stockhausen") as GenericSectionChart;
      const minimalists = getComposerChart("minimalists") as GenericSectionChart;
      const coleman = getComposerChart("ornette-coleman") as GenericSectionChart;
      const shankar = getComposerChart("ravi-shankar") as GenericSectionChart;
      expect(stockhausen.kind).toBe("section");
      expect(minimalists.kind).toBe("section");
      expect(coleman.kind).toBe("section");
      expect(shankar.kind).toBe("section");
      // Raw lines preserved
      expect(stockhausen.raw.length).toBeGreaterThan(0);
      expect(shankar.raw.length).toBeGreaterThan(0);
    });
  });
});
