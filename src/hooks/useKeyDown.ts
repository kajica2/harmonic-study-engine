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