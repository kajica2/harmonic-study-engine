/**
 * src/lib/scoreExport.etude.test.ts - PRD-001 Phase 3 Slice 2 (T4).
 *
 * Node project. GOLDEN PROTOCOL (D27): the two constants below were
 * captured from the PRE-EDIT toMusicXml (HEAD 884a5de, before
 * scoreExport.ts was touched - see /tmp/phase-3-s2-snapshots). They
 * pin that the no-melody output stays BYTE-IDENTICAL after the
 * additive melody-part extension; the frozen tests/scoreExport.test.ts
 * stays untouched.
 */

import { describe, it, expect } from "vitest";
import { toMusicXml } from "./scoreExport";
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

const OPTS = {
  title: "T2",
  composer: "C2",
  tempo: 132,
  transpose: 2,
  beatsPerMeasure: 3,
  stepsPerMeasure: 2,
};

const GOLDEN_NO_MELODY = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>Test Progression</work-title>
  </work>
  <identification>
    <creator type="composer">harmonic-study-engine</creator>
  </identification>
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="0">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>80</per-minute></metronome></direction-type></direction>
    </measure>
    <measure number="1">
      
      <harmony>
        <root><root-step>D</root-step><root-alter>0</root-alter></root>
        <kind text="Dm7">major</kind>
      </harmony>
        <note>
          <pitch>D3</pitch>
          <duration>4</duration>
          <voice>1</voice>
        </note>
        <note>
          <pitch>F3</pitch>
          <duration>4</duration>
          <voice>1</voice>
        </note>
        <note>
          <pitch>A3</pitch>
          <duration>4</duration>
          <voice>1</voice>
        </note>
        <note>
          <pitch>C4</pitch>
          <duration>4</duration>
          <voice>1</voice>
        </note>
    </measure>
    <measure number="2">
      
      <harmony>
        <root><root-step>G</root-step><root-alter>0</root-alter></root>
        <kind text="G7">major</kind>
      </harmony>
        <note>
          <pitch>G3</pitch>
          <duration>4</duration>
          <voice>1</voice>
        </note>
        <note>
          <pitch>B3</pitch>
          <duration>4</duration>
          <voice>1</voice>
        </note>
        <note>
          <pitch>D4</pitch>
          <duration>4</duration>
          <voice>1</voice>
        </note>
        <note>
          <pitch>F4</pitch>
          <duration>4</duration>
          <voice>1</voice>
        </note>
    </measure>
    <measure number="3">
      
      <harmony>
        <root><root-step>C</root-step><root-alter>0</root-alter></root>
        <kind text="Cmaj7">major</kind>
      </harmony>
        <note>
          <pitch>C3</pitch>
          <duration>4</duration>
          <voice>1</voice>
        </note>
        <note>
          <pitch>E3</pitch>
          <duration>4</duration>
          <voice>1</voice>
        </note>
        <note>
          <pitch>G3</pitch>
          <duration>4</duration>
          <voice>1</voice>
        </note>
        <note>
          <pitch>B3</pitch>
          <duration>4</duration>
          <voice>1</voice>
        </note>
    </measure>
  </part>
</score-partwise>`;
const GOLDEN_WITH_OPTS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>T2</work-title>
  </work>
  <identification>
    <creator type="composer">C2</creator>
  </identification>
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="0">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>132</per-minute></metronome></direction-type></direction>
    </measure>
    <measure number="1">
      
      <harmony>
        <root><root-step>D</root-step><root-alter>0</root-alter></root>
        <kind text="Dm7">major</kind>
      </harmony>
        <note>
          <pitch>E3</pitch>
          <duration>2</duration>
          <voice>1</voice>
        </note>
        <note>
          <pitch>G3</pitch>
          <duration>2</duration>
          <voice>1</voice>
        </note>
        <note>
          <pitch>B3</pitch>
          <duration>2</duration>
          <voice>1</voice>
        </note>
        <note>
          <pitch>D4</pitch>
          <duration>2</duration>
          <voice>1</voice>
        </note>
      <harmony>
        <root><root-step>G</root-step><root-alter>0</root-alter></root>
        <kind text="G7">major</kind>
      </harmony>
        <note>
          <pitch>A3</pitch>
          <duration>2</duration>
          <voice>1</voice>
        </note>
        <note>
          <pitch>Df4</pitch>
          <duration>2</duration>
          <voice>1</voice>
        </note>
        <note>
          <pitch>E4</pitch>
          <duration>2</duration>
          <voice>1</voice>
        </note>
        <note>
          <pitch>G4</pitch>
          <duration>2</duration>
          <voice>1</voice>
        </note>
    </measure>
    <measure number="2">
      
      <harmony>
        <root><root-step>C</root-step><root-alter>0</root-alter></root>
        <kind text="Cmaj7">major</kind>
      </harmony>
        <note>
          <pitch>D3</pitch>
          <duration>4</duration>
          <voice>1</voice>
        </note>
        <note>
          <pitch>Gf3</pitch>
          <duration>4</duration>
          <voice>1</voice>
        </note>
        <note>
          <pitch>A3</pitch>
          <duration>4</duration>
          <voice>1</voice>
        </note>
        <note>
          <pitch>Df4</pitch>
          <duration>4</duration>
          <voice>1</voice>
        </note>
    </measure>
  </part>
</score-partwise>`;

/** 2-bar melody grid: slot 6 dur 4 CROSSES the barline (6+4=10);
 *  slot 10..12 is a gap that must render as a rest. */
const MELODY: readonly EtudeNote[] = [
  { slot: 0, midi: 60, durationSlots: 6, velocity: 0.85, strongBeat: true, syncopated: false },
  { slot: 6, midi: 62, durationSlots: 4, velocity: 0.65, strongBeat: true, syncopated: false },
  { slot: 12, midi: 64, durationSlots: 4, velocity: 0.85, strongBeat: true, syncopated: false },
];

function p2Section(xml: string): string {
  const i = xml.indexOf('<part id="P2">');
  expect(i).toBeGreaterThanOrEqual(0);
  return xml.slice(i);
}

function p1Section(xml: string): string {
  const start = xml.indexOf('<part id="P1">');
  const end = xml.indexOf("</part>", start);
  return xml.slice(start, end + 7);
}

describe("D27 golden: no-melody output byte-identical to pre-edit", () => {
  it("default options", () => {
    expect(toMusicXml(TEST_PATH)).toBe(GOLDEN_NO_MELODY);
  });

  it("non-default options", () => {
    expect(toMusicXml(TEST_PATH, OPTS)).toBe(GOLDEN_WITH_OPTS);
  });

  it("empty melody array is treated as absent (byte-identical)", () => {
    expect(toMusicXml(TEST_PATH, { melody: [] })).toBe(GOLDEN_NO_MELODY);
  });
});

describe("D27 additive melody part", () => {
  const xml = toMusicXml(TEST_PATH, { melody: MELODY, tempo: 120 });

  it("part-list gains P2 and P1 stays untouched", () => {
    expect(xml).toContain(
      '<score-part id="P2"><part-name>Melody</part-name></score-part>',
    );
    const noMelody = toMusicXml(TEST_PATH, { tempo: 120 });
    // P1's CONTENT is untouched (the only delta before <part id="P1">
    // is the additive P2 line in part-list).
    expect(p1Section(xml)).toBe(p1Section(noMelody));
  });

  it("P2 has its own measure-0 with divisions=2 and bars measures", () => {
    const p2 = p2Section(xml);
    expect(p2).toContain("<divisions>2</divisions>");
    expect(p2).toContain("<clef><sign>G</sign><line>2</line></clef>");
    const measures = p2.match(/<measure number="\d+">/g) ?? [];
    // measure-0 + 2 bars
    expect(measures.length).toBe(3);
    expect(p2).toContain("<per-minute>120</per-minute>");
  });

  it("bar-crossing note splits with tie start/stop", () => {
    const p2 = p2Section(xml);
    expect((p2.match(/<tie type="start"\/>/g) ?? []).length).toBe(1);
    expect((p2.match(/<tie type="stop"\/>/g) ?? []).length).toBe(1);
    expect((p2.match(/<tied type="start"\/>/g) ?? []).length).toBe(1);
    expect((p2.match(/<tied type="stop"\/>/g) ?? []).length).toBe(1);
    // The crossing note (D4, transposed 0) appears twice in P2.
    expect((p2.match(/<pitch>D4<\/pitch>/g) ?? []).length).toBe(2);
  });

  it("rests fill gaps and every P2 measure sums to exactly 8 divisions", () => {
    const p2 = p2Section(xml);
    const measures = p2.match(/<measure number="\d+">[\s\S]*?<\/measure>/g) ?? [];
    const dataMeasures = measures.filter((m) => !m.includes('number="0"'));
    expect(dataMeasures.length).toBe(2);
    for (const m of dataMeasures) {
      const durations = [...m.matchAll(/<duration>(\d+)<\/duration>/g)]
        .map((d) => Number(d[1]))
        .reduce((a, b) => a + b, 0);
      expect(durations).toBe(8);
    }
    // Bar 2: continuation(2) + rest(2) + note(4) -> exactly one rest.
    expect((p2.match(/<rest\/>/g) ?? []).length).toBe(1);
  });

  it("transpose applies to P2 pitches as well", () => {
    const shifted = toMusicXml(TEST_PATH, { melody: MELODY, transpose: 2 });
    const p2 = p2Section(shifted);
    expect(p2).toContain("<pitch>E4</pitch>"); // 60 + 2
    expect(p2).not.toContain("<pitch>C4</pitch>");
  });

  it("empty path + melody still throws (existing contract)", () => {
    expect(() =>
      toMusicXml(
        { id: "empty", title: "Empty", description: "", steps: [] },
        { melody: MELODY },
      ),
    ).toThrow(/empty/);
  });
});
