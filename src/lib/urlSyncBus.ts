/**
 * src/lib/urlSyncBus.ts - PRD-001 Phase 8 S1 (D149).
 *
 * Shared debounce scheduler + synchronous flush for the ONE URL
 * writer (ADR-015 stays byte-true: there is still exactly ONE
 * write() function, now REGISTERED here - this module never touches
 * history, it only decides WHEN the writer runs).
 *
 * The pagehide law (App.tsx:1592-1597, the HIGH-001 complement) is
 * relocated here so copyShareUrl can reuse it: a Share click within
 * the 200ms debounce window otherwise reads a STALE location.href
 * (the same HIGH-001 disease the pagehide flush cured for reloads).
 *
 * Semantics replicated from the shipped writer EXACTLY:
 *  - schedule: clearTimeout + re-arm (idempotent re-arm, the shipped
 *    :1580-1581 shape);
 *  - flush: pending -> clearTimeout + write() NOW, synchronously;
 *    no pending -> NO write (the shipped "no pending write -> no
 *    write" law at :1593);
 *  - no registered writer -> NEVER throws (SSR/jsdom safety, the
 *    midiIn try/catch philosophy).
 */

/** The shipped debounce (App.tsx:1581 window.setTimeout(write, 200)). */
export const URL_WRITE_DEBOUNCE_MS = 200;

let writer: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Register the ONE writer. Returns the unregister (exact-inverse,
 *  StrictMode-safe: the second mount's register wins; an unregister
 *  only clears the registration it owns). */
export function registerUrlWriter(write: () => void): () => void {
  writer = write;
  return () => {
    if (writer === write) writer = null;
  };
}

/** Arm the shared 200ms timer (re-arm extends the window - the
 *  shipped coalescing shape). Safe without a registered writer: the
 *  fire is a no-op, never a throw. */
export function scheduleUrlWrite(): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (writer !== null) writer();
  }, URL_WRITE_DEBOUNCE_MS);
}

/** The pagehide law, reusable: pending -> cancel + write NOW (so
 *  the URL matches the store at the boundary); none -> no-op. */
export function flushUrlWrite(): void {
  if (timer === null) return;
  clearTimeout(timer);
  timer = null;
  if (writer !== null) writer();
}
