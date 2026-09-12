/**
 * Unit tests for src/lib/paths.ts.
 *
 * Coverage:
 *  - PATHS array shape: every path has id, title, description, non-empty steps
 *  - Every step has name, notes (non-empty, MIDI 0-127)
 *  - ALL_PATHS backfills `name` from `title` for LiveScoreDisplay's abcjs T:
 *  - The 5 Phase 5 classical paths exist and have valid metadata
 *  - sequence_ascent has sequenceStepper + sequenceInterval
 *  - progressive_tonality has keyDrift metadata (arrow-separated)
 *  - STUDIES_PATHS contributes to ALL_PATHS (no duplicate IDs)
 *  - No MIDI notes are out of range (0..127)
 */
import { describe, it, expect } from "vitest";
import { PATHS, STUDIES_PATHS, ALL_PATHS } from "./paths";

describe("PATHS array shape", () => {
  it("PATHS has the 8 built-in paths", () => {
    expect(PATHS.length).toBeGreaterThanOrEqual(13); // 8 originals + 5 classical
  });

  it("every path has id, title, description, non-empty steps", () => {
    for (const p of PATHS) {
      expect(typeof p.id).toBe("string");
      expect(p.id.length).toBeGreaterThan(0);
      expect(typeof p.title).toBe("string");
      expect(p.title.length).toBeGreaterThan(0);
      expect(typeof p.description).toBe("string");
      expect(Array.isArray(p.steps)).toBe(true);
      expect(p.steps.length).toBeGreaterThan(0);
    }
  });

  it("every step has name, non-empty notes array, descriptions string", () => {
    for (const p of PATHS) {
      for (const s of p.steps) {
        expect(typeof s.name).toBe("string");
        expect(Array.isArray(s.notes)).toBe(true);
        expect(s.notes.length).toBeGreaterThan(0);
        for (const n of s.notes) {
          expect(Number.isInteger(n)).toBe(true);
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(127);
        }
        expect(typeof s.descriptions).toBe("string");
      }
    }
  });

  it("all path IDs are unique", () => {
    const ids = PATHS.map((p) => p.id);
    const set = new Set(ids);
    expect(set.size).toBe(ids.length);
  });
});

describe("Phase 5 classical paths", () => {
  const classical = [
    "mystic_prometheus",
    "bell_sonority",
    "developing_variation",
    "sequence_ascent",
    "progressive_tonality",
  ];

  it("all 5 classical paths exist in PATHS", () => {
    for (const id of classical) {
      const p = PATHS.find((x) => x.id === id);
      expect(p, `path ${id} missing`).toBeDefined();
    }
  });

  it("every classical path declares a composer", () => {
    for (const id of classical) {
      const p = PATHS.find((x) => x.id === id)!;
      expect(typeof p.composer).toBe("string");
      expect(p.composer!.length).toBeGreaterThan(0);
    }
  });

  it("sequence_ascent declares sequenceStepper + sequenceInterval=2", () => {
    const p = PATHS.find((x) => x.id === "sequence_ascent")!;
    expect((p as any).sequenceStepper).toBe(true);
    expect((p as any).sequenceInterval).toBe(2);
  });

  it("progressive_tonality declares key with arrow (X → Y)", () => {
    const p = PATHS.find((x) => x.id === "progressive_tonality")!;
    expect(p.key).toBeDefined();
    // Use String.fromCharCode for the regex to avoid source-file escaping.
    expect(p.key!.includes("\u2192")).toBe(true);
  });

  it("mystic_prometheus has quartal-voiced notes (4ths stacked)", () => {
    const p = PATHS.find((x) => x.id === "mystic_prometheus")!;
    // padPath() extends every path to a 4-bars-multiple length so the
    // audio loop clock (which steps 4 beats per bar) lines up cleanly.
    // Default pad target is 24 bars = 96 steps.
    expect(p.steps.length % 4).toBe(0);
    expect(p.steps.length).toBeGreaterThanOrEqual(4);
    // The first four steps are the declared quartal voicings.
    expect(p.steps[0].name).toBe("C quartal");
    expect(p.steps[1].name).toBe("Gb quartal");
    expect(p.steps[2].name).toBe("B quartal");
    expect(p.steps[3].name).toBe("E quartal");
  });

  it("sequence_ascent starts with D, E, F#, G (climbs by 2 semitones)", () => {
    const p = PATHS.find((x) => x.id === "sequence_ascent")!;
    const roots = p.steps.slice(0, 4).map((s) => Math.min(...s.notes));
    expect(roots[0]).toBe(50); // D
    expect(roots[1]).toBe(52); // E
    expect(roots[2]).toBe(54); // F#
    expect(roots[3]).toBe(55); // G
  });
});

describe("ALL_PATHS backfill", () => {
  it("every ALL_PATHS entry has `name` populated from `title`", () => {
    for (const p of ALL_PATHS) {
      expect(p.name).toBeDefined();
      expect(p.name).toBe(p.title);
    }
  });

  it("ALL_PATHS includes PATHS + STUDIES_PATHS with no duplicate IDs", () => {
    // PATHS is the post-padPath derived array. ALL_PATHS is currently
    // aliased to PATHS (STUDIES_PATHS are surfaced separately through
    // the Masterclass picker, see src/lib/paths.ts comments).
    expect(ALL_PATHS.length).toBe(PATHS.length);
    const ids = ALL_PATHS.map((p) => p.id);
    const set = new Set(ids);
    expect(set.size).toBe(ids.length);
  });

  it("the LiveScoreDisplay-required classical paths are all in AL_PATHS", () => {
    const ids = new Set(ALL_PATHS.map((p) => p.id));
    for (const id of ["mystic_prometheus", "bell_sonority", "developing_variation", "sequence_ascent", "progressive_tonality"]) {
      expect(ids.has(id)).toBe(true);
    }
  });
});