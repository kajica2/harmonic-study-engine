/**
 * src/hooks/useNoteInput.ts - PRD-001 Phase 7 S4 (D139): the global
 * computer-keyboard note listener (REQ-IO-5). THIN ADAPTER - wiring
 * only. It owns NO state (the octave lives in the store; shifts go
 * through the caller's callback) and never imports audioEngine (the
 * caller's onNote does audio + recorder + live-note visuals).
 *
 * Mounted ONCE in App, armed iff `enabled` - the CALLER composes
 * that (study surface + opt-in toggle + no blocking modal, D139);
 * the hook just obeys. Guard order is LAW (PHASE-1-01, pinned):
 *   1. typing guard FIRST (input/textarea/select/contentEditable);
 *   2. modifier guard (meta/ctrl/alt) BEFORE any key branch -
 *      classifyNoteKey re-checks it internally (defense in depth);
 *      Shift is NOT guarded (D139: shift-while-playing is physically
 *      common, no mapping key uses shift semantics);
 *   3. e.repeat guard (auto-repeat would machine-gun note-ons at
 *      ~30/s; MIDI has no repeat concept);
 *   4. classify by e.code (NEVER e.key - the D14 law).
 *
 * Pinned internals (section 3.3):
 *   - keydown note: onNote(rootMidi + semitones, true) THEN
 *     emitNoteInput(..., "keyboard") - one emit site per surface;
 *   - keyup -> noteoff ONLY for codes this hook started (per-mount
 *     Map code -> midi; unknown-keyup safety);
 *   - window blur -> release ALL held (stuck-note guard, the shipped
 *     keyAccess blur doctrine, PianoKeyboard.tsx:121);
 *   - preventDefault on HANDLED keys ONLY - unhandled keydown falls
 *     through byte-identically to today's behavior;
 *   - StrictMode: add/removeEventListener exact inverses; the held
 *     Map is per-mount, NEVER module-level.
 *
 * The typing predicate is a deliberate 4-line duplication of App's
 * inline one (audit #14: no shared util exists; the duty.ts safeInt
 * precedent - cheaper than widening exports).
 */

import { useEffect, useRef } from "react";
import { classifyNoteKey } from "./useKeyDown";
import { emitNoteInput } from "../lib/noteInputBus";

export interface UseNoteInputArgs {
  /** Caller-composed activation gate (D139): the hook just obeys. */
  enabled: boolean;
  /** Root octave 3..4 (persisted); root MIDI = (rootOctave + 1) * 12. */
  rootOctave: number;
  /** Play/stop audio + recorder + live-note visuals (App-owned). */
  onNote: (midi: number, down: boolean) => void;
  /** Z / X octave shift (store write upstream, clamped 3..4). */
  onOctaveShift: (delta: 1 | -1) => void;
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  const tag = el?.tagName?.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    el?.isContentEditable === true
  );
}

export function useNoteInput(args: UseNoteInputArgs): void {
  // Live mirrors (the shipped ref-mirror pattern): the listener binds
  // once per arm toggle; a rootOctave/prop change never re-subscribes
  // and never drops a held note.
  const rootOctaveRef = useRef(args.rootOctave);
  rootOctaveRef.current = args.rootOctave;
  const onNoteRef = useRef(args.onNote);
  onNoteRef.current = args.onNote;
  const onOctaveRef = useRef(args.onOctaveShift);
  onOctaveRef.current = args.onOctaveShift;

  // Held notes, per-mount (D135.5 lineage): code -> the MIDI we
  // started with it (rootOctave may shift while a key is held - the
  // release uses the STARTED midi, never a re-derived one).
  const heldRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!args.enabled) return;

    const rootMidi = (): number => {
      const o = Math.min(4, Math.max(3, Math.trunc(rootOctaveRef.current)));
      return (o + 1) * 12;
    };

    const release = (code: string): void => {
      const midi = heldRef.current.get(code);
      if (midi === undefined) return; // only stop notes we started
      heldRef.current.delete(code);
      onNoteRef.current(midi, false);
      emitNoteInput(midi, false, "keyboard");
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (isTypingTarget(e.target)) return; // guard 1
      if (e.metaKey || e.ctrlKey || e.altKey) return; // guard 2 (before any key branch)
      if (e.repeat) return; // guard 3
      const action = classifyNoteKey(e); // guard 4 (by e.code, NEVER e.key)
      if (action === null) return; // unmapped: fall through untouched
      e.preventDefault(); // handled keys ONLY
      if (action.kind === "octave") {
        onOctaveRef.current(action.delta);
        return;
      }
      const midi = rootMidi() + action.semitones;
      heldRef.current.set(e.code, midi);
      onNoteRef.current(midi, true);
      emitNoteInput(midi, true, "keyboard");
    };

    const onKeyUp = (e: KeyboardEvent): void => {
      release(e.code);
    };

    const onBlur = (): void => {
      // Stuck-note guard: release everything this hook started.
      for (const code of [...heldRef.current.keys()]) release(code);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      // Exact inverses + never leave a note sounding across an
      // unmount (StrictMode double-invoke lands here too).
      for (const code of [...heldRef.current.keys()]) release(code);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [args.enabled]);
}
