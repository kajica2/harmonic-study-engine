import type { Persona } from "../lib/personas";
import { PERSONAS } from "../lib/personas";
import { User, Check } from "lucide-react";

interface PersonaRibbonProps {
  selectedPersonaId: string;
  onSelectPersona: (id: string) => void;
}

/**
 * Synesthesia Composer Personas Ribbon — pick the mastermind persona.
 * Self-contained leaf: only needs the active id + a select callback, plus
 * the static PERSONAS catalog. Extracted from App so the sidebar block
 * composes self-contained units (rendering-hoist-jsx, byte-exact leaf).
 */
export function PersonaRibbon({
  selectedPersonaId,
  onSelectPersona,
}: PersonaRibbonProps) {
  return (
    <div className="bg-[color:var(--color-bg-1)] border border-[color:var(--color-border)] rounded-[var(--radius-xl)] p-4 sm:p-5 flex flex-col gap-4 shadow-[0_4px_18px_rgba(0,0,0,0.35)]">
      <div className="flex items-baseline justify-between gap-3 px-1 flex-wrap">
        <div className="flex items-baseline gap-3">
          <User size={18} className="text-[color:var(--color-brand-strong)]" aria-hidden="true" />
          <div>
            <div className="t-label text-[color:var(--color-text-3)]">Personas</div>
            <h2 className="t-display-2 text-[color:var(--color-text-1)]">
              Choose a mastermind
            </h2>
          </div>
        </div>
        <p className="t-small text-[color:var(--color-text-2)] max-w-[24ch] sm:max-w-[36ch] text-right">
          Each persona loads their own synesthesia canvas, instrument voicing,
          and color story.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 gap-3 overflow-x-auto pb-1">
        {PERSONAS.map((p) => {
          const isActive = selectedPersonaId === p.id;
          const isDocumented = p.synesthesiaStatus === "documented";
          return (
            <button
              key={p.id}
              onClick={() => onSelectPersona(p.id)}
              aria-pressed={isActive}
              className={`relative text-left p-3 rounded-xl border transition-all duration-300 flex flex-col justify-between h-36 group ${
                isActive
                  ? `bg-gradient-to-br ${p.gradientFrom} ${p.gradientTo} shadow-[0_4px_20px_rgba(0,0,0,0.4)]`
                  : "bg-neutral-900/40 border-transparent hover:bg-neutral-900/80 hover:border-neutral-800"
              }`}
              style={{
                borderColor: isActive ? p.accentColor : undefined,
                borderWidth: isActive ? 2 : undefined,
                boxShadow: isActive
                  ? `0 0 0 2px ${p.accentColor}40, 0 4px 20px rgba(0,0,0,0.4)`
                  : undefined,
              }}
            >
              {/* Active top-strip — non-color signal (shape) */}
              {isActive && (
                <div
                  className="absolute top-0 inset-x-0 h-1 rounded-t-xl"
                  style={{ backgroundColor: p.accentColor }}
                />
              )}

              <div className="flex items-start justify-between w-full">
                {/* Compact Profile Circle */}
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono font-bold tracking-tighter"
                  style={{
                    backgroundColor: isActive
                      ? p.accentColor + "15"
                      : "rgba(255,255,255,0.05)",
                    color: p.accentColor,
                  }}
                >
                  {p.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>

                {/* Synesthesia badge: ✅ Documented / 🎨 Interpretive
                    OR the existing "active" indicator when selected.
                    Color-blind safe: both badge and check use shape,
                    not color, as the carrier. */}
                {isDocumented ? (
                  <span
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--radius-sm)] border border-[color:var(--color-info)]/40 bg-[color:var(--color-info)]/10 text-[color:var(--color-info)] text-[8px] font-mono uppercase tracking-wider"
                    title="Documented synesthesia — color is historically sourced"
                  >
                    <Check size={10} aria-hidden="true" />
                    documented
                  </span>
                ) : (
                  <span
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--radius-sm)] border border-[color:var(--color-warn)]/40 bg-[color:var(--color-warn)]/10 text-[color:var(--color-warn)] text-[8px] font-mono uppercase tracking-wider"
                    title="Interpretive color — mood/texture metaphor"
                  >
                    interpretive
                  </span>
                )}
              </div>

              <div className="mt-2">
                <div className="font-semibold text-xs text-neutral-200 truncate">
                  {p.name}
                </div>
                <div className="text-[10px] text-neutral-500 font-medium truncate mt-0.5">
                  {p.role}
                </div>
              </div>

              {/* Technique chips — first 2 visible, rest on hover via
                  title attr. Pure visual hint of what the persona does;
                  click cycles the active highlight elsewhere. */}
              {p.techniques && p.techniques.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {p.techniques.slice(0, 2).map((t) => (
                    <span
                      key={t}
                      className="px-1.5 py-0.5 rounded text-[8px] font-mono uppercase tracking-wider bg-neutral-900/60 border border-neutral-800 text-neutral-500"
                      title={`technique: ${t}`}
                    >
                      {t.replace(/_/g, " ")}
                    </span>
                  ))}
                  {p.techniques.length > 2 && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[8px] font-mono text-neutral-600"
                      title={p.techniques.slice(2).join(", ")}
                    >
                      +{p.techniques.length - 2}
                    </span>
                  )}
                </div>
              )}

              {/* Quote block */}
              <div className="text-[8px] text-neutral-400 font-serif italic truncate w-full opacity-60 mt-1">
                "{p.quote}"
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
