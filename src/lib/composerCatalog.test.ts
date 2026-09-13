import { describe, it, expect } from "vitest";
import {
  getComposerChart,
  getBarCharts,
  getSectionCharts,
  totalBarCount,
  ALL_COMPOSER_IDS,
  type ComposerId,
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
});
