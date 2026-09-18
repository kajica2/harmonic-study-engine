/**
 * src/components/RecentTakesPanel.tsx — "Recent takes" read side of the
 * performance log (roadmap option G).
 *
 * Shows the last few recorded takes from the practice rail: path title,
 * tempo, instrument, loop duration, time-ago, and a 1–5 self-rating.
 * Rating buttons write straight back into the persisted take. A Clear
 * button wipes the whole log.
 *
 * Rendered by App only when at least one take exists, so first paint
 * stays untouched.
 */
import React from "react";
import { Trash2, Clock } from "lucide-react";
import {
  formatRelativeTime,
  getPreviousTakeWithTally,
  guideToneAccuracy,
  type PerformanceTake,
} from "../lib/performanceLog";

const RATE_LABELS = ["struggled", "getting there", "comfortable", "solid", "mastered"];

interface RecentTakesPanelProps {
  takes: PerformanceTake[];
  onRate: (id: string, rating: number) => void;
  onClear: () => void;
}

export const RecentTakesPanel = React.memo(function RecentTakesPanel({
  takes,
  onRate,
  onClear,
}: RecentTakesPanelProps) {
  // Newest first for the panel (the log itself is append-ordered).
  const ordered = [...takes].reverse();
  return (
    <section
      aria-label="Recent takes"
      className="rounded-2xl border border-[color:var(--color-border)] surface-1 p-4"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="t-h2 text-[color:var(--color-text-1)] text-sm flex items-center gap-2">
          <Clock size={14} className="text-[color:var(--color-brand-muted)]" aria-hidden />
          Recent takes
        </h3>
        <button
          onClick={onClear}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider text-neutral-500 hover:text-rose-300 hover:bg-white/5 transition-colors"
        >
          <Trash2 size={11} aria-hidden /> Clear
        </button>
      </div>

      <ul className="flex flex-col divide-y divide-white/5">
        {ordered.map((t) => (
          <TakeRow
            key={t.id}
            take={t}
            allTakes={takes}
            onRate={(rating) => onRate(t.id, rating)}
          />
        ))}
      </ul>
    </section>
  );
});

/**
 * GuideToneProgress — the option G read-out fed by the option C
 * classifier: "3/5 guide tones · 60%" with a tiny fill bar. Rendered
 * only for takes that carry the tally (older takes stay clean).
 */
const GuideToneProgress: React.FC<{ take: PerformanceTake }> = ({ take }) => {
  const hit = take.transitionsHit ?? 0;
  const total = hit + (take.transitionsMissed ?? 0);
  const pct = total === 0 ? 0 : Math.round((hit / total) * 100);
  return (
    <div className="mt-1 flex items-center gap-2">
      <span className="text-[10px] font-mono text-neutral-400">
        Guide tones{" "}
        <span className={pct >= 70 ? "text-emerald-300" : pct >= 40 ? "text-amber-300" : "text-neutral-300"}>
          {hit}/{total} · {pct}%
        </span>
      </span>
      <span
        role="progressbar"
        aria-label={`Guide-tone accuracy ${pct}%`}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-24 rounded-full bg-white/10 overflow-hidden"
      >
        <span
          className={`block h-full rounded-full transition-all ${
            pct >= 70 ? "bg-emerald-400" : pct >= 40 ? "bg-amber-400" : "bg-neutral-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </span>
    </div>
  );
};

/**
 * RepDiff — the "first try vs rep #3" subline shown when a take has
 * a recorded tally AND an immediately-previous take on the same path
 * also has a tally. Renders the absolute accuracy delta as
 * "+15% vs rep #N" (positive = improvement).
 *
 * Hidden when no prior take with a tally exists, when the current
 * take has no tally yet, or when the current take is rep #1.
 */
const RepDiff: React.FC<{
  take: PerformanceTake;
  allTakes: PerformanceTake[];
}> = ({ take, allTakes }) => {
  const prev = getPreviousTakeWithTally(allTakes, take);
  if (!prev) return null;
  const cur = guideToneAccuracy(take);
  const pre = guideToneAccuracy(prev);
  if (cur === null || pre === null) return null;
  const deltaPct = Math.round((cur - pre) * 100);
  const sign = deltaPct > 0 ? "+" : "";
  const color =
    deltaPct > 0
      ? "text-emerald-300"
      : deltaPct < 0
        ? "text-rose-300"
        : "text-neutral-400";
  return (
    <div className="mt-0.5 text-[10px] font-mono">
      <span className={color}>
        {sign}
        {deltaPct}% vs rep #{prev.rep}
      </span>
    </div>
  );
};

const TakeRow: React.FC<{
  take: PerformanceTake;
  allTakes: PerformanceTake[];
  onRate: (rating: number) => void;
}> = ({ take, allTakes, onRate }) => (
  <li className="flex flex-wrap items-center justify-between gap-2 py-2">
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="font-bold text-sm text-[color:var(--color-text-1)] truncate">
          {take.pathTitle}
        </span>
        {typeof take.rep === "number" && (
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[color:var(--color-border)] text-neutral-400"
            title={`Repetition #${take.rep} on this path`}
          >
            rep {take.rep}
          </span>
        )}
        <span className="text-[10px] font-mono text-neutral-500">
          {formatRelativeTime(take.recordedAt)}
        </span>
      </div>
      <div className="text-[11px] font-mono text-neutral-500">
        {take.tempo} BPM · {take.meter} · {take.instrument} ·{" "}
        {take.durationSec.toFixed(1)}s
      </div>
      {typeof take.transitionsHit === "number" &&
        typeof take.transitionsMissed === "number" && (
          <>
            <GuideToneProgress take={take} />
            <RepDiff take={take} allTakes={allTakes} />
          </>
        )}
    </div>

    <div
      className="flex items-center gap-0.5"
      role="radiogroup"
      aria-label={`Rate ${take.pathTitle}`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const active = take.selfRating === n;
        return (
          <button
            key={n}
            role="radio"
            aria-checked={active}
            aria-label={`${n} — ${RATE_LABELS[n - 1]}`}
            title={RATE_LABELS[n - 1]}
            onClick={() => onRate(n)}
            className={`w-6 h-6 rounded text-[10px] font-mono transition-colors ${
              active
                ? "bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)]"
                : "bg-white/5 text-neutral-500 hover:text-neutral-200 hover:bg-white/10"
            }`}
          >
            {n}
          </button>
        );
      })}
    </div>
  </li>
);