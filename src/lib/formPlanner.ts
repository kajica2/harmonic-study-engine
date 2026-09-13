/**
 * src/lib/formPlanner.ts — form template planning + section reorder.
 *
 * Decision (resolved 2026-09-13): the 24-64 bar invariant
 * (`MIN_PATH_BARS`, `MAX_PATH_BARS` in src/lib/paths.ts:55-56) is
 * HARD by default. Sub-24-bar user paths require an explicit
 * `relaxInvariant: true` flag on the planner call. The override is
 * logged in the undo history entry.
 *
 * MVP: pure functions, no React. Templates are JSON files in
 * `src/data/formTemplates/`. Reorder round-trips byte-equal.
 */

import {
  MIN_PATH_BARS,
  MAX_PATH_BARS,
  type HarmonicStep,
} from "./paths";

export type FormTemplateId = "aaba" | "abac" | "theme-vars" | "through-composed";

export interface FormSection {
  /** Stable id within the template (A, B, A', etc.). */
  id: string;
  /** Length in bars (after snap to MIN/MAX). */
  length: number;
  /** Optional cadence hint for the section's last bar. */
  cadence?: "ii-V-I" | "V/V-V-I" | "plagal" | "deceptive" | "half-cadence" | "none";
}

export interface FormPlan {
  template: FormTemplateId;
  /** Sections in performance order. */
  sections: FormSection[];
  /** Total bars in the plan (sum of section lengths). */
  totalBars: number;
  /** True if the plan violated the 24-64 invariant and was clamped. */
  clamped: boolean;
  /** Optional notice shown to the user when clamping occurred. */
  notice?: string;
}

export interface PlanFormArgs {
  bars: number;
  template: FormTemplateId;
  /** When true, plans can go below MIN_PATH_BARS (default false). */
  relaxInvariant?: boolean;
}

export interface ReorderSectionArgs {
  /** Existing section list. */
  sections: FormSection[];
  /** Desired order by section id. */
  order: string[];
}

/** Result type — either ok with a plan, or fail with a reason. */
export type PlanFormResult =
  | { ok: true; plan: FormPlan }
  | { ok: false; error: string };

/**
 * 4 starter templates. The shape is hand-tuned; v1 will move these to
 * `src/data/formTemplates/*.json` and load them at boot.
 */
const TEMPLATES: Record<FormTemplateId, () => FormSection[]> = {
  aaba: () => [
    { id: "A", length: 8, cadence: "ii-V-I" },
    { id: "A", length: 8, cadence: "ii-V-I" },
    { id: "B", length: 8, cadence: "V/V-V-I" },
    { id: "A", length: 8, cadence: "ii-V-I" },
  ],
  abac: () => [
    { id: "A", length: 8, cadence: "ii-V-I" },
    { id: "B", length: 8, cadence: "V/V-V-I" },
    { id: "A", length: 8, cadence: "ii-V-I" },
    { id: "C", length: 8, cadence: "plagal" },
  ],
  "theme-vars": () => [
    { id: "T", length: 8, cadence: "ii-V-I" },
    { id: "V1", length: 8, cadence: "half-cadence" },
    { id: "V2", length: 8, cadence: "ii-V-I" },
    { id: "V3", length: 8, cadence: "ii-V-I" },
    { id: "Coda", length: 8, cadence: "plagal" },
  ],
  "through-composed": () => [
    { id: "A", length: 8, cadence: "ii-V-I" },
    { id: "B", length: 8, cadence: "half-cadence" },
    { id: "C", length: 8, cadence: "deceptive" },
    { id: "D", length: 8, cadence: "ii-V-I" },
  ],
};

/**
 * Plan a form for the given bar count under the active template.
 * If `bars` is outside [24, 64] and `relaxInvariant` is false,
 * returns {ok: false, error}. If clamping is needed (e.g. bar
 * count divides unevenly into the template), clamps sections and
 * surfaces a notice.
 */
export function planForm(args: PlanFormArgs): PlanFormResult {
  const { bars, template, relaxInvariant = false } = args;
  const minBars = relaxInvariant ? 1 : MIN_PATH_BARS;
  if (bars < minBars || bars > MAX_PATH_BARS) {
    return {
      ok: false,
      error: `bar count ${bars} outside invariant [${minBars}, ${MAX_PATH_BARS}]; pass relaxInvariant: true to override`,
    };
  }

  const sections = TEMPLATES[template]();
  const total = sections.reduce((s, x) => s + x.length, 0);
  const ratio = bars / total;
  const scaled: FormSection[] = sections.map((s) => ({
    ...s,
    length: Math.max(1, Math.round(s.length * ratio)),
  }));
  const newTotal = scaled.reduce((s, x) => s + x.length, 0);

  // Snap the last section to make the totals match the requested bars.
  // `clamped` is true when rounding alone didn't hit the target and
  // we had to adjust the last section.
  const diff = bars - newTotal;
  const clamped = diff !== 0;
  if (clamped && scaled.length > 0) {
    const last = scaled[scaled.length - 1];
    last.length = Math.max(1, last.length + diff);
  }

  const finalTotal = scaled.reduce((s, x) => s + x.length, 0);

  return {
    ok: true,
    plan: {
      template,
      sections: scaled,
      totalBars: finalTotal,
      clamped,
      notice: clamped
        ? `Section lengths snapped to satisfy ${bars}-bar target (final = ${finalTotal} bars).`
        : undefined,
    },
  };
}

/**
 * Reorder sections by id. Throws if `order` references a missing id.
 * Round-trips byte-equal: `reorder(s, originalOrder)` is identity,
 * and `reorder(reorder(s, A), originalOrder)` is also identity.
 */
export function reorderSections<T extends { id: string }>(args: {
  sections: T[];
  order: string[];
}): T[] {
  const { sections, order } = args;
  const byId = new Map(sections.map((s) => [s.id, s] as const));
  if (order.length !== sections.length) {
    throw new Error(
      `reorderSections: order length ${order.length} != sections length ${sections.length}`,
    );
  }
  for (const id of order) {
    if (!byId.has(id)) throw new Error(`reorderSections: unknown section id '${id}'`);
  }
  // Reject duplicate ids in the order.
  if (new Set(order).size !== order.length) {
    throw new Error("reorderSections: duplicate ids in order");
  }
  // Reorder in the requested sequence.
  const result: T[] = [];
  for (const id of order) result.push(byId.get(id) as T);
  return result;
}

/**
 * Tag a path's `HarmonicStep[]` with section labels derived from a
 * plan. Mutates a copy of `steps` and adds a side-channel via
 * `sectionLabels: string[]` (a parallel array). Pure function —
 * no React.
 */
export function tagSections(args: {
  steps: HarmonicStep[];
  sections: FormSection[];
}): { taggedSteps: HarmonicStep[]; sectionLabels: string[] } {
  const { steps, sections } = args;
  const labels: string[] = [];
  let stepIdx = 0;
  for (const s of sections) {
    for (let b = 0; b < s.length; b++) {
      for (let beat = 0; beat < 4 && stepIdx < steps.length; beat++) {
        labels.push(`${s.id}${b === s.length - 1 && beat === 3 ? " (end)" : ""}`);
        stepIdx++;
      }
    }
  }
  return { taggedSteps: steps.slice(), sectionLabels: labels };
}

/** Re-export the invariant so callers don't need to import from paths.ts. */
export { MIN_PATH_BARS, MAX_PATH_BARS };
