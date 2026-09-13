/**
 * src/components/StyleWarnings.tsx — inline violation list rendered
 * above LiveScoreDisplay. MVP: takes pre-computed violations; v1
 * will run styleEnforcer inline.
 */

import React from "react";
import { AlertTriangle } from "lucide-react";

export interface StyleWarning {
  barIndex: number;
  type: "parallelFifth" | "parallelOctave" | "hiddenFifth" | "hiddenOctave";
  explanation: string;
}

interface StyleWarningsProps {
  styleName: string;
  violations: StyleWarning[];
}

export const StyleWarnings: React.FC<StyleWarningsProps> = ({
  styleName,
  violations,
}) => {
  if (violations.length === 0) return null;

  return (
    <section
      role="alert"
      aria-label={`${styleName} style violations`}
      className="rounded-lg border border-amber-700/60 bg-amber-950/30 p-3 flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className="text-amber-300" aria-hidden="true" />
        <span className="text-[11px] font-mono uppercase tracking-wider text-amber-200">
          {styleName} — {violations.length} violation{violations.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {violations.map((v, idx) => (
          <li
            key={`${v.type}-${v.barIndex}-${idx}`}
            className="text-[11px] font-mono text-amber-100 leading-snug"
          >
            <span className="text-amber-300">bar {v.barIndex + 1}</span> · {v.type.replace(/([A-Z])/g, " $1").toLowerCase()} · {v.explanation}
          </li>
        ))}
      </ul>
    </section>
  );
};
