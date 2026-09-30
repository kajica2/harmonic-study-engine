/**
 * src/hooks/useKeyDown.ts - PRD-001 Phase 1 fix-round (HIGH-001).
 *
 * Extracted from App.tsx's mode-shortcut keydown handler so the
 * modifier-guard logic is unit-testable in isolation. The 1/2/3 mode
 * shortcuts must NOT swallow Cmd/Ctrl/Alt + digit because that
 * suppresses the browser's native tab-switch / menu behavior.
 *
 * Shift is intentionally NOT in the guard: Shift+1..3 has no
 * behavior today, and the reviewer's verdict was to leave it alone.
 */

/** True when a non-Shift modifier is held - the mode shortcuts must
 *  yield to the browser's native behavior in that case. */
export function isModeShortcutModifierKey(
  e: Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey">,
): boolean {
  return e.metaKey || e.ctrlKey || e.altKey;
}

/** Transpose key intent (PRD-001 Phase 2, D14). */
export type TransposeKeyIntent = "down1" | "up1" | "down12" | "up12";

/**
 * Classify a keydown into a transpose intent - PURE, no DOM.
 *
 * CRITICAL (D14): matching is by e.code (physical key), NEVER e.key:
 * Shift+[ arrives with e.key === "{" on US layouts, so key-based
 * matching silently breaks Shift+octave. BracketLeft = down,
 * BracketRight = up; shiftKey widens to +/-12.
 *
 * Returns null when meta/ctrl/alt is held (yield to the browser,
 * coexisting with the isModeShortcutModifierKey guard in App.tsx) or
 * when the key is not a bracket. Shift alone PASSES (it is the
 * octave modifier).
 */
export function classifyTransposeKey(
  e: Pick<
    KeyboardEvent,
    "code" | "shiftKey" | "metaKey" | "ctrlKey" | "altKey"
  >,
): TransposeKeyIntent | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.code === "BracketLeft") return e.shiftKey ? "down12" : "down1";
  if (e.code === "BracketRight") return e.shiftKey ? "up12" : "up1";
  return null;
}

/**
 * PRD-001 Phase 7 S4 (REQ-IO-5, D139): computer-keyboard note
 * mapping. PURE, no DOM reads beyond the event fields; matched by
 * e.code (physical position, the D14 law - NEVER e.key, layouts
 * shift). This is the seam the parent doc (PHASE-7-PRACTICE) named
 * but never built; audit #3 verified all 15 codes are collision-free
 * in shipped code (the only bound letter is M, App:1363).
 */
export type NoteKeyAction =
  | { kind: "note"; semitones: number } // 0..12 from the root
  | { kind: "octave"; delta: 1 | -1 }; // Z down, X up

/** A W S E D F T G Y H U J K = 0..12 semitones (one octave + root). */
export const NOTE_KEY_SEMITONES_BY_CODE: Readonly<Record<string, number>> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6,
  KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12,
};

/**
 * Returns null when meta/ctrl/alt is held (PHASE-1-01 guard FIRST,
 * before any key branch - same law as classifyTransposeKey:43),
 * when the code is unmapped, or on non-key input. Shift is
 * DELIBERATELY not guarded (D139): no mapping key uses shift
 * semantics and shift-while-playing is physically common.
 */
export function classifyNoteKey(
  e: Pick<KeyboardEvent, "code" | "metaKey" | "ctrlKey" | "altKey">,
): NoteKeyAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const semitones = NOTE_KEY_SEMITONES_BY_CODE[e.code];
  if (typeof semitones === "number") {
    return { kind: "note", semitones };
  }
  if (e.code === "KeyZ") return { kind: "octave", delta: -1 };
  if (e.code === "KeyX") return { kind: "octave", delta: 1 };
  return null;
}

/**
 * S4 (D140): the letter-chip map for an input piano rooted at
 * rootMidi - midi -> "A".."K" for the first 13 keys, plain beyond.
 * Derived from the ONE mapping table (anti-drift: the chip a user
 * sees is the key the classifier fires). Shared by the study-surface
 * piano (App) and the wizard's compact embed; pure + node-testable
 * through the table pins above.
 */
export function noteKeyChipsForRoot(
  rootMidi: number,
): Readonly<Record<number, string>> {
  const out: Record<number, string> = {};
  for (const [code, semitones] of Object.entries(NOTE_KEY_SEMITONES_BY_CODE)) {
    out[rootMidi + semitones] = code.startsWith("Key") ? code.slice(3) : code;
  }
  return out;
}

/**
 * Global letter shortcuts (T/N/L/P/C). PURE classifier - the App.tsx
 * handler consults it so the guard laws are unit-testable in
 * isolation (same pattern as classifyTransposeKey).
 *
 * Guard order (PHASE-1-01): meta/ctrl/alt yield FIRST (the browser's
 * native Cmd/Ctrl+letter behavior survives); then match by e.code
 * (the D14 law - NEVER e.key, layouts shift). Shift passes (no
 * mapping key uses shift semantics).
 *
 * T is gated on the piano-armed flag: KeyT is the +6 semitone piano
 * key (NOTE_KEY_SEMITONES_BY_CODE), so the tuner toggle must yield
 * while the computer-keyboard piano is armed (the useNoteInput
 * listener owns KeyT in that state).
 */
export type GlobalShortcutKey =
  | "tuner"
  | "metronome"
  | "loop"
  | "play"
  | "countIn";

export function classifyGlobalShortcutKey(
  e: Pick<KeyboardEvent, "code" | "metaKey" | "ctrlKey" | "altKey">,
  opts: { pianoArmed: boolean },
): GlobalShortcutKey | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.code === "KeyT" && !opts.pianoArmed) return "tuner";
  if (e.code === "KeyN") return "metronome";
  if (e.code === "KeyL") return "loop";
  if (e.code === "KeyP") return "play";
  if (e.code === "KeyC") return "countIn";
  return null;
}

/**
 * Cmd/Ctrl+Z undo / Cmd/Ctrl+Shift+Z redo intent. PURE classifier for
 * the App.tsx global undo branch (the compose surface keeps its own
 * local handler; the global branch covers the etude surface and
 * yields when a compose project is loaded so the two never
 * double-fire). Returns null when the chord is not a modifier+Z.
 */
export type UndoRedoIntent = "undo" | "redo";

export function classifyUndoRedoKey(
  e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey">,
): UndoRedoIntent | null {
  if (!(e.metaKey || e.ctrlKey)) return null;
  if (e.key.toLowerCase() !== "z") return null;
  return e.shiftKey ? "redo" : "undo";
}