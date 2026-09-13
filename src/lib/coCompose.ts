/**
 * src/lib/coCompose.ts — "What if?" reharmonization proposer.
 *
 * For a given bar, proposes ONE alternative chord. The proposal is
 * derived from the active chord via a small library of substitution
 * techniques. Each technique has a deterministic explanation string.
 *
 * MVP techniques:
 *   - Tritone substitution (V → bII7)
 *   - Modal mixture (I → i, IV → iv, V → v in minor)
 *   - Secondary dominant (I → V/V, IV → V/IV)
 *   - Passing diminished (I → #Idim7 between I and ii)
 *
 * Deterministic: same (pathId, barIndex, seed) → byte-equal proposal.
 */

import { mulberry32 } from "../magenta/noise";
import { analyzeChord, type ChordAnalysis } from "./theory";
import { PERSONAS } from "./personas";

export interface ProposeAlternativeArgs {
  pathId: string;
  barIndex: number;
  seed: number;
  /**
   * Optional: when supplied, the picker up-weights techniques
   * associated with this persona's harmonic influence (per
   * `Persona.harmonicInfluence[0].composerId`).
   */
  personaId?: string;
}

export interface AlternativeChord {
  /** The active chord (input). */
  active: ChordAnalysis;
  /** The proposed replacement. Null if no substitute fits the key context. */
  alternative: ChordAnalysis | null;
  /** Human-readable technique label (tritone substitution, modal mixture, …). */
  technique: string;
  /** Why this substitution works, in theory terms. */
  explanation: string;
  /** Voice-leading distance vs. the active chord (semitones summed). */
  voiceLeadingDistance: number;
}

const TECHNIQUES = [
  "tritone_substitution",
  "modal_mixture",
  "secondary_dominant",
  "passing_diminished",
  "axis_modulation",
  "coltrane_change",
] as const;

type Technique = (typeof TECHNIQUES)[number];

/**
 * Per-persona technique weights. When a personaId is supplied to
 * `proposeAlternative`, the picker up-weights techniques associated
 * with that persona's harmonic influence (per `Persona.harmonicInfluence`).
 *
 * The persona's `composerId` is mapped to a bias — e.g. Coltrane's
 * `john-coltrane` influence up-weights `tritone_substitution` and
 * `coltrane_change`; Bartók's `bartok` influence up-weights
 * `axis_modulation`.
 *
 * Bias values are > 1.0 to increase pick probability; 1.0 = neutral.
 * Sum doesn't need to be 1 — the picker normalizes.
 */
const PERSONA_TECHNIQUE_BIAS: Record<string, Partial<Record<Technique, number>>> = {
  // Bach → Wendy Carlos (functional tonality, voice-leading)
  "wendy-carlos": {
    secondary_dominant: 2.0,
    tritone_substitution: 1.5,
  },
  // Coltrane → John Coltrane (major-third cycles, tritone subs, Giant Steps)
  "john-coltrane": {
    coltrane_change: 3.0,
    tritone_substitution: 2.0,
  },
  // Debussy → Debussy (modal mixture, parallel color)
  "debussy": {
    modal_mixture: 3.0,
    axis_modulation: 1.5,
  },
  // Eno → Brian Eno (static, non-functional — favors techniques that
  // produce unusual substitutions)
  "brian-eno": {
    passing_diminished: 1.5,
    axis_modulation: 1.5,
  },
  // Glass → Minimalists (drones, slow harmonic change — modal)
  "minimalists": {
    modal_mixture: 2.0,
  },
  // Miles → Miles Davis (modal jazz, quartal)
  "miles-davis": {
    modal_mixture: 2.0,
    passing_diminished: 1.5,
  },
  // Scriabin → Bartók (axis system, symmetrical scales)
  "bartok": {
    axis_modulation: 3.0,
    modal_mixture: 1.5,
  },
};

/**
 * Pick a technique deterministically from (pathId, barIndex, seed).
 * When `personaId` is supplied and matches a bias map, weighted
 * sampling favors the persona's preferred techniques. The same
 * (pathId, barIndex, seed, personaId) tuple always returns the same
 * technique — useful for reproducible suggestions across reloads.
 */
function pickTechnique(args: ProposeAlternativeArgs): Technique {
  const baseSeed =
    hashStringToSeed(args.pathId) ^
    ((args.barIndex + 1) * 0x9e3779b9) ^
    (args.seed >>> 0);
  const personaSeed = args.personaId
    ? hashStringToSeed(args.personaId)
    : 0;
  const rng = mulberry32((baseSeed ^ personaSeed) >>> 0);

  // Build weighted pool from TECHNIQUES × bias
  const weights = TECHNIQUES.map((t) => {
    let w = 1.0;
    if (args.personaId) {
      const bias =
        PERSONA_TECHNIQUE_BIAS[args.personaId] ??
        // Try the persona's mapped composer id as fallback
        // (Persona.harmonicInfluence[0].composerId)
        lookupComposerBiasForPersona(args.personaId);
      if (bias && bias[t]) w *= bias[t]!;
    }
    return w;
  });
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  let pick = rng() * totalWeight;
  for (let i = 0; i < TECHNIQUES.length; i++) {
    pick -= weights[i];
    if (pick <= 0) return TECHNIQUES[i];
  }
  return TECHNIQUES[TECHNIQUES.length - 1];
}

/**
 * Resolve a personaId to its persona's mapped composer bias (if any).
 * Looks up `Persona.harmonicInfluence[0].composerId` and uses that as
 * the key into `PERSONA_TECHNIQUE_BIAS`. Returns undefined if the
 * persona has no influence entry.
 */
function lookupComposerBiasForPersona(
  personaId: string,
): Partial<Record<Technique, number>> | undefined {
  // Lazy import to avoid a circular dep — personas.ts → composerCatalog.ts
  // (we don't import composerCatalog here, just PERSONAS).
  const persona = PERSONAS.find((p) => p.id === personaId);
  const composerId = persona?.harmonicInfluence?.[0]?.composerId;
  return composerId ? PERSONA_TECHNIQUE_BIAS[composerId] : undefined;
}

/** Tiny FNV-1a-ish hash so pathId seeds aren't zero for empty strings. */
function hashStringToSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Compute MIDI sum of voice-leading distance vs. the active chord. */
function voiceLeading(active: number[], alt: number[]): number {
  const a = [...active].sort((x, y) => x - y);
  const b = [...alt].sort((x, y) => x - y);
  const len = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < len; i++) d += Math.abs(a[i] - b[i]);
  return d;
}

/** Build a chord from a root pc and a quality. MIDI pitches in root position. */
function chordFromQuality(rootPc: number, quality: string, octave = 4): number[] {
  const root = rootPc + 12 * (octave + 1);
  const intervals: Record<string, number[]> = {
    "maj7":  [0, 4, 7, 11],
    "min7":  [0, 3, 7, 10],
    "dom7":  [0, 4, 7, 10],
    "dim7":  [0, 3, 6, 9],
    "min7b5": [0, 3, 6, 10],
  };
  return (intervals[quality] ?? [0, 4, 7, 10]).map((iv) => root + iv);
}

/**
 * Apply a technique to derive a substitute chord from the active
 * chord's analysis. Returns the substitute notes + explanation, or
 * null if the technique doesn't apply.
 */
function applyTechnique(active: ChordAnalysis, technique: Technique): {
  notes: number[];
  explanation: string;
} | null {
  const rootPc = (() => {
    // parse "C" / "C#" / etc. from rootName
    const m = active.rootName.match(/^([A-G][#b]?)/);
    if (!m) return 0;
    const NOTE_TO_PC: Record<string, number> = {
      C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6,
      G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
    };
    return NOTE_TO_PC[m[1]] ?? 0;
  })();

  switch (technique) {
    case "tritone_substitution": {
      // V → bII7: down a tritone from the dominant root.
      // Only meaningful if active is dominant.
      if (active.family !== "dominant") return null;
      const bIIRoot = (rootPc + 6) % 12; // tritone above = bII
      return {
        notes: chordFromQuality(bIIRoot, "dom7"),
        explanation: `Tritone substitution: ${active.rootName}7 (V) → bII7 a tritone away. The bII7's guide tones (3rd & 7th) are the tritone-resolving pitches of V, so they pull to I identically. Common in jazz to add chromatic motion.`,
      };
    }
    case "modal_mixture": {
      // Borrow from parallel mode: major → minor (or vice versa) on
      // tonic-family chords. We toggle I ↔ i, IV ↔ iv.
      if (active.function !== "tonic" && active.function !== "subdominant") return null;
      if (active.family === "major") {
        return {
          notes: chordFromQuality(rootPc, "min7"),
          explanation: `Modal mixture (major → minor): borrow the parallel-mode minor quality. ${active.rootName} → ${active.rootName}m7. Darkens the tonic/subdominant; common in film music and minor-key jazz.`,
        };
      } else if (active.family === "minor") {
        return {
          notes: chordFromQuality(rootPc, "maj7"),
          explanation: `Modal mixture (minor → major): borrow the parallel-mode major quality. ${active.rootName}m → ${active.rootName}maj7. Raises the third; common in modal interchange (e.g. bVII in minor).`,
        };
      }
      return null;
    }
    case "secondary_dominant": {
      // Apply V/V (a fifth above the active root) → the V of V resolves
      // to V. We suggest V/V only when the active chord is not already
      // a dominant — to avoid V/V/V chains.
      if (active.family === "dominant") return null;
      const vOfVRoot = (rootPc + 7) % 12;
      return {
        notes: chordFromQuality(vOfVRoot, "dom7"),
        explanation: `Secondary dominant: V/V (a fifth above ${active.rootName}). The new chord is the dominant of the active chord; resolves naturally to ${active.rootName}. Common as a tonicization.`,
      };
    }
    case "passing_diminished": {
      // Insert a #Idim7 between I and ii (or similar diatonic step).
      // Only meaningful when active is tonic.
      if (active.function !== "tonic") return null;
      const passingRoot = (rootPc + 1) % 12;
      return {
        notes: chordFromQuality(passingRoot, "dim7"),
        explanation: `Passing diminished: between ${active.rootName} (I) and ii, insert ${PC_NAME[passingRoot]}dim7 to smooth the voice leading. The diminished-7th's pitches share 3 of 4 with the ii chord.`,
      };
    }
    case "axis_modulation": {
      // Bartók-style axis modulation: move the active tonic chord to its
      // tritone-related key (e.g. A → Eb). This is a non-functional,
      // symmetrical relationship — keys relate by tritone and minor third
      // rather than by fifth. Only applies to tonic-family chords; the
      // result is a chord of the same quality transposed up a tritone.
      if (active.function !== "tonic") return null;
      const axisRoot = (rootPc + 6) % 12;
      const quality =
        active.family === "minor" ? "min7" : active.family === "major" ? "maj7" : "dom7";
      return {
        notes: chordFromQuality(axisRoot, quality),
        explanation: `Axis modulation (Bartók): ${active.rootName} (I) → ${PC_NAME[axisRoot]} (I a tritone away). The two keys are axis-related — they share no functional dominant, so the motion is symmetrical rather than tonal. Bartók's tonic axis (A–C–Eb–F#) is the canonical example.`,
      };
    }
    case "coltrane_change": {
      // Coltrane-style major-third modulation: from a tonic chord, move
      // up a major third (e.g. Bmaj7 → D7/Gmaj7). The dominant of the
      // new key resolves to the new tonic. The major-third cycle (B →
      // G → Eb → B) is the structural device in Giant Steps.
      if (active.function !== "tonic") return null;
      const majorThirdUp = (rootPc + 4) % 12;
      const quality =
        active.family === "minor" ? "min7" : active.family === "major" ? "maj7" : "dom7";
      return {
        notes: chordFromQuality(majorThirdUp, quality),
        explanation: `Coltrane change: ${active.rootName} (I) → ${PC_NAME[majorThirdUp]} (I a major third up). The major-third cycle (B → G → Eb → B) is the structural device in Giant Steps — each new tonic is approached by its own V7, creating rapid modulation by major thirds rather than fifths.`,
      };
    }
  }
}

const PC_NAME = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Propose one alternative chord for the given bar. The proposal is
 * deterministic given (pathId, barIndex, seed).
 */
export function proposeAlternative(args: ProposeAlternativeArgs): AlternativeChord {
  const { pathId, barIndex, seed } = args;
  // MVP: read the active chord from a hardcoded lookup keyed by
  // (pathId, barIndex). v1 will read from the actual path's
  // HarmonicStep[].
  const activeNotes = lookupActiveChord(pathId, barIndex);
  const active = analyzeChord(activeNotes);

  const technique = pickTechnique(args);
  const applied = applyTechnique(active, technique);

  if (!applied) {
    // Technique didn't fit — return a no-op with the active chord and
    // a note about why.
    return {
      active,
      alternative: null,
      technique,
      explanation: `${humanize(technique)} does not apply to a ${active.family} ${active.function} chord (${active.roman}). Try another bar.`,
      voiceLeadingDistance: 0,
    };
  }

  const alt = analyzeChord(applied.notes);
  const distance = voiceLeading(activeNotes, applied.notes);
  return {
    active,
    alternative: alt,
    technique,
    explanation: applied.explanation,
    voiceLeadingDistance: distance,
  };
}

function humanize(t: Technique): string {
  return {
    tritone_substitution: "Tritone substitution",
    modal_mixture: "Modal mixture",
    secondary_dominant: "Secondary dominant",
    passing_diminished: "Passing diminished",
    axis_modulation: "Axis modulation",
    coltrane_change: "Coltrane change",
  }[t];
}

/**
 * MVP lookup: derive a chord from (pathId, barIndex) without reading
 * the path catalog. v1 will replace with actual path lookup.
 *
 * Pattern: sum pathId character codes → seed → pick a quality based
 * on barIndex mod 4. The active chord is the user's reference for
 * comparison; the substitute is derived from it.
 */
function lookupActiveChord(pathId: string, barIndex: number): number[] {
  const seed = hashStringToSeed(pathId) ^ ((barIndex + 1) * 0x9e3779b9);
  const rng = mulberry32(seed >>> 0);
  const qualities = ["maj7", "min7", "dom7", "min7"] as const;
  const quality = qualities[Math.floor(rng() * qualities.length)];
  // Pick a "key" by sampling the first character of pathId.
  const NOTE_TO_PC: Record<string, number> = {
    C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6,
    G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
  };
  const rootName = (pathId.match(/[A-G][#b]?/) ?? ["C"])[0];
  const root = NOTE_TO_PC[rootName] ?? 0;
  return chordFromQuality(root, quality);
}
