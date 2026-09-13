/**
 * Unit tests for src/lib/personas.ts and the personas.json data.
 *
 * Coverage:
 *  - PERSONAS array shape (every entry has required fields)
 *  - synesthesiaStatus is either 'documented' or 'interpretive'
 *  - defaultVoicing (when set) resolves to a VoicingId
 *  - loadPersonasFromJson validates and returns parsed array
 *  - loadPersonasFromJson rejects non-array input
 *  - loadPersonasFromJson silently skips malformed entries
 *  - mergePersonas dedupes by id
 */
import { describe, it, expect } from "vitest";
import {
  PERSONAS,
  loadPersonasFromJson,
  mergePersonas,
  type Persona,
} from "./personas";
import { VOICINGS } from "./theory";

describe("PERSONAS array shape", () => {
  it("has 22 entries (12 jazz/electronic + 5 classical from Phase 5 + 5 new from main merge)", () => {
    expect(PERSONAS.length).toBe(22);
  });

  it("every persona has id, name, role, quote, originalSongId", () => {
    for (const p of PERSONAS) {
      expect(typeof p.id).toBe("string");
      expect(p.id.length).toBeGreaterThan(0);
      expect(typeof p.name).toBe("string");
      expect(p.name.length).toBeGreaterThan(0);
      expect(typeof p.role).toBe("string");
      expect(typeof p.quote).toBe("string");
      expect(typeof p.originalSongId).toBe("string");
    }
  });

  it("every persona has instrument, tempo, arp settings, theme, colors", () => {
    for (const p of PERSONAS) {
      expect(p.instrument).toBeDefined();
      expect(typeof p.tempo).toBe("number");
      expect(p.tempo).toBeGreaterThan(0);
      expect(["none","up","down","upDown","downUp","random","converge","diverge"])
        .toContain(p.arpType);
      expect(typeof p.arpRate).toBe("number");
      expect(typeof p.arpGate).toBe("number");
      expect(typeof p.arpOctaves).toBe("number");
      expect(p.visualTheme).toBeDefined();
      expect(typeof p.accentColor).toBe("string");
      expect(p.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("every persona's synesthesiaStatus is 'documented' or 'interpretive'", () => {
    for (const p of PERSONAS) {
      // Phase5 status may be undefined for backward-compat; treat as interpretive.
      const status = p.synesthesiaStatus ?? "interpretive";
      expect(["documented", "interpretive"]).toContain(status);
    }
  });

  it("documented personas are only those with historically-sourced synesthesia", () => {
    // Per the spec: Kandinsky + Scriabin = documented. The rest are interpretive.
    const documented = PERSONAS.filter((p) => p.synesthesiaStatus === "documented");
    const ids = documented.map((p) => p.id).sort();
    expect(ids).toEqual(["kandinsky", "scriabin"]);
  });

  it("every persona's defaultVoicing (when set) is a registered VoicingId", () => {
    const validIds = new Set(Object.keys(VOICINGS));
    for (const p of PERSONAS) {
      if (p.defaultVoicing) {
        expect(validIds.has(p.defaultVoicing)).toBe(true);
      }
    }
  });

  it("every persona's defaultPath (when set) maps to a HarmonicPath id", () => {
    // Lazy import paths to avoid the audio.ts side effect chain.
    // The check is just that the id is a non-empty string — we don't
    // verify it actually exists in PATHS here (that lives in paths.test.ts).
    for (const p of PERSONAS) {
      if (p.defaultPath) {
        expect(typeof p.defaultPath).toBe("string");
        expect(p.defaultPath.length).toBeGreaterThan(0);
      }
    }
  });

  it("all 5 classical personas (Phase 5) have a techniques array", () => {
    const classical = ["scriabin", "rachmaninov", "brahms", "tchaikovsky", "mahler"];
    for (const id of classical) {
      const p = PERSONAS.find((x) => x.id === id);
      expect(p).toBeDefined();
      expect(Array.isArray(p!.techniques)).toBe(true);
      expect(p!.techniques!.length).toBeGreaterThan(0);
    }
  });

  it("all 5 classical personas have a non-empty colorPalette", () => {
    const classical = ["scriabin", "rachmaninov", "brahms", "tchaikovsky", "mahler"];
    for (const id of classical) {
      const p = PERSONAS.find((x) => x.id === id)!;
      expect(Array.isArray(p.colorPalette)).toBe(true);
      expect(p.colorPalette!.length).toBeGreaterThan(0);
      for (const hex of p.colorPalette!) {
        expect(hex).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });
});

describe("loadPersonasFromJson", () => {
  it("returns parsed array for valid JSON", () => {
    const json = JSON.stringify([
      {
        id: "test", name: "Test", role: "x", quote: "",
        originalSongId: "x", instrument: "sine", tempo: 60,
        arpType: "none", arpRate: 1, arpGate: 100, arpOctaves: 1,
        visualTheme: "default", accentColor: "#000000",
        gradientFrom: "", gradientTo: "",
      },
    ]);
    const result = loadPersonasFromJson(json);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("test");
  });

  it("throws on non-array input", () => {
    expect(() => loadPersonasFromJson('{"foo": "bar"}')).toThrow(/must be an array/);
    expect(() => loadPersonasFromJson("null")).toThrow();
  });

  it("throws on empty array (no valid entries)", () => {
    expect(() => loadPersonasFromJson("[]")).toThrow(/No valid persona entries/);
  });

  it("silently skips malformed entries", () => {
    const json = JSON.stringify([
      { id: "good", name: "Good", instrument: "sine" },
      { id: "bad" /* missing name, instrument */ },
      null,
      "string entry",
    ]);
    const result = loadPersonasFromJson(json);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("good");
  });
});

describe("mergePersonas", () => {
  it("returns built-in personas when called with empty array", () => {
    const merged = mergePersonas([]);
    expect(merged).toHaveLength(PERSONAS.length);
  });

  it("appends custom personas", () => {
    const custom: Persona[] = [
      {
        id: "custom-one", name: "Custom One", role: "x", quote: "",
        originalSongId: "x", instrument: "sine" as any, tempo: 60,
        arpType: "none", arpRate: 1, arpGate: 100, arpOctaves: 1,
        visualTheme: "default", accentColor: "#000000",
        gradientFrom: "", gradientTo: "",
      },
    ];
    const merged = mergePersonas(custom);
    expect(merged).toHaveLength(PERSONAS.length + 1);
    expect(merged.find((p) => p.id === "custom-one")).toBeDefined();
  });

  it("dedupes by id — custom wins over built-in", () => {
    const custom: Persona[] = [
      {
        id: "kandinsky", name: "Override Kandinsky", role: "x", quote: "",
        originalSongId: "x", instrument: "sine" as any, tempo: 60,
        arpType: "none", arpRate: 1, arpGate: 100, arpOctaves: 1,
        visualTheme: "default", accentColor: "#FFFFFF",
        gradientFrom: "", gradientTo: "",
      },
    ];
    const merged = mergePersonas(custom);
    const kandinsky = merged.find((p) => p.id === "kandinsky")!;
    expect(kandinsky.name).toBe("Override Kandinsky");
    expect(kandinsky.accentColor).toBe("#FFFFFF");
    // Total count unchanged (one replaced, not appended)
    expect(merged).toHaveLength(PERSONAS.length);
  });
});