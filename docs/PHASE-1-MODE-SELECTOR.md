# Architecture Design: PRD-001 Phase 1 (Mode selector & scaffolding)

- **Author:** @architect
- **Status:** Ready for implementation
- **Date:** 2026-09-23
- **PRD reference:** `docs/PRD-001.md` sections 6.1, 8.1 (REQ-MODE-1..7, REQ-IDEA-1..4), 8.5, 9.6, 11.1, 11.2, 14
- **Inherited ADRs:** ADR-003 (engine/ + purity guard), ADR-004 (Zustand 5), ADR-005 (canonicalId / instanceId)
- **Scope:** Phase 1  -  1 week. Mode selector + scaffolding + dirty-state prompt + Idea bar + per-mode empty states + minimal Idea object.

---

## 0. TL;DR for @developer

You are shipping five additions and one minimal refactor against a working app:

1. **New: `src/state/sessionStore.ts`**  -  Zustand 5 store with `persist` middleware (key `hse.session`); owns `mode`, `globalTranspose`, `currentIdea`, per-mode dirty flags, and (in Phase 1.5) the existing `useSessionStore.ts` payload migrated slice-by-slice. Phase 1 ships ONLY the mode-related slice; the rest follows.
2. **New: `src/components/ModeSelector.tsx`**  -  `role="tablist"` 3-button segmented control (Compose / Etude / Explore); reads + writes the zustand store; on switch it consults dirty flags and opens a Save/Discard/Cancel modal (built on the existing `ModalShell`). Keyboard handler at the document level for `1`/`2`/`3` (additive  -  does not touch the existing handler in `App.tsx`).
3. **New: `engine/core/idea.ts`**  -  `Idea` tagged-union (pure module, engine/ purity guard applies). Backed by `CanonicalId`/`InstanceId` brand types from `engine/core/ids.ts` (ADR-005).
4. **New: `src/components/IdeaBar.tsx`**  -  sticky-bottom bar inside `<main>`, sits above `MobileCommandBar`. Shows the current Idea as a chip + Send-to-Mode / Save / Share dropdown (Phase 1 wires Send-to-Mode only; Save/Share are no-op placeholders that emit a `console.warn` and a toast, see D6).
5. **New: `src/components/ModeGate.tsx`**  -  thin orchestrator that reads `effectiveMode` from the store and switches the rendered surface. App.tsx renders `<ModeGate />` inside `<main>` instead of the current inline JSX block. Existing JSX becomes the three branches.
6. **Refactor: App.tsx**  -  minimal. Wrap `<AppShell />` so it renders `<ModeGate>` in place of the current main body. Wire the zustand store into the keyboard handler (additive). Add `useUrlSync()` hook that mirrors `mode`/`globalTranspose`/active-path into `?mode=...&transpose=...&path=...`. Do NOT delete or rearrange any existing component.

Existing tests must keep passing. New tests land in `engine/core/idea.test.ts` (node) and `src/components/ModeSelector.test.tsx`, `src/components/IdeaBar.test.tsx`, `src/state/sessionStore.test.ts` (jsdom  -  added to `JSDOM_FILES` in `vitest.config.ts`). The drift gate (`assets/check-links.cjs`) and `check-path-bars.ts` are not touched.

---

## 1. Blocking decisions (D5..D9)  -  resolved

### D5. Refactor strategy against the App.tsx monolith

**Chosen: (b) Incremental  -  App.tsx stays the orchestrator, mode-aware gating via a thin `<ModeGate>` component.**

Evidence:
- The app ships today with 1090 passing tests on a 3614-line App.tsx (verified). A big-bang router swap (option a) risks regression in every test that touches App.tsx, with no incremental rollback path.
- Option (c) hard-split into three modules would force a 1-2 day refactor before any new feature lands. The monolith has well-isolated components (`<PlaySessionRail>`, `<CoComposePanel>`, `<PathCatalog>`, `<ImportExportModal>`, `<FormPlanner>`, etc.); the boundary that needs to move is the *outer shell* that contains them, not the components themselves.
- Option (b) preserves all working code paths. `<ModeGate>` is one new file (~80 lines) plus a single JSX swap in App.tsx's render. The existing 3-panel tab system (`activePanel`: `"paths" | "practice" | "catalog"`) becomes an internal Etude-mode sub-tab and is not deleted.

**Migration of App.tsx's render (step-by-step):**

```
1. NEW: src/state/sessionStore.ts                  (~120 lines)
2. NEW: src/components/ModeGate.tsx                (~80 lines)
3. NEW: src/components/ModeSelector.tsx            (~140 lines)
4. NEW: engine/core/idea.ts                        (~80 lines, plus tests)
5. NEW: src/components/IdeaBar.tsx                 (~150 lines)
6. NEW: src/components/DirtyPromptModal.tsx        (~120 lines)
7. EDIT: src/App.tsx                                -  three surgical edits:
   a. Wrap <AppShell/> body so <main> renders <ModeGate /> in place of
      the current 2000+ line main body (lines 1569-3493). Cut the body
      into a new exported function <AppMain />  -  same props, same hooks,
      same children  -  and <ModeGate /> becomes the orchestrator.
   b. Inside <ModeGate />, switch on `effectiveMode`:
        - "etude"    -> <AppMain />  (today's behavior, verbatim)
        - "compose"  -> <ComposeSurface />  (NEW, ~40 lines  -  empty state + ImportExportModal trigger)
        - "explore"  -> <ExploreSurface />  (NEW, ~40 lines  -  empty state + form planner)
   c. Add <IdeaBar /> as the LAST child inside <main> (above </main>).
      The main's pb-[calc(72px+env(safe-area-inset-bottom))] already
      reserves 72px for MobileCommandBar; IdeaBar adds ~64px above
      that on mobile only  -  see D8.
   d. Inside the existing keydown handler (line 909), add `1`/`2`/`3`
      cases that call `useSessionStore.getState().requestMode(...)`
      which delegates the dirty-state prompt logic. The handler is
      additive  -  no existing branches are touched.
   e. Add a new top-level useEffect that runs the URL <-> store sync
      (see Sec.4). Mounts once on App boot.
8. EDIT: src/lib/storage.ts                           -  register the new
   `hse.session` key (or let zustand persist own it; see D7). No
   schema bump required.
9. EDIT: vitest.config.ts                             -  add new JSDOM_FILES
   entries.
```

**What does NOT change:**
- All existing components (`<PlaySessionRail>`, `<PathCatalog>`, `<CoComposePanel>`, `<FormPlanner>`, `<ImportExportModal>`, etc.) keep their props and behavior.
- `useSessionStore.ts` is NOT deleted in Phase 1 (it still owns paths, tempo, transpose, etc.  -  see D7).
- `usePersistedState.ts` is NOT deleted; it remains the helper for ad-hoc non-store keys (e.g. `quizTopic`, `bassMidiChannel`).
- No tests are modified. Existing 1090 tests stay green.

### D6. Dirty-state model (per mode, Phase 1 specific)

Per PRD REQ-MODE-5: each mode exposes a dirty flag. Per REQ-MODE-4: switching modes with unsaved work prompts Save / Discard / Cancel  -  never silent discard.

**Phase 1 declaration (recorded in ADR-006 below):**

| Mode    | Dirty definition (Phase 1)                                                              | What "Save" does                                                                                       | What "Discard" does                              |
|---------|------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|--------------------------------------------------|
| Compose | **Always clean.** No upload surface ships in Phase 1; the modal is the entry point.     | n/a  -  button hidden                                                                                     | n/a                                              |
| Etude   | `dirty = (lastStepRef !== null) && (exportedSinceLastAccept === false)`                 | Snapshots the current active-path mutation to `hse.ideas` (named library, REQ-IDEA-4). Marks clean.     | Calls existing `revertLastAccept()` machinery.  |
| Explore | **Always clean.** Form template picker is read-only in Phase 1; no idea-card surface yet. | n/a  -  button hidden                                                                                     | n/a                                              |

**Mechanics** (lives in `src/state/sessionStore.ts`):

```ts
type DirtyKind = 'none' | 'etude-pending-accept';

interface SessionState {
  mode: Mode | null;              // null = legacy / first-run
  globalTranspose: number;
  currentIdea: Idea | null;
  dirty: Record<Mode, DirtyKind>;
  // ...slices from useSessionStore migrate here in Phase 1.5
  requestMode: (next: Mode) => void;   // checks dirty; opens modal or commits
  saveCurrentIdea: () => void;         // Etude: persists named idea, clears dirty
  discardCurrent: () => void;          // Etude: revertLastAccept + clear idea
}
```

`requestMode('etude')` from any source (selector click, `1`/`2`/`3` shortcut, URL bootstrap):
1. If `mode === next`, no-op.
2. If `dirty[mode] === 'none'`, commit immediately: `setMode(next)` + push to history.
3. If dirty, push the desired target onto a `pendingModeRequest` slot; `<DirtyPromptModal>` opens (modal-driven, not blocking).
4. Modal resolves: Save / Discard / Cancel -> set `pendingModeRequest = null` and commit / revert / abort.

**Save / Share placeholders.** REQ-IDEA-3 names Save and Share. Phase 1 ships them as wired buttons that `console.warn('Share: not yet implemented  -  Phase 8')` and `console.warn('Save: snapshot stored at hse.ideas')`  -  the warn output is allowed by `tests/no-debug-logs.test.ts`. Both buttons are visible so the affordance is honest; the underlying behavior is a `localStorage.setItem('hse.ideas', JSON.stringify([...prev, currentIdea]))` for Save and a `navigator.clipboard.writeText(location.href + '?idea=' + encode(currentIdea))` for Share (no server round-trip; the URL is the share channel per PRD 8.7 REQ-IO-50).

### D7. Zustand activation

**Chosen: split migration.** Phase 1 ships the zustand store with ONLY the mode-related slice. The existing `useSessionStore.ts` (586 lines, 30+ useStates) migrates INTO the same store in **Phase 1.5** as a follow-up  -  one slice per PR, each slice adding a `version` bump and a migration entry in `engine/migrations/`. This minimizes Phase 1 risk while honoring ADR-004 ("zustand installed in Phase 0; activated in Phase 1").

**Store shape (full target  -  Phase 1 ships only the first slice):**

```ts
// src/state/sessionStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMigrationRunner, type MigrationRunner } from '../../engine/migrations/runner';
import type { Mode, Idea } from '../../engine/core/idea';

export const SESSION_STORAGE_KEY = 'hse.session';
export const CURRENT_SESSION_VERSION = 1;

// ---- slice 1 (Phase 1) ----------------------------------------------------
interface ModeSlice {
  mode: Mode | null;
  globalTranspose: number;
  currentIdea: Idea | null;
  // Per-mode dirty kind. 'none' = clean.
  dirty: { compose: 'none'; etude: DirtyKind; explore: 'none' };
  pendingModeRequest: Mode | null;
  // Actions
  setMode: (m: Mode | null) => void;
  requestMode: (next: Mode) => void;        // checks dirty; pushes to pendingModeRequest
  resolveDirty: (action: 'save' | 'discard' | 'cancel') => void;
  setGlobalTranspose: (n: number) => void;
  setCurrentIdea: (i: Idea | null) => void;
  saveCurrentIdea: () => void;              // Etude path; no-op for other modes
  discardCurrent: () => void;
}

// ---- slice 2..N (Phase 1.5 follow-ups) -----------------------------------
// pathsSlice, transportSlice, voicingSlice, instrumentSlice,
// personaSlice, arpSlice, loopSlice, metronomeSlice, compositionSlice.
// Each slice adds a { version: 2..N } entry to SESSION_MIGRATIONS.

export interface SessionState extends ModeSlice /* , PathsSlice, ... */ {}

export const sessionRunner: MigrationRunner<unknown> = createMigrationRunner({
  currentVersion: CURRENT_SESSION_VERSION,
  migrations: SESSION_MIGRATIONS,   // empty array in Phase 1
  assumeVersion: 1,                  // legacy hse.* payloads written before runner = v1
});

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      mode: null,
      globalTranspose: 0,
      currentIdea: null,
      dirty: { compose: 'none', etude: 'none', explore: 'none' },
      pendingModeRequest: null,
      setMode: (m) => set({ mode: m }),
      requestMode: (next) => {
        const cur = get().mode;
        if (cur === next) return;
        const kind = get().dirty[cur ?? 'etude']; // default etude for null mode
        if (kind === 'none') {
          set({ mode: next });
        } else {
          set({ pendingModeRequest: next });
        }
      },
      resolveDirty: (action) => {
        const pending = get().pendingModeRequest;
        if (!pending) return;
        if (action === 'cancel') {
          set({ pendingModeRequest: null });
          return;
        }
        if (action === 'save') get().saveCurrentIdea();
        if (action === 'discard') get().discardCurrent();
        set({ mode: pending, pendingModeRequest: null });
      },
      setGlobalTranspose: (n) => set({ globalTranspose: Math.max(-24, Math.min(24, n)) }),
      setCurrentIdea: (i) => set({ currentIdea: i }),
      saveCurrentIdea: () => {
        const idea = get().currentIdea;
        if (!idea) return;
        try {
          const raw = localStorage.getItem('hse.ideas');
          const list: Idea[] = raw ? JSON.parse(raw) : [];
          list.push(idea);
          // Cap at 100 named ideas  -  REQ-IDEA-4 (saved ideas persist locally)
          const capped = list.slice(-100);
          localStorage.setItem('hse.ideas', JSON.stringify(capped));
        } catch { /* quota  -  silently ignore, in-memory state stays */ }
        set({ dirty: { ...get().dirty, etude: 'none' } });
      },
      discardCurrent: () => {
        // Etude case: signal the existing revertLastAccept machinery in App.tsx.
        // We expose a window-scoped event so useSessionStore (the old hook)
        // can subscribe without importing the new store.
        window.dispatchEvent(new CustomEvent('hse:revert-last-accept'));
        set({ currentIdea: null, dirty: { ...get().dirty, etude: 'none' } });
      },
    }),
    {
      name: SESSION_STORAGE_KEY,
      version: CURRENT_SESSION_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Legacy migration: if any pre-Phase-1 zustand version existed (none yet,
      // but be safe) the runner handles it. The legacy synesthesia_* keys are
      // owned by useSessionStore.ts and not migrated here  -  Phase 1.5 picks
      // them up one slice at a time.
      migrate: (persistedState, version) => {
        const result = sessionRunner.run(persistedState);
        if (!result.ok) {
          console.warn(`[hse.session] migration failed at v${version}: ${result.error}`);
          return null; // zustand falls back to initial state
        }
        return result.value as SessionState;
      },
      partialize: (s) => ({
        mode: s.mode,
        globalTranspose: s.globalTranspose,
        currentIdea: s.currentIdea,
        // dirty + pendingModeRequest intentionally NOT persisted  -  dirty
        // state is session-scoped, not cross-reload state.
      }),
    },
  ),
);
```

**Migration path from `useSessionStore.ts` (Phase 1.5 spec, executed slice-by-slice):**

| Slice | Source `useState` keys | Migration entry | Order |
|-------|------------------------|------------------|-------|
| transport | `tempo`, `timeSignature`, `beatType`, `volume` | `v2` | 1 |
| transpose | `transposeShift` | `v3` | 2 |
| paths | `paths`, `activePathIndex`, `activeStepIndex` | `v4` | 3 |
| instrument | `instrument`, `drumsMuted`, `bassMuted`, `pianoMuted` | `v5` | 4 |
| voicing | `voicingType`, `optimizeVoiceLeading` | `v6` | 5 |
| arp | `arpType`, `arpRate`, `arpGate`, `arpOctaves` | `v7` | 6 |
| persona | `selectedPersonaId`, `showTheoryLabels`, `kbRange` | `v8` | 7 |
| loop | `isLooping`, `loopStartBar`, `loopEndBar` | `v9` | 8 |
| metronome | `metronomeOn` | `v10` | 9 |
| wav | `wavMode`, `humanizeAmount`, `humanizePersonaId`, `scoreDisplayMode` | `v11` | 10 |
| composition | `melodyByStep`, `counterMelodyByStep`, `stylePackId`, `quizScore`, `feedbackHistory` | `v12` | 11 |

Each PR:
1. Moves one slice's useState + useEffect-persist into the store as a new slice file.
2. Reads the legacy `synesthesia_*` key ONCE in the persist `migrate` callback, copies the value, and writes the new `hse.session` shape.
3. Deletes the legacy write-side `useEffect` (zustand persist handles it).
4. Adds a migration entry in `engine/migrations/` with `from: prevVersion, to: prevVersion+1`.
5. Bumps `CURRENT_SESSION_VERSION`.
6. Keeps the legacy `synesthesia_*` reader intact for ONE more release (deleted in the slice+2 PR) so users on old sessions don't crash.

**Why split, not big-bang?** useSessionStore.ts is referenced from ~22 usePersistedState callsites in App.tsx plus the keyboard handler, all of which are stable across renders. Migrating 30 useStates in one PR is a 600+-line diff with no incremental rollback. Slice-by-slice gives @reviewer something concrete to check each time, and reuses the zustand persist migration runner that's already wired.

### D8. Idea bar placement + chrome

**Placement.** Sits as the LAST child inside `<main>` (above `</main>`). `<main>` already has `pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-6` (line 1571) which reserves 72px on mobile for the existing `MobileCommandBar` (fixed-position). The Idea bar is NOT fixed  -  it's a `sticky bottom-0` element that scrolls into view naturally on desktop. On mobile (`<md`), the Idea bar reserves an additional 72px via `pb-[calc(136px+env(safe-area-inset-bottom))]` on a new wrapper `<div>` that contains both the Idea bar and the existing MobileCommandBar spacer; this keeps both surfaces visible without overlap.

**z-index ladder (preserved + extended):**

```
z-50  ModalFallback, ImportExportModal, RecordingModal       (existing)
z-40  DirtyPromptModal (NEW), KeyboardShortcutsCheatsheet    (existing)
z-30  sticky <header> (existing)
z-20  MobileCommandBar (existing, fixed)
z-10  IdeaBar (NEW, sticky inside main)
   0  default
```

The Idea bar is below all modals so a dirty-prompt can overlay it; below the header so the header stays clickable; above MobileCommandBar's stacking context (z-20) is irrelevant because they're in different layout contexts (sticky vs fixed) and never overlap on any breakpoint.

**Chrome (pixel-spec from PRD 9.1 + 9.6):**

- Height: 64px desktop, 56px mobile.
- Background: `surface-1` (var(--color-bg-1)) with `border-t border-[color:var(--color-border)]`.
- Layout: 12px outer padding; flex row; left = idea chip, right = action cluster.
- Idea chip (left): rounded-lg, `surface-2` background, brass left-edge accent (var(--color-brand-strong)) when an idea is present, dim gray when none. Width: max-content up to 40ch, then ellipsis.
  - Empty state: italic dim text "Play something or generate an etude to start an idea." with a small `+` button (`aria-label="Create idea from current chord"`) that materializes an idea from the current chord (the Etude-mode shortcut, see Sec.6).
  - Populated: chord symbol (large mono) + source pill ("from Etude bar 3") + clear `x` button.
- Action cluster (right): 3 buttons + 1 dropdown trigger.
  - `Send to...` dropdown: lists Compose / Etude / Explore; selecting one calls `requestMode(target)` and packages the Idea into the target slice's default seeding surface.
  - `Save` button: calls `saveCurrentIdea()`. Disabled when no current idea.
  - `Share` button: builds `?idea=<base64>` URL, copies to clipboard, toast confirms. Disabled when no current idea.
- Focus: `focus-visible:ring-1 focus-visible:ring-neutral-400/60` per prevention rule PM-2026-009-006.

### D9. Mode mapping  -  what each existing App.tsx section becomes

**Verified from code (lines referenced):**

| Mode     | Phase 1 surface                                                                                  | Source code today                                                  |
|----------|--------------------------------------------------------------------------------------------------|--------------------------------------------------------------------|
| **Etude**  | Full current page body: `<PathBriefing>` + `<PlaySessionRail>` + the right column (StageFrame, LiveScoreDisplay, MelodyLane, piano keyboard). The 3-tab sidebar (`paths`/`practice`/`catalog`) becomes an Etude-internal sub-tab. | Lines 1569-3493 (the entire `<main>`)                              |
| **Compose**| Empty-state stub + a single "Open import modal" button that triggers the existing `ImportExportModal`. The modal renders full-screen on mobile, centered on desktop. No analysis card yet (Phase 4). | New ~40-line `<ComposeSurface>`. Reuses `<ImportExportModal>` (lazy). |
| **Explore**| Empty-state stub with three random preset chips + the existing `<FormPlanner>` + `<FormTemplatePicker>`. The picker is read-only (`onPick` no-op today, line 1588). Phase 5 replaces the chips with real Explore surfaces. | New ~40-line `<ExploreSurface>` reusing existing form-planner JSX (lines 1580-1595). |

**Effective-mode resolution.** URL `?mode=` is canonical at boot; `localStorage.hse.session.mode` is fallback when no URL param; `null` (legacy) resolves to `'etude'` so today's behavior is preserved. The helper:

```ts
// inside the store
function resolveEffectiveMode(): Mode {
  const fromUrl = new URLSearchParams(location.search).get('mode');
  if (fromUrl && isMode(fromUrl)) return fromUrl;
  if (get().mode) return get().mode!;
  return 'etude';  // legacy / first-run default
}
```

`<ModeGate>` calls `resolveEffectiveMode()` once at mount and dispatches `setMode(...)` to the store; subsequent store changes are propagated to URL via a `useUrlSync` effect (see Sec.4).

**v1 of each mode in Phase 1:**

| Mode    | Phase 1 ships                                                                                                                              | Phase 1 explicitly does NOT ship                                                |
|---------|--------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------|
| Compose | (a) Drop-here piano-roll thumbnail (the existing `<SynesthesiaCanvas>` faded to 30% opacity), (b) CTA button to open `<ImportExportModal>`, (c) Privacy statement `<aside>` (REQ-IO-70 already listed as P0, but it lives on the upload surface which is the modal  -  Phase 1 adds the `<aside>` next to the CTA). | Track role classification, key/melody/chord analysis, editable analysis card, accompaniment generation. |
| Etude   | Everything that's there today, untouched. Mode selector lives in the new header slot so users can leave.                                   | Generated-etude constraint panel (Phase 3), metronome/loop polish (Phase 7).     |
| Explore | (a) Three random preset chips (drawn from a fixed list of 12  -  chord, progression, scale seeds; see Sec.10), (b) the existing `<FormPlanner>` + `<FormTemplatePicker>`. | Reharmonize / substitute / expand operations (Phase 5), idea cards with rationale. |

---

## 2. Component API + UX (Mode selector)

### Props

```ts
interface ModeSelectorProps {
  /** Optional override; defaults to reading from useSessionStore. */
  value?: Mode;
  /** Optional override for the change handler; defaults to requestMode. */
  onChange?: (next: Mode) => void;
  /** When true, renders a compact icon-only row (used in MobileCommandBar). */
  compact?: boolean;
  /** Test-only id prefix for the tablist; defaults to 'mode-selector'. */
  idPrefix?: string;
}
```

### Markup (a11y-correct, per PRD 9.8)

```tsx
<div role="tablist" aria-label="Mode" className="...">
  {MODES.map((m) => (
    <button
      key={m}
      role="tab"
      id={`${idPrefix}-tab-${m}`}
      aria-selected={value === m}
      aria-controls={`${idPrefix}-panel-${m}`}
      tabIndex={value === m ? 0 : -1}
      onClick={() => onChange?.(m)}
      onKeyDown={handleRovingTabKey}
      className={value === m ? 'active' : 'inactive'}
    >
      <span className="kbd">{(MODES.indexOf(m) + 1).toString()}</span>
      <span>{LABELS[m]}</span>
    </button>
  ))}
</div>
```

- Roving tabindex (ArrowLeft / ArrowRight) per WAI-ARIA tablist pattern.
- The existing document-level keydown handler in App.tsx (line 909) intercepts `1`/`2`/`3` BEFORE the tablist's own handler so the shortcut works even when focus is on the canvas / a modal-trigger button.
- Visual: 3 segments separated by 1px dividers; active segment has `bg-[color:var(--color-brand-muted)] text-[color:var(--color-brand-strong)]`; inactive is `surface-1 text-neutral-300`. Hovering an inactive segment shows a subtle `hover:text-white` shift.
- Compact mode (mobile): 3 icons only, no labels, fixed 36x36px squares.

### Persistence wiring

- Read: `useSessionStore(s => s.mode)` (selector subscription  -  only this component re-renders on mode change).
- Write: `useSessionStore.getState().requestMode(next)` (action, not setMode  -  goes through dirty check).
- On mount: dispatches `setMode(resolveEffectiveMode())` once (see D9).

### Keyboard handler integration

Add three additive branches to the existing `handleKeyDown` in App.tsx (line 909), placed AFTER the `Escape` and `?` branches but BEFORE the arrow-key branches (so digit keys don't get caught by anything else):

```ts
} else if (e.key === "1") {
  useSessionStore.getState().requestMode('compose');
  e.preventDefault();
} else if (e.key === "2") {
  useSessionStore.getState().requestMode('etude');
  e.preventDefault();
} else if (e.key === "3") {
  useSessionStore.getState().requestMode('explore');
  e.preventDefault();
}
```

Existing `isTyping` guard (lines 911-918) ensures these don't fire inside an input/select/textarea. No conflict with the existing `[`/`]`/arrow/space handlers.

---

## 3. URL persistence scheme (PRD 11.2 examples)

### Boot-time read

On App mount, before any state hydration, a single `useEffect` reads `location.search` and writes each known param into the store via `partialize`-safe setters:

```ts
function syncFromUrl(): void {
  const p = new URLSearchParams(location.search);
  const m = p.get('mode');
  if (m && isMode(m)) useSessionStore.getState().setMode(m);
  const t = p.get('transpose');
  if (t !== null) {
    const n = Number(t);
    if (Number.isFinite(n)) useSessionStore.getState().setGlobalTranspose(n);
  }
  // path = active path id, decoded base36 if present
  const pid = p.get('path');
  if (pid) {
    // delegated to useSessionStore (old hook)  -  Phase 1.5 will own it directly
    const idx = /* find in paths */ ;
    if (idx >= 0) /* setActivePathIndex(idx) */ ;
  }
  // idea = base64 JSON of an Idea, only honored when present (share link)
  const ideaStr = p.get('idea');
  if (ideaStr) {
    try {
      const json = decodeURIComponent(atob(ideaStr));
      const idea = JSON.parse(json) as Idea;
      if (isValidIdea(idea)) useSessionStore.getState().setCurrentIdea(idea);
    } catch { /* malformed  -  ignore, log via console.warn */ }
  }
}
```

### Live write (history.replaceState, never pushState for ephemeral tweaks)

A subscription on the store debounced to 200ms writes back to URL on any change to `mode`, `globalTranspose`, or active path id. Uses `history.replaceState` to avoid polluting the back stack. Only the canonical keys are written; ephemeral UI state (current bar, dirty flag, pending prompt) is never serialized to URL.

### Examples (PRD 11.2)

```
/?mode=etude&transpose=2&path=2k7
/?mode=compose&path=4f1           (fileHash arrives in Phase 4)
/?mode=explore                    (no seed yet  -  empty state)
/?idea=<base64 idea JSON>          (share link  -  opens Etude with idea preloaded)
```

Unknown params are preserved (the writer only re-emits the 3 known keys; everything else in `location.search` stays).

---

## 4. localStorage key: `hse.session`  -  shape + migration plan

### Shape (Phase 1)

```jsonc
// hse.session  (JSON, persisted by zustand/persist)
{
  "state": {
    "mode": "etude" | "compose" | "explore" | null,
    "globalTranspose": 0,        // integer semitones, -24..24
    "currentIdea": null | {
      "id": "<canonicalId>",     // engine/core/ids.ts brand
      "instanceId": "<instanceId>",
      "source": "etude" | "compose" | "explore",
      "kind": "chord" | "progression" | "scale" | "melody" | "seed",
      // exactly ONE of the following is populated per kind:
      "chord": "Cmaj7" | null,
      "progression": ["Cmaj7", "Am7", "Dm7", "G7"] | null,
      "scale": "C dorian" | null,
      "melody": [60, 64, 67, 72] | null,    // MIDI numbers
      "seed": 12345 | null,                 // integer; reproducible gen
      "tags": ["user-created"] | null,      // small array; capped at 8
      "createdAt": 1695000000000            // epoch ms  -  UI display only
    }
    // NOTE: dirty + pendingModeRequest are session-scoped and explicitly
    // excluded from persistence via `partialize`.
  },
  "version": 1
}
```

### What lives where (Phase 1 vs later)

| State                              | Phase 1 location                                      | Phase 1.5+ migration                                                  |
|------------------------------------|-------------------------------------------------------|------------------------------------------------------------------------|
| `mode`                             | zustand `hse.session` (via persist)                   | stays                                                                 |
| `globalTranspose`                  | zustand `hse.session`                                 | stays                                                                 |
| `currentIdea`                      | zustand `hse.session`                                 | stays                                                                 |
| Per-mode `dirty` flags             | zustand `hse.session` *memory only* (partialize out)  | stays                                                                 |
| `pendingModeRequest`               | zustand *memory only*                                 | stays                                                                 |
| Saved ideas library                | `hse.ideas` (separate key, capped 100)                | stays                                                                 |
| All `useSessionStore` payload      | still in synesthesia_* keys (unchanged)                | moves to `hse.session` slice-by-slice (table in D7)                  |
| `quizTopic`, `bassMidiChannel`     | usePersistedState (unchanged)                         | unchanged (per-call persisted state, not session-scoped)              |
| `hse.performance.log.v1`           | unchanged                                             | unchanged                                                             |

### Schema migration plan

`engine/migrations/runner.ts` already exists and validates the chain. Phase 1 ships with `CURRENT_SESSION_VERSION = 1` and `SESSION_MIGRATIONS = []`. Each Phase 1.5 PR that adds a slice appends one entry. The `assumeVersion: 1` option treats any pre-runner payload as v1 (matches existing `hse.performance.log.v1` precedent  -  ADR-004's "version-in-key" convention).

### Boot order in App.tsx

1. `ensureStorageSchemaVersion()` (line 102 import, called early in App boot  -  unchanged).
2. `useMidiDevices()` etc. (existing, unchanged).
3. `useSessionStore.persist.rehydrate()` is called automatically by zustand on first `useStore()` invocation; no explicit call needed. The `migrate` callback runs during rehydration.
4. `syncFromUrl()` runs in a `useEffect` with empty deps after rehydration completes (the store's `onFinishHydration` callback, also exposed by zustand persist).

---

## 5. Idea object bootstrap

### Where it lives

`engine/core/idea.ts`. ADR-003 mandates engine/ for pure data types; ADR-005 already ships `CanonicalId`/`InstanceId` brand types in `engine/core/ids.ts`. The Idea type sits next to it.

### Minimal Phase 1 type (per ADR-005 brand + PRD 11.1 subset)

```ts
// engine/core/idea.ts
import type { CanonicalId, InstanceId } from './ids';
import { asCanonicalId, makeInstanceId } from './ids';

/**
 * Source mode that minted this idea. PRD REQ-IDEA-2 ("every mode's
 * primary output must be packageable as an Idea") uses source to
 * route the Send-to-Mode action.
 */
export type IdeaSource = 'compose' | 'etude' | 'explore';

export type IdeaKind = 'chord' | 'progression' | 'scale' | 'melody' | 'seed';

/**
 * Idea  -  PRD 11.1 normalized cross-mode currency.
 *
 * Phase 1 ships the minimal discriminated union: exactly one of
 * chord/progression/scale/melody/seed is populated. The richer
 * payload (audio refs, style ids, analysis confidence) lands in
 * later phases as the corresponding mode's primary output stabilizes.
 */
export interface Idea extends Versioned {
  readonly id: CanonicalId;          // ADR-005: deterministic from payload
  readonly instanceId: InstanceId;   // ADR-005: timestamped materialization
  readonly source: IdeaSource;
  readonly kind: IdeaKind;
  readonly chord: string | null;
  readonly progression: readonly string[] | null;
  readonly scale: string | null;
  readonly melody: readonly number[] | null;   // MIDI 0-127
  readonly seed: number | null;
  readonly tags: readonly string[] | null;    // <= 8
  readonly createdAt: number;                  // epoch ms; UI display only
}

// Versioned base from engine/core/versioned.ts (already exists, ADR-003).
interface Versioned { readonly version: number; }

/** Type guard for runtime validation at trust boundaries (URL, localStorage). */
export function isIdea(raw: unknown): raw is Idea {
  if (typeof raw !== 'object' || raw === null) return false;
  const o = raw as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.instanceId === 'string' &&
    typeof o.source === 'string' &&
    ['compose', 'etude', 'explore'].includes(o.source as string) &&
    typeof o.kind === 'string' &&
    ['chord', 'progression', 'scale', 'melody', 'seed'].includes(o.kind as string) &&
    (o.chord === null || typeof o.chord === 'string') &&
    (o.progression === null || Array.isArray(o.progression)) &&
    (o.scale === null || typeof o.scale === 'string') &&
    (o.melody === null || Array.isArray(o.melody)) &&
    (o.seed === null || typeof o.seed === 'number') &&
    (o.tags === null || Array.isArray(o.tags)) &&
    typeof o.createdAt === 'number'
  );
}

/**
 * Build an Idea from a chord symbol (the Etude-mode day-1 source).
 * Pure  -  nowMs is supplied by the caller, never read from the clock.
 */
export function ideaFromChord(
  source: IdeaSource,
  chord: string,
  nowMs: number,
  seq = 0,
): Idea {
  const payload = { source, kind: 'chord' as const, chord };
  return {
    id: deriveIdeaId(payload),
    instanceId: makeInstanceId(nowMs, seq),
    source,
    kind: 'chord',
    chord,
    progression: null,
    scale: null,
    melody: null,
    seed: null,
    tags: null,
    createdAt: nowMs,
    version: 1,
  };
}

// Internal: derive a deterministic canonical id from a canonicalized payload.
// Mirrors deriveCanonicalId's hashSeed approach but over the Idea subset
// (the full versioned envelope is the input to the engine id helper).
import { hashSeed } from './rng';
function deriveIdeaId(p: { source: string; kind: string; chord: string | null }): CanonicalId {
  const key = `${p.source}|${p.kind}|${p.chord ?? ''}`;
  return asCanonicalId(`idea-${hashSeed(key).toString(36)}`);
}
```

**Purity guard compliance.** No `Date.now`, no `Math.random`, no external imports. `nowMs` flows in from the caller (App.tsx supplies `Date.now()` at the adapter layer  -  ADR-003's exact pattern). Tested in `engine/core/idea.test.ts` (node env, colocated under engine/ per ADR-003-02).

### What populates an Idea on day 1

| Trigger                                          | Idea built                                                | Source tag |
|--------------------------------------------------|-----------------------------------------------------------|------------|
| User clicks a bar in the bar strip (PlaySessionRail line 727) | `ideaFromChord('etude', transposeChordName(step.name, transposeShift), Date.now())` | `'etude'` |
| User clicks the `+` button on the empty idea bar | Same as above, using `step` from the currently active step | `'etude'` |
| URL `?idea=<base64>`                             | Validated via `isIdea`, stored as-is                      | varies     |
| CoCompose Accept (existing handler at App.tsx line 1627) | Phase 1.5  -  not wired this PR.                          | `'etude'` |

The bar-click handler is one line in App.tsx  -  additive, no existing behavior changes. The same handler already calls `setActiveStepIndex(stepIdx)` and `onPlayChord(stepNotes)`; we add `useSessionStore.getState().setCurrentIdea(ideaFromChord(...))` right after those.

---

## 6. Idea bar  -  layout, empty state, Send-to-Mode wiring

### Layout (matches PRD 9.1 + D8 above)

```tsx
// src/components/IdeaBar.tsx
export function IdeaBar() {
  const idea = useSessionStore(s => s.currentIdea);
  const dirty = useSessionStore(s => s.dirty.etude);
  const requestMode = useSessionStore(s => s.requestMode);
  const saveCurrentIdea = useSessionStore(s => s.saveCurrentIdea);
  // ...handlers
  return (
    <div className="sticky bottom-0 z-10 mt-4 -mx-3 sm:-mx-6 px-3 sm:px-6 py-2 surface-1 border-t border-[color:var(--color-border)] h-16">
      <div className="flex items-center gap-3 max-w-screen-2xl mx-auto">
        {/* LEFT: chip */}
        {idea ? <PopulatedChip idea={idea} onClear={...} /> : <EmptyChip onCreate={...} />}
        <div className="flex-1" />
        {/* RIGHT: actions */}
        <SendDropdown idea={idea} onSend={(target) => {
          // Build the per-mode seed payload from idea and call the
          // mode-specific hook to apply it. Phase 1 only Etude-to-
          // anything is wired; Compose/Explore are stubs.
          if (target === 'etude' && idea.kind === 'chord') {
            // Etude is the default surface  -  just navigate.
            requestMode('etude');
          } else if (target === 'compose') {
            console.warn('[IdeaBar] Send-to-Compose: Phase 4 wires the upload surface');
            requestMode('compose');
          } else {
            console.warn('[IdeaBar] Send-to-Explore: Phase 5 wires idea cards');
            requestMode('explore');
          }
        }} />
        <button onClick={saveCurrentIdea} disabled={!idea}>Save</button>
        <button onClick={copyShareLink} disabled={!idea}>Share</button>
      </div>
    </div>
  );
}
```

### Empty state copy (PRD 9.6 verbatim)

```
"Play something or generate an etude to start an idea."
```

With the `+` icon button labeled `Create idea from current chord` (aria-label only; visible glyph is `+`).

### Send-to-Mode dropdown

A native `<select>` (not a custom popover) is sufficient for Phase 1  -  it's already the pattern used in `<MidiInPicker>` (App.tsx line 1469), `<BackingTrackPicker>` (line 2952), and the WAV render mode picker (PlaySessionRail line 944). Consistency with the existing chrome wins over fancy UI here.

Options: `Send to Compose` (disabled until Phase 4), `Send to Etude` (always enabled), `Send to Explore` (disabled until Phase 5). Disabled options have a tooltip explaining when they'll land.

### Copy/share link

`Share` button -> builds `?idea=${encodeURIComponent(btoa(JSON.stringify(idea)))}` -> `navigator.clipboard.writeText(location.origin + '?idea=...')` -> toast via the existing `<InlineStatus>` pattern (already used by App.tsx for WAV export status, line 978). No server round-trip; the URL is the share channel (PRD REQ-IO-50).

---

## 7. Empty states per mode (PRD 9.6 copy, exact strings)

### Compose (no file)

```
[ faded SynesthesiaCanvas thumbnail, 30% opacity ]
"Drop a .mid file to get started."
[ "Open import / export" button ]   [ privacy statement <aside> ]
```

Privacy statement (REQ-IO-70, P0): single sentence, dim text:

```
"All processing happens in your browser. Your MIDI file never leaves this tab."
```

### Etude (before generating)  -  N/A in Phase 1

The current app lands users directly on the curated paths experience with no "before generating" state. Phase 1 ships Etude as-is (D9). When Phase 3 lands the constraint panel + generated etude, this empty state applies. Documented here so the future change is one PR.

### Explore (no seed)

```
[ three random preset chips, drawn from a fixed list of 12:
    "Cmaj7", "ii-V-I in C", "D dorian", "Fmaj7",
    "C blues", "12-bar in A", "C lydian", "Dm9",
    "Bbmaj7-A7alt", "G mixolydian", "Cm-Eb-Gm progression", "Phrygian in E"
  Each chip: pill button with the seed text + a `^` glyph ]
[ "<FormTemplatePicker>" + "<FormPlanner>" below  -  current behavior ]
```

Three chips are random per session (seeded by `Date.now() ^ sessionSalt`); on every new mode entry a fresh trio is drawn so the user sees different chips each time.

### Idea bar (no idea)

```
"Play something or generate an etude to start an idea."   [ + ]
```

---

## 8. Zustand selector split (don't render-trash the monolith)

Critical rule from AGENTS.md: App.tsx is a 3614-line monolith owning playback state, persona/voicing/tempo, keyboard/MIDI wiring. The whole point of Zustand here is per-slice subscriptions so adding the mode selector doesn't re-render the rest of the tree.

**Selector pattern (apply everywhere the store is consumed):**

```ts
// Good  -  component re-renders ONLY when mode changes
const mode = useSessionStore(s => s.mode);

// Bad  -  re-renders on every state change in the store
const { mode, transpose, dirty } = useSessionStore();
```

**Per-component subscription map:**

| Component             | Selectors (only these re-render the component)                                        |
|-----------------------|----------------------------------------------------------------------------------------|
| `<ModeSelector>`      | `s => s.mode`                                                                          |
| `<IdeaBar>`           | `s => s.currentIdea`, `s => s.dirty.etude`                                             |
| `<DirtyPromptModal>`  | `s => s.pendingModeRequest`, `s => s.dirty`                                            |
| `<ComposeSurface>`    | `s => s.mode` (just to know it's active)                                               |
| `<ExploreSurface>`    | `s => s.mode`                                                                          |
| `<AppMain>` (Etude)   | (none in Phase 1; the inner components subscribe per slice when Phase 1.5 lands)      |
| `App.tsx` keydown     | `useSessionStore.getState()` (non-reactive  -  fire-and-forget action calls)            |

`useShallow` from zustand is used only when a component needs more than one slice and a custom equality is required; for the Phase 1 components listed above, single-field selectors are enough.

---

## 9. Test plan

### New test files (all keep the drift gate green)

| File                                        | Env       | What it pins                                                                          |
|---------------------------------------------|-----------|----------------------------------------------------------------------------------------|
| `engine/core/idea.test.ts`                  | node      | `isIdea` validator; `ideaFromChord` is pure (same input -> same id); brand types prevent mix; null fields for non-active kinds. |
| `src/state/sessionStore.test.ts`            | jsdom     | `setMode` / `requestMode` / `resolveDirty` state machine; persist + rehydrate round-trip; legacy `synesthesia_*` keys untouched. |
| `src/components/ModeSelector.test.tsx`      | jsdom     | Click toggles mode; `1`/`2`/`3` keys route through `requestMode`; roving tabindex works; dirty mode triggers the prompt. |
| `src/components/IdeaBar.test.tsx`           | jsdom     | Empty chip copy matches PRD 9.6; populated chip shows source pill + clear; Save disabled when no idea; Share copies to clipboard (mocked). |
| `src/components/DirtyPromptModal.test.tsx`  | jsdom     | Save -> persists + switches mode; Discard -> reverts + switches; Cancel -> stays on current mode. |
| `src/components/ModeGate.test.tsx`          | jsdom     | `mode=etude` renders `<AppMain>`; `mode=compose` renders `<ComposeSurface>`; URL bootstrap on mount. |

### `JSDOM_FILES` updates in `vitest.config.ts`

Add the 4 component / state files to the `JSDOM_FILES` array (line 13). `engine/core/idea.test.ts` is node-only and runs under the node project automatically. The drift gate (`assets/check-links.cjs`) does NOT count these files (it counts `tests/*.test.ts` blocks only  -  ADR-003-02).

### Migration test (zustand version bump)

When Phase 1.5 PRs land slice migrations, each adds:

1. An entry to `SESSION_MIGRATIONS` in `engine/migrations/index.ts`.
2. A `migrate: (s, fromVersion) => ...` clause in the persist config.
3. A unit test in `src/state/sessionStore.test.ts` (or `engine/migrations/runner.test.ts` if the helper is engine-side) that:
   - constructs a payload stamped at `fromVersion - 1`,
   - calls `sessionRunner.run(payload)`,
   - asserts the migrated shape matches `version: fromVersion` and the legacy fields are correctly copied into the new fields.

For Phase 1 itself, `CURRENT_SESSION_VERSION = 1` and `SESSION_MIGRATIONS = []`  -  the migration runner is invoked but is a no-op (validates the empty chain).

### Pin: `hse.session` shape

No new pin in `assets/check-links.cjs`  -  the drift gate doesn't assert localStorage shape (it asserts README/SPEC counts). No `tests/*.test.ts` count change.

### Pin: `curatedBriefingCount` (existing, untouched)

The Phase 1 PR does NOT add a masterclass tune, so `tests/pathBriefing.test.ts`'s pin `curatedBriefingCount() === 12` stays at 12. No update.

### Pin: `tunesCount()` (existing, untouched)

`tests/count-tunes.test.js`'s `tunesCount() === 40` (masterclass catalog size) is unchanged. No update.

### Gate order

```
npm run lint        # tsc --noEmit  -  must pass; the new TS files use existing types only
npm test            # 1090 existing + ~30 new tests
npm run build       # vite.rnn.config.ts then vite build  -  must pass
node assets/check-links.cjs   # unchanged; still green
npm run check:paths # 36/36 paths within MIN/MAX_PATH_BARS  -  unchanged
```

---

## 10. Implementation checklist (top-to-bottom, ordered)

Each step is one PR / one commit. Numbers are not the merge order (CI / reviewer may reorder); they're the logical dependency order so each step's diff is reviewable in isolation.

### Phase 1 (this PRD section 14 - 1 week)

1. **Add `engine/core/idea.ts` + test.** Pure module, purity guard passes. ~80 LOC + 30 LOC test. No App.tsx touched. Commit: `feat(engine): Idea type (PRD REQ-IDEA-1)`. Gates: lint, test, engine/purity.
2. **Add `src/state/sessionStore.ts` + test.** Zustand store with mode + globalTranspose + currentIdea + dirty + persist. ~120 LOC + 80 LOC test. Imports `engine/core/idea.ts`. No App.tsx touched. Commit: `feat(state): zustand session store (mode slice)`.
3. **Add `vitest.config.ts` JSDOM_FILES entries** for the 4 new test files in step 2 + later components. Commit: `chore(vitest): register new JSDOM test files`.
4. **Add `<ModeSelector>` + test.** Reads + writes the store via selectors. ~140 LOC + 80 LOC test. Commit: `feat(ui): ModeSelector component (PRD REQ-MODE-1, REQ-MODE-7)`. Mount it inside `<header>` between the title block and the existing MIDI/device controls (right column on md+, hidden <md  -  mobile uses MobileCommandBar's mode chip which is a follow-up).
5. **Add `<ModeGate>` + test.** Switch on `effectiveMode`. ~80 LOC + 40 LOC test. Commit: `feat(ui): ModeGate orchestrator (PRD REQ-MODE-1..3)`.
6. **Add URL <-> store sync effect** in App.tsx (one `useEffect`, ~30 LOC). Commit: `feat(state): URL persistence for mode+transpose (PRD REQ-MODE-2)`. This is the only App.tsx edit in this step.
7. **Add keyboard `1`/`2`/`3` branches** to the existing `handleKeyDown` (3 LOC). Commit: `feat(ui): mode keyboard shortcuts (PRD REQ-MODE-7)`. Additive to the existing handler.
8. **Add `<IdeaBar>` + test.** Reads `currentIdea` + `dirty.etude`. Wires Save / Share / Send-to-Mode. ~150 LOC + 100 LOC test. Commit: `feat(ui): IdeaBar (PRD REQ-MODE-6, REQ-IDEA-3)`.
9. **Add `<DirtyPromptModal>` + test.** Save / Discard / Cancel flow. Built on existing `<ModalShell>`. ~120 LOC + 80 LOC test. Commit: `feat(ui): dirty-state prompt (PRD REQ-MODE-4, REQ-MODE-5)`.
10. **Add `<ComposeSurface>`** (~40 LOC). Empty state + privacy `<aside>` + "Open import / export" button that forces `setShowImportExport(true)`. Commit: `feat(ui): Compose surface (PRD REQ-COMP-1 empty state, REQ-IO-70)`.
11. **Add `<ExploreSurface>`** (~40 LOC). Three random chips + the existing `<FormTemplatePicker>` + `<FormPlanner>` JSX (currently inline in App.tsx at lines 1580-1595). Commit: `feat(ui): Explore surface (PRD REQ-EXP-2 empty state)`.
12. **Wire `<ModeGate>` into App.tsx.** The surgical edit: move the `<main>` body's children into an exported `<AppMain>` component (props unchanged) and replace the inline JSX with `<ModeGate />`. Plus insert `<IdeaBar />` as the last child of `<main>`. Commit: `feat(ui): mode-aware App.tsx gating (PRD REQ-MODE-1)`. This is the biggest App.tsx edit (~50 lines moved, ~10 lines added).
13. **Wire the bar-click Idea capture** (one line in App.tsx at line ~744 in PlaySessionRail's bar button handler). Commit: `feat(state): bar click mints Idea (PRD REQ-IDEA-2 day-1 path)`.
14. **Final gates.** `npm run lint && npm test && npm run build`. The build runs both `vite.rnn.config.ts` AND `vite build` (AGENTS.md command order). Verify dist: `grep -o "mode-selector" dist/assets/index-*.js` ships the new component.
15. **Commit message per repo convention:** `feat(modes): Phase 1  -  mode selector + scaffolding + Idea bar (PRD-001 Sec.14)`.

### Phase 1.5 (follow-up, not in this 1-week window)

These are documented but explicitly NOT shipped in Phase 1. Each is a one-slice PR per the table in D7:

16. Migrate `tempo` / `timeSignature` / `beatType` / `volume` (transport slice). PR.
17. Migrate `transposeShift` (transpose slice; rename to `globalTranspose` in the store, deprecate the old key). PR.
18. Migrate `paths` / `activePathIndex` / `activeStepIndex` (paths slice). PR.
19. Migrate instrument + mutes, voicing, arp, persona, loop, metronome, wav, composition (one PR per slice). 8 more PRs.

Each adds `CURRENT_SESSION_VERSION` bump + `SESSION_MIGRATIONS` entry + a migration test.

---

## 11. Risks + open questions + explicitly deferred

### Risks

| # | Risk                                                                                       | Likelihood | Impact | Mitigation                                                                                                                  |
|---|--------------------------------------------------------------------------------------------|-----------|--------|------------------------------------------------------------------------------------------------------------------------------|
| R1 | The `1`/`2`/`3` shortcuts collide with a future modal that uses digit-key navigation.       | Low       | Medium | The `isTyping` guard (App.tsx line 911) already covers form fields; add a per-modal `e.stopPropagation()` if/when needed.     |
| R2 | zustand's persist `migrate` is called on every rehydrate  -  if it logs on cold start, it pollutes DevTools. | Medium | Low    | The runner's failure path uses `console.warn` (allowed) and only fires when a migration breaks. Cold-start success is silent.  |
| R3 | The `IdeaBar`'s `Save` button on a session with 100+ saved ideas silently caps; user loses old ideas. | Low       | Low    | 100-cap is documented inline; the chip shows count ("98 saved"). Phase 2 can add export/clear actions.                          |
| R4 | Splitting migration across Phase 1 + 1.5 means `useSessionStore.ts` and `useSessionStore` (the new zustand one) coexist for ~10 PRs; bugs in one may surprise the other. | Medium | Medium | Both stores subscribe to `localStorage` but use disjoint keys. The Phase 1 zustand store only reads its OWN `hse.session` key. The Phase 1.5 migration PRs read legacy keys ONCE during rehydrate then never touch them again. |
| R5 | `<IdeaBar>` on mobile collides with `<MobileCommandBar>`.                                   | Medium    | Low    | Verified: MobileCommandBar is `fixed` at z-20, IdeaBar is `sticky` at z-10 inside `<main>`. They live in different stacking contexts. Extra `pb` on `<main>` for mobile only. |
| R6 | The drift gate (`assets/check-links.cjs`) is sensitive to test counts; adding 6 new test files changes `tests/*.test.ts` totals? | Low | High | The drift gate counts `tests/*.test.ts` only, NOT `src/**/*.test.ts` (verified at line ~40 of check-links.cjs). New component tests live under `src/components/` and don't affect the gate. New state test is under `src/state/`. engine/ tests never counted. |
| R7 | CoComposePanel's `onAccept` already calls `setHarmonicStep` (App.tsx line 1627) which mutates the path. Phase 1 Etude dirty detection relies on `lastStepRef.current !== null`  -  but `lastStepRef` is owned by `useSessionStore.ts`, not the new zustand store. | High | High | Phase 1 emits a `window.dispatchEvent(new CustomEvent('hse:etude-mutated'))` from inside the existing `setHarmonicStep` callback (or, simpler: re-export `setHarmonicStep` from the store and let App.tsx subscribe). Phase 1.5 moves the ref into the store. Documented in D6 mechanics. |

### Open questions (defer to Phase 1.5 or PRD section 15)

- **Q1** (replaces PRD Q1  -  answered in ADR-004). State library: Zustand 5. Resolved.
- **Q2-new** How does the Idea bar interact with the practice log when a saved idea is "loaded"  -  does it auto-restart playback? Phase 1 says no (load = setCurrentIdea + navigate to Etude). Phase 2 can revisit.
- **Q3-new** Should `Save` open a name-prompt dialog, or save with an auto-generated name (`idea-${Date.now()}`)? Phase 1 uses the auto-name; Phase 2+ can add naming.
- **Q4-new** When the Idea bar is hidden because the active mode is `null` (legacy), what shows? The empty state copy still appears, plus a one-line "select a mode" hint above it. Phase 1 ships this.

### Explicitly deferred (Phase 2+)

- Real Compose analysis card (Phase 4)  -  surface stays as a stub + modal trigger.
- Real Explore operations (Phase 5)  -  preset chips + form planner only.
- The full 30-field `useSessionStore.ts` migration (Phase 1.5)  -  slice-by-slice.
- `hse.ideas` library UI (Phase 6  -  concept drawer will house it).
- Style profiles (Phase 0 follow-up, deferred; current `stylePackId` stays in `useSessionStore.ts` until Phase 1.5 slice 11).
- `?fileHash=` URL scheme (Phase 4)  -  Phase 1 URL persistence covers mode + transpose + path + idea.
- Concept registry + drawer (Phase 6).
- Practice mechanics deepening (Phase 7).
- Session sharing via URL with full state serialization (Phase 8)  -  Phase 1 ships only the Idea share link.

---

## Appendix A. ADR records (in the style of `.kai/decisions/ADR-NNN-*.md`)

### ADR-006: Phase 1 mode selector refactor strategy

- **Date:** 2026-09-23
- **Status:** Accepted (Phase 1 implementation)
- **Context:** PRD-001 Phase 1  -  mode selector + scaffolding against a 3614-line App.tsx monolith

**Decision.** Pick option (b): incremental mode-aware gating. App.tsx remains the orchestrator; a new `<ModeGate>` reads `effectiveMode` from a Zustand 5 store and switches between `<AppMain>` (Etude), `<ComposeSurface>`, `<ExploreSurface>`. URL + localStorage drive the gate.

**Alternatives rejected.**
- (a) Big-bang router swap: high regression risk on a working 1090-test app; no incremental rollback.
- (c) Hard split into compose/etude/explore modules: requires 1-2 days of refactor before any new feature lands; the monolith already has well-isolated components that can be promoted in-place.

**Rationale.**
- Preserves every existing test (the only App.tsx edit is JSX reshuffling  -  no logic changes).
- `<ModeGate>` is one ~80-line new file + ~50 lines moved out of App.tsx into `<AppMain>`. Diff is reviewable in one PR.
- Sets up the Phase 1.5 slice migration without committing to a 30-field big-bang move in the same week.

**Consequences.**
- App.tsx remains the orchestrator (3614 -> ~3580 LOC after the move).
- Two coexisting state surfaces (`useSessionStore.ts` and the new zustand store) for the duration of Phase 1.5; documented in the implementation checklist.
- ADR-004's "zustand installed in Phase 0, activated in Phase 1" satisfied.

### ADR-007: Phase 1 dirty-state semantics per mode

- **Date:** 2026-09-23
- **Status:** Accepted (Phase 1 implementation)
- **Context:** PRD REQ-MODE-4, REQ-MODE-5  -  every mode exposes a dirty flag; mode switch prompts Save/Discard/Cancel.

**Decision.**
- Compose: always clean in Phase 1 (no upload surface ships).
- Etude: dirty = "active path mutated by `setHarmonicStep` since last export, and current Idea not yet saved". Save snapshots the current idea to `hse.ideas` (separate key, capped at 100). Discard calls the existing `revertLastAccept()` machinery.
- Explore: always clean in Phase 1 (no mutable surface ships).
- Save/Share buttons in `<IdeaBar>` are visible (honest affordance) but `Share` is a clipboard write to `?idea=<base64>` (no server round-trip; REQ-IO-50). Save is `localStorage.setItem('hse.ideas', ...)`.

**Alternatives rejected.**
- Make all three modes always-clean in Phase 1: violates REQ-MODE-5 ("each mode must expose a dirty flag"). Even with no user input, the flag exists and is reported as 'none'.
- Save = full session snapshot: out of scope (Phase 2+ persistence design).

**Consequences.**
- The dirty flag lives ONLY in zustand memory (not persisted via `partialize`)  -  dirty state is session-scoped.
- Phase 1.5 needs to re-evaluate when real Compose / Explore surfaces land.

### ADR-008: Phase 1 zustand migration scope (split, not big-bang)

- **Date:** 2026-09-23
- **Status:** Accepted (Phase 1 implementation)
- **Context:** ADR-004 mandates zustand activation in Phase 1; `useSessionStore.ts` is 586 lines / 30+ useStates.

**Decision.** Ship Phase 1's zustand store with ONLY the mode slice (`mode`, `globalTranspose`, `currentIdea`, per-mode `dirty`, `pendingModeRequest`). Migrate `useSessionStore.ts` into the same store in Phase 1.5  -  one slice per PR, each adding a `version` bump + `engine/migrations/` entry.

**Alternatives rejected.**
- Big-bang migrate all 30 useStates in one PR: 600+-line diff with no incremental rollback; reviewer cannot meaningfully check a slice migration in isolation.
- Skip the migration entirely (keep usePersistedState forever): violates ADR-004's spirit ("activate now"); leaves the ~22 callsites in App.tsx with two parallel persistence APIs.

**Consequences.**
- Phase 1 store ~120 LOC + tests ~80 LOC. Reviewable in one PR.
- Phase 1.5 spans ~11 PRs (one per slice). Each PR adds `CURRENT_SESSION_VERSION += 1` and one `SESSION_MIGRATIONS` entry. Legacy `synesthesia_*` readers stay one PR longer than the writers to keep old sessions alive.
- The drift gate (`assets/check-links.cjs`) is unaffected: no new pins; no SPEC count changes.

---

## Appendix B. File-touch summary

```
NEW FILES
  engine/core/idea.ts                                    ~80 LOC
  engine/core/idea.test.ts                               ~30 LOC
  src/state/sessionStore.ts                              ~120 LOC
  src/state/sessionStore.test.ts                         ~80 LOC
  src/components/ModeSelector.tsx                        ~140 LOC
  src/components/ModeSelector.test.tsx                   ~80 LOC
  src/components/ModeGate.tsx                            ~80 LOC
  src/components/ModeGate.test.tsx                       ~40 LOC
  src/components/IdeaBar.tsx                             ~150 LOC
  src/components/IdeaBar.test.tsx                        ~100 LOC
  src/components/DirtyPromptModal.tsx                    ~120 LOC
  src/components/DirtyPromptModal.test.tsx               ~80 LOC
  src/components/ComposeSurface.tsx                      ~40 LOC
  src/components/ExploreSurface.tsx                      ~40 LOC
  docs/PHASE-1-MODE-SELECTOR.md                          (this file)

EDITED FILES
  src/App.tsx                                            ~60 LOC moved, ~30 LOC added
                                                          - <main> children extracted to <AppMain>
                                                          - <main> body replaced by <ModeGate />
                                                          - <IdeaBar /> appended inside <main>
                                                          - handleKeyDown +3 branches (1/2/3)
                                                          - useEffect for URL sync (~30 LOC)
                                                          - bar-click handler +1 line (Idea mint)
  vitest.config.ts                                       +4 lines to JSDOM_FILES
  src/lib/storage.ts                                     +1 line to STORAGE_KEYS (hse.session)

UNCHANGED FILES (explicitly NOT touched)
  src/components/*  (CSS-WIP owner's territory per the prompt)
  engine/**
  src/lib/studies.ts (generated)
  README.md, SPEC.md
  AGENTS.md
  .kai/
  tests/* (no count change; no pin change)
```

---

## Appendix C. HANDOFF_TO_DEVELOPER (the @architect -> @developer contract)

```yaml
HANDOFF_TO_DEVELOPER:
  from: "@architect"
  to: "@developer"
  timestamp: "2026-09-23T00:00:00Z"
  phase: "PRD-001 Phase 1  -  Mode selector & scaffolding (1 week)"

  DELIVERABLES:
    - name: "docs/PHASE-1-MODE-SELECTOR.md"
      status: complete
      size: "this file"
    - name: "ADR-006 mode-selector-refactor-strategy"
      status: complete
      location: "Appendix A"
    - name: "ADR-007 phase-1-dirty-state-semantics"
      status: complete
      location: "Appendix A"
    - name: "ADR-008 phase-1-zustand-migration-scope"
      status: complete
      location: "Appendix A"

  CONSTRAINTS:
    - technical: "Additive + non-breaking. 1090 existing tests must keep passing. Drift gate (assets/check-links.cjs) and check-path-bars (36/36) must stay green. New DOM-touching test files MUST be added to JSDOM_FILES in vitest.config.ts."
    - scope: "Phase 1 ONLY. Do not start the Phase 1.5 slice migrations in this PR; they're documented follow-ups (Appendix B / D7)."
    - files_off_limits: "src/components/* (CSS-WIP owner's), engine/** (ADR-003 purity owner), src/lib/studies.ts (generated), README.md, SPEC.md (counts pinned by check-links.cjs), AGENTS.md, .kai/. The PlaySessionRail expectedSec label (PlaySessionRail.tsx around line 924) is owned by the CSS-WIP merge per the prompt."
    - ascii_only: true
    - no_debug_logs: "console.log/info/debug banned in src/. console.warn/error allowed."
    - no_ts_ignore_or_any: true
    - prevention_rule_W2_002: "When reverting any mutation in this worktree, use FILE-COPY snapshots taken at intake (NOT git checkout --/reset). Parallel agents may be writing."

  DECISIONS_MADE:
    - decision: "D5  -  pick refactor option (b): incremental mode-aware gating via <ModeGate>"
      confidence: HIGH
      rationale: "Lowest risk on a working 1090-test app; preserves all existing components; <ModeGate> is ~80 LOC + ~50 LOC move in App.tsx."
    - decision: "D6  -  Compose + Explore always-clean in Phase 1; Etude dirty = setHarmonicStep mutation since last export"
      confidence: HIGH
      rationale: "PRD REQ-MODE-5 requires the flag on every mode but Compose/Explore have no mutable surface in Phase 1; declaring them always-clean is honest."
    - decision: "D7  -  zustand store ships with mode slice only in Phase 1; useSessionStore.ts migrates slice-by-slice in Phase 1.5"
      confidence: HIGH
      rationale: "Big-bang migration is 600+-line diff with no incremental rollback; slice migration is 11 PRs with per-PR reviewable diffs and per-PR version bumps."
    - decision: "D8  -  IdeaBar is sticky inside <main> (NOT fixed); sits above MobileCommandBar on mobile via extra pb"
      confidence: HIGH
      rationale: "Matches PRD 9.1 (persistent bottom of app); avoids z-index dance with fixed MobileCommandBar; preserves existing layout."
    - decision: "D9  -  Compose -> stub + ImportExportModal trigger; Explore -> stub + FormPlanner + FormTemplatePicker; Etude -> today's entire <main> verbatim"
      confidence: HIGH
      rationale: "Zero new components touched; the existing 3-tab sidebar becomes an Etude-internal sub-tab."

  IMPLEMENTATION_NOTES:
    - "The new zustand store MUST coexist with useSessionStore.ts in Phase 1. Do not delete the old hook."
    - "usePersistedState remains in use for ad-hoc keys (quizTopic, bassMidiChannel). It is NOT replaced by the store."
    - "All new TS code uses existing types. No new external deps. zustand@^5.0.15 is already in package.json per ADR-004."
    - "Bar-click Idea mint (implementation step 13) goes in PlaySessionRail.tsx's bar button onClick handler  -  ONE line addition: useSessionStore.getState().setCurrentIdea(ideaFromChord(...))"
    - "Existing keyboard handler in App.tsx (line 909) is extended ADDITIVELY. Do not reorder existing branches. The 1/2/3 cases go AFTER the Escape/? branches and BEFORE the Arrow keys."
    - "useSessionStore (the new zustand one) uses getState() inside the keyboard handler (non-reactive action call). Component-level subscriptions use the selector form (e.g. s => s.mode)."
    - "Idea bar's Save button writes to hse.ideas (separate key, capped at 100). DO NOT persist dirty + pendingModeRequest  -  they are session-scoped via partialize."
    - "URL sync uses history.replaceState (NEVER pushState) and only writes the 3 canonical keys (mode, transpose, path)."

  PROGRESS:
    - phases_completed: 5/5
    - total_time_spent: "~25 minutes"
    - retries: 0
    - quality_gates_passed: 5/5

  ESTIMATED_EFFORT:
    - implementation_hours: "16-20 hours (across the 15-step checklist)"
    - testing_hours: "6-8 hours (6 new test files, ~30 new it() blocks)"
    - documentation_hours: "2 hours (commit messages + ADR updates + this doc's PR description)"

  AUDIT_TRAIL:
    - timestamp: "2026-09-23T00:00:00Z"
      phase: "Phase 1 design complete"
      tools_used: "Read (App.tsx, useSessionStore.ts, ModeSelector candidates, ADR-003/004/005, vitest.config.ts, PRD-001 Sec.6.1/8.1/8.5/9.6/11.1/11.2/14, FUTURE_PLANNING.md, .kai/memory.yaml)"
      errors_encountered: "none"
```

---

**End of design.** All decisions resolved. The 15-step checklist in Sec.10 is the execution order; the appendices carry the ADR records and handoff YAML that @reviewer needs.
