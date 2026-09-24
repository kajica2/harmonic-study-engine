/**
 * src/components/useConceptPress.ts - PRD-001 Phase 6 (REQ-PED-6, D103).
 *
 * Shared gesture hook for PED-6 (SCOPED to AnalysisCard chord cells):
 * right-click (onContextMenu) + 500ms long-press (touch) + Shift+F10
 * keyboard alternative (a11y). Resolution is HONEST: the cell opens
 * the concept linked from the NEAREST annotation covering that
 * (bar, slot); when no annotation covers the cell, the gesture opens
 * the GLOBAL search prefilled with the cell symbol (no false claim).
 */

import { useRef, useEffect } from "react";

export type ConceptPressResolver = () => string | null;
export type ConceptPressOpener = (conceptId: string | null, fallbackText: string) => void;

const LONG_PRESS_MS = 500;

/** Bind the three PED-6 gestures to one resolver/opener pair. */
export function useConceptPress(
  resolve: ConceptPressResolver,
  open: ConceptPressOpener,
  fallbackText: string = "",
): {
  onContextMenu: React.MouseEventHandler;
  onTouchStart: React.TouchEventHandler;
  onTouchEnd: React.TouchEventHandler;
  onTouchMove: React.TouchEventHandler;
  onKeyDown: React.KeyboardEventHandler;
} {
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, []);

  const fire = (): void => {
    const id = resolve();
    open(id, fallbackText);
  };

  return {
    onContextMenu: (e) => {
      e.preventDefault();
      fire();
    },
    onTouchStart: () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(fire, LONG_PRESS_MS);
    },
    onTouchEnd: () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    },
    onTouchMove: () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    },
    onKeyDown: (e) => {
      if (e.shiftKey && e.key === "F10") {
        e.preventDefault();
        fire();
      }
    },
  };
}

/** Long-press duration (exported for the jsdom timer test). */
export const CONCEPT_PRESS_MS = LONG_PRESS_MS;
