/**
 * engine/pedagogy/concepts.test.ts - PRD-001 Phase 3 Slice 1 (test
 * plan 5, D17 review bar).
 *
 * Pins the concept registry (8 PRD-required + the 2 accompaniment
 * concepts added by Phase 4 Slice 3, D74): REQ-PED-10 coverage,
 * REQ-PED-11 shape
 * (all fields non-empty, kebab ids, category enum, definition <= 160
 * chars), ASCII-only prose, related ids resolve, exampleNumerals parse
 * in the D21 grammar (both modes), JSON round-trip.
 */

import { describe, it, expect } from "vitest";
import { CONCEPT_IDS, getConcept, allConcepts } from "./concepts";
import { parseNumeral } from "../etude/harmony";
import type { Concept, ConceptCategory } from "./types";

const CATEGORIES: readonly ConceptCategory[] = [
  "harmony", "voice-leading", "melody", "form", "rhythm",
];
const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// printable ASCII + newline (paragraph separators); nothing else.
const ASCII_RE = /^[\x20-\x7E\n]*$/;

// D74 (Phase 4 Slice 3): walking-bass + comping appended - additive,
// registry-legal (there is NO count pin; this list is the order pin).
const EXPECTED_IDS = [
  "ii-v-i", "tritone-sub", "secondary-dominant", "modal-interchange",
  "voice-leading", "drop-2", "cadence", "axis-progression",
  "walking-bass", "comping",
];

describe("REQ-PED-10 registry coverage", () => {
  it("ships the 8 PRD concepts + the 2 S3 accompaniment concepts, in registry order", () => {
    expect([...CONCEPT_IDS]).toEqual(EXPECTED_IDS);
    expect(allConcepts().map((c) => c.id)).toEqual(EXPECTED_IDS);
  });

  it("getConcept resolves and never throws; unknown -> null", () => {
    for (const id of EXPECTED_IDS) expect(getConcept(id)).not.toBeNull();
    expect(getConcept("nope")).toBeNull();
    expect(getConcept("")).toBeNull();
  });
});

describe("REQ-PED-11 shape (conceptShapeValid bar)", () => {
  const concepts = allConcepts();

  it("ids are unique and kebab-case", () => {
    const ids = concepts.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of concepts) expect(c.id).toMatch(KEBAB_RE);
  });

  it("every field is populated per spec", () => {
    for (const c of concepts) {
      expect(c.version).toBe(1);
      expect(c.title.length).toBeGreaterThan(0);
      expect(CATEGORIES).toContain(c.category);
      expect(c.definition.length).toBeGreaterThan(0);
      expect(c.definition.length).toBeLessThanOrEqual(160);
      expect(c.body.length).toBeGreaterThan(0);
      // 150-word floor: pedagogy bodies must be substantive (D17).
      expect(c.body.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(100);
      expect(c.references === null || (Array.isArray(c.references) && c.references.every((r) => r.length > 0))).toBe(true);
      expect(c.related === null || (Array.isArray(c.related) && c.related.length > 0)).toBe(true);
      expect(c.exampleNumerals === null || (Array.isArray(c.exampleNumerals) && c.exampleNumerals.length > 0)).toBe(true);
    }
  });

  it("prose is ASCII-only (no smart quotes, no degree glyphs)", () => {
    for (const c of concepts) {
      for (const field of [c.title, c.definition, c.body, ...(c.references ?? []), ...(c.related ?? []), ...(c.exampleNumerals ?? [])]) {
        expect(field, `${c.id}: ${field.slice(0, 30)}`).toMatch(ASCII_RE);
      }
    }
  });

  it("related ids resolve to real concepts", () => {
    for (const c of concepts) {
      for (const rel of c.related ?? []) {
        expect(getConcept(rel), `${c.id} -> ${rel}`).not.toBeNull();
      }
    }
  });

  it("exampleNumerals parse in the D21 grammar in BOTH modes", () => {
    for (const c of concepts) {
      for (const token of c.exampleNumerals ?? []) {
        expect(parseNumeral(token, "major"), `${c.id}: ${token}/major`).not.toBeNull();
        expect(parseNumeral(token, "minor"), `${c.id}: ${token}/minor`).not.toBeNull();
      }
    }
  });

  it("JSON round-trips losslessly (plain data)", () => {
    for (const c of concepts) {
      const back = JSON.parse(JSON.stringify(c)) as Concept;
      expect(back).toEqual(c);
    }
  });
});
