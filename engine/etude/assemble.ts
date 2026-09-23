/**
 * engine/etude/assemble.ts - PRD-001 Phase 3 Slice 1 (REQ-ETU-10..15,
 * REQ-FND-3/6 usage).
 *
 * generateEtude: validate -> profile -> ONE rng (draw order: harmony
 * all bars -> melody all bars -> title; order is part of the
 * reproducibility contract, pinned by determinism.test.ts) ->
 * annotations -> deterministic ids.
 *
 * The clock is a PARAMETER (EtudeClock): nowMs/seq never read here
 * from Date (ADR-005; engine/purity.test.ts enforces).
 *
 * Last-resort contract: impossible constraints throw RangeError AFTER
 * validateEtudeConstraints - adapters call validate + feasibilityOf
 * first and never let a user hit these paths (Slice 2 panel disables
 * impossible combos).
 */

import { createRng } from "../core/rng";
import { deriveCanonicalId, makeInstanceId } from "../core/ids";
import { spellTonic } from "../core/spelling";
import { getStyleProfile } from "../styles/index";
import type { StyleProfile } from "../styles/types";
import { filterTemplates, tokenAllowed } from "./harmony";
import { generateProgression } from "./harmony";
import { generateMelody } from "./melody";
import { annotateEtude } from "../pedagogy/annotate";
import {
  validateEtudeConstraints,
  type Etude,
  type EtudeBarStep,
  type EtudeConstraints,
  type EtudeResult,
} from "./types";
import type { Rng } from "../core/rng";

export interface EtudeClock {
  readonly nowMs: number; // caller-supplied epoch ms (ADR-005)
  readonly seq: number; // per-process counter
}

/** Word A pool: shared across styles (mood adjectives, ASCII). */
const MOOD_WORDS: readonly string[] = [
  "Night", "Midnight", "Blue", "Golden", "Quiet", "Restless",
  "Velvet", "Bright", "Lonesome", "Wandering", "Ceramic", "Electric",
];

/** Word B pools: per-style nouns (design section 5 step 5). */
const STYLE_TITLE_WORDS: Readonly<Record<string, readonly string[]>> = {
  jazz: ["Changes", "Swing", "Ballad", "Frame", "Route"],
  pop: ["Anthem", "Hook", "Loop", "Path", "Motion"],
  classical: ["Study", "Invention", "Minuet", "Etude", "Canon"],
};

/** Draw order: pick A -> pick B -> [bool + range] for the opus suffix.
 *  Always consumes at least 2 draws, 4 with a suffix (fixed shape). */
function generateTitle(
  profile: StyleProfile,
  constraints: EtudeConstraints,
  rng: Rng,
): string {
  const wordA = rng.pick(MOOD_WORDS);
  const pool = STYLE_TITLE_WORDS[constraints.styleId] ?? [profile.name];
  const wordB = rng.pick(pool);
  const tonic = spellTonic(constraints.key, constraints.mode, "");
  const modeWord = constraints.mode === "major" ? "Major" : "Minor";
  let title = `${wordA} ${wordB} in ${tonic} ${modeWord}`;
  if (rng.bool(0.5)) title += ` No. ${rng.range(1, 88)}`;
  return title;
}

/**
 * REQ-ETU-10..15: the full pipeline. Throws RangeError on invalid
 * constraints (adapters validate first) or on material the constraints
 * exclude (feasibilityOf surfaces the warning text beforehand).
 */
export function generateEtude(
  constraints: EtudeConstraints,
  clock: EtudeClock,
): EtudeResult {
  const validation = validateEtudeConstraints(constraints);
  if (!validation.ok) {
    throw new RangeError(
      `invalid etude constraints: ${validation.errors.join("; ")}`,
    );
  }
  const profile = getStyleProfile(constraints.styleId); // throwing contract OK (programmer error)
  const rng = createRng(constraints.seed);

  // Fixed draw order - the reproducibility contract:
  const chords = generateProgression({ profile, constraints, rng }); // 1. harmony, all bars
  const melody = generateMelody({ profile, constraints, chords, rng }); // 2. melody, all bars
  const annotations = annotateEtude(chords, melody, profile, constraints); // pure scan, no draws
  const title = generateTitle(profile, constraints, rng); // 3. title, last

  const etude: Etude = {
    version: 1,
    canonicalId: deriveCanonicalId("etu", constraints.seed, constraints),
    instanceId: makeInstanceId(clock.nowMs, clock.seq),
    title,
    tempo: constraints.tempo ?? profile.defaultTempo,
    styleId: constraints.styleId,
    key: constraints.key,
    mode: constraints.mode,
    bars: constraints.bars,
    difficulty: constraints.difficulty,
    seed: constraints.seed,
    chords,
    melody,
    annotations,
    constraints,
  };
  return { etude, annotations }; // SAME array (single source, D18)
}

/**
 * One step per BAR (finding 4): structurally HarmonicStep-shaped so
 * the Slice 2 adapter can cast into the existing setPaths/padPath/
 * detectFormPeriod pipeline. Engine never imports paths.ts.
 */
export function etudeToSteps(etude: Etude): readonly EtudeBarStep[] {
  return etude.chords.map((chord) => {
    const barAnn = etude.annotations.filter((a) => {
      if (a.target.kind === "chord") return a.target.bar === chord.bar;
      if (a.target.kind === "progression") {
        return chord.bar >= a.target.fromBar && chord.bar <= a.target.toBar;
      }
      return false; // melody/note/scale targets are not bar-scoped
    });
    const descriptions =
      barAnn.length > 0
        ? barAnn.map((a) => `${a.label}: ${a.text}`).join(" | ")
        : `${chord.numeral} - ${chord.name}`;
    return {
      name: chord.name,
      notes: [...chord.notes],
      descriptions,
    };
  });
}

/**
 * Non-throwing feasibility warning for the Slice 2 panel (design
 * section 5 step 1 contract).
 *
 * INVARIANT (fix round, PRD-001 Phase 3 S1): whenever this returns
 * null, `generateEtude` NEVER throws for ANY seed. The check is
 * therefore CONSERVATIVE-SOUND: it may warn on constraints that would
 * in fact generate fine (some seeds never dead-end), but it never
 * claims "feasible" on constraints where ANY seed can dead-end. Pinned
 * by the 300-seed property sweep in assemble.test.ts.
 *
 * Why conservative is required: the generator's requireChromaticism
 * dead-end depends on the REALIZED final chord (tonic-family or not),
 * which is a function of the rng stream (template pick + per-bar
 * passes) - no cheap static check can predict it exactly. The bVII7
 * fallback at bar 1 is the only substitution reachable for every
 * seed (canTouch(1) is always true for validated bars >= 4), so
 * bVII7-passes-the-filter is the conservative feasibility criterion.
 */
export function feasibilityOf(constraints: EtudeConstraints): string | null {
  const validation = validateEtudeConstraints(constraints);
  if (!validation.ok) {
    return `Invalid constraints: ${validation.errors.join("; ")}`;
  }
  const profile = getStyleProfile(constraints.styleId);
  if (filterTemplates(profile, constraints).length === 0) {
    return (
      `Harmony constraints exclude every '${constraints.styleId}' progression - ` +
      `widen allowedNumerals/allowedQualities or pick another style.`
    );
  }
  // REQ-ETU-13 overrides WIN over the harmony filter (documented), but
  // a contradictory override must be LOUD: warn when startOn/endOn
  // would have been filtered out as a generated token - the emitted
  // etude will contain a chord outside the allowed set.
  for (const [field, token] of [
    ["startOn", constraints.harmony.startOn],
    ["endOn", constraints.harmony.endOn],
  ] as const) {
    if (token !== null && !tokenAllowed(token, constraints)) {
      return (
        `harmony.${field} '${token}' violates the allowedNumerals/allowedQualities ` +
        `filter - the override still wins, but the etude will contain chords outside the allowed set.`
      );
    }
  }
  if (constraints.harmony.requireChromaticism) {
    // Conservative mirror of the generator's forced-substitution
    // sequence (harmony.ts step 6): the bII7 branch only applies when
    // the realized final chord is tonic-family (seed-dependent), so
    // only the bVII7 fallback is guaranteed reachable. Warn whenever
    // bVII7 is filtered out, even if bII7 passes - on those shapes
    // SOME seeds genuinely throw the RangeError.
    if (!tokenAllowed("bVII7", constraints)) {
      return (
        "requireChromaticism may not be satisfiable: the guaranteed fallback " +
        "chromatic token (bVII7) is excluded by the harmony filter - generation " +
        "can dead-end on seeds whose final chord is not tonic-family (bII7 only " +
        "applies as a substitution before a tonic close). Widen allowedNumerals/allowedQualities."
      );
    }
  }
  return null;
}
