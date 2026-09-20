/**
 * src/components/BuildFooter.tsx — small "build <sha> · <date>" badge
 * at the bottom of the page so users can tell at a glance whether
 * they're looking at the latest deploy or a stale one.
 *
 * Rendered by App.tsx inside the root <div>, after <main> and all
 * modals, so it sits at the very bottom of the document flow.
 * Typography is intentionally tiny and muted — it's a status
 * indicator, not a UI element.
 *
 * Pure presentational; the build stamp is read from
 * src/lib/buildInfo.ts (vite-injected).
 */
import React from "react";
import { formatBuildInfo } from "../lib/buildInfo";

export const BuildFooter: React.FC = () => {
  return (
    <footer
      aria-label="Build info"
      data-testid="build-footer"
      className="w-full px-4 py-2 text-[10px] font-mono text-neutral-600 text-right select-text"
    >
      {formatBuildInfo()}
    </footer>
  );
};
