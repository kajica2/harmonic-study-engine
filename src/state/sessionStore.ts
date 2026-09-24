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
 * `currentIdea`, `exerciseTranspose`, `keyCycleActive`,
 * `etudeConstraints`, `composeSession` in localStorage. `dirty` +
 * `pendingModeRequest` are session-scoped (per-mode Edit state, not
 * cross-reload state). The compose PROJECT + analysis + undo stacks
 * (up to 30MB) are IN-MEMORY only - never localStorage (D57).
 *
 * Migration: zustand persist's `migrate` callback delegates to the
 * engine's `createSessionRunner`. v1 -> v2 (Phase 2) appends the
 * transpose-slice defaults; v2 -> v3 (Phase 3 Slice 2, D23) appends
 * `etudeConstraints: null`; v3 -> v4 (Phase 4 Slice 2, D57) appends
 * `composeSession: null`. CURRENT_SESSION_VERSION = 4 and the
 * persist envelope version mirrors it (ADR-004).
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  createSessionRunner,
  type MigrationRunner,
} from "../../engine/migrations";
import { analyzeProject } from "../../engine/compose";
import {
  EMPTY_OVERRIDES,
  type AccompanimentRequest,
  type AccompanimentResult,
  type AnalysisOverrides,
  type ComposeAnalysis,
  type MixerState,
  type NormalizedProject,
} from "../../engine/compose/types";
import type { Idea } from "../../engine/core/idea";
import { advanceKeyCycle as nextInCycleRotation } from "../../engine/core/spelling";
import type { EtudeConstraints } from "../../engine/etude/types";
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
 *  v3 (PRD-001 Phase 3 Slice 2, D23): adds etudeConstraints.
 *  v4 (PRD-001 Phase 4 Slice 2, D57): adds composeSession.
 *  Keep in lockstep with engine/migrations CURRENT_SESSION_VERSION;
 *  the persist envelope version mirrors this value (ADR-004). */
export const CURRENT_SESSION_VERSION = 4;

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

/** PRD-001 Phase 3 Slice 2 (D23): the etude constraints slice. The
 *  COMMITTED constraint set is cross-reload session state (persisted,
 *  exactly like globalTranspose). The panel DRAFT lives in component
 *  state (transient, PRD 10.4) and the Etude RESULT is a pure
 *  derivation of constraints (REQ-ETU-15) - neither belongs here. */
interface EtudeSlice {
  etudeConstraints: EtudeConstraints | null;
  setEtudeConstraints: (c: EtudeConstraints | null) => void;
  /** User-initiated Generate / Randomize-seed (D30): writes the
   *  constraints AND the exact handleCoComposeAccept dirty shape in
   *  ONE action (ADR-007). Never called on boot restore, never by the
   *  memoized compute. */
  acceptEtude: (c: EtudeConstraints) => void;
}

/** PRD-001 Phase 4 Slice 2 (D57): the compose session slice.
 *
 *  PERSISTED (partialize keeps `composeSession` - small by
 *  construction: fileName + hash + sparse overrides + window flag).
 *  The 30MB NormalizedProject, its ComposeAnalysis and the undo
 *  stacks live IN-MEMORY in this same store: a reload with
 *  `composeSession` present but `composeProject === null` renders the
 *  re-upload prompt (D62), and mode switches never lose work (F8).
 *  S3/S4 fields (request/mixer) widen ComposeSession later WITHOUT a
 *  v5 - missing persisted fields default at read. */
export interface ComposeSession {
  fileName: string;
  /** F9: null = "hash unavailable" (insecure ctx / jsdom). */
  fileHash: string | null;
  /** Sparse; chord cells + key/tempo/meter/melody (REQ-COMP-21). */
  overrides: AnalysisOverrides;
  /** REQ-COMP-53 window choice (default 4 min vs full file). */
  analyzeFull: boolean;
  /** PRD-001 Phase 4 Slice 3 (D73): the accompaniment request is an
   *  OPTIONAL persisted field - NO v5, NO migration. Old payloads
   *  default at read via `session.request ?? null`. Style/seed are
   *  taste, not file state: setComposeFile KEEPS them. */
  request?: AccompanimentRequest | null;
  /** PRD-001 Phase 4 Slice 4 (D84): the pasted chord-chart TEXT is an
   *  OPTIONAL persisted field - NO v5. Text (not file bytes,
   *  REQ-IO-70-safe); a reload AUTO-HEALS the session by re-parsing
   *  (pure + sub-ms), so there is NO re-upload prompt for charts.
   *  setComposeFile CLEARS it (a real file supersedes a chart). */
  chartText?: string | null;
  /** PRD-001 Phase 4 Slice 4 (D85): mixer levels are per-SONG taste
   *  (mute THIS file's muddy bass), so they ride composeSession -
   *  they travel with the restore flow AND the share URL. OPTIONAL,
   *  default at read via `session.mixer ?? MIXER_DEFAULTS`. Like the
   *  request, setComposeFile KEEPS it (resetting on every re-upload
   *  during the prompt flow would be worse). */
  mixer?: MixerState | null;
}

/** Undo stack cap (D59): whole-map snapshots, oldest dropped first. */
export const COMPOSE_UNDO_CAP = 32;

/** D84: the session identity of a pasted chart (no file, no hash). */
export const CHART_SESSION_FILE_NAME = "Chord chart (pasted)";

/** File identity + hash captured at upload (setComposeFile meta). */
export interface ComposeFileMeta {
  readonly fileName: string;
  readonly fileHash: string | null;
}

/** Hash-gated restore payload (D62): applied ONLY when the re-uploaded
 *  file's hash matches the persisted composeSession.fileHash. */
export interface ComposeRestore {
  readonly overrides: AnalysisOverrides;
  readonly analyzeFull: boolean;
}

interface ComposeSlice {
  composeSession: ComposeSession | null;
  composeProject: NormalizedProject | null;
  composeAnalysis: ComposeAnalysis | null;
  /** D73: the accompaniment RESULT is in-memory ONLY (excluded by
   *  partialize): deterministic from (grid, request, seed), so
   *  persisting it would cache a pure function - and it references
   *  ticks of a project we refuse to persist. */
  composeAccompaniment: AccompanimentResult | null;
  /** D59 snapshot stacks (in-memory; never persisted). */
  composeUndo: AnalysisOverrides[];
  composeRedo: AnalysisOverrides[];
  /** Load a parsed project + its analysis. Resets overrides to
   *  EMPTY_OVERRIDES, both stacks, analyzeFull -> false - UNLESS a
   *  hash-verified `restore` is supplied by the surface (D62: match
   *  -> restore overrides + analyze; the stacks still reset, undo
   *  never crosses files - RK-S2-5). */
  setComposeFile: (
    project: NormalizedProject,
    analysis: ComposeAnalysis,
    meta: ComposeFileMeta,
    restore?: ComposeRestore,
  ) => void;
  /** The ONLY compose write path (REQ-COMP-21/24): pushes the
   *  PREVIOUS overrides onto undo (cap 32, shift-oldest), clears redo. */
  patchComposeOverrides: (next: AnalysisOverrides) => void;
  undoCompose: () => void;
  redoCompose: () => void;
  /** REQ-COMP-53: recompute composeAnalysis on the in-memory project
   *  (deterministic, no clock/rng - legal in-store). */
  setComposeAnalyzeFull: (b: boolean) => void;
  /** D73: persist the accompaniment request (or null). Does NOT touch
   *  the undo stacks - D59 scope is ANALYSIS OVERRIDES only;
   *  regeneration is instant and the seed is user-owned. */
  setComposeRequest: (req: AccompanimentRequest | null) => void;
  /** D73: in-memory result slot (never persisted). */
  setComposeAccompaniment: (r: AccompanimentResult | null) => void;
  /** PRD-001 Phase 4 Slice 4 (D84): commit a pasted chord chart. The
   *  synthetic project + analysis come from the PURE engine builders
   *  (parseChordChart + buildChartSession - the surface owns them).
   *  Session identity: fileName "Chord chart (pasted)", fileHash null,
   *  EMPTY_OVERRIDES unless a hashless `restore` is supplied (the
   *  reload auto-heal + URL-restore paths pass the persisted overrides
   *  through - same pattern as setComposeFile's restore, minus the
   *  gate: a chart IS its text, there is no file to verify). KEEPS
   *  request + mixer (taste, D73/D85); nulls the accompaniment result
   *  (grid-derived). Resets the undo stacks (new session). */
  setComposeChart: (
    chartText: string,
    project: NormalizedProject,
    analysis: ComposeAnalysis,
    restore?: ComposeRestore,
  ) => void;
  /** D85: persist mixer state (inside composeSession, no v5). Does NOT
   *  touch the undo stacks and does NOT dirty anything (ADR-007). */
  setComposeMixer: (m: MixerState) => void;
  /** D86: boot-time URL restore - sets the (already-resolved) session.
   *  HIGH-001 (S4 fix round): the CALLER (App boot) now FIELD-WISE
   *  MERGES the URL payload with the persisted session BEFORE calling
   *  this (composeUrl.mergeComposeUrlWithPersisted) - a stale
   *  debounced URL no longer clobbers fresher localStorage fields.
   *  This action stays a plain wholesale setter (the merge needs the
   *  raw URLSearchParams presence, a boot concern). Chart sessions
   *  auto-heal their project via the surface's one-shot rebuild; MIDI
   *  sessions land in the EXISTING hash-gate prompt. */
  restoreComposeSessionFromUrl: (session: ComposeSession) => void;
  /** The "start over" reset - compose's OWN clear; resetModeSlice is
   *  deliberately NOT widened (sessionStore pins its shape). */
  clearCompose: () => void;
}

export type SessionState = ModeSlice & EtudeSlice & ComposeSlice;

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      mode: null,
      globalTranspose: 0,
      exerciseTranspose: 0,
      keyCycleActive: false,
      currentIdea: null,
      etudeConstraints: null,
      composeSession: null,
      composeProject: null,
      composeAnalysis: null,
      composeAccompaniment: null,
      composeUndo: [],
      composeRedo: [],
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
      setEtudeConstraints: (c) => {
        set({ etudeConstraints: c });
      },
      acceptEtude: (c) => {
        // D30: the dirty literal is the EXACT shape of App's
        // handleCoComposeAccept (compose/explore stay "none"; only
        // the Etude surface can be dirty). A generated etude is
        // unsaved work - the mode-switch prompt must fire (ADR-007).
        set({
          etudeConstraints: c,
          dirty: {
            compose: "none",
            etude: "etude-pending-accept",
            explore: "none",
          },
        });
      },
      // --- PRD-001 Phase 4 Slice 2 (D57): compose slice actions. All
      // pure setters; the only computation is re-running
      // analyzeProject (deterministic, no clock/rng - legal in-store).
      setComposeFile: (project, analysis, meta, restore) => {
        const s0 = get();
        const overrides = restore === undefined ? EMPTY_OVERRIDES : restore.overrides;
        const analyzeFull = restore === undefined ? false : restore.analyzeFull;
        let finalAnalysis = analysis;
        if (analyzeFull) {
          const full = analyzeProject(project, {
            window: { fromTick: 0, toTick: project.endTick },
          });
          if (full.ok) finalAnalysis = full.value;
        }
        set({
          composeProject: project,
          composeAnalysis: finalAnalysis,
          composeSession: {
            fileName: meta.fileName,
            fileHash: meta.fileHash,
            overrides,
            analyzeFull,
            // D73: style/seed are taste, not file state - the
            // persisted request SURVIVES a file swap (same reasoning
            // as etudeConstraints surviving mode switches).
            request: s0.composeSession?.request ?? null,
            // D84: a real file SUPERSEDES a pasted chart.
            chartText: null,
            // D85: the mixer is per-song taste and KEEPS on file swap
            // (consistent with request; resetting on every re-upload
            // during the prompt flow would be worse).
            mixer: s0.composeSession?.mixer ?? null,
          },
          // D73: the result is grid-derived - a new file invalidates it.
          composeAccompaniment: null,
          composeUndo: [],
          composeRedo: [],
        });
      },
      patchComposeOverrides: (next) => {
        const s = get();
        if (s.composeSession === null) return;
        // D59: snapshot-per-commit, whole-map (sparse + tiny).
        const undo = s.composeUndo.concat(s.composeSession.overrides);
        if (undo.length > COMPOSE_UNDO_CAP) undo.shift();
        set({
          composeUndo: undo,
          composeRedo: [],
          composeSession: { ...s.composeSession, overrides: next },
        });
      },
      undoCompose: () => {
        const s = get();
        if (s.composeSession === null || s.composeUndo.length === 0) return;
        const prev = s.composeUndo[s.composeUndo.length - 1];
        set({
          composeUndo: s.composeUndo.slice(0, -1),
          composeRedo: s.composeRedo.concat(s.composeSession.overrides),
          composeSession: { ...s.composeSession, overrides: prev },
        });
      },
      redoCompose: () => {
        const s = get();
        if (s.composeSession === null || s.composeRedo.length === 0) return;
        const next = s.composeRedo[s.composeRedo.length - 1];
        set({
          composeRedo: s.composeRedo.slice(0, -1),
          composeUndo: s.composeUndo.concat(s.composeSession.overrides),
          composeSession: { ...s.composeSession, overrides: next },
        });
      },
      setComposeAnalyzeFull: (b) => {
        const s = get();
        if (s.composeSession === null || s.composeProject === null) return;
        const project = s.composeProject;
        const outcome = b
          ? analyzeProject(project, { window: { fromTick: 0, toTick: project.endTick } })
          : analyzeProject(project);
        set({
          composeAnalysis: outcome.ok ? outcome.value : s.composeAnalysis,
          composeSession: { ...s.composeSession, analyzeFull: b },
        });
      },
      setComposeRequest: (req) => {
        const s = get();
        // Persisted INSIDE the v4 composeSession record (D73: optional
        // field, no v5). No-op without a session (the panel only
        // renders loaded; taste needs a home).
        if (s.composeSession === null) return;
        set({ composeSession: { ...s.composeSession, request: req } });
      },
      setComposeAccompaniment: (r) => {
        set({ composeAccompaniment: r });
      },
      setComposeChart: (chartText, project, analysis, restore) => {
        const s0 = get();
        const overrides = restore === undefined ? EMPTY_OVERRIDES : restore.overrides;
        const analyzeFull = restore === undefined ? false : restore.analyzeFull;
        set({
          composeProject: project,
          composeAnalysis: analysis,
          composeSession: {
            fileName: CHART_SESSION_FILE_NAME,
            // D84: a chart has NO file identity (hash null - the
            // hash-gate prompt machinery never applies).
            fileHash: null,
            overrides,
            analyzeFull,
            // Taste KEEPS across the commit (D73/D85 - same rule as
            // setComposeFile).
            request: s0.composeSession?.request ?? null,
            chartText,
            mixer: s0.composeSession?.mixer ?? null,
          },
          // Grid-derived result: a new chart invalidates it.
          composeAccompaniment: null,
          composeUndo: [],
          composeRedo: [],
        });
      },
      setComposeMixer: (m) => {
        const s = get();
        // Persisted INSIDE the v4 composeSession record (D85: optional
        // field, no v5). No-op without a session (taste needs a home).
        if (s.composeSession === null) return;
        set({ composeSession: { ...s.composeSession, mixer: m } });
      },
      restoreComposeSessionFromUrl: (session) => {
        // D86: plain wholesale setter (boot-time only, the App
        // one-shot). HIGH-001 (S4 fix round): the App caller merges
        // the URL payload field-wise with the persisted session
        // BEFORE this (composeUrl.mergeComposeUrlWithPersisted), so
        // what lands here is already the resolved value. In-memory
        // project/analysis/result are null at boot, and the surface's
        // chart auto-heal / MIDI hash-gate prompt take it from here.
        set({ composeSession: session });
      },
      clearCompose: () => {
        set({
          composeSession: null,
          composeProject: null,
          composeAnalysis: null,
          composeAccompaniment: null,
          composeUndo: [],
          composeRedo: [],
        });
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
          etudeConstraints: null,
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
        etudeConstraints: s.etudeConstraints,
        // D57: ONLY the small persisted compose record. The 30MB
        // project, its analysis and the undo stacks are in-memory.
        composeSession: s.composeSession,
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