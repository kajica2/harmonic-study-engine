import { describe, it, expect } from "vitest";
import {
  parseChordToMidi,
  importIRealText,
  importIReal,
  exportIReal,
} from "../src/lib/ireal";
import type { HarmonicPath } from "../src/lib/paths";

/**
 * ireal — iReal Pro / iRealBook URL + text importer.
 *
 * The iReal importer is the entry point for two import flows:
 *   - the "Paste iReal URL" field in ImportExportModal
 *   - the file-drop for Real-Book-style chart text
 *
 * Tests pin:
 *   - parseChordToMidi: the chord-quality table (maj7, m7, dim, sus, etc.)
 *   - importIRealText: URL + base64 + JSON + plain-text branches
 *   - importIReal: backwards-compatible single-path API
 *   - exportIReal: round-trip-ish serialization
 */

describe("parseChordToMidi", () => {
  it("returns C3 major triad [C3=48, E3=52, G3=55] at default octave", () => {
    // baseOctave default is 4; the function places the root at
    // notesList.indexOf(root) + baseOctave*12, so C at baseOctave=4
    // is MIDI 48 (C3). The codebase's existing path data (paths.ts)
    // uses this lower octave as the convention — middle C appears
    // in the upper octave of each chord.
    expect(parseChordToMidi("C")).toEqual([48, 52, 55]);
  });

  it("applies the major-7 interval [0, 4, 7, 11]", () => {
    expect(parseChordToMidi("Cmaj7")).toEqual([48, 52, 55, 59]);
  });

  it("applies the minor-7 interval [0, 3, 7, 10]", () => {
    expect(parseChordToMidi("Dm7")).toEqual([50, 53, 57, 60]);
  });

  it("normalizes flats to sharps internally", () => {
    // Db = C#, so Db major 7 should equal C# major 7
    expect(parseChordToMidi("Dbmaj7")).toEqual(parseChordToMidi("C#maj7"));
  });

  it("lowercase letter is normalized (e.g. 'cmaj7' == 'Cmaj7')", () => {
    expect(parseChordToMidi("cmaj7")).toEqual(parseChordToMidi("Cmaj7"));
  });

  it("applies slash chord: C/E prepends E below the root", () => {
    const notes = parseChordToMidi("C/E")!;
    // E3=52 above C3=48 — slash chord should bring E below the root.
    // E2 = 40; the actual output prepends E2 (40), then root + chord.
    expect(notes[0]).toBe(40); // E2
    expect(notes).toContain(48); // C3 root still present
  });

  it("handles 'm7b5' (half-diminished) as [0, 3, 6, 10]", () => {
    // Half-diminished = minor 3 + diminished 5 + minor 7 → intervals [0,3,6,10]
    expect(parseChordToMidi("Bm7b5")).toEqual([59, 62, 65, 69]);
  });

  it("handles diminished as [0, 3, 6]", () => {
    expect(parseChordToMidi("Bdim")).toEqual([59, 62, 65]);
  });

  it("returns null for unparseable input", () => {
    expect(parseChordToMidi("Hx")).toBeNull();
  });

  it("respects the baseOctave argument", () => {
    expect(parseChordToMidi("C", 5)).toEqual([60, 64, 67]);
  });
});

describe("importIRealText — plain-text chart", () => {
  it("parses bar-pipe notation into HarmonicPath[] with one step per chord", () => {
    const paths = importIRealText("| Cmaj7 | Dm7 G7 | Cmaj7 |");
    expect(paths.length).toBe(1);
    expect(paths[0].steps.length).toBeGreaterThan(0);
    expect(paths[0].steps[0].name).toBe("Cmaj7");
  });

  it("strips time-signature markers (T44)", () => {
    const paths = importIRealText("T44 | Cmaj7 | Dm7 |");
    expect(paths.length).toBe(1);
    expect(paths[0].steps.some((s) => s.name.includes("T44"))).toBe(false);
  });

  it("strips repeat markers (*A, *B)", () => {
    const paths = importIRealText("*A | Cmaj7 |");
    expect(paths[0].steps[0].name).not.toMatch(/\*/);
  });

  it("returns [] on empty input", () => {
    expect(importIRealText("")).toEqual([]);
    expect(importIRealText("   ")).toEqual([]);
  });
});

describe("importIRealText — JSON input", () => {
  it("parses a single-song JSON object", () => {
    const json = JSON.stringify({
      title: "Test Tune",
      composer: "Tester",
      style: "Swing",
      key: "C",
      chords: ["Cmaj7", "Dm7", "G7"],
    });
    const paths = importIRealText(json);
    expect(paths.length).toBe(1);
    expect(paths[0].title).toBe("Test Tune");
    expect(paths[0].description).toContain("Tester");
  });

  it("parses a playlist JSON with multiple songs", () => {
    const json = JSON.stringify({
      name: "My Playlist",
      songs: [
        { title: "First", chords: ["Cmaj7", "Fm7"] },
        { title: "Second", chords: ["Dm7", "G7"] },
      ],
    });
    const paths = importIRealText(json);
    expect(paths.length).toBe(2);
    expect(paths[0].title).toBe("First");
    expect(paths[1].title).toBe("Second");
  });

  it("falls back to a default title when none is provided", () => {
    const json = JSON.stringify({ chords: ["Cmaj7"] });
    const paths = importIRealText(json);
    expect(paths[0].title).toMatch(/Imported/);
  });
});

describe("importIReal (backwards-compatible single-path API)", () => {
  it("returns the first path of importIRealText, or null", () => {
    const p = importIReal("| Cmaj7 | Dm7 |");
    expect(p).not.toBeNull();
    expect(p!.title).toMatch(/Imported/);
  });

  it("returns null when input is empty", () => {
    expect(importIReal("")).toBeNull();
  });

  it("returns null when input is whitespace only", () => {
    expect(importIReal("   ")).toBeNull();
  });
});

describe("exportIReal", () => {
  it("serializes a path to an irealpro:// URL", () => {
    const path: HarmonicPath = {
      id: "test",
      title: "Test",
      description: "",
      steps: [
        { name: "Cmaj7", notes: [48, 52, 55, 59], descriptions: "" },
        { name: "Dm7", notes: [50, 53, 57, 60], descriptions: "" },
      ],
    };
    const url = exportIReal(path);
    expect(url).toMatch(/^irealpro:\/\//);
    // Cmaj7 gets encoded as C^7 (^ = maj in iRealPro wire format)
    expect(url).toContain("C^7");
    // Dm7 gets encoded as D-7 (- = m in iRealPro wire format)
    expect(url).toContain("D-7");
  });
});
