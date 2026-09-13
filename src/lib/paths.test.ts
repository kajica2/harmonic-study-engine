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
 *  - The 7 Phase 3 concept paths (LV–LXI) exist with correct metadata
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
    // PATHS is the curated set + concept paths; STUDIES_PATHS is the
    // masterclass deep-dive block (Solar, Cherokee, …). ALL_PATHS is the
    // union — the practice-session player uses it for the full catalog.
    expect(ALL_PATHS.length).toBe(PATHS.length + STUDIES_PATHS.length);
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

describe("Phase 1 persona signature paths (XXXVIII–LIV)", () => {
  // id → expected composer (cross-checks path identity)
  const PERSONA_PATHS: Array<{ id: string; composer: string; title: string }> = [
    { id: "prometheus_flame",    composer: "A. Scriabin",           title: "Path XXXVIII: The Flame" },
    { id: "prelude_chord",       composer: "S. Rachmaninov",        title: "Path XXXIX: The Prelude Chord" },
    { id: "symphony_theme",      composer: "J. Brahms",             title: "Path XL: The Theme and Variations" },
    { id: "siren",               composer: "P. I. Tchaikovsky",     title: "Path XLI: The Siren" },
    { id: "adagio",              composer: "G. Mahler",             title: "Path XLII: The Adagio" },
    { id: "giant_steps_cycle",   composer: "J. Coltrane",           title: "Path XLIII: The Cycle" },
    { id: "invention_1",         composer: "J.S. Bach",             title: "Path XLIV: The Invention" },
    { id: "whole_tone_study",    composer: "C. Debussy",            title: "Path XLV: The Whole-Tone Garden" },
    { id: "ambient_field",       composer: "B. Eno",                title: "Path XLVI: The Ambient Field" },
    { id: "koyaanisqatsi_ostinato", composer: "P. Glass",            title: "Path XLVII: The Koyaanisqatsi Ostinato" },
    { id: "monk_stab",           composer: "T. Monk",               title: "Path XLVIII: The Monk Stab" },
    { id: "so_what_vamp",        composer: "M. Davis",              title: "Path XLIX: So What Vamp" },
    { id: "my_funny_valentine",  composer: "R. Rodgers / L. Hart",  title: "Path L: My Funny Valentine" },
    { id: "salt_peanuts_figure", composer: "K. Clarke / T. Monk (attrib.)", title: "Path LI: Salt Peanuts Figure" },
    { id: "red_clay_changes",    composer: "F. Hubbard",            title: "Path LII: Red Clay Changes" },
    { id: "footprints_vamp",     composer: "W. Shorter",            title: "Path LIII: Footprints Vamp" },
    { id: "color_shape_study",   composer: "W. Kandinsky (synth)",  title: "Path LIV: Color Shapes" },
  ];

  it("all 17 persona signature paths exist in PATHS", () => {
    for (const { id, title } of PERSONA_PATHS) {
      const p = PATHS.find((x) => x.id === id);
      expect(p, `path '${id}' missing from PATHS`).toBeDefined();
      expect(p!.title).toBe(title);
    }
  });

  it("every persona signature path declares composer / key / feel", () => {
    for (const { id, composer } of PERSONA_PATHS) {
      const p = PATHS.find((x) => x.id === id)!;
      expect(typeof p.composer).toBe("string");
      expect(p.composer!.length).toBeGreaterThan(0);
      expect(p.composer).toBe(composer);
      expect(typeof p.key).toBe("string");
      expect(p.key!.length).toBeGreaterThan(0);
      expect(typeof p.feel).toBe("string");
      expect(p.feel!.length).toBeGreaterThan(0);
    }
  });

  it("every persona signature path has >= 4 steps with valid MIDI notes", () => {
    for (const { id } of PERSONA_PATHS) {
      const p = PATHS.find((x) => x.id === id)!;
      expect(p.steps.length).toBeGreaterThanOrEqual(4);
      const first = p.steps[0];
      expect(first.notes.length).toBeGreaterThan(0);
      for (const n of first.notes) {
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(127);
      }
    }
  });

  it("all 17 persona signature ids are unique", () => {
    const ids = PERSONA_PATHS.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Also confirm no collision with the existing 13 PATHS.
    const allIds = PATHS.map((p) => p.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("Tchaikovsky's siren path has sequenceStepper=true and sequenceInterval=-1 (descending)", () => {
    const p = PATHS.find((x) => x.id === "siren")!;
    expect((p as any).sequenceStepper).toBe(true);
    expect((p as any).sequenceInterval).toBe(-1);
  });

  it("Mahler's adagio path declares key drift with arrow (F minor → Ab major)", () => {
    const p = PATHS.find((x) => x.id === "adagio")!;
    expect(p.key).toBeDefined();
    expect(p.key!.includes("\u2192")).toBe(true);
  });

  it("Miles's so_what_vamp carries bassIsolation marker for the persona", () => {
    const p = PATHS.find((x) => x.id === "so_what_vamp")! as any;
    // bassIsolation is the persona-side rule. We mirror it on the path so
    // bar-strip markers / test introspection see a single source of truth.
    expect(p.bassIsolation).toBe(true);
  });
});

describe("Phase 3 concept paths (LV–LXI)", () => {
  const CONCEPT_IDS = [
    "ii_v_i_walk",
    "tritone_sub_walk",
    "coltrane_changes_demo",
    "rhythm_changes_demo",
    "bird_blues",
    "modal_vamp_demo",
    "backdoor_ii_v_demo",
  ];

  it("all 7 concept paths exist in PATHS", () => {
    for (const id of CONCEPT_IDS) {
      const p = PATHS.find((x) => x.id === id);
      expect(p, `concept path '${id}' missing`).toBeDefined();
    }
  });

  it("all 7 concept path ids are unique across PATHS", () => {
    const ids = PATHS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of CONCEPT_IDS) {
      expect(ids.filter((x) => x === id).length).toBe(1);
    }
  });

  it("every concept path declares composer, key, feel, and at least one technique tag", () => {
    for (const id of CONCEPT_IDS) {
      const p = PATHS.find((x) => x.id === id)!;
      expect(typeof p.composer, `composer missing on ${id}`).toBe("string");
      expect(p.composer!.length).toBeGreaterThan(0);
      expect(typeof p.key, `key missing on ${id}`).toBe("string");
      expect(p.key!.length).toBeGreaterThan(0);
      expect(typeof p.feel, `feel missing on ${id}`).toBe("string");
      expect(p.feel!.length).toBeGreaterThan(0);
      expect(Array.isArray((p as any).techniques), `techniques missing on ${id}`).toBe(true);
      expect((p as any).techniques.length).toBeGreaterThan(0);
    }
  });

  it("every concept path step has notes in valid MIDI range (0..127)", () => {
    for (const id of CONCEPT_IDS) {
      const p = PATHS.find((x) => x.id === id)!;
      expect(p.steps.length).toBeGreaterThanOrEqual(4);
      const first = p.steps[0];
      expect(first.notes.length).toBeGreaterThan(0);
      for (const n of first.notes) {
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(127);
      }
      // Spot-check the last step too so we know the full path is in range.
      const last = p.steps[p.steps.length - 1];
      for (const n of last.notes) {
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(127);
      }
    }
  });

  it("ii_v_i_walk has 36 source steps (9 bars × 4 beats)", () => {
    const p = PATHS.find((x) => x.id === "ii_v_i_walk")!;
    expect(p.steps.length).toBeGreaterThanOrEqual(36);
    // After padPath cycles to MIN_PATH_BARS = 24 bars (=96 steps), the
    // first 36 source steps must still be the declared cadence.
    expect(p.steps[0].name).toBe("Dm7");
    expect(p.steps[1].name).toBe("G7");
    expect(p.steps[2].name).toBe("Cmaj7");
    expect(p.steps[3].name).toBe("Cmaj7");
    // Final cadence lands on Bb major.
    expect(p.steps[35].name).toBe("Bbmaj7");
  });

  it("tritone_sub_walk has 32 source steps (8 bars × 4 beats)", () => {
    const p = PATHS.find((x) => x.id === "tritone_sub_walk")!;
    expect(p.steps.length).toBeGreaterThanOrEqual(32);
    expect(p.steps[0].name).toBe("Dm7");
    expect(p.steps[1].name).toBe("Db7"); // the tritone sub
    expect(p.steps[2].name).toBe("Cmaj7");
    // Bar 8: Fm7 → E7 → Ebmaj7 → Ebmaj7 (indices 28-31)
    expect(p.steps[28].name).toBe("Fm7");
    expect(p.steps[29].name).toBe("E7");
    expect(p.steps[30].name).toBe("Ebmaj7");
    expect(p.steps[31].name).toBe("Ebmaj7");
  });

  it("coltrane_changes_demo declares sliceAndRepeat=true", () => {
    const p = PATHS.find((x) => x.id === "coltrane_changes_demo")! as any;
    expect(p.sliceAndRepeat).toBe(true);
    expect(p.steps.length).toBeGreaterThanOrEqual(16);
    // First bar cycles B → G → Eb → B.
    expect(p.steps[0].name).toBe("Bmaj7");
    expect(p.steps[1].name).toBe("G7");
    expect(p.steps[2].name).toBe("Ebmaj7");
    expect(p.steps[3].name).toBe("Bmaj7");
  });

  it("rhythm_changes_demo has 32 source steps (8 bars × 4 beats)", () => {
    const p = PATHS.find((x) => x.id === "rhythm_changes_demo")!;
    expect(p.steps.length).toBeGreaterThanOrEqual(32);
    expect(p.steps[0].name).toBe("Bbmaj7");
    expect(p.steps[1].name).toBe("G7");
    expect(p.steps[2].name).toBe("Cm7");
    expect(p.steps[3].name).toBe("F7");
    // Bridge turnaround: Dm7b5 sits at index 27, G7alt at 28.
    expect(p.steps[27].name).toBe("Dm7b5");
    expect(p.steps[28].name).toBe("G7alt");
  });

  it("bird_blues has 12 source steps (3 bars × 4 beats)", () => {
    const p = PATHS.find((x) => x.id === "bird_blues")!;
    expect(p.steps.length).toBeGreaterThanOrEqual(12);
    expect(p.steps[0].name).toBe("Bbmaj7");
    expect(p.steps[2].name).toBe("Bbm7");
    expect(p.steps[3].name).toBe("Eb7");
    // Bar 3 closes the form back on I.
    expect(p.steps[11].name).toBe("Bbmaj7");
  });

  it("modal_vamp_demo has 8 source steps (2 bars × 4 beats)", () => {
    const p = PATHS.find((x) => x.id === "modal_vamp_demo")!;
    expect(p.steps.length).toBeGreaterThanOrEqual(8);
    expect(p.steps[0].name).toBe("Dm7");
    expect(p.steps[3].name).toBe("Dm7"); // held for whole Dorian bar
    expect(p.steps[4].name).toBe("G7");
    expect(p.steps[7].name).toBe("G7"); // held for whole Mixolydian bar
  });

  it("backdoor_ii_v_demo has 8 source steps (2 bars × 4 beats)", () => {
    const p = PATHS.find((x) => x.id === "backdoor_ii_v_demo")!;
    expect(p.steps.length).toBeGreaterThanOrEqual(8);
    // Bar 1: standard ii-V-i with Eb7.
    expect(p.steps[0].name).toBe("Cm7");
    expect(p.steps[1].name).toBe("Eb7");
    expect(p.steps[2].name).toBe("Fm7");
    // Bar 2: backdoor bVII7 → i with Db7.
    expect(p.steps[4].name).toBe("Cm7");
    expect(p.steps[5].name).toBe("Db7");
    expect(p.steps[6].name).toBe("Fm7");
  });
});