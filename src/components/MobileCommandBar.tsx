import React, { useState } from "react";
import { Play, Pause, MoreHorizontal, FileDown, Music, Mic, RefreshCw, Volume2 } from "lucide-react";

interface Props {
  isPlayingAuto: boolean;
  setIsPlayingAuto: (v: boolean) => void;
  activeStepIndex: number;
  setActiveStepIndex: (v: number) => void;
  pathLength: number;
  onShowInspector: () => void;
  onShowExport: () => void;
  onCommit: () => void;
  onTogglePlayAlong?: () => void;
  onToggleLoop?: () => void;
  melodyMuted?: boolean;
  isLooping?: boolean;
}

/**
 * Mobile-first persistent command bar. Hidden on md+ (where the
 * rail + page layout already provide transport). Fixed to the bottom
 * of the viewport with safe-area-inset awareness.
 *
 * Three primary actions on the bar:
 *   - Center: big Play / Pause (the only one-tap action a player
 *     needs while holding their horn)
 *   - Left: Previous chord (◂) — quick nav
 *   - Right: Next chord (▸) — quick nav
 *
 * Everything else (inspector, record, export, loop, play-along,
 * volume) lives behind a single "More" button that opens a
 * stacked bottom-sheet menu. This keeps the bar thumb-reachable
 * on a phone without forcing the user to make fine discriminations
 * between five 44×44px buttons in a 360px-wide viewport.
 */
export const MobileCommandBar: React.FC<Props> = ({
  isPlayingAuto, setIsPlayingAuto,
  activeStepIndex, setActiveStepIndex,
  pathLength,
  onShowInspector, onShowExport, onCommit,
  onTogglePlayAlong,
  onToggleLoop,
  melodyMuted = false,
  isLooping = false,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav
        aria-label="Playback controls"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 surface-2 border-t border-[color:var(--color-border)] backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-3 items-center gap-2 px-3 py-2">
          {/* Left: previous chord */}
          <div className="flex items-center justify-start">
            <button
              onClick={() => setActiveStepIndex(activeStepIndex - 1)}
              disabled={activeStepIndex <= 0}
              className="flex items-center justify-center w-12 h-12 rounded-[var(--radius-md)] surface-1 border border-[color:var(--color-border)] active:bg-[color:var(--color-bg-3)] disabled:opacity-30 transition-colors"
              aria-label="Previous chord"
            >
              <span className="text-xl">◂</span>
            </button>
          </div>

          {/* Center: big play/pause */}
          <div className="flex items-center justify-center">
            <button
              onClick={() => setIsPlayingAuto(!isPlayingAuto)}
              aria-label={isPlayingAuto ? "Pause" : "Play"}
              className="flex items-center justify-center w-16 h-16 rounded-full bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)] shadow-[0_0_24px_rgba(212,168,87,0.35)] hover:bg-[color:var(--color-brand-strong)] active:scale-95 transition-transform"
            >
              {isPlayingAuto ? <Pause size={28} /> : <Play size={28} className="translate-x-[1px]" />}
            </button>
          </div>

          {/* Right: next chord + More */}
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setActiveStepIndex(activeStepIndex + 1)}
              disabled={activeStepIndex >= pathLength - 1}
              className="flex items-center justify-center w-12 h-12 rounded-[var(--radius-md)] surface-1 border border-[color:var(--color-border)] active:bg-[color:var(--color-bg-3)] disabled:opacity-30 transition-colors"
              aria-label="Next chord"
            >
              <span className="text-xl">▸</span>
            </button>
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              aria-label="More options"
              aria-expanded={moreOpen}
              className={`flex items-center justify-center w-12 h-12 rounded-[var(--radius-md)] border transition-colors ${
                moreOpen
                  ? "bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)] border-[color:var(--color-brand)]"
                  : "surface-1 border-[color:var(--color-border)] active:bg-[color:var(--color-bg-3)]"
              }`}
            >
              <MoreHorizontal size={20} />
            </button>
          </div>
        </div>
      </nav>

      {/* Stacked bottom-sheet menu. Rendered outside the nav so it
          can cover the screen without affecting the bar layout. */}
      {moreOpen && (
        <div
          className="md:hidden fixed inset-x-0 bottom-16 z-40 px-3 pb-2"
          role="dialog"
          aria-label="More playback options"
        >
          <div className="surface-1 border border-[color:var(--color-border)] rounded-[var(--radius-lg)] p-3 shadow-2xl backdrop-blur-xl">
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => { onShowInspector(); setMoreOpen(false); }}
                className="flex flex-col items-center gap-1 py-3 surface-2 border border-[color:var(--color-border)] rounded-[var(--radius-md)] active:bg-[color:var(--color-bg-3)]"
              >
                <Music size={18} />
                <span className="text-[10px] t-mono">Inspect</span>
              </button>
              <button
                onClick={() => { onCommit(); setMoreOpen(false); }}
                className="flex flex-col items-center gap-1 py-3 surface-2 border border-[color:var(--color-border)] rounded-[var(--radius-md)] active:bg-[color:var(--color-bg-3)]"
              >
                <Mic size={18} className="text-[color:var(--color-err)]" />
                <span className="text-[10px] t-mono">Record</span>
              </button>
              <button
                onClick={() => { onShowExport(); setMoreOpen(false); }}
                className="flex flex-col items-center gap-1 py-3 surface-2 border border-[color:var(--color-border)] rounded-[var(--radius-md)] active:bg-[color:var(--color-bg-3)]"
              >
                <FileDown size={18} />
                <span className="text-[10px] t-mono">Export</span>
              </button>
              <button
                onClick={() => { onTogglePlayAlong?.(); setMoreOpen(false); }}
                className={`flex flex-col items-center gap-1 py-3 surface-2 border rounded-[var(--radius-md)] active:bg-[color:var(--color-bg-3)] ${
                  melodyMuted
                    ? "border-[color:var(--color-brand)] text-[color:var(--color-brand)]"
                    : "border-[color:var(--color-border)]"
                }`}
                disabled={!onTogglePlayAlong}
              >
                <Volume2 size={18} className={melodyMuted ? "" : "opacity-60"} />
                <span className="text-[10px] t-mono">{melodyMuted ? "Synth off" : "Synth on"}</span>
              </button>
              <button
                onClick={() => { onToggleLoop?.(); setMoreOpen(false); }}
                className={`flex flex-col items-center gap-1 py-3 surface-2 border rounded-[var(--radius-md)] active:bg-[color:var(--color-bg-3)] ${
                  isLooping
                    ? "border-[color:var(--color-brand)] text-[color:var(--color-brand)]"
                    : "border-[color:var(--color-border)]"
                }`}
                disabled={!onToggleLoop}
              >
                <RefreshCw size={18} className={isLooping ? "" : "opacity-60"} />
                <span className="text-[10px] t-mono">{isLooping ? "Loop on" : "Loop"}</span>
              </button>
              <button
                onClick={() => setMoreOpen(false)}
                className="flex flex-col items-center gap-1 py-3 surface-2 border border-[color:var(--color-border)] rounded-[var(--radius-md)] active:bg-[color:var(--color-bg-3)]"
              >
                <span className="text-[10px] t-mono">Close</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};