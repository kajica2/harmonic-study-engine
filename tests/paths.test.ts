/**
 * Paths catalog — invariants every HarmonicPath in PATHS / STUDIES_PATHS /
 * ALL_PATHS must satisfy. These are the kinds of things the UI silently
 * breaks on if violated (rendering blanks, score exports with zero
 * notes, voice-leading that crashes on a missing target).
 */

import { describe, it, expect } from "vitest";
import { ALL_PATHS, PATHS, STUDIES_PATHS } from "../src/lib/paths";

describe("HarmonicPath catalog invariants", () => {
  it("PATHS, STUDIES_PATHS, and ALL_PATHS are all defined", () => {
    expect(Array.isArray(PATHS)).toBe(true);
    expect(Array.isArray(STUDIES_PATHS)).toBe(true);
    expect(Array.isArray(ALL_PATHS)).toBe(true);
  });

  it("ALL_PATHS is PATHS + STUDIES_PATHS", () => {
    expect(ALL_PATHS.length).toBe(PATHS.length + STUDIES_PATHS.length);
    // First PATHS-N entries match
    expect(ALL_PATHS.slice(0, PATHS.length)).toEqual(PATHS);
  });

  it("every path has a non-empty id, title, and at least one step", () => {
    for (const p of ALL_PATHS) {
      expect(p.id, "path missing id").toBeTruthy();
      expect(p.title, `${p.id} missing title`).toBeTruthy();
      expect(p.steps.length, `${p.id} has zero steps`).toBeGreaterThan(0);
    }
  });

  it("every id is unique across ALL_PATHS", () => {
    const ids = new Set<string>();
    for (const p of ALL_PATHS) {
      expect(ids.has(p.id), `duplicate id ${p.id}`).toBe(false);
      ids.add(p.id);
    }
    expect(ids.size).toBe(ALL_PATHS.length);
  });

  it("every step has non-empty notes (for audio playback)", () => {
    // Steps with empty notes would render as silence in the WAV
    // export and crash voice-leading distance calculation.
    let violations = 0;
    const offenders: string[] = [];
    for (const p of ALL_PATHS) {
      for (let i = 0; i < p.steps.length; i++) {
        const step = p.steps[i];
        if (!Array.isArray(step.notes) || step.notes.length === 0) {
          violations++;
          offenders.push(`${p.id}[${i}] (${step.name})`);
        }
      }
    }
    expect(
      violations,
      `steps with empty notes: ${offenders.join(", ")}`,
    ).toBe(0);
  });

  it("every note is a valid MIDI number (0-127)", () => {
    for (const p of ALL_PATHS) {
      for (let i = 0; i < p.steps.length; i++) {
        const step = p.steps[i];
        for (const note of step.notes) {
          expect(
            Number.isInteger(note) && note >= 0 && note <= 127,
            `${p.id}[${i}].notes contains invalid MIDI: ${note}`,
          ).toBe(true);
        }
      }
    }
  });

  it("every step name is a non-empty string", () => {
    for (const p of ALL_PATHS) {
      for (let i = 0; i < p.steps.length; i++) {
        expect(p.steps[i].name, `${p.id}[${i}] missing name`).toBeTruthy();
      }
    }
  });

  it("every mvpReady path has notes (UI greys out empty paths)", () => {
    // The mvpReady flag tells the UI which paths to highlight.
    // If a path is marked mvpReady but has no notes, the UI
    // shows an empty score. Pin the invariant.
    for (const p of ALL_PATHS) {
      if (!p.mvpReady) continue;
      const totalNotes = p.steps.reduce((n, s) => n + s.notes.length, 0);
      expect(totalNotes, `mvpReady path ${p.id} has zero notes`).toBeGreaterThan(
        0,
      );
    }
  });
});