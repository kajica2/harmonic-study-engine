/**
 * src/components/ModeGate.tsx - PRD-001 REQ-MODE-1..3.
 *
 * Thin orchestrator that reads `effectiveMode` from the zustand
 * sessionStore and switches the rendered surface. App.tsx renders
 * <ModeGate /> inside <main> instead of the current inline JSX block.
 * Existing Etude-mode JSX lives in <AppMain> (passed as a slot via
 * props); Compose / Explore use their own dedicated sub-components.
 *
 * Resolution order (D9):
 *   1. URL ?mode= param (canonical at boot)
 *   2. localStorage hse.session.mode (set on prior runs)
 *   3. legacy / first-run -> "etude" (today's behavior, verbatim)
 *
 * The URL bootstrap runs once on mount via the store's resolve helper
 * (see sessionStore.resolveEffectiveMode). Subsequent store mutations
 * are mirrored to the URL by the App-level useEffect - this component
 * only handles mount-time resolution + surface selection.
 *
 * Etude keeps the same component identity as the legacy monolith: the
 * gate returns <AppMain /> for mode === "etude", preserving every
 * existing test that mounts or queries inside the legacy tree.
 */

import React, { useEffect, useState } from "react";
import {
  useSessionStore,
  resolveEffectiveMode,
  type Mode,
} from "../state/sessionStore";
import { ComposeSurface } from "./ComposeSurface";
import { ExploreSurface } from "./ExploreSurface";

export interface ModeGateProps {
  /** Etude surface. Whatever App.tsx renders today for the legacy mode. */
  AppMain: React.ReactNode;
  /** Triggered by the Compose surface's "Open import / export" button. */
  onOpenImportExport: () => void;
}

export const ModeGate: React.FC<ModeGateProps> = ({
  AppMain,
  onOpenImportExport,
}) => {
  // We don't subscribe to the store here for mode (the consuming
  // surfaces do their own per-slice subscriptions); we only read the
  // initial value on mount and forward it to the correct surface.
  const [resolved, setResolved] = useState<Mode>(() => {
    const initial = useSessionStore.getState().mode;
    return resolveEffectiveMode(initial);
  });

  useEffect(() => {
    // Mount-time bootstrap: write the resolved mode back to the store
    // so other consumers (ModeSelector highlight, URL sync) see a
    // consistent value. Only fires once on mount.
    const initial = useSessionStore.getState().mode;
    const next = resolveEffectiveMode(initial);
    if (next !== initial) {
      useSessionStore.getState().setMode(next);
    }
    setResolved(next);
    // Intentionally empty deps - mount-time only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (resolved === "compose") {
    return <ComposeSurface onOpenImportExport={onOpenImportExport} />;
  }
  if (resolved === "explore") {
    return <ExploreSurface />;
  }
  // Etude (default) - render the existing legacy main surface.
  return <>{AppMain}</>;
};