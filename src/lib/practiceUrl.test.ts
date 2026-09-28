/**
 * src/lib/practiceUrl.test.ts - PRD-001 Phase 8 S1 (D145, doc 6.1).
 *
 * Node project (pure logic, no DOM). 14 pins: serialize laws (the
 * etu-* ADR-015 interaction, the format gate, the bpm default/domain
 * gate, the persona/voicing default deletes), the presence map (raw
 * params.has - the composeUrl :244-249 lesson), and parse (absent ->
 * ALL null never defaults, the field-wise law; clamp; etu rejection;
 * injected-list membership; full-domain round-trip identity).
 */

import { describe, it, expect } from "vitest";
import {
  PRACTICE_URL_KEYS,
  PRACTICE_URL_DEFAULTS,
  practiceUrlPresence,
  parsePracticeParams,
  serializePractice,
  type PracticeStateIn,
} from "./practiceUrl";

const PERSONAS = ["bach", "coltrane", "monk"];
const VOICINGS = ["closed", "drop2", "quartal"];

function state(over: Partial<PracticeStateIn> = {}): PracticeStateIn {
  return { pathId: "study-solar", bpm: 132, personaId: "coltrane", voicingId: "drop2", ...over };
}

describe("serializePractice (D145 laws)", () => {
  it("the key set is exactly path/bpm/persona/voicing", () => {
    expect(PRACTICE_URL_KEYS).toEqual(["path", "bpm", "persona", "voicing"]);
    expect(Object.keys(serializePractice(state())).sort()).toEqual(
      [...PRACTICE_URL_KEYS].sort(),
    );
  });

  it("an etu-* pathId is DROPPED (generated etudes ride the 13 etude keys - ADR-015)", () => {
    // The exact shipped id shape: etu-etu-<hash> (etudeEngine.ts).
    expect(serializePractice(state({ pathId: "etu-etu-1a2b3c" })).path).toBeNull();
    expect(serializePractice(state({ pathId: "etu-any" })).path).toBeNull();
  });

  it("a format-garbage pathId is dropped (regex gate)", () => {
    expect(serializePractice(state({ pathId: "" })).path).toBeNull();
    expect(serializePractice(state({ pathId: "Study-Solar" })).path).toBeNull();
    expect(serializePractice(state({ pathId: "-lead" })).path).toBeNull();
    expect(serializePractice(state({ pathId: "a".repeat(65) })).path).toBeNull();
    // Valid catalog shapes survive.
    expect(serializePractice(state({ pathId: "path-7" })).path).toBe("path-7");
    expect(serializePractice(state({ pathId: "study-solar" })).path).toBe("study-solar");
  });

  it("bpm at the shipped default 60 deletes the key", () => {
    expect(serializePractice(state({ bpm: 60 })).bpm).toBeNull();
    expect(PRACTICE_URL_DEFAULTS.bpm).toBe(60);
  });

  it("bpm 132 writes as-is (string)", () => {
    expect(serializePractice(state({ bpm: 132 })).bpm).toBe("132");
    // Domain edges stay (20 and 400 are the superset bounds).
    expect(serializePractice(state({ bpm: 20 })).bpm).toBe("20");
    expect(serializePractice(state({ bpm: 400 })).bpm).toBe("400");
  });

  it("bpm NaN/0/9999 drop the key (test-plan domain gate)", () => {
    expect(serializePractice(state({ bpm: Number.NaN })).bpm).toBeNull();
    expect(serializePractice(state({ bpm: 0 })).bpm).toBeNull();
    expect(serializePractice(state({ bpm: 9999 })).bpm).toBeNull();
    expect(serializePractice(state({ bpm: 132.5 })).bpm).toBeNull(); // non-integer
  });

  it("persona '' and voicing 'closed' delete their keys", () => {
    expect(serializePractice(state({ personaId: "" })).persona).toBeNull();
    expect(serializePractice(state({ voicingId: "closed" })).voicing).toBeNull();
    expect(PRACTICE_URL_DEFAULTS.voicing).toBe("closed");
    expect(serializePractice(state({ personaId: "monk" })).persona).toBe("monk");
    expect(serializePractice(state({ voicingId: "drop2" })).voicing).toBe("drop2");
  });
});

describe("practiceUrlPresence (HIGH-001 field-wise doctrine)", () => {
  it("presence is the RAW params.has, not parsed-non-default", () => {
    // The composeUrl :244-249 lesson: ?bpm=60 parses to the default
    // but IS present - it must win over a fresher persisted value.
    const p = new URLSearchParams("?bpm=60&path=study-solar");
    expect(practiceUrlPresence(p)).toEqual({
      path: true,
      bpm: true,
      persona: false,
      voicing: false,
    });
    // An empty value still counts as present (has, not truthiness).
    expect(practiceUrlPresence(new URLSearchParams("?persona=")).persona).toBe(true);
  });
});

describe("parsePracticeParams (benign-drop law)", () => {
  it("absent keys parse to ALL null (never defaults - the field-wise law)", () => {
    expect(parsePracticeParams(new URLSearchParams(""), PERSONAS, VOICINGS)).toEqual({
      pathId: null,
      bpm: null,
      personaId: null,
      voicingId: null,
    });
  });

  it("bpm clamped into 20..400 (hand-typed values)", () => {
    expect(parsePracticeParams(new URLSearchParams("?bpm=5000"), PERSONAS, VOICINGS).bpm).toBe(400);
    expect(parsePracticeParams(new URLSearchParams("?bpm=5"), PERSONAS, VOICINGS).bpm).toBe(20);
    expect(parsePracticeParams(new URLSearchParams("?bpm=60"), PERSONAS, VOICINGS).bpm).toBe(60);
  });

  it("malformed values drop SILENTLY (bpm=abc, path garbage, empty persona)", () => {
    const out = parsePracticeParams(
      new URLSearchParams("?bpm=abc&path=BAD%20ID&persona=&voicing="),
      PERSONAS,
      VOICINGS,
    );
    expect(out).toEqual({ pathId: null, bpm: null, personaId: null, voicingId: null });
    expect(parsePracticeParams(new URLSearchParams("?bpm=12.5"), PERSONAS, VOICINGS).bpm).toBeNull();
  });

  it("etu-* pathIds are rejected at PARSE too (a hand-typed ?path=etu-... is absent)", () => {
    expect(
      parsePracticeParams(new URLSearchParams("?path=etu-etu-abc"), PERSONAS, VOICINGS).pathId,
    ).toBeNull();
  });

  it("unknown persona/voicing OUTSIDE the injected lists parse to null; members parse through", () => {
    expect(
      parsePracticeParams(new URLSearchParams("?persona=bogus&voicing=not-a-voicing"), PERSONAS, VOICINGS),
    ).toEqual({ pathId: null, bpm: null, personaId: null, voicingId: null });
    const ok = parsePracticeParams(
      new URLSearchParams("?persona=monk&voicing=quartal"),
      PERSONAS,
      VOICINGS,
    );
    expect(ok.personaId).toBe("monk");
    expect(ok.voicingId).toBe("quartal");
  });

  it("round-trip: serialize -> parse is identity over the whole domain", () => {
    const cases: PracticeStateIn[] = [
      state(),
      state({ pathId: "path-3", bpm: 20, personaId: "bach", voicingId: "quartal" }),
      state({ pathId: "etu-x", bpm: 60, personaId: "", voicingId: "closed" }), // all-drop
      state({ pathId: "study-solar", bpm: 400, personaId: "monk", voicingId: "drop2" }),
    ];
    for (const c of cases) {
      const rec = serializePractice(c);
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(rec)) if (v !== null) qs.set(k, v);
      const out = parsePracticeParams(qs, [...PERSONAS, "bach", "coltrane", "monk"], [...VOICINGS, "closed", "drop2", "quartal"]);
      // Defaults/etu/garbage -> null on BOTH sides of the compact law.
      const expectPath = c.pathId.startsWith("etu-") ? null : c.pathId;
      expect(out.pathId).toBe(expectPath);
      expect(out.bpm).toBe(c.bpm === 60 ? null : c.bpm);
      expect(out.personaId).toBe(c.personaId === "" ? null : c.personaId);
      expect(out.voicingId).toBe(c.voicingId === "closed" ? null : c.voicingId);
    }
  });
});
