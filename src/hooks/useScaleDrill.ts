/**
 * useScaleDrill — scale practice + rhythm-drill ephemeral UI state.
 * Extracted from App (rerender-split-combined-hooks).
 */

import { useState } from "react";
import { DrillSubdivision } from "../lib/rhythmDrill";

export function useScaleDrill() {
  const [scaleMode, setScaleMode] = useState<string>("auto");
  const [scaleBusy, setScaleBusy] = useState(false);
  const [scaleModeOpen, setScaleModeOpen] = useState(false);
  const [drillBusy, setDrillBusy] = useState(false);
  const [drillIter, setDrillIter] = useState<DrillSubdivision | null>(null);

  return {
    scaleMode,
    setScaleMode,
    scaleBusy,
    setScaleBusy,
    scaleModeOpen,
    setScaleModeOpen,
    drillBusy,
    setDrillBusy,
    drillIter,
    setDrillIter,
  };
}