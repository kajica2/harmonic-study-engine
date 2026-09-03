/**
 * Personas catalog — invariants every entry in PERSONAS must satisfy.
 * Source of truth is src/data/personas.json; this pins the contract
 * so a malformed JSON edit fails the test suite, not a random
 * production request.
 */

import { describe, it, expect } from "vitest";
import { PERSONAS } from "../src/lib/personas";
import { ALL_PATHS } from "../src/lib/paths";
import { InstrumentType } from "../src/lib/audio";

const VALID_INSTRUMENTS: ReadonlySet<InstrumentType> = new Set([
  "trumpet",
  "epiano",
  "sine",
  "pad",
  "pluck",
  "guitar",
  "sax",
]);

const VALID_ARP_TYPES = new Set([
  "none",
  "up",
  "down",
  "upDown",
  "downUp",
  "random",
  "converge",
  "diverge",
]);

describe("Personas catalog invariants", () => {
  it("every persona has a non-empty id, name, and quote", () => {
    for (const p of PERSONAS) {
      expect(p.id, "persona missing id").toBeTruthy();
      expect(p.name, `${p.id} missing name`).toBeTruthy();
      expect(p.quote, `${p.id} missing quote`).toBeTruthy();
    }
  });

  it("every persona id is unique", () => {
    const ids = new Set<string>();
    for (const p of PERSONAS) {
      expect(ids.has(p.id), `duplicate persona id: ${p.id}`).toBe(false);
      ids.add(p.id);
    }
    expect(ids.size).toBe(PERSONAS.length);
  });

  it("every persona's originalSongId references a real path", () => {
    const pathIds = new Set(ALL_PATHS.map((p) => p.id));
    for (const p of PERSONAS) {
      expect(
        pathIds.has(p.originalSongId),
        `persona ${p.id} references missing path ${p.originalSongId}`,
      ).toBe(true);
    }
  });

  it("every persona's instrument is a known InstrumentType", () => {
    for (const p of PERSONAS) {
      expect(
        VALID_INSTRUMENTS.has(p.instrument as InstrumentType),
        `persona ${p.id} has unknown instrument "${p.instrument}"`,
      ).toBe(true);
    }
  });

  it("every persona's arpType is a known value", () => {
    for (const p of PERSONAS) {
      expect(
        VALID_ARP_TYPES.has(p.arpType),
        `persona ${p.id} has unknown arpType "${p.arpType}"`,
      ).toBe(true);
    }
  });

  it("every persona has a sensible tempo (40-240 BPM)", () => {
    // Range matches the tempo slider bounds used elsewhere. A
    // persona with tempo=0 or tempo=300 is almost certainly a
    // data entry error.
    for (const p of PERSONAS) {
      expect(
        p.tempo >= 40 && p.tempo <= 240,
        `persona ${p.id} has implausible tempo ${p.tempo}`,
      ).toBe(true);
    }
  });

  it("every persona has a 6-digit hex accentColor", () => {
    for (const p of PERSONAS) {
      expect(
        /^#[0-9A-Fa-f]{6}$/.test(p.accentColor),
        `persona ${p.id} accentColor "${p.accentColor}" is not #RRGGBB`,
      ).toBe(true);
    }
  });

  it("tagline is optional but bounded when present", () => {
    // A persona tagline is rendered as a single-line italic span
    // in the masterclass rail. Longer than ~60 chars wraps badly.
    for (const p of PERSONAS) {
      if (p.tagline === undefined) continue;
      expect(
        p.tagline.length <= 60,
        `persona ${p.id} tagline is ${p.tagline.length} chars (max 60)`,
      ).toBe(true);
    }
  });
});

describe("Personas catalog — recently added", () => {
  it("includes Nina Simone (closes the vocalist gap)", () => {
    const simone = PERSONAS.find((p) => p.id === "simone");
    expect(simone, "simone persona missing").toBeDefined();
    expect(simone!.originalSongId).toBe("path-6"); // Chopin — classical training
    expect(simone!.instrument).toBe("epiano"); // she was a pianist first
    expect(simone!.arpType).toBe("random"); // non-architectural phrasing
  });

  it("includes Augusto Novaro (sight-reading drill sergeant)", () => {
    const novo = PERSONAS.find((p) => p.id === "novaro");
    expect(novo, "novaro persona missing").toBeDefined();
    expect(novo!.originalSongId).toBe("path-3"); // chromatic descent
    expect(novo!.instrument).toBe("trumpet");
    expect(novo!.arpType).toBe("none"); // pure melody lines, no arpeggios
  });
});