/**
 * EtudeStaffView.tsx - PRD-001 Phase 3 Slice 2 (D26, REQ-ETU-21).
 *
 * abcjs render host for the etude staff. Lazy-loaded by EtudeViews
 * (which is itself lazy in App) so abcjs stays out of the eager
 * chunk. renderAbc runs in try/catch with a console.warn + inline
 * fallback (precedent: sheetMusicExport's guarded render); the
 * melodySummary text alternative keeps the view accessible when
 * notation cannot be drawn.
 *
 * LiveScoreDisplay is deliberately NOT reused: it is a 4-bar-window
 * playing-score with tick subscriptions - a different job (D26).
 */

import React, { useEffect, useRef, useState } from "react";
import abcjs from "abcjs";
import type { Etude } from "../../engine/etude/types";
import { buildEtudeAbc } from "../lib/etudeAbc";
import { melodySummary } from "./EtudePianoRoll";

export interface EtudeStaffViewProps {
  etude: Etude;
  transposeShift: number;
}

export function EtudeStaffView({
  etude,
  transposeShift,
}: EtudeStaffViewProps): React.ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const [renderFailed, setRenderFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    try {
      abcjs.renderAbc(host, buildEtudeAbc(etude, { transposeShift }), {
        add_classes: true,
        staffwidth: 760,
        scale: 1,
        responsive: "resize",
      });
      setRenderFailed(false);
    } catch (err) {
      // Notation is a progressive enhancement here - warn and show
      // the text summary instead of crashing the surface.
      console.warn("[EtudeStaffView] abcjs render failed:", err);
      setRenderFailed(true);
    }
  }, [etude, transposeShift]);

  return (
    <div className="flex flex-col gap-2">
      {renderFailed && (
        <p className="text-xs text-[color:var(--color-text-2)]">
          Staff rendering is unavailable right now - text summary:{" "}
          {melodySummary(etude)}
        </p>
      )}
      <div
        ref={hostRef}
        role="img"
        aria-label={melodySummary(etude)}
        data-testid="etude-staff-host"
        className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white/95 p-2"
      />
    </div>
  );
}
