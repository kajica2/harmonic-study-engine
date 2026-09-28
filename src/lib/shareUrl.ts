/**
 * src/lib/shareUrl.ts - PRD-001 Phase 8 S1 (D149): the copy seam.
 *
 * LAW: flushUrlWrite() BEFORE reading location.href (pinned by the
 * call-order test). The debounced writer (200ms, App.tsx) means a
 * Share click milliseconds after a state change would otherwise
 * copy a STALE URL - the exact HIGH-001 disease the pagehide flush
 * cured for reloads. Every Share button on every surface goes
 * through THIS function; raw clipboard.writeText of a self-built URL
 * is banned (DO-NOT list - a second serializer is a drift magnet).
 *
 * The status copy is a SHIPPED CONTRACT, not prose: the three
 * strings are byte-identical to IdeaBar.tsx:187-193.
 */

import type { Idea } from "../../engine/core/idea";
import { withIdeaParam } from "./ideaShare";
import { flushUrlWrite } from "./urlSyncBus";

export type ShareStatus = "copied" | "unavailable" | "blocked";

/** Status copy (VERBATIM shipped strings, IdeaBar.tsx:187-193). */
export function shareStatusText(s: ShareStatus): string {
  switch (s) {
    case "copied":
      return "Share link copied to clipboard.";
    case "unavailable":
      return "Share link ready (clipboard unavailable).";
    case "blocked":
      return "Share link ready (clipboard blocked).";
  }
}

/** Flush the writer, read the FRESH location, optionally re-set the
 *  `idea` param (IdeaBar passes the live idea - explicit copy beats
 *  the writer governor), then write to the clipboard.
 *
 *  `idea === undefined` -> copy the URL exactly as the writer wrote
 *  it (the practice/etude/compose/explore surfaces); a defined value
 *  -> read-modify-write ONE param, every other key preserved. */
export async function copyShareUrl(idea?: Idea | null): Promise<ShareStatus> {
  // FLUSH-BEFORE-COPY (the anti-stale law):
  flushUrlWrite();
  let href = window.location.href;
  if (idea !== undefined) href = withIdeaParam(href, idea);
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(href);
      return "copied";
    }
    return "unavailable";
  } catch {
    return "blocked";
  }
}
