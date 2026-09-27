/**
 * src/lib/practiceMechanics.ts - PRD-001 Phase 7 S2 (D126): the
 * practice-mechanics CONFIG plumbing (types + DEFAULT + hydrate guard +
 * chip formatter). Pure, node-tested; lives in src/lib NOT engine/
 * (config plumbing, not musical math - mirrors metronomePatterns.ts
 * placement; the math lives in engine/practice/{duty,ramp}.ts).
 *
 * ONE optional top-level zustand field `practiceMechanics` (D126):
 * NO envelope v5, NO migration step (the migration runner spreads
 * unknown keys - verified precondition, audit #13), NO new K.* keys
 * (the field rides the existing K.session envelope). partialize GAINS
 * the key in sessionStore.ts.
 *
 * normalizePracticeMechanics mirrors normalizeMetronomeConfig's
 * contract (audit #14): ANY stored JSON shape resolves to a valid
 * config - every field type-checked + range-clamped, corrupt ->
 * default. The panel emits COMPLETE config objects (MetronomeControls
 * contract); App owns normalize-at-read.
 */

import type { AbConfig, MechanicsMode, PauseConfig } from "../../engine/practice/duty";
import type { BarWindow } from "../../engine/practice/windows";
import {
  normalizeRampConfig,
  type RampConfig,
  type RampState,
} from "../../engine/practice/ramp";

/** S3 (D132): played-correctly detection config. Rides the ONE
 *  practiceMechanics field - NO new zustand field, NO v5 (D126
 *  lineage): normalize DEFAULTS THE MISSING SUB-FIELD at read. */
export interface DetectConfig {
  /** Armed iff enabled AND the Web MIDI API is present (REQ-PRAC-54
   *  gate lives at the hook/panel; this is the user's taste). */
  enabled: boolean;
  /** Timing window per bar start, 60..300 ms (engine floor 60). */
  toleranceMs: number;
  /** matchedFraction needed for an auto-rep success, 0.5..1.0. */
  passThreshold: number;
}

export interface PracticeMechanicsConfig {
  /** off | loop | pause | ab - ONE selector (mode exclusivity, D122). */
  mode: MechanicsMode;
  /** Pause duty cycle (playBars N, restBars M), each 1..16. */
  pause: PauseConfig;
  /** A/B windows + swap interval (1..32). Clamp-at-write on top of the
   *  scheduler's clamp-at-read (D122 form-boundary). */
  ab: AbConfig;
  /** Tempo ladder config (validated via normalizeRampConfig). */
  ramp: RampConfig;
  /** Ramp is ORTHOGONAL: rides any mode (D122). */
  rampEnabled: boolean;
  /** S3 detection (D132): armed auto-rep + tolerance + threshold. */
  detect: DetectConfig;
}

/** Shipped defaults (section 2): pause 4/4, AB 0-7 vs 8-15 swap 4,
 *  ramp 90->150 step 4 reps 2 threshold 2, mode off, ramp off,
 *  detection OFF with the 120 ms window + 0.8 pass threshold (S3). */
export const DEFAULT_MECHANICS: PracticeMechanicsConfig = {
  mode: "off",
  pause: { playBars: 4, restBars: 4 },
  ab: {
    a: { fromBar: 0, toBar: 7 },
    b: { fromBar: 8, toBar: 15 },
    swapBars: 4,
  },
  ramp: {
    startBpm: 90,
    targetBpm: 150,
    stepBpm: 4,
    repsPerStep: 2,
    failThreshold: 2,
  },
  rampEnabled: false,
  detect: { enabled: false, toleranceMs: 120, passThreshold: 0.8 },
};

const MODES: readonly MechanicsMode[] = ["off", "loop", "pause", "ab"];

/** UI-independent ceiling for persisted bar indices (the ACTIVE form
 *  narrows further at scheduler read - clampWindow). 128 covers every
 *  shipped form (MAX_PATH_BARS padded views included). */
const BAR_INDEX_MAX = 128;

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);
}

function intInRange(v: unknown, lo: number, hi: number, fallback: number): number {
  return isInt(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

/** Persisted windows are app-global; normalize only guards SHAPE here
 *  (non-negative ints, ascending). Form clamping is clampWindow's job
 *  at scheduler read + store write. */
function normalizeBarWindow(v: unknown, fallback: BarWindow): BarWindow {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return fallback;
  const r = v as Record<string, unknown>;
  if (!isInt(r.fromBar) || !isInt(r.toBar)) return fallback;
  const cap = (n: number) => Math.min(BAR_INDEX_MAX, Math.max(0, n));
  const from = cap(r.fromBar);
  const to = cap(r.toBar);
  return from <= to ? { fromBar: from, toBar: to } : { fromBar: to, toBar: from };
}

/**
 * The total-shape hydrate guard. Corrupt -> default, per field. A
 * REJECTED ramp ladder (start >= target, law 6) forces rampEnabled
 * false while KEEPING the user's edited numbers (S2 fix-round LOW-3:
 * no silent ladder wipe back to DEFAULT) - safe because an invalid
 * ladder can NEVER engage (the ramp machine is unreachable while
 * disabled). A GARBAGE ramp (non-object / non-finite bpms) still
 * falls to the default ladder, so no NaN ever reaches live state.
 */
export function normalizePracticeMechanics(raw: unknown): PracticeMechanicsConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return structuredCloneDefault(DEFAULT_MECHANICS);
  }
  const r = raw as Record<string, unknown>;

  const mode: MechanicsMode =
    typeof r.mode === "string" && MODES.indexOf(r.mode as MechanicsMode) >= 0
      ? (r.mode as MechanicsMode)
      : DEFAULT_MECHANICS.mode;

  const pauseRaw = (typeof r.pause === "object" && r.pause !== null ? r.pause : {}) as Record<string, unknown>;
  const pause: PauseConfig = {
    playBars: intInRange(pauseRaw.playBars, 1, 16, DEFAULT_MECHANICS.pause.playBars),
    restBars: intInRange(pauseRaw.restBars, 1, 16, DEFAULT_MECHANICS.pause.restBars),
  };

  const abRaw = (typeof r.ab === "object" && r.ab !== null ? r.ab : {}) as Record<string, unknown>;
  const ab: AbConfig = {
    a: normalizeBarWindow(abRaw.a, DEFAULT_MECHANICS.ab.a),
    b: normalizeBarWindow(abRaw.b, DEFAULT_MECHANICS.ab.b),
    swapBars: intInRange(abRaw.swapBars, 1, 32, DEFAULT_MECHANICS.ab.swapBars),
  };

  const ramp = normalizeRampConfig(r.ramp);
  const rampEnabled =
    ramp !== null && r.rampEnabled === true;

  // S3 (D132/D126 lineage): the detect sub-field DEFAULTS AT READ -
  // a legacy payload without the key resolves to the shipped default
  // (NO v5, no migration; the no-v5 pin is the missing-key case in
  // practiceMechanics.test.ts).
  const detectRaw = (typeof r.detect === "object" && r.detect !== null ? r.detect : {}) as Record<string, unknown>;
  const detect: DetectConfig = {
    enabled: detectRaw.enabled === true,
    toleranceMs: intInRange(
      detectRaw.toleranceMs,
      60,
      300,
      DEFAULT_MECHANICS.detect.toleranceMs,
    ),
    passThreshold:
      typeof detectRaw.passThreshold === "number" &&
      Number.isFinite(detectRaw.passThreshold)
        ? Math.min(1, Math.max(0.5, detectRaw.passThreshold))
        : DEFAULT_MECHANICS.detect.passThreshold,
  };

  return {
    mode,
    pause,
    ab,
    ramp: ramp ?? editedRampLadder(r.ramp),
    rampEnabled,
    detect,
  };
}

/**
 * S2 fix-round (LOW-3): a REJECTED-but-shaped ladder (start >=
 * target) keeps the user's edited numbers instead of silently wiping
 * the whole ladder back to DEFAULT. SAFE by law 6: the returned
 * ladder is always start >= target (a valid one never reaches this
 * path) and normalizePracticeMechanics forces rampEnabled false for
 * it, so the ramp machine is unreachable. Every field is finite and
 * clamped to law 6's own ranges (bpm 30..240, counters floored at 1)
 * - NO NaN EVER SURVIVES (the MED-1 hydrate contract). A non-object
 * or a non-finite bpm is garbage: full default ladder.
 */
function editedRampLadder(raw: unknown): RampConfig {
  const d = DEFAULT_MECHANICS.ramp;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ...d };
  }
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const start = num(r.startBpm);
  const target = num(r.targetBpm);
  if (start === null || target === null) return { ...d };
  const bpm = (n: number): number => Math.min(240, Math.max(30, Math.floor(n)));
  const counter = (v: unknown, fallback: number): number => {
    const n = num(v);
    return n === null ? fallback : Math.max(1, Math.floor(n));
  };
  return {
    startBpm: bpm(start),
    targetBpm: bpm(target),
    stepBpm: counter(r.stepBpm, d.stepBpm),
    repsPerStep: counter(r.repsPerStep, d.repsPerStep),
    failThreshold: counter(r.failThreshold, d.failThreshold),
  };
}

/** Deep-clone the defaults so callers can never mutate the module
 *  constant (persist rehydration merges into these objects). */
function structuredCloneDefault(c: PracticeMechanicsConfig): PracticeMechanicsConfig {
  return {
    mode: c.mode,
    pause: { ...c.pause },
    ab: { a: { ...c.ab.a }, b: { ...c.ab.b }, swapBars: c.ab.swapBars },
    ramp: { ...c.ramp },
    rampEnabled: c.rampEnabled,
    detect: { ...c.detect },
  };
}

/**
 * The ramp chip string (REQ-PRAC-32, D127):
 *   "RAMP 96 -> 102 (+6)  rep 0/4  S4/F0"
 *   complete -> "RAMP 102 - TARGET"
 * S/F are CONSECUTIVE streaks - one of them is always 0, so an
 * "S3/F1"-style chip (the design doc's illustration) is UNREACHABLE
 * by construction; the reachable forms are pinned in
 * practiceMechanics.test.ts. ASCII only (the repo bans non-ASCII in
 * src). Lives here (not practiceHeader.ts) because it consumes
 * RampState/RampConfig - audit #20.
 */
export function formatRampChip(s: RampState, c: RampConfig): string {
  if (s.phase === "complete") {
    return `RAMP ${c.targetBpm} - TARGET`;
  }
  return (
    `RAMP ${s.bpm} -> ${c.targetBpm} (+${c.stepBpm})  ` +
    `rep ${s.repsAtBpm}/${c.repsPerStep}  S${s.successStreak}/F${s.failStreak}`
  );
}
