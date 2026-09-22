/**
 * src/state/sessionStore.ts - PRD-001 Phase 1 mode slice (ADR-004).
 *
 * Zustand 5 store + persist middleware (key `hse.session`). Phase 1
 * ships ONLY the mode-related slice (mode, globalTranspose, currentIdea,
 * per-mode dirty, pendingModeRequest). The legacy `useSessionStore.ts`
 * stays untouched in Phase 1 and migrates slice-by-slice in Phase 1.5.
 *
 * Persistence: `partialize` keeps `mode`, `globalTranspose`,
 * `currentIdea` in localStorage. `dirty` + `pendingModeRequest` are
 * session-scoped (per-mode Edit state, not cross-reload state).
 *
 * Migration: zustand persist's `migrate` callback delegates to the
 * engine's `createSessionRunner`. Phase 1 ships with no migrations
 * (CURRENT_SESSION_VERSION = 1, empty SESSION_MIGRATIONS). Each
 * Phase 1.5 PR appends one entry + bumps the version.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  createSessionRunner,
  type MigrationRunner,
} from "../../engine/migrations";
import type { Idea } from "../../engine/core/idea";
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
export const CURRENT_SESSION_VERSION = 1;

const sessionRunner: MigrationRunner<unknown> = createSessionRunner();

interface ModeSlice {
  mode: Mode | null;
  globalTranspose: number;
  currentIdea: Idea | null;
  dirty: DirtyMap;
  pendingModeRequest: Mode | null;
  setMode: (m: Mode | null) => void;
  requestMode: (next: Mode) => void;
  resolveDirty: (action: "save" | "discard" | "cancel") => void;
  setGlobalTranspose: (n: number) => void;
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
        const clamped = Math.max(-24, Math.min(24, n));
        set({ globalTranspose: clamped });
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