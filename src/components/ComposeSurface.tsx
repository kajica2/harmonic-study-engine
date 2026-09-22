/**
 * src/components/ComposeSurface.tsx - PRD-001 REQ-COMP-1 (empty state).
 *
 * Phase 1 stub. Surfaces the existing ImportExportModal trigger and
 * the privacy statement (REQ-IO-70). No analysis card yet - Phase 4.
 *
 * Renders a faded piano-roll thumbnail at 30% opacity so the canvas
 * doesn't visually pop in/out on mode switch; the SynesthesiaCanvas
 * is the same component the main app uses, drawn as a background
 * accent. Phase 4 replaces this with the real upload surface.
 */

import React, { Suspense } from "react";
import { SynesthesiaCanvas } from "./SynesthesiaCanvas";
import { SynesthesiaProvider } from "./SynesthesiaProvider";

interface ComposeSurfaceProps {
  /** Triggered by the "Open import / export" button. */
  onOpenImportExport: () => void;
  /** Optional className passthrough. */
  className?: string;
}

export const ComposeSurface: React.FC<ComposeSurfaceProps> = ({
  onOpenImportExport,
  className = "",
}) => {
  return (
    <section
      role="region"
      aria-label="Compose mode (empty state)"
      className={`flex flex-col gap-4 ${className}`}
    >
      <div className="relative rounded-2xl border border-[color:var(--color-border)] surface-1 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-30" aria-hidden="true">
          <SynesthesiaProvider>
            <Suspense fallback={null}>
              <SynesthesiaCanvas width={800} height={400} />
            </Suspense>
          </SynesthesiaProvider>
        </div>
        <div className="relative z-10 px-6 py-10 flex flex-col items-center justify-center text-center gap-4">
          <h2 className="text-lg font-semibold text-[color:var(--color-text-1)]">
            Drop a .mid file to get started.
          </h2>
          <p className="text-sm text-[color:var(--color-text-3)] max-w-md">
            The Compose workspace analyzes a MIDI file and builds an
            editable analysis card. In this Phase 1 stub, drop in via
            the import modal.
          </p>
          <button
            type="button"
            onClick={onOpenImportExport}
            className="px-4 py-2 rounded-lg bg-[color:var(--color-brand)] hover:bg-[color:var(--color-brand-strong)] text-[color:var(--color-text-inverse)] text-sm font-semibold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/60"
          >
            Open import / export
          </button>
        </div>
      </div>
      <aside
        aria-label="Privacy statement"
        className="text-xs text-[color:var(--color-text-3)] italic text-center max-w-md mx-auto"
      >
        All processing happens in your browser. Your MIDI file never
        leaves this tab.
      </aside>
    </section>
  );
};