/**
 * src/state/sessionStore.ts - PRD-001 Phase 1+2 mode slice (ADR-004).
 *
 * Zustand 5 store + persist middleware (key `hse.session`). Phase 1
 * shipped the mode-related slice (mode, globalTranspose, currentIdea,
 * per-mode dirty, pendingModeRequest). Phase 2 (D10) adds the
 * transpose slice: `exerciseTranspose` (per-exercise offset, clamped
 * +/-12) + `keyCycleActive` (cycle-all-12 flag) with actions
 * setExerciseTranspose / nudgeExerciseTranspose / advanceKeyCycle /
 * setKeyCycleActive. The legacy `useSessionStore.ts` hook's
 * transposeShift is now a read-through/write-through BRIDGE to
 * `globalTranspose` here (single source of truth).
 *
 * Persistence: `partialize` keeps `mode`, `globalTranspose`,
 * `currentIdea`, `exerciseTranspose`, `keyCycleActive` in
 * localStorage. `dirty` + `pendingModeRequest` are session-scoped
 * (per-mode Edit state, not cross-reload state).
 *
 * Migration: zustand persist's `migrate` callback delegates to the
 * engine's `createSessionRunner`. v1 -> v2 (Phase 2) appends the
 * transpose-slice defaults; CURRENT_SESSION_VERSION = 2 and the
 * persist envelope version mirrors it (ADR-004).
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  createSessionRunner,
  type MigrationRunner,
} from "../../engine/migrations";
import type { Idea } from "../../engine/core/idea";
import { advanceKeyCycle as nextInCycleRotation } from "../../engine/core/spelling";
import { K } from "../lib/storage";

/** The 3 modes a user can explicitly pick. `null` = legacy / first-run. */
export type Mode = "compose" | "etude" | "explore";

/** Per-mode dirty kind. Compose + Explore are 'none' in Phase 1
 *  (ADR-007); only Etude carries real dirty state. */
export type DirtyKind = "none" | "etude-pending-accept";

export interface DirtyMap {
  readonly compose: "none";
  readonly etude: DirtyKind;
  readonly explore: "none";
}

export const SESSION_STORAGE_KEY = K.session;
/** v2 (PRD-001 Phase 2): adds exerciseTranspose + keyCycleActive.
 *  Keep in lockstep with engine/migrations CURRENT_SESSION_VERSION;
 *  the persist envelope version mirrors this value (ADR-004). */
export const CURRENT_SESSION_VERSION = 2;

const sessionRunner: MigrationRunner<unknown> = createSessionRunner();

/** Exercise-offset clamp (D10): +/-12 semitones. */
export const EXERCISE_TRANSPOSE_MAX = 12;
/** Global clamp (D15): +/-24 semitones. The SUM (soundingShift) is
 *  intentionally NOT clamped - -12 must be able to mean octave-down
 *  and the full reachable span is pinned no-crash at +/-36. */
export const GLOBAL_TRANSPOSE_MAX = 24;

function clampGlobal(n: number): number {
  return Math.max(-GLOBAL_TRANSPOSE_MAX, Math.min(GLOBAL_TRANSPOSE_MAX, n));
}

function clampExercise(n: number): number {
  return Math.max(-EXERCISE_TRANSPOSE_MAX, Math.min(EXERCISE_TRANSPOSE_MAX, n));
}

interface ModeSlice {
  mode: Mode | null;
  globalTranspose: number;
  /** Per-exercise (Etude-surface) transpose offset, clamped +/-12.
   *  Sounding shift = globalTranspose + exerciseTranspose (D15). */
  exerciseTranspose: number;
  /** Cycle-all-12 flag: advance exerciseTranspose +1 mod 12 per
   *  form pass while active (D13). */
  keyCycleActive: boolean;
  currentIdea: Idea | null;
  dirty: DirtyMap;
  pendingModeRequest: Mode | null;
  setMode: (m: Mode | null) => void;
  requestMode: (next: Mode) => void;
  resolveDirty: (action: "save" | "discard" | "cancel") => void;
  setGlobalTranspose: (n: number) => void;
  setExerciseTranspose: (n: number) => void;
  nudgeExerciseTranspose: (delta: number) => void;
  /** Cycle-all-12 advance: exerciseTranspose := (n + 1) mod 12.
   *  NEVER touches `dirty` (structural + pinned by test). */
  advanceKeyCycle: () => void;
  setKeyCycleActive: (b: boolean) => void;
  setCurrentIdea: (i: Idea | null) => void;
  saveCurrentIdea: () => void;
  discardCurrent: () => void;
  resetModeSlice: () => void;
}

export type SessionState = ModeSlice;

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      mode: null,
      globalTranspose: 0,
      exerciseTranspose: 0,
      keyCycleActive: false,
      currentIdea: null,
      dirty: { compose: "none", etude: "none", explore: "none" },
      pendingModeRequest: null,
      setMode: (m) => set({ mode: m }),
      requestMode: (next) => {
        const cur = get().mode;
        if (cur === next) return;
        // For the legacy `mode = null` case, treat the dirty state as
        // Etude (the surface the app actually renders today). Compose
        // and Explore are always-clean in Phase 1.
        const lookup = cur ?? "etude";
        const kind = get().dirty[lookup];
        if (kind === "none") {
          set({ mode: next });
          return;
        }
        set({ pendingModeRequest: next });
      },
      resolveDirty: (action) => {
        const pending = get().pendingModeRequest;
        if (!pending) return;
        if (action === "cancel") {
          set({ pendingModeRequest: null });
          return;
        }
        if (action === "save") {
          get().saveCurrentIdea();
        } else if (action === "discard") {
          get().discardCurrent();
        }
        set({ mode: pending, pendingModeRequest: null });
      },
      setGlobalTranspose: (n) => {
        set({ globalTranspose: clampGlobal(n) });
      },
      setExerciseTranspose: (n) => {
        set({ exerciseTranspose: clampExercise(n) });
      },
      nudgeExerciseTranspose: (delta) => {
        set((s) => ({ exerciseTranspose: clampExercise(s.exerciseTranspose + delta) }));
      },
      advanceKeyCycle: () => {
        // Cycle-all-12: rotate the exercise offset +1 mod 12. This is
        // a playback-affecting view transform, NOT a composition edit,
        // so it deliberately leaves `dirty` untouched (D13).
        set((s) => ({ exerciseTranspose: nextInCycleRotation(s.exerciseTranspose) }));
      },
      setKeyCycleActive: (b) => {
        set({ keyCycleActive: b });
      },
      setCurrentIdea: (i) => set({ currentIdea: i }),
      saveCurrentIdea: () => {
        const idea = get().currentIdea;
        if (!idea) return;
        // Build the next library payload with crash-recovery semantics:
        // a corrupted stored value falls back to a fresh empty array,
        // and a quota / private-mode write failure is swallowed
        // silently so the UI never breaks (in-memory `currentIdea`
        // stays).
        let list: Idea[] = [];
        try {
          const raw = localStorage.getItem(K.ideas);
          if (raw) {
            const parsed = JSON.parse(raw) as unknown;
            if (Array.isArray(parsed)) list = parsed as Idea[];
          }
        } catch {
          // Corrupted stored value - start fresh.
          list = [];
        }
        list.push(idea);
        const capped = list.slice(-100);
        try {
          localStorage.setItem(K.ideas, JSON.stringify(capped));
        } catch {
          // Quota / private mode - silently ignore; the in-memory
          // `currentIdea` stays.
        }
        set({
          dirty: { compose: "none", etude: "none", explore: "none" },
        });
      },
      discardCurrent: () => {
        // Etude: signal the existing revertLastAccept machinery in
        // App.tsx via a window CustomEvent so the old useSessionStore
        // can subscribe without importing the new zustand store.
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("hse:revert-last-accept"));
        }
        set({
          currentIdea: null,
          dirty: { compose: "none", etude: "none", explore: "none" },
        });
      },
      resetModeSlice: () =>
        set({
          mode: null,
          globalTranspose: 0,
          exerciseTranspose: 0,
          keyCycleActive: false,
          currentIdea: null,
          dirty: { compose: "none", etude: "none", explore: "none" },
          pendingModeRequest: null,
        }),
    }),
    {
      name: SESSION_STORAGE_KEY,
      version: CURRENT_SESSION_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState, version) => {
        const result = sessionRunner.run(persistedState);
        if (!result.ok) {
          // eslint-disable-next-line no-console
          console.warn(
            `[${SESSION_STORAGE_KEY}] migration failed at v${version}: ${result.error}`,
          );
          return null;
        }
        return result.value as SessionState;
      },
      partialize: (s) => ({
        mode: s.mode,
        globalTranspose: s.globalTranspose,
        exerciseTranspose: s.exerciseTranspose,
        keyCycleActive: s.keyCycleActive,
        currentIdea: s.currentIdea,
      }),
    },
  ),
);

/** All known Mode literals in display order. */
export const MODES: readonly Mode[] = ["compose", "etude", "explore"] as const;

export const MODE_LABELS: Readonly<Record<Mode, string>> = {
  compose: "Compose",
  etude: "Etude",
  explore: "Explore",
};

/** Resolve the effective mode for the gate (D9). URL > persisted > legacy. */
export function resolveEffectiveMode(stored: Mode | null): Mode {
  if (typeof window !== "undefined") {
    const fromUrl = new URLSearchParams(window.location.search).get("mode");
    if (fromUrl && (MODES as readonly string[]).includes(fromUrl)) {
      return fromUrl as Mode;
    }
  }
  if (stored) return stored;
  return "etude";
}

/** True for the 3 known mode string literals. */
export function isMode(s: string): s is Mode {
  return (MODES as readonly string[]).includes(s);
}

/** Inputs for resolveBootTranspose - raw values, no DOM access. */
export interface BootTransposeInput {
  /** Raw `?transpose=` URL param (string | null). */
  readonly urlValue: string | null;
  /** Persisted hse.session globalTranspose, or null when absent. */
  readonly persistedValue: number | null;
  /** Raw legacy `synesthesia_transposeShift` value (string | null). */
  readonly legacyValue: string | null;
}

/**
 * Boot-time global transpose (D10). Precedence, strictly:
 *   1. `?transpose=` URL param (finite number) - deep links win.
 *   2. Persisted hse.session globalTranspose.
 *   3. ONE-SHOT adoption of the legacy `synesthesia_transposeShift`
 *      key - READ-ONLY (never written/deleted) and only when > 0,
 *      matching the legacy writer's historical range.
 *   4. 0.
 * Result is clamped to the global range (+/-24).
 */
export function resolveBootTranspose(input: BootTransposeInput): number {
  const parse = (v: string | null): number | null => {
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const fromUrl = parse(input.urlValue);
  if (fromUrl !== null) return clampGlobal(fromUrl);
  if (
    input.persistedValue !== null &&
    typeof input.persistedValue === "number" &&
    Number.isFinite(input.persistedValue)
  ) {
    return clampGlobal(input.persistedValue);
  }
  const legacy = parse(input.legacyValue);
  if (legacy !== null && legacy > 0) return clampGlobal(legacy);
  return 0;
}