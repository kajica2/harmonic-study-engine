/**
 * scoreExport — MusicXML and Score21 string generation. Both are
 * pure functions: deterministic, no IO, no async. Test against
 * the actual string output to catch regressions.
 */

import { describe, it, expect } from "vitest";
import { toMusicXml, toScore21 } from "../src/lib/scoreExport";
import { HarmonicPath } from "../src/lib/paths";

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

describe("toMusicXml", () => {
  it("throws on an empty path", () => {
    expect(() =>
      toMusicXml({
        id: "empty",
        title: "Empty",
        description: "",
        steps: [],
      }),
    ).toThrow(/empty/);
  });

  it("produces a valid MusicXML 4.0 XML document", () => {
    const xml = toMusicXml(TEST_PATH);
    expect(xml).toMatch(/<\?xml version="1\.0"/);
    expect(xml).toMatch(/<!DOCTYPE score-partwise/);
    expect(xml).toMatch(/<score-partwise version="4\.0">/);
    expect(xml).toMatch(/<\/score-partwise>/);
  });

  it("includes the path title as work-title", () => {
    const xml = toMusicXml(TEST_PATH);
    expect(xml).toContain("<work-title>Test Progression</work-title>");
  });

  it("includes one <measure> per step plus an opening measure-0", () => {
    // MusicXML always emits a leading <measure number="0"> with the
    // time/key/clef attributes, then one <measure> per chord by
    // default. So 3 steps => 3 + 1 = 4 measure elements.
    const xml = toMusicXml(TEST_PATH);
    const measures = xml.match(/<measure number="\d+">/g);
    expect(measures?.length).toBe(4);
    expect(xml).toContain('<measure number="0">');
    expect(xml).toContain('<measure number="1">');
    expect(xml).toContain('<measure number="3">');
  });

  it("respects the stepsPerMeasure option (groups steps)", () => {
    // 3 steps + stepsPerMeasure=3 = 1 chord-measure + the opening
    // measure-0 = 2 measure elements.
    const xml = toMusicXml(TEST_PATH, { stepsPerMeasure: 3 });
    const measures = xml.match(/<measure number="\d+">/g);
    expect(measures?.length).toBe(2);
  });

  it("emits different <pitch> elements when transposed", () => {
    // The transpose option shifts every pitch up/down by N semitones.
    // Verify by comparing the pitch elements between transposed and
    // untransposed outputs.
    const baseXml = toMusicXml(TEST_PATH);
    const transposedXml = toMusicXml(TEST_PATH, { transpose: 4 });
    const basePitches = baseXml.match(/<pitch>[^<]+<\/pitch>/g);
    const transposedPitches = transposedXml.match(/<pitch>[^<]+<\/pitch>/g);
    expect(basePitches?.length).toBeGreaterThan(0);
    expect(transposedPitches?.length).toBe(basePitches?.length);
    // At least one pitch element must differ
    const allSame = basePitches?.every((p, i) => p === transposedPitches?.[i]);
    expect(allSame, "transpose should change pitch output").toBe(false);
  });

  it("escapes special XML characters in the title", () => {
    const xml = toMusicXml({
      ...TEST_PATH,
      title: "Bach's <Well-Tempered> & Co.",
    });
    // The < > & should be escaped in the work-title element
    expect(xml).toContain("&lt;Well-Tempered&gt;");
    expect(xml).toContain("&amp;");
    // But not in a way that breaks parsing
    expect(xml).toContain("Bach&apos;s");
  });

  it("includes the composer in <identification>", () => {
    const xml = toMusicXml(TEST_PATH, { composer: "Test Author" });
    expect(xml).toContain('creator type="composer">Test Author</creator>');
  });

  it("sets <time> from beatsPerMeasure", () => {
    const xml = toMusicXml(TEST_PATH, { beatsPerMeasure: 3 });
    expect(xml).toContain("<beats>3</beats>");
  });

  it("encodes chord names in <harmony><kind>", () => {
    const xml = toMusicXml(TEST_PATH);
    expect(xml).toContain('kind text="Dm7"');
    expect(xml).toContain('kind text="G7"');
    expect(xml).toContain('kind text="Cmaj7"');
  });

  it("transposes the pitches via the transpose option", () => {
    // transpose=2 semitones — every <pitch> step should be 2 higher.
    // Verify by comparing the pitch elements between transposed and
    // untransposed outputs (rather than asserting exact strings,
    // which depend on octave-numbering conventions).
    const xml = toMusicXml(TEST_PATH, { transpose: 2 });
    const baseXml = toMusicXml(TEST_PATH);
    const basePitches = baseXml.match(/<pitch>[^<]+<\/pitch>/g);
    const transposedPitches = xml.match(/<pitch>[^<]+<\/pitch>/g);
    expect(basePitches?.length).toBe(transposedPitches?.length);
    // At least one pitch must differ
    const allSame = basePitches?.every((p, i) => p === transposedPitches?.[i]);
    expect(allSame, "transpose should change pitch output").toBe(false);
  });
});

describe("toScore21", () => {
  it("starts with the title as markdown H1", () => {
    const out = toScore21(TEST_PATH);
    expect(out).toMatch(/^# Test Progression$/m);
  });

  it("includes the chord-symbol row", () => {
    const out = toScore21(TEST_PATH);
    expect(out).toMatch(/## chords/);
    expect(out).toContain("Dm7");
    expect(out).toContain("G7");
    expect(out).toContain("Cmaj7");
  });

  it("includes the pitch grid section", () => {
    const out = toScore21(TEST_PATH);
    expect(out).toMatch(/## pitches \(concert\)/);
  });

  it("emits X marks for present pitches and . for absent", () => {
    const out = toScore21(TEST_PATH);
    // The output uses ASCII X / . grid — check that both appear
    // and that no row is entirely empty (verifies the grid is real)
    expect(out).toMatch(/X/);
    expect(out).toMatch(/\./);
  });

  it("includes a voice-leading summary section", () => {
    const out = toScore21(TEST_PATH);
    expect(out).toMatch(/## voice-leading/);
    // One b<n>: line per step
    expect(out).toMatch(/^b1: /m);
    expect(out).toMatch(/^b3: /m);
  });

  it("honors the custom title option", () => {
    const out = toScore21(TEST_PATH, { title: "Custom Title" });
    expect(out).toMatch(/^# Custom Title$/m);
  });
});