/**
 * src/components/TrumpetStageBanner.tsx — persistent top-of-page
 * "stage" surface. Sits above the brass strip + header so the
 * Trumpet Stage tuner is the literal first thing a player sees.
 *
 * Compact, brand-tinted: shows the current target chord, an inline
 * "Start" trigger, and a key-binding hint. Click anywhere to open
 * the full TrumpetStageModal.
 */

import React from "react";
import { Mic, ChevronUp, ChevronDown } from "lucide-react";
import type { StageConfig } from "../lib/trumpetStage";

interface Props {
  /** Optional currently-active chord + degree sequence so the banner
   *  can show the next target at-a-glance. */
  activeTarget?: {
    degree: string;
    pitchClass: string;
    octave: number;
  } | null;
  /** Default config to show in the banner header. */
  defaultConfig?: StageConfig;
  /** Open the full modal. */
  onOpen: () => void;
  /** Whether the tuner is currently running (banner shows LIVE badge). */
  isRunning?: boolean;
  /** Allow collapsing the banner. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export const TrumpetStageBanner: React.FC<Props> = ({
  activeTarget,
  defaultConfig,
  onOpen,
  isRunning = false,
  collapsed = false,
  onToggleCollapsed,
}) => {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-trumpet-stage-launcher="banner"
      aria-label="Open trumpet stage tuner"
      className="w-full text-left flex items-center gap-3 px-4 sm:px-6 py-1.5 bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)] hover:bg-[color:var(--color-brand-strong)] transition-colors shadow-[0_2px_8px_rgba(212,168,87,0.25)] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
    >
      <Mic size={14} className="shrink-0" />
      <span className="t-mono text-[11px] font-bold tracking-wider uppercase shrink-0">
        Trumpet stage
      </span>
      {defaultConfig && (
        <span className="t-mono text-[11px] opacity-90 shrink-0 hidden sm:inline">
          {defaultConfig.chordRoot}
          {defaultConfig.chordQuality}
        </span>
      )}
      {activeTarget && !collapsed && (
        <span className="t-mono text-[11px] opacity-90 truncate flex-1 min-w-0">
          → {activeTarget.pitchClass}
          {activeTarget.octave}{" "}
          <span className="opacity-70">({activeTarget.degree})</span>
        </span>
      )}
      {!activeTarget && !collapsed && (
        <span className="t-mono text-[11px] opacity-80 truncate flex-1 min-w-0 hidden md:inline">
          Drill a chord-tone sequence with cents grading
        </span>
      )}
      <span className="ml-auto flex items-center gap-2 shrink-0">
        {isRunning && (
          <span className="t-mono text-[10px] uppercase tracking-wider bg-black/30 px-1.5 py-0.5 rounded">
            Live
          </span>
        )}
        {onToggleCollapsed && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapsed();
            }}
            className="opacity-80 hover:opacity-100"
            aria-label={collapsed ? "Expand stage banner" : "Collapse stage banner"}
          >
            {collapsed ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronUp size={14} />
            )}
          </span>
        )}
      </span>
    </button>
  );
};

export default TrumpetStageBanner;