/**
 * src/components/FormTemplatePicker.tsx — 4 template cards (one per
 * src/data/formTemplates/*.json in v1). MVP: 4 cards rendered from
 * the formPlanner.ts in-module defaults.
 */

import React from "react";
import type { FormPlan, FormTemplateId } from "../lib/formPlanner";

interface TemplateDef {
  id: FormTemplateId;
  name: string;
  description: string;
}

const TEMPLATES: TemplateDef[] = [
  {
    id: "aaba",
    name: "AABA",
    description: "32-bar standard. Two A's, contrasting B (bridge), A' return.",
  },
  {
    id: "abac",
    name: "ABAC",
    description: "32-bar variant. A and A' replaced by a contrasting C section.",
  },
  {
    id: "theme-vars",
    name: "Theme + Variations",
    description: "40-bar. Each variation reworks the theme (rhythm, melody, harmony).",
  },
  {
    id: "through-composed",
    name: "Through-Composed",
    description: "32-bar. No repeated sections; new material throughout.",
  },
];

interface FormTemplatePickerProps {
  activeId: FormTemplateId | null;
  /** When set, show the active plan's bar count under each card. */
  planFor?: (id: FormTemplateId) => FormPlan | null;
  onPick: (id: FormTemplateId) => void;
}

export const FormTemplatePicker: React.FC<FormTemplatePickerProps> = ({
  activeId,
  planFor,
  onPick,
}) => {
  return (
    <section
      role="region"
      aria-label="Form templates"
      className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-3 flex flex-col gap-2"
    >
      <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
        Template
      </span>
      <div className="grid grid-cols-2 gap-2">
        {TEMPLATES.map((t) => {
          const plan = planFor?.(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onPick(t.id)}
              aria-pressed={activeId === t.id}
              className={`text-left p-2 rounded border transition-colors ${
                activeId === t.id
                  ? "border-purple-600/70 bg-purple-900/40 text-purple-100"
                  : "border-neutral-800 bg-neutral-900/40 text-neutral-300 hover:bg-neutral-800"
              }`}
              title={t.description}
            >
              <div className="font-mono text-[12px]">{t.name}</div>
              <div className="text-[10px] text-neutral-400 mt-0.5 leading-snug">
                {t.description}
              </div>
              {plan && (
                <div className="text-[10px] text-neutral-500 mt-0.5 font-mono">
                  {plan.totalBars} bars
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
};
