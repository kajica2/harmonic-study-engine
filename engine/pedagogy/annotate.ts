/**
 * engine/pedagogy/annotate.ts - PRD-001 Phase 3 Slice 1 (D18 / REQ-ETU-14,
 * REQ-PED-1/2/3).
 *
 * TRUTHFUL detectors over generated chords/melody: a concept is linked
 * ONLY when its pattern actually fires in the data the generator
 * produced. Detectors read the D21 numeral grammar tokens
 * (EtudeChord.numeral via numeralInfo) plus realized rootPc/notes -
 * never prose. Emission order is fixed (detector by detector, bars
 * ascending); ids are deterministic ordinals ("ann-<detector>-<bar>"),
 * never rng, never clock.
 *
 * Deviations from the design wording (documented, both conservative):
 *  - drop-2 gap threshold is ">= 7" (the design says "> 7", but the
 *    design's own drop-2 realization produces a gap of exactly 7 for
 *    maj7/m7/halfdim tetrads; ">= 7" keeps generator and detector in
 *    agreement while close voicings (gap <= 4) still never fire).
 *  - voice-leading averages the nearest-tone motion PER VOICE (a plain
 *    per-chord sum of 4-5 voices would sit near the threshold for
 *    every etude and prove nothing).
 */

import type { StyleProfile } from "../styles/types";
import type { EtudeChord, EtudeConstraints, EtudeMode, EtudeNote } from "../etude/types";
import { MODE_OFFSETS, numeralInfo } from "../etude/harmony";
import type { Annotation, AnnotationTarget } from "./types";

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function ann(
  id: string,
  target: AnnotationTarget,
  label: string,
  text: string,
  conceptId: string | null,
  confidence: number | null,
): Annotation {
  return { version: 1, id, target, label, text, conceptId, confidence };
}

const DOMINANT_QUALITIES: readonly string[] = ["dom7", "dom9", "alt"];
const MAJOR_FAMILY: readonly string[] = ["maj", "maj7", "maj9", "maj6", "majadd9"];
const MINOR_FAMILY: readonly string[] = ["min", "m7", "min9", "min6", "minadd9"];

function isDominant(c: EtudeChord): boolean {
  return DOMINANT_QUALITIES.includes(c.qualitySymbol);
}

function familyOf(c: EtudeChord): "major" | "minor" | "dim" | "other" {
  if (MAJOR_FAMILY.includes(c.qualitySymbol)) return "major";
  if (MINOR_FAMILY.includes(c.qualitySymbol)) return "minor";
  if (c.qualitySymbol === "dim" || c.qualitySymbol === "dim7" || c.qualitySymbol === "halfdim") {
    return "dim";
  }
  return "other";
}

function isTonicFamily(c: EtudeChord, key: number, mode: EtudeMode): boolean {
  if (c.rootPc !== mod12(key)) return false;
  const fam = familyOf(c);
  return mode === "major" ? fam === "major" : fam === "minor";
}

/** Mean nearest-tone semitone motion from chord a to chord b (per voice). */
function transitionMotion(a: EtudeChord, b: EtudeChord): number {
  let sum = 0;
  for (const n of a.notes) {
    let best = Infinity;
    for (const m of b.notes) {
      const d = Math.abs(n - m);
      if (d < best) best = d;
    }
    sum += best;
  }
  return sum / a.notes.length;
}

/**
 * Run every truthful detector over a generated etude's data. Pure
 * scan - no rng, no clock, no allocation order dependence beyond fixed
 * array iteration.
 */
export function annotateEtude(
  chords: readonly EtudeChord[],
  melody: readonly EtudeNote[],
  profile: StyleProfile,
  constraints: EtudeConstraints,
): readonly Annotation[] {
  void profile; // detectors read the DATA (chords/melody), not the profile
  const out: Annotation[] = [];
  const bars = chords.length;
  const key = constraints.key;
  const mode = constraints.mode;
  const offsets = MODE_OFFSETS[mode];
  const rootOffsetOf = (c: EtudeChord): number => mod12(c.rootPc - key);
  const claimedByDominantRule = new Set<number>();

  // 1. ii-V-I: consecutive ii* -> V* -> I* (quality families via the
  //    grammar token, roots via the mode table).
  for (let b = 0; b + 2 < bars; b++) {
    const i0 = numeralInfo(chords[b].numeral);
    const i1 = numeralInfo(chords[b + 1].numeral);
    if (i0 === null || i1 === null) continue;
    const iiOk =
      i0.degree === 2 && !i0.upper && rootOffsetOf(chords[b]) === offsets[1];
    const vOk =
      i1.degree === 5 &&
      i1.accidental === "" &&
      i1.upper &&
      isDominant(chords[b + 1]) &&
      rootOffsetOf(chords[b + 1]) === offsets[4];
    const iOk = isTonicFamily(chords[b + 2], key, mode);
    if (iiOk && vOk && iOk) {
      out.push(
        ann(
          `ann-iiv1-${b}`,
          { kind: "progression", fromBar: b, toBar: b + 2 },
          "ii-V-I",
          `${chords[b].name} to ${chords[b + 1].name} to ${chords[b + 2].name}: the classic ii-V-I. The minor-family ii feeds the dominant V, whose tritone resolves into the tonic.`,
          "ii-v-i",
          1,
        ),
      );
    }
  }

  // 2. Tritone substitution: bII7 resolving DOWN a semitone to an
  //    I-family chord.
  for (let b = 0; b + 1 < bars; b++) {
    const info = numeralInfo(chords[b].numeral);
    if (info === null) continue;
    if (
      info.degree === 2 &&
      info.accidental === "b" &&
      isDominant(chords[b]) &&
      chords[b + 1].rootPc === mod12(chords[b].rootPc - 1) &&
      isTonicFamily(chords[b + 1], key, mode)
    ) {
      claimedByDominantRule.add(b);
      out.push(
        ann(
          `ann-tritone-${b}`,
          { kind: "chord", bar: b },
          "Tritone substitution",
          `${chords[b].numeral} (${chords[b].name}) stands in for V7 a tritone away and resolves down a half step into ${chords[b + 1].name}. The shared guide tones make the pull identical while the bass slides chromatically.`,
          "tritone-sub",
          1,
        ),
      );
    }
  }

  // 3. Secondary dominant: uppercase non-V degree + dominant 7th whose
  //    root + 5 mod 12 equals the NEXT chord's root.
  for (let b = 0; b + 1 < bars; b++) {
    const info = numeralInfo(chords[b].numeral);
    if (info === null) continue;
    if (
      info.upper &&
      !info.dim &&
      info.degree !== 5 &&
      isDominant(chords[b]) &&
      mod12(chords[b].rootPc + 5) === chords[b + 1].rootPc
    ) {
      claimedByDominantRule.add(b);
      out.push(
        ann(
          `ann-secdom-${b}`,
          { kind: "chord", bar: b },
          "Secondary dominant",
          `${chords[b].name} is V7 of ${chords[b + 1].name} (its root sits a fifth above the target). It tonicizes the next chord without leaving the key.`,
          "secondary-dominant",
          1,
        ),
      );
    }
  }

  // 4. Modal interchange: non-diatonic root, not explained by rules
  //    2-3 above.
  for (let b = 0; b < bars; b++) {
    if (claimedByDominantRule.has(b)) continue;
    if (!offsets.includes(rootOffsetOf(chords[b]))) {
      out.push(
        ann(
          `ann-modal-${b}`,
          { kind: "chord", bar: b },
          "Modal interchange",
          `${chords[b].name} (as ${chords[b].numeral}) has a root outside the diatonic pitch set of ${mode} - a chord borrowed from the parallel mode rather than a functional dominant.`,
          "modal-interchange",
          1,
        ),
      );
    }
  }

  // 5. Cadence: final-bar V->I (authentic) or iv->I (plagal).
  if (bars >= 2 && isTonicFamily(chords[bars - 1], key, mode)) {
    const prev = chords[bars - 2];
    const info = numeralInfo(prev.numeral);
    const authentic =
      info !== null &&
      info.degree === 5 &&
      info.accidental === "" &&
      info.upper &&
      isDominant(prev);
    const plagal =
      info !== null &&
      info.degree === 4 &&
      info.accidental === "" &&
      familyOf(prev) === "minor";
    if (authentic || plagal) {
      out.push(
        ann(
          `ann-cadence-${bars - 1}`,
          { kind: "progression", fromBar: bars - 2, toBar: bars - 1 },
          authentic ? "Authentic cadence" : "Plagal cadence",
          authentic
            ? `The etude closes V to I (${prev.name} to ${chords[bars - 1].name}): the dominant's tritone resolves inward and the phrase lands on the tonic - a full stop.`
            : `The etude closes iv to I (${prev.name} to ${chords[bars - 1].name}): the borrowed minor subdominant sighs into the tonic - the plagal "Amen" close.`,
          "cadence",
          1,
        ),
      );
    }
  }

  // 6. Voice leading: mean per-voice nearest-tone motion <= 4 semitones
  //    -> annotate the single smoothest transition.
  if (bars >= 2) {
    const motions: number[] = [];
    for (let b = 0; b + 1 < bars; b++) motions.push(transitionMotion(chords[b], chords[b + 1]));
    const mean = motions.reduce((s, m) => s + m, 0) / motions.length;
    if (mean <= 4) {
      let best = 0;
      for (let b = 1; b < motions.length; b++) if (motions[b] < motions[best]) best = b;
      out.push(
        ann(
          `ann-voiceleading-${best}`,
          { kind: "chord", bar: best },
          "Smooth voice leading",
          `Between ${chords[best].name} and ${chords[best + 1].name} the average voice moves only ${motions[best].toFixed(1)} semitones to its nearest pitch in the next chord, and the whole etude averages ${mean.toFixed(1)} - the voicings share most of their pitch material.`,
          "voice-leading",
          1,
        ),
      );
    }
  }

  // 7. Drop 2: tetrad whose 2nd-from-top voice sits >= 7 semitones
  //    below the top (documented threshold deviation) with the lower
  //    three voices inside an octave.
  for (let b = 0; b < bars; b++) {
    const n = chords[b].notes;
    if (n.length !== 4) continue;
    const gap = n[3] - n[2];
    const lowerThree = n[2] - n[0];
    if (gap >= 7 && lowerThree <= 12) {
      out.push(
        ann(
          `ann-drop2-${b}`,
          { kind: "chord", bar: b },
          "Drop 2 voicing",
          `${chords[b].name} is spread as a drop 2: the second voice from the top sits ${gap} semitones below the melody note while the lower three fit inside an octave - the open jazz-guitar shape.`,
          "drop-2",
          1,
        ),
      );
    }
  }

  // 8. Axis progression: 3 consecutive roots cycling by major thirds
  //    (+/-4 mod 12) or an exact tritone pair alternation.
  for (let b = 0; b + 2 < bars; b++) {
    const r0 = chords[b].rootPc;
    const r1 = chords[b + 1].rootPc;
    const r2 = chords[b + 2].rootPc;
    const d1 = mod12(r1 - r0);
    const d2 = mod12(r2 - r1);
    const thirdCycle = (d1 === 4 && d2 === 4) || (d1 === 8 && d2 === 8);
    const tritonePair = d1 === 6 && r0 === r2;
    if (thirdCycle || tritonePair) {
      out.push(
        ann(
          `ann-axis-${b}`,
          { kind: "progression", fromBar: b, toBar: b + 2 },
          "Axis / major-third motion",
          `Roots ${chords[b].name} - ${chords[b + 1].name} - ${chords[b + 2].name} move by ${thirdCycle ? "major thirds" : "an exact tritone pair"} instead of fifths: symmetric axis motion (Bartok's system, Coltrane's cycles) rather than functional resolution.`,
          "axis-progression",
          1,
        ),
      );
    }
  }

  // 9. Melody editorial (the only non-concept annotation): count
  //    chromatic approach notes - a step of one semitone onto a
  //    non-diatonic pitch.
  const scalePcs = offsets.map((o) => mod12(key + o));
  let approaches = 0;
  for (let i = 1; i < melody.length; i++) {
    if (
      Math.abs(melody[i].midi - melody[i - 1].midi) === 1 &&
      !scalePcs.includes(mod12(melody[i].midi))
    ) {
      approaches++;
    }
  }
  if (approaches > 0) {
    out.push(
      ann(
        "ann-melody-chromatic-0",
        { kind: "melody" },
        "Chromatic approach notes",
        `The melody approaches its target notes by half step ${approaches} time(s) from outside the scale - a jazz idiom that adds line-level tension without changing the chords.`,
        null,
        null,
      ),
    );
  }

  return out;
}
