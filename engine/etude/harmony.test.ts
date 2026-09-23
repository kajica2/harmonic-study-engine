/**
 * engine/etude/harmony.test.ts - PRD-001 Phase 3 Slice 1 (test plan 1).
 *
 * Node-env, colocated, invisible to the tests/ drift gate. Pins the
 * D21 grammar against EVERY shipped-profile token and the generator
 * contract (startOn/endOn/filter/requireChromaticism/drop2).
 */

import { describe, it, expect } from "vitest";
import {
  parseNumeral,
  numeralInfo,
  generateProgression,
  spellChordName,
  filterTemplates,
  MODE_OFFSETS,
} from "./harmony";
import { createRng } from "../core/rng";
import { allStyleProfiles } from "../styles/index";
import type { StyleProfile } from "../styles/types";
import type { EtudeConstraints, EtudeMode } from "./types";

function constraints(over: Partial<EtudeConstraints> = {}): EtudeConstraints {
  return {
    version: 1,
    styleId: "jazz",
    key: 0,
    mode: "major",
    difficulty: 3,
    bars: 8,
    tempo: null,
    seed: 42,
    harmony: {
      allowedQualities: null,
      allowedNumerals: null,
      startOn: null,
      endOn: null,
      requireChromaticism: false,
    },
    melody: { maxIntervalSemitones: null, chordTonesOnStrongBeats: false, range: null },
    rhythm: { straightRhythmsOnly: false },
    ...over,
  };
}

function gen(c: EtudeConstraints, profile: StyleProfile, seed = c.seed) {
  return generateProgression({ profile, constraints: c, rng: createRng(seed) });
}

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

describe("D21 numeral grammar", () => {
  it("parses EVERY vocabulary + progression token of all shipped profiles, both modes", () => {
    const tokens = new Set<string>();
    for (const p of allStyleProfiles()) {
      for (const v of p.harmony.vocabulary) tokens.add(v.numeral);
      for (const prog of p.harmony.progressions) for (const t of prog) tokens.add(t);
    }
    expect(tokens.size).toBeGreaterThan(0);
    for (const token of tokens) {
      for (const mode of ["major", "minor"] as EtudeMode[]) {
        expect(parseNumeral(token, mode), `${token}/${mode}`).not.toBeNull();
      }
    }
  });

  it("resolves the D21 quality table (case + suffix -> family)", () => {
    expect(parseNumeral("V7", "major")!.qualitySymbol).toBe("dom7");
    expect(parseNumeral("ii7", "major")!.qualitySymbol).toBe("m7");
    expect(parseNumeral("ii7(b5)", "major")!.qualitySymbol).toBe("halfdim");
    expect(parseNumeral("V7alt", "major")!.qualitySymbol).toBe("alt");
    expect(parseNumeral("viio", "major")!.qualitySymbol).toBe("dim");
    expect(parseNumeral("Imaj7", "major")!.qualitySymbol).toBe("maj7");
  });

  it("maps degree -> scale offset per mode; b/# shift by one", () => {
    expect(parseNumeral("IV", "major")!.rootOffsetSemitones).toBe(5);
    expect(parseNumeral("iv", "minor")!.rootOffsetSemitones).toBe(5);
    expect(parseNumeral("bII7", "major")!.rootOffsetSemitones).toBe(1);
    expect(parseNumeral("bVII7", "major")!.rootOffsetSemitones).toBe(10);
    expect(parseNumeral("#iv", "major")!.rootOffsetSemitones).toBe(6);
  });

  it("rejects tokens outside the grammar (never throws)", () => {
    for (const bad of ["", "X", "IIII", "iV", "vimaj7", "Im7", "b", "7", "vii#7"]) {
      expect(parseNumeral(bad, "major"), bad).toBeNull();
      expect(numeralInfo(bad) === null || parseNumeral(bad, "major") === null).toBe(true);
    }
    // vii + 7(b5) IS legal grammar (lowercase halfdim) - not a rejection.
    expect(parseNumeral("vii7(b5)", "major")!.qualitySymbol).toBe("halfdim");
  });
});

describe("generateProgression", () => {
  const jazz = allStyleProfiles().find((p) => p.id === "jazz") as StyleProfile;
  const pop = allStyleProfiles().find((p) => p.id === "pop") as StyleProfile;
  const classical = allStyleProfiles().find((p) => p.id === "classical") as StyleProfile;

  it("emits exactly `bars` chords, ascending bar index", () => {
    for (const bars of [4, 8, 16, 32]) {
      const chords = gen(constraints({ bars }), jazz);
      expect(chords.length).toBe(bars);
      chords.forEach((c, i) => expect(c.bar).toBe(i));
    }
  });

  // Seed x difficulty sweep for the startOn/endOn protection tests.
  // A single seed per difficulty survived the mutation that removed the
  // locked-bar guard (the random passes only overwrite a bar when their
  // gate fires), so the sweep is deliberately wide: 11 seeds x 5
  // difficulties = 55 draws per locked end, with 2-3 independent
  // overwrite gates (secondary-dominant / modal-interchange / tritone)
  // per bar - the protection-removal mutation cannot survive this.
  const LOCK_SEEDS = [1, 2, 3, 7, 11, 23, 42, 99, 1234, 31337, 65535] as const;
  const LOCK_DIFFICULTIES = [1, 2, 3, 4, 5] as const;

  it("honors endOn at every difficulty across a seed sweep (REQ-ETU-13)", () => {
    for (const seed of LOCK_SEEDS) {
      for (const d of LOCK_DIFFICULTIES) {
        const chords = gen(constraints({ difficulty: d, seed, harmony: {
          allowedQualities: null, allowedNumerals: null, startOn: null, endOn: "IV", requireChromaticism: false,
        } }), jazz, seed);
        expect(chords[chords.length - 1].numeral, `seed=${seed} d=${d}`).toBe("IV");
        expect(chords[chords.length - 1].rootPc, `seed=${seed} d=${d} root`).toBe(5);
      }
    }
  });

  it("honors startOn (bar 0 forced) at every difficulty across a seed sweep", () => {
    for (const seed of LOCK_SEEDS) {
      for (const d of LOCK_DIFFICULTIES) {
        const chords = gen(constraints({ difficulty: d, seed, harmony: {
          allowedQualities: null, allowedNumerals: null, startOn: "vi7", endOn: null, requireChromaticism: false,
        } }), jazz, seed);
        expect(chords[0].numeral, `seed=${seed} d=${d}`).toBe("vi7");
        expect(chords[0].rootPc, `seed=${seed} d=${d} root`).toBe(9);
      }
    }
  });

  it("startOn AND endOn together hold across the seed sweep", () => {
    for (const seed of LOCK_SEEDS) {
      for (const d of LOCK_DIFFICULTIES) {
        const chords = gen(constraints({ difficulty: d, seed, harmony: {
          allowedQualities: null, allowedNumerals: null, startOn: "vi7", endOn: "IV", requireChromaticism: false,
        } }), jazz, seed);
        expect(chords[0].numeral, `seed=${seed} d=${d} start`).toBe("vi7");
        expect(chords[chords.length - 1].numeral, `seed=${seed} d=${d} end`).toBe("IV");
      }
    }
  });

  it("respects allowedNumerals filter, or throws RangeError when it empties the pool", () => {
    const keep = ["ii7", "V7", "Imaj7"];
    const chords = gen(constraints({ harmony: {
      allowedQualities: null, allowedNumerals: keep, startOn: null, endOn: null, requireChromaticism: false,
    } }), jazz);
    for (const c of chords) {
      const info = numeralInfo(c.numeral) as { accidental: string; degree: number };
      const bare = info.accidental + ["I", "II", "III", "IV", "V", "VI", "VII"][info.degree - 1].toLowerCase();
      expect(keep.includes(c.numeral) || keep.includes(bare), c.numeral).toBe(true);
    }
    // A filter that excludes every jazz template -> RangeError.
    expect(() => gen(constraints({ harmony: {
      allowedQualities: null, allowedNumerals: ["bIII"], startOn: null, endOn: null, requireChromaticism: false,
    } }), jazz)).toThrow(RangeError);
    expect(filterTemplates(jazz, constraints({ harmony: {
      allowedQualities: null, allowedNumerals: ["bIII"], startOn: null, endOn: null, requireChromaticism: false,
    } }))).toHaveLength(0);
  });

  it("requireChromaticism guarantees >= 1 non-diatonic chord", () => {
    const offsets = MODE_OFFSETS.major;
    for (let seed = 1; seed <= 15; seed++) {
      const chords = gen(constraints({ harmony: {
        allowedQualities: null, allowedNumerals: null, startOn: null, endOn: null, requireChromaticism: true,
      } }), jazz, seed);
      const chromatic = chords.filter((c) => !offsets.includes(mod12(c.rootPc - 0)));
      expect(chromatic.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("drop2 spread present for jazz, close for pop/classical", () => {
    const jazzChords = gen(constraints({}), jazz, 7);
    const tetrads = jazzChords.filter((c) => c.notes.length === 4);
    expect(tetrads.length).toBeGreaterThan(0);
    expect(tetrads.some((c) => c.notes[3] - c.notes[2] >= 7)).toBe(true);

    for (const profile of [pop, classical]) {
      for (let seed = 1; seed <= 10; seed++) {
        for (const c of gen(constraints({ styleId: profile.id }), profile, seed)) {
          if (c.notes.length === 4) {
            expect(c.notes[3] - c.notes[2]).toBeLessThan(7); // never spread
          }
        }
      }
    }
  });

  it("difficulty 5 produces >= as many 9ths/alts as difficulty 1 (fixed seed)", () => {
    const rich = (d: 1 | 5): number =>
      gen(constraints({ difficulty: d }), jazz, 99).filter(
        (c) => c.qualitySymbol.includes("9") || c.qualitySymbol === "alt",
      ).length;
    expect(rich(5)).toBeGreaterThanOrEqual(rich(1));
  });
});

describe("spellChordName (D11 spelling)", () => {
  it("uses flats in flat keys, sharps in sharp keys, ties flat", () => {
    expect(spellChordName(2, "m7", 0, "major")).toBe("Dm7"); // C major
    expect(spellChordName(1, "dom7", 0, "major")).toBe("Db7"); // tie flat
    expect(spellChordName(10, "dom7", 9, "major")).toBe("A#7"); // A major -> sharp side
    expect(spellChordName(3, "maj7", 3, "major")).toBe("Ebmaj7"); // Eb major
    expect(spellChordName(6, "dom7", 6, "minor")).toBe("F#7"); // F# minor (3#)
    expect(spellChordName(10, "dom7", 2, "minor")).toBe("Bb7"); // D minor (1b)
  });
});
