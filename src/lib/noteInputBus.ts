/**
 * src/lib/noteInputBus.ts - PRD-001 Phase 7 S4 (D137): the synthetic
 * note source. Dispatches the SAME window "midin" CustomEvent midiIn
 * dispatches for hardware (midiIn.ts:167, detail shape midiIn.ts:30-38)
 * so every shipped consumer - the played-correctly detector, the
 * latency wizard, the IN picker - sees fallback input with ZERO
 * plumbing. No parallel event, no consumer fan-in (D137 rejected
 * alternatives a/b).
 *
 * NO AUDIO HERE: audio / recorder / live-note visuals stay with the
 * callers (App wiring, wizard) - this module owns ONLY the event
 * contract. Pinned laws (noteInputBus.test.ts):
 *   - detail.channel is ALWAYS 0 - outside the human 1..16 bass
 *     convention, so the shipped bass-exclusion (detail.channel ===
 *     bass, bass picker 1..16) can NEVER drop a synthetic note;
 *   - velocity 100 on noteon, 0 on noteoff (midiIn's own noteon law
 *     is velocity > 0, so synthetic noteons qualify);
 *   - timestamp = performance.now() - the hardware domain
 *     (midiIn.ts:156), same clock as the boundary anchors;
 *   - inputId sentinels "hse-keyboard" / "hse-screen" (hardware
 *     source ids are implementation strings, never "hse-*");
 *   - NEVER throws when window/CustomEvent are absent (midiIn's own
 *     try/catch philosophy, midiIn.ts:166-171).
 */

import type { MidiInEvent } from "./midiIn";

export type NoteInputSource = "keyboard" | "screen";

/** inputId sentinels (D137). */
export function hseInputId(source: NoteInputSource): string {
  return source === "keyboard" ? "hse-keyboard" : "hse-screen";
}

/** The ONE predicate every source-distinguishing consumer shares
 *  (detector compensation, wizard mode filter). undefined -> false. */
export function isHseInputId(inputId: string | undefined): boolean {
  return inputId === "hse-keyboard" || inputId === "hse-screen";
}

/** Human-readable source names (the IN chip + the wizard's
 *  fallback-median deviceName, D141). */
export function hseInputName(source: NoteInputSource): string {
  return source === "keyboard" ? "Computer keyboard" : "On-screen piano";
}

/** Dispatch one synthetic note event on the "midin" seam. */
export function emitNoteInput(
  midi: number,
  down: boolean,
  source: NoteInputSource,
): void {
  if (typeof window === "undefined") return;
  const detail: MidiInEvent = {
    note: midi,
    velocity: down ? 100 : 0,
    type: down ? "noteon" : "noteoff",
    channel: 0, // the sentinel (never bass-excluded)
    inputId: hseInputId(source),
    inputName: hseInputName(source),
    timestamp: performance.now(),
  };
  try {
    window.dispatchEvent(new CustomEvent("midin", { detail }));
  } catch {
    // CustomEvent unavailable in some environments - same philosophy
    // as midiIn's own dispatch guard; never throw into a key handler.
  }
}
