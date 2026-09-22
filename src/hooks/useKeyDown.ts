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