import React from "react";
import { Play, Pause, ChevronLeft, ChevronRight, FileDown, Music } from "lucide-react";

interface Props {
  isPlayingAuto: boolean;
  setIsPlayingAuto: (v: boolean) => void;
  activeStepIndex: number;
  setActiveStepIndex: (v: number) => void;
  pathLength: number;
  onShowInspector: () => void;
  onShowExport: () => void;
  onCommit: () => void;
}

/**
 * Mobile-first persistent command bar.
 * Hidden on md+ (where the rail + page layout already provide transport).
 * Fixed to the bottom of the viewport with safe-area-inset awareness.
 *
 * Single deliberate rhythm: step chord (-/play/+) on the left, the two
 * most common "what next?" actions (inspect + commit/export) on the right.
 * Tap targets ≥ 44×44px.
 */
export const MobileCommandBar: React.FC<Props> = ({
  isPlayingAuto, setIsPlayingAuto,
  activeStepIndex, setActiveStepIndex,
  pathLength,
  onShowInspector, onShowExport, onCommit,
}) => {
  return (
    <nav
      aria-label="Playback controls"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 surface-2 border-t border-[color:var(--color-border)] backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2">
        {/* Left: step chord */}
        <div className="flex items-center justify-start gap-1">
          <button
            onClick={() => setActiveStepIndex(activeStepIndex - 1)}
            disabled={activeStepIndex <= 0}
            className="flex items-center justify-center w-11 h-11 rounded-[var(--radius-md)] surface-1 border border-[color:var(--color-border)] active:bg-[color:var(--color-bg-3)] disabled:opacity-30 transition-colors"
            aria-label="Previous chord"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => setActiveStepIndex(activeStepIndex + 1)}
            disabled={activeStepIndex >= pathLength - 1}
            className="flex items-center justify-center w-11 h-11 rounded-[var(--radius-md)] surface-1 border border-[color:var(--color-border)] active:bg-[color:var(--color-bg-3)] disabled:opacity-30 transition-colors"
            aria-label="Next chord"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Center: big play/pause */}
        <button
          onClick={() => setIsPlayingAuto(!isPlayingAuto)}
          aria-label={isPlayingAuto ? "Pause" : "Play"}
          className="flex items-center justify-center w-14 h-14 rounded-full bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)] shadow-[0_0_24px_rgba(212,168,87,0.35)] hover:bg-[color:var(--color-brand-strong)] active:scale-95 transition-transform"
        >
          {isPlayingAuto ? <Pause size={22} /> : <Play size={22} className="translate-x-[1px]" />}
        </button>

        {/* Right: commit + export */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onShowInspector}
            aria-label="Open chord inspector"
            className="flex items-center justify-center w-11 h-11 rounded-[var(--radius-md)] surface-1 border border-[color:var(--color-border)] active:bg-[color:var(--color-bg-3)] transition-colors"
          >
            <Music size={18} />
          </button>
          <button
            onClick={onCommit}
            aria-label="Record take"
            className="flex items-center justify-center w-11 h-11 rounded-[var(--radius-md)] surface-1 border border-[color:var(--color-border)] active:bg-[color:var(--color-bg-3)] transition-colors"
          >
            <span className="w-3 h-3 rounded-full bg-[color:var(--color-err)]" aria-hidden="true" />
          </button>
          <button
            onClick={onShowExport}
            aria-label="Open import / export"
            className="flex items-center justify-center w-11 h-11 rounded-[var(--radius-md)] surface-1 border border-[color:var(--color-border)] active:bg-[color:var(--color-bg-3)] transition-colors"
          >
            <FileDown size={18} />
          </button>
        </div>
      </div>
    </nav>
  );
};