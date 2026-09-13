import React, { useMemo, useState } from "react";
import { Filter, Search, X } from "lucide-react";
import type { HarmonicPath } from "../lib/paths";

/**
 * PathCatalog — a filterable grid of all available HarmonicPath items.
 *
 * Sits next to the existing "Paths" and "Practice" tabs in the left
 * sidebar. Provides four orthogonal facets the other surfaces lack:
 *  - composer (free-text match against the path's `composer` field,
 *    falling back to "")
 *  - key (dropdown of common keys; matches the path's `key` token
 *    prefix so `"F"` matches `"F"` but also `"F major"` and starts
 *    of arrow-separated keys like `"F → Bb"`)
 *  - behavioral-rule chips — each chip is *present* in the path's
 *    `rules` set if and only if the upstream derivation says so
 *    (App.tsx supplies this via `rulesByPathId`)
 *  - technique chips — keyed by the path's `techniques` array
 *    (optional on HarmonicPath — see Personas-style footprint)
 *
 * Clicking "Open" calls `onSelect(path.id)`; the parent wires it to
 * `setActivePathIndex(idx)` after locating the path's index in its
 * own `paths` array (because this component is intentionally
 * decoupled from any specific paths store).
 *
 * Visual style deliberately mirrors the persona cards above the rail:
 * `bg-neutral-900/40` on the inactive state, `border-transparent`,
 * `rounded-xl`, same chip typography.
 */

export type BehavioralRuleId =
  | "sequenceStepper"
  | "keyDrift"
  | "motifTracker"
  | "frozenBass"
  | "sliceAndRepeat"
  | "bassIsolation";

export type BehavioralRuleMap = Record<string, BehavioralRuleId[]>;

export const BEHAVIORAL_RULES: { id: BehavioralRuleId; label: string }[] = [
  { id: "sequenceStepper", label: "Sequence Stepper" },
  { id: "keyDrift", label: "Key Drift" },
  { id: "motifTracker", label: "Motif Tracker" },
  { id: "frozenBass", label: "Frozen Bass" },
  { id: "sliceAndRepeat", label: "Slice & Repeat" },
  { id: "bassIsolation", label: "Bass Isolation" },
];

/**
 * Common keys surfaced in the dropdown. Anything not in this list can
 * still appear on a path; the user picks "All" (the default) and the
 * filter no-ops. We deliberately keep this list short — it matches
 * the curated wheel used by the generator etude dropdown.
 */
const COMMON_KEYS: string[] = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
  "Cm",
  "Dm",
  "Em",
  "Gm",
  "Am",
  "Bm",
];

export interface PathCatalogProps {
  paths: HarmonicPath[];
  /**
   * Map from path.id → set of behavioral rule ids that apply to that
   * path. Optional — when omitted, no paths match the rule filters
   * (i.e. all 6 chips look empty, which is still a valid view).
   */
  rulesByPathId?: BehavioralRuleMap;
  /** Receive the selected path's id. */
  onSelect: (pathId: string) => void;
  /**
   * Optional empty-state message override. Default: a friendly
   * "Nothing matches those filters."
   */
  emptyMessage?: string;
}

function padStepCount(path: HarmonicPath): number {
  // Mirror padPath() in lib/paths.ts at render time: snap steps to
  // [MIN_PATH_BARS, MAX_PATH_BARS] bars. We don't actually re-write
  // the path — we just count what the user-visible length would be.
  const MIN = 24 * 4;
  const MAX = 64 * 4;
  let n = path.steps.length;
  const orig = n;
  while (n < MIN) {
    const need = Math.min(orig, MIN - n);
    n += need;
  }
  if (n > MAX) n = MAX;
  return n;
}

function pathKeyPrefix(key: string | undefined): string | null {
  if (!key) return null;
  // "F → Bb" → "F"; "F major" → "F"; "F" → "F"; "Bb-" → "Bb"
  const trimmed = key.trim();
  if (!trimmed) return null;
  const arrow = trimmed.split(/[→\-]/)[0].trim();
  return arrow || null;
}

export const PathCatalog: React.FC<PathCatalogProps> = ({
  paths,
  rulesByPathId = {},
  onSelect,
  emptyMessage = "Nothing matches those filters.",
}) => {
  const [composer, setComposer] = useState("");
  const [key, setKey] = useState<string>("");
  const [activeRules, setActiveRules] = useState<Set<BehavioralRuleId>>(
    new Set(),
  );

  const toggleRule = (id: BehavioralRuleId) => {
    setActiveRules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Compose composer list (for the dropdown of known composers, plus the
  // free-text fallback). Keep ordering stable and dedup case-insensitive.
  const knownComposers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of paths) {
      const c = (p.composer ?? "").trim();
      if (!c) continue;
      const key = c.toLowerCase();
      if (!seen.has(key)) seen.set(key, c);
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [paths]);

  const allTechniques = useMemo(() => {
    const seen = new Set<string>();
    for (const p of paths) {
      const techs = (p as unknown as { techniques?: string[] }).techniques;
      if (Array.isArray(techs)) for (const t of techs) if (t) seen.add(t);
    }
    return Array.from(seen).sort();
  }, [paths]);

  const [activeTechniques, setActiveTechniques] = useState<Set<string>>(
    new Set(),
  );
  const toggleTechnique = (id: string) => {
    setActiveTechniques((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const composerNeedle = composer.trim().toLowerCase();
    return paths.filter((p) => {
      // Composer filter — substring match against composer field.
      if (composerNeedle) {
        const c = (p.composer ?? "").toLowerCase();
        if (!c.includes(composerNeedle)) return false;
      }
      // Key filter — exact prefix match against the path's first key token.
      if (key) {
        const prefix = pathKeyPrefix(p.key);
        if (prefix !== key) return false;
      }
      // Behavioral-rule filter — every active rule must be present in the
      // rule set for this path. Empty activeRules is a no-op.
      if (activeRules.size > 0) {
        const rules = rulesByPathId[p.id] ?? [];
        for (const r of activeRules) if (!rules.includes(r)) return false;
      }
      // Technique filter — every active technique must be present.
      if (activeTechniques.size > 0) {
        const techs = (p as unknown as { techniques?: string[] })
          .techniques ?? [];
        for (const t of activeTechniques) if (!techs.includes(t)) return false;
      }
      return true;
    });
  }, [paths, composer, key, activeRules, activeTechniques, rulesByPathId]);

  const anyFilterActive =
    composer.trim() !== "" ||
    key !== "" ||
    activeRules.size > 0 ||
    activeTechniques.size > 0;

  const clearAll = () => {
    setComposer("");
    setKey("");
    setActiveRules(new Set());
    setActiveTechniques(new Set());
  };

  return (
    <div className="flex flex-col gap-3" data-testid="path-catalog">
      <header className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-sm uppercase tracking-widest text-neutral-500 font-semibold flex items-center gap-2">
          <Filter size={14} className="text-purple-400" aria-hidden="true" />
          Path Catalog
          <span className="text-[10px] text-neutral-600 font-mono">
            ({filtered.length}/{paths.length})
          </span>
        </h2>
        {anyFilterActive && (
          <button
            onClick={clearAll}
            className="text-[10px] uppercase tracking-wider text-neutral-500 hover:text-neutral-200 font-mono flex items-center gap-1"
          >
            <X size={10} aria-hidden="true" />
            clear
          </button>
        )}
      </header>

      {/* Composer + Key row */}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono">
            Composer
          </span>
          <div className="relative">
            <Search
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500"
              aria-hidden="true"
            />
            <input
              type="text"
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              placeholder="Any composer"
              data-testid="catalog-composer-input"
              className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-neutral-900/40 border border-neutral-800 focus:border-neutral-500 text-xs text-neutral-200 placeholder:text-neutral-600 outline-none"
              aria-label="Filter by composer"
            />
          </div>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono">
            Key
          </span>
          <select
            value={key}
            onChange={(e) => setKey(e.target.value)}
            data-testid="catalog-key-select"
            className="w-full px-2 py-1.5 rounded-lg bg-neutral-900/40 border border-neutral-800 focus:border-neutral-500 text-xs text-neutral-200 outline-none"
            aria-label="Filter by key"
          >
            <option value="">Any key</option>
            {COMMON_KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Behavioral-rule chips */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono mb-1.5">
          Behavioral rule
        </div>
        <div className="flex flex-wrap gap-1">
          {BEHAVIORAL_RULES.map((r) => {
            const active = activeRules.has(r.id);
            return (
              <button
                key={r.id}
                onClick={() => toggleRule(r.id)}
                aria-pressed={active}
                data-testid={`catalog-rule-${r.id}`}
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider transition-colors ${
                  active
                    ? "bg-purple-500/20 text-purple-200 border border-purple-500/40"
                    : "bg-neutral-900/40 text-neutral-500 border border-neutral-800 hover:text-neutral-200"
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Technique chips — only show if any path has techniques */}
      {allTechniques.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono mb-1.5">
            Technique
          </div>
          <div className="flex flex-wrap gap-1">
            {allTechniques.map((t) => {
              const active = activeTechniques.has(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleTechnique(t)}
                  aria-pressed={active}
                  data-testid={`catalog-tech-${t}`}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider transition-colors ${
                    active
                      ? "bg-cyan-500/20 text-cyan-200 border border-cyan-500/40"
                      : "bg-neutral-900/40 text-neutral-500 border border-neutral-800 hover:text-neutral-200"
                  }`}
                >
                  {t.replace(/_/g, " ")}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Result grid */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar"
        data-testid="catalog-grid"
      >
        {filtered.length === 0 ? (
          <div className="col-span-full t-small text-neutral-500 italic px-2 py-3">
            {emptyMessage}
          </div>
        ) : (
          filtered.map((p) => {
            const techs =
              (p as unknown as { techniques?: string[] }).techniques ?? [];
            const stepCount = padStepCount(p);
            return (
              <article
                key={p.id}
                data-testid="catalog-card"
                data-path-id={p.id}
                className="flex flex-col gap-2 p-3 rounded-xl border border-transparent bg-neutral-900/40 hover:bg-neutral-900/80 hover:border-neutral-800 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-xs text-neutral-200 line-clamp-2">
                    {p.title}
                  </h3>
                  <span className="text-[9px] text-neutral-600 font-mono whitespace-nowrap flex-shrink-0">
                    {stepCount} steps
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-neutral-500 font-mono">
                  {p.composer ? <span>{p.composer}</span> : null}
                  {p.composer && p.key ? (
                    <span className="text-neutral-700">·</span>
                  ) : null}
                  {p.key ? <span>{p.key}</span> : null}
                </div>

                {/* Technique chips — first 2, mirroring the persona card. */}
                {techs.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {techs.slice(0, 2).map((t) => (
                      <span
                        key={t}
                        className="px-1.5 py-0.5 rounded text-[8px] font-mono uppercase tracking-wider bg-neutral-900/60 border border-neutral-800 text-neutral-500"
                        title={`technique: ${t}`}
                      >
                        {t.replace(/_/g, " ")}
                      </span>
                    ))}
                    {techs.length > 2 && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[8px] font-mono text-neutral-600"
                        title={techs.slice(2).join(", ")}
                      >
                        +{techs.length - 2}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between mt-auto pt-1">
                  <span className="text-[9px] uppercase tracking-wider text-neutral-600 font-mono truncate">
                    {p.id}
                  </span>
                  <button
                    onClick={() => onSelect(p.id)}
                    data-testid={`catalog-open-${p.id}`}
                    className="px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 transition-colors"
                  >
                    Open
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
};

export default PathCatalog;
