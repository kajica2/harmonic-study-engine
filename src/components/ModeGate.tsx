/**
 * src/components/ModeGate.tsx - PRD-001 REQ-MODE-1..4.
 *
 * Thin orchestrator that switches the rendered surface from the LIVE
 * `mode` in the zustand sessionStore. App.tsx renders <ModeGate />
 * inside <main> instead of the current inline JSX block. Existing
 * Etude-mode JSX lives in <AppMain> (passed as a slot via props);
 * Compose / Explore use their own dedicated sub-components.
 *
 * Resolution contract (two phases):
 *
 *  1. BOOT (first render + mount effect): resolveEffectiveMode runs
 *     once with full precedence - URL ?mode= param > persisted
 *     hse.session.mode > legacy/null -> "etude". The mount effect
 *     writes the resolved value back to the store (when different) so
 *     the ModeSelector highlight and the App-level URL sync see a
 *     consistent value. The first paint is already the resolved mode:
 *     no flash.
 *
 *  2. AFTER MOUNT (live): the rendered surface is derived purely from
 *     the store subscription. A post-mount store.mode change (mode
 *     selector click, 1/2/3 keyboard shortcut, dirty-prompt Save/
 *     Discard) switches the surface immediately.
 *
 * URL-read-once rule: the URL is consulted ONLY during boot
 * resolution. It is NEVER re-read after mount, because the App-level
 * store->URL sync is 200ms debounced; a post-mount URL-precedence
 * re-read would race a just-written store mode and could revert the
 * surface back to the stale URL value. popstate / back-forward is
 * out of scope (TD: never wired; the debounced replaceState sync
 * never pushes history entries anyway).
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
  // LIVE subscription to the store's mode. Pre-boot it may still be
  // null (legacy first-run); the render below resolves that through
  // resolveEffectiveMode (URL > persisted > etude) so the FIRST paint
  // is already correct. Post-boot the store value is authoritative -
  // the mount effect guarantees a non-null write-back, and the
  // `?? "etude"` below is defensive for a programmatic setMode(null).
  const storedMode = useSessionStore((s) => s.mode);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    // Mount-time bootstrap (runs once; idempotent under StrictMode
    // double-invoke): resolve the effective mode with full precedence
    // and write it back to the store when different, so other
    // consumers (ModeSelector highlight, URL sync) see a consistent
    // value. After this, the live subscription above owns rendering.
    const initial = useSessionStore.getState().mode;
    const next = resolveEffectiveMode(initial);
    if (next !== initial) {
      useSessionStore.getState().setMode(next);
    }
    setBooted(true);
    // Intentionally empty deps - boot resolution only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-boot render: full precedence (URL may override a persisted
  // store value on the very first paint). Post-boot render: LIVE store
  // mode only - never re-read the URL (see URL-read-once rule above).
  const mode: Mode = booted
    ? storedMode ?? "etude"
    : resolveEffectiveMode(storedMode);

  if (mode === "compose") {
    return <ComposeSurface onOpenImportExport={onOpenImportExport} />;
  }
  if (mode === "explore") {
    return <ExploreSurface />;
  }
  // Etude (default) - render the existing legacy main surface.
  return <>{AppMain}</>;
};
