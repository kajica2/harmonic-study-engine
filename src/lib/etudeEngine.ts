/**
 * src/lib/etudeEngine.ts - PRD-001 Phase 3 Slice 2 (D24).
 *
 * The ONE clean module owning every engine->src crossing for etudes:
 * defaults, memoized non-throwing generation, the Etude ->
 * HarmonicPath adapter that feeds the existing setPaths / playback /
 * export chain, and the pure App-side decision helpers extracted for
 * testability (planEtudeRestore HIGH-001, etudeActiveBarFor
 * DOCS-CATCH - fix round). src MAY import engine, never the reverse.
 *
 * Contracts pinned here:
 *  - generateEtudeFor NEVER throws into the UI (REQ-NFR-5): it returns
 *    null on invalid constraints OR when feasibilityOf warns. The
 *    engine's conservative-sound feasibility invariant guarantees a
 *    null-warning shape generates for EVERY seed.
 *  - Copy-not-cast: EtudeBarStep.notes is readonly; HarmonicStep.notes
 *    is mutable. The boundary is crossed with explicit array copies -
 *    no `as`, no @ts-ignore.
 *  - WHOLE-CYCLE padding (not padPath): padPath truncates the final
 *    cycle to exactly 96 steps, which seams a non-divisor form (e.g. a
 *    7-bar form: 96 % 7 !== 0). Repeating whole form passes keeps
 *    steps.length % bars === 0, so the live loop is seamless and
 *    detectFormPeriod returns the true form.
 *  - Clock reads happen HERE (adapter layer only, ADR-005): Date.now()
 *    + a module counter feed makeInstanceId via generateEtude.
 *  - Memo: Map<canonicalId, Etude>, FIFO-capped at 16. Same seed +
 *    constraints => same work AND same object identity (REQ-ETU-15).
 */

import { generateEtude, etudeToSteps, feasibilityOf } from "../../engine/etude/assemble";
import {
  validateEtudeConstraints,
  type Etude,
  type EtudeConstraints,
} from "../../engine/etude/types";
import { deriveCanonicalId } from "../../engine/core/ids";
import { spellTonic } from "../../engine/core/spelling";
import {
  MIN_PATH_BARS,
  STEPS_PER_BAR,
  type HarmonicPath,
  type HarmonicStep,
} from "./paths";

/** REQ-ETU-1 defaults: the middle-of-the-road first-run shape. */
export const DEFAULT_ETUDE_CONSTRAINTS: EtudeConstraints = {
  version: 1,
  styleId: "jazz",
  key: 0,
  mode: "major",
  difficulty: 3,
  bars: 8,
  tempo: null,
  seed: 1,
  harmony: {
    allowedQualities: null,
    allowedNumerals: null,
    startOn: null,
    endOn: null,
    requireChromaticism: false,
  },
  melody: {
    maxIntervalSemitones: null,
    chordTonesOnStrongBeats: false,
    range: null,
  },
  rhythm: { straightRhythmsOnly: false },
};

/** Stable path id for a generated etude (D24). canonicalId already
 *  carries the "etu-" kind prefix; the path id adds another so etude
 *  paths are unmistakable in the Paths list and greppable as
 *  `etu-etu-<hash>` (design D31: "etu-*" paths). */
export function etudePathId(etude: Etude): string {
  return `etu-${etude.canonicalId}`;
}

const MEMO_CAP = 16;
const memo = new Map<string, Etude>();
let moduleCounter = 0;

/**
 * Non-throwing generation entry point (REQ-NFR-5). Returns null when
 * the constraints are invalid OR feasibilityOf warns; never null for a
 * valid + null-warning shape (conservative-sound invariant, slice 1).
 */
export function generateEtudeFor(constraints: EtudeConstraints): Etude | null {
  if (!validateEtudeConstraints(constraints).ok) return null;
  if (feasibilityOf(constraints) !== null) return null;

  const id = deriveCanonicalId("etu", constraints.seed, constraints);
  const hit = memo.get(id);
  if (hit) return hit;

  // Clock read HERE - the adapter is the only Date.now() in the path
  // (engine/purity.test.ts keeps engine/ clean, ADR-005).
  const { etude } = generateEtude(constraints, {
    nowMs: Date.now(),
    seq: ++moduleCounter,
  });

  if (memo.size >= MEMO_CAP) {
    // FIFO evict: Map preserves insertion order; drop the oldest.
    const oldest = memo.keys().next();
    if (!oldest.done) memo.delete(oldest.value);
  }
  memo.set(id, etude);
  return etude;
}

/**
 * Etude -> loadable HarmonicPath (D24). The result flows through the
 * existing setPaths / playback / loop / WAV / transpose chain with
 * zero further work (D31); it is deliberately NOT routed through
 * padPath - see the module header for the whole-cycle rationale.
 */
export function etudeToHarmonicPath(etude: Etude): HarmonicPath {
  // Copy-not-cast: readonly notes -> mutable HarmonicStep.
  const form: HarmonicStep[] = etudeToSteps(etude).map((s) => ({
    name: s.name,
    notes: [...s.notes],
    descriptions: s.descriptions,
  }));

  const minSteps = MIN_PATH_BARS * STEPS_PER_BAR; // 96
  let steps = form;
  if (steps.length > 0 && steps.length < minSteps) {
    const passes = Math.ceil(minSteps / steps.length);
    const padded: HarmonicStep[] = [];
    for (let i = 0; i < passes; i++) {
      for (const step of form) {
        // Fresh copies per pass: the live loop mutates nothing today,
        // but sharing one step object across passes would let any
        // future in-place edit bleed between loops.
        padded.push({ ...step, notes: [...step.notes] });
      }
    }
    steps = padded;
  }

  const tonic = spellTonic(etude.key, etude.mode, "");
  const key = etude.mode === "minor" ? `${tonic} minor` : tonic;

  return {
    id: etudePathId(etude),
    title: etude.title,
    name: etude.title,
    description:
      `Generated ${etude.styleId} etude - ${etude.bars} bars, ` +
      `difficulty ${etude.difficulty}, seed ${etude.seed}. ` +
      `The ${etude.bars}-bar form loops inside the padded practice track.`,
    key,
    steps,
  };
}

/** Boot-restore prepend plan (see planEtudeRestore). */
export interface EtudeRestorePlan {
  /** True when the etude path is NOT already in `paths` and must be prepended. */
  prepend: boolean;
  /** +1 iff prepend - the amount ACTIVE path indices shift when the
   *  prepend happens; 0 otherwise. */
  indexShift: 0 | 1;
}

/**
 * HIGH-001 (fix round): the boot-restore prepend decision, extracted
 * from App's boot effect so the index-shift contract is testable
 * (React components are intentionally not unit-tested).
 *
 * The boot restore PREPENDS the etude path WITHOUT activating it
 * (D28). But prepending shifts every existing index by +1, so the
 * persisted activePathIndex would silently point at a DIFFERENT path
 * (a no-stomp violation), and on a fresh browser (index 0) the
 * prepend would ACTIVATE the etude. Callers must therefore apply
 * `indexShift` to the active index when - and only when - `prepend`
 * is true, preserving the user's active-path IDENTITY with the etude
 * sitting inactive at the front.
 */
export function planEtudeRestore(
  paths: readonly { id: string }[],
  pid: string,
): EtudeRestorePlan {
  const present = paths.some((p) => p.id === pid);
  return { prepend: !present, indexShift: present ? 0 : 1 };
}

/**
 * DOCS-CATCH (fix round): form-relative bar index for the etude roll
 * highlight, given a playback step index on the etude's PRACTICE path.
 *
 * Invariant (slice-1 finding 4): an etude practice path carries ONE
 * STEP PER BAR - the adapter emits one HarmonicStep per etude bar and
 * pads by repeating WHOLE form passes (steps.length % bars === 0).
 * The legacy `Math.floor(stepIndex / STEPS_PER_BAR)` mapping (for
 * 4-steps-per-bar paths) therefore advances the highlight at 1/4
 * speed AND falls out of range after the first third of the loop.
 *
 * The roll shows the true form (etude.bars columns), so the playing
 * bar is `stepIndex % bars`: identical to the raw step index within
 * the first pass, wrapping seamlessly across the padded repeats.
 */
export function etudeActiveBarFor(etude: Etude, stepIndex: number): number {
  const bars = etude.bars;
  // Defensive: bars is engine-validated 4-32, stepIndex a transport
  // integer - but the highlight must never emit NaN / out-of-range.
  if (!Number.isInteger(bars) || bars <= 0) return 0;
  if (!Number.isFinite(stepIndex)) return 0;
  return ((Math.trunc(stepIndex) % bars) + bars) % bars;
}
