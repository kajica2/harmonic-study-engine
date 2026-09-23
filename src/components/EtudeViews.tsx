/**
 * EtudeViews.tsx - PRD-001 Phase 3 Slice 2 (D22/D25/D26).
 *
 * The etude read-out surface: a Roll/Staff tab pair mounted in the
 * right column of the Etude surface. The piano roll is a static
 * import (small, SVG); the abcjs staff view is lazy so the notation
 * library stays code-split (this component is itself lazy in App).
 */

import React, { lazy, Suspense, useState } from "react";
import type { Etude } from "../../engine/etude/types";
import { EtudePianoRoll } from "./EtudePianoRoll";

const EtudeStaffView = lazy(() =>
  import("./EtudeStaffView").then((m) => ({ default: m.EtudeStaffView })),
);

export interface EtudeViewsProps {
  etude: Etude;
  pathId: string;
  transposeShift: number;
  /**
   * FORM-relative bar index to highlight (0 .. etude.bars - 1) or
   * null. FIX-ROUND INVARIANT (DOCS-CATCH): etude practice paths
   * carry ONE STEP PER BAR (slice-1 finding 4), so App derives this
   * with `etudeActiveBarFor(etude, activeStepIndex)` =
   * `stepIndex % etude.bars` - NOT the legacy
   * `Math.floor(stepIndex / STEPS_PER_BAR)` (4 steps/bar), which
   * advances the highlight at 1/4 speed and falls out of range after
   * the first third of the padded loop. EtudePianoRoll clamps
   * out-of-range values defensively; with the correct mapping the
   * highlight is ALWAYS in range while the form loops.
   */
  activeBar: number | null;
}

export function EtudeViews({
  etude,
  pathId,
  transposeShift,
  activeBar,
}: EtudeViewsProps): React.ReactElement {
  const [tab, setTab] = useState<"roll" | "staff">("roll");

  const tabClass = (active: boolean): string =>
    `px-3 py-1 rounded-[var(--radius-sm)] text-xs font-mono transition-colors ${
      active
        ? "bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)]"
        : "text-[color:var(--color-text-2)] hover:bg-[color:var(--color-bg-2)] hover:text-[color:var(--color-text-1)]"
    }`;

  return (
    <section
      aria-label={`Etude views for ${pathId}`}
      className="w-full rounded-[var(--radius-xl)] border border-[color:var(--color-border)] bg-[color:var(--color-bg-1)] p-3 sm:p-4 flex flex-col gap-3"
    >
      <div className="flex items-center gap-2">
        <span className="t-label text-[color:var(--color-text-3)]">
          Etude view
        </span>
        <button
          type="button"
          className={tabClass(tab === "roll")}
          aria-pressed={tab === "roll"}
          onClick={() => setTab("roll")}
        >
          Piano roll
        </button>
        <button
          type="button"
          className={tabClass(tab === "staff")}
          aria-pressed={tab === "staff"}
          onClick={() => setTab("staff")}
        >
          Staff
        </button>
      </div>
      {tab === "roll" ? (
        <EtudePianoRoll
          etude={etude}
          transposeShift={transposeShift}
          activeBar={activeBar}
        />
      ) : (
        <Suspense
          fallback={
            <p className="text-xs text-[color:var(--color-text-3)]">
              Loading staff renderer...
            </p>
          }
        >
          <EtudeStaffView etude={etude} transposeShift={transposeShift} />
        </Suspense>
      )}
    </section>
  );
}
