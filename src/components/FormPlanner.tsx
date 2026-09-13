/**
 * src/components/FormPlanner.tsx — bar strip with section labels.
 *
 * MVP: read-only display of the active plan's sections. v1 will
 * add draggable section boundaries; v2 will add inline form-template
 * editing.
 */

import React from "react";
import type { FormPlan } from "../lib/formPlanner";

interface FormPlannerProps {
  /** Active plan (null = no plan yet). */
  plan: FormPlan | null;
  /** Currently-active bar index. */
  activeBar?: number;
  /** Callback when the user clicks a bar — UI highlight only in MVP. */
  onBarClick?: (barIndex: number) => void;
  /** Optional className passthrough. */
  className?: string;
}

export const FormPlanner: React.FC<FormPlannerProps> = ({
  plan,
  activeBar,
  onBarClick,
  className,
}) => {
  if (!plan) {
    return (
      <section
        role="region"
        aria-label="Form"
        className={`rounded-lg border border-neutral-800 bg-neutral-900/30 p-3 text-[11px] font-mono text-neutral-500 ${className ?? ""}`}
      >
        <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1">
          Form
        </div>
        No plan loaded.
      </section>
    );
  }

  // Render one labeled block per section. Each block's width is
  // proportional to the section's bar count.
  const totalBars = plan.totalBars;

  return (
    <section
      role="region"
      aria-label="Form"
      className={`rounded-lg border border-neutral-800 bg-neutral-900/30 p-3 flex flex-col gap-2 ${className ?? ""}`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
          Form
        </span>
        <span className="text-[10px] font-mono text-neutral-500">
          {plan.template} · {totalBars} bars{plan.clamped ? " (clamped)" : ""}
        </span>
      </div>
      <div
        className="flex w-full gap-0.5"
        role="list"
        aria-label="Form sections"
      >
        {plan.sections.map((section, idx) => {
          const widthPct = (section.length / totalBars) * 100;
          const startBar = plan.sections.slice(0, idx).reduce((s, x) => s + x.length, 0);
          return (
            <button
              key={`${section.id}-${idx}`}
              role="listitem"
              type="button"
              title={`${section.id} — ${section.length} bars${section.cadence ? ` (${section.cadence})` : ""}`}
              onClick={() => onBarClick?.(startBar)}
              className={`h-7 rounded text-[11px] font-mono flex items-center justify-center transition-colors border ${
                activeBar != null && activeBar >= startBar && activeBar < startBar + section.length
                  ? "bg-purple-700/50 border-purple-500 text-purple-100"
                  : "bg-neutral-800/60 border-neutral-700 text-neutral-300 hover:bg-neutral-700/60"
              }`}
              style={{ width: `${widthPct}%` }}
              aria-label={`Section ${section.id}, ${section.length} bars`}
            >
              {section.id}
            </button>
          );
        })}
      </div>
      {plan.notice && (
        <div className="text-[10px] font-mono text-amber-300" role="status">
          {plan.notice}
        </div>
      )}
    </section>
  );
};
