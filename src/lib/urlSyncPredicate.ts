/**
 * src/lib/urlSyncPredicate.ts - PRD-001 Phase 3 Slice 2 fix round
 * (TESTER GAP-1).
 *
 * The predicate behind App's debounced URL writer: the zustand
 * subscription calls it with (prev, next) on every store change and
 * only schedules the 200ms replaceState write when it returns true.
 * Extracted from the App subscription (untestable there - React
 * components are intentionally not unit-tested) so dropping a term -
 * e.g. the `etudeConstraints` comparison added in slice 2 - fails a
 * test instead of silently desyncing the URL.
 *
 * Comparison semantics: `etudeConstraints` is compared by REFERENCE
 * because the store replaces (never mutates) the object; mode and
 * globalTranspose are primitives. A value-equal but freshly built
 * constraints object therefore DOES schedule a write - harmless (the
 * writer is idempotent and debounced) and strictly safer than
 * deep-equality, which could MISS a real change.
 */

import type { EtudeConstraints } from "../../engine/etude/types";
import type { ComposeSession } from "../state/sessionStore";

/** The slice of store state the URL writer tracks. The full zustand
 *  state (actions, dirty, pendingModeRequest, ...) is structurally
 *  assignable - changes OUTSIDE this slice must NOT fire. */
export interface UrlSyncSnapshot {
  mode: string | null;
  globalTranspose: number;
  etudeConstraints: EtudeConstraints | null;
  /** D86 (REQ-IO-50): the compose session rides THIS writer (ADR-015
   *  single-writer). Reference-compared like etudeConstraints - the
   *  store replaces, never mutates. */
  composeSession: ComposeSession | null;
}

/** True when a store change must be reflected in the URL. */
export function shouldScheduleUrlWrite(
  prev: UrlSyncSnapshot,
  next: UrlSyncSnapshot,
): boolean {
  return (
    next.mode !== prev.mode ||
    next.globalTranspose !== prev.globalTranspose ||
    next.etudeConstraints !== prev.etudeConstraints ||
    next.composeSession !== prev.composeSession
  );
}
