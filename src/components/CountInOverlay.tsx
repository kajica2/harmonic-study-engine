/**
 * src/components/CountInOverlay.tsx - PRD-001 Phase 3 Slice 3
 * (REQ-PRAC-11, D35). The visible pre-roll countdown: a huge mono
 * beats-left number + a "bar X of N" subline.
 *
 * z-40: above the sticky header (z-30), below the modal/drawer layer
 * (z-50) - a modal opened during the count-in stays usable.
 * pointer-events-none: the pre-roll must never block the transport
 * (pressing Pause again CANCELS the count-in via the gate).
 *
 * role="status" + aria-live="assertive": the screen-reader countdown
 * is the REQ-PRAC-11 accessibility win.
 */

import React from "react";

export interface CountInOverlayProps {
  beatsLeft: number;
  beatsPerBar: number;
  totalBars: number;
}

export const CountInOverlay: React.FC<CountInOverlayProps> = ({
  beatsLeft,
  beatsPerBar,
  totalBars,
}) => {
  // beatsLeft counts DOWN across the whole pre-roll; the bar
  // subline counts UP ("bar 1 of 2" first).
  const barFromEnd =
    beatsPerBar > 0 ? Math.floor((beatsLeft - 1) / beatsPerBar) : 0;
  const currentBar = Math.max(1, totalBars - barFromEnd);
  return (
    <div
      data-testid="countin-overlay"
      data-beats-left={beatsLeft}
      role="status"
      aria-live="assertive"
      className="fixed inset-0 z-40 grid place-items-center pointer-events-none"
    >
      <div className="flex flex-col items-center gap-2 rounded-[var(--radius-xl)] border border-[color:var(--color-border)] bg-[color:var(--color-bg-1)]/80 px-12 py-10 backdrop-blur-sm">
        <span className="t-mono text-8xl font-bold leading-none text-[color:var(--color-brand-strong)]">
          {beatsLeft}
        </span>
        <span className="t-label text-[color:var(--color-text-3)]">
          {`bar ${currentBar} of ${totalBars}`}
        </span>
      </div>
    </div>
  );
};
