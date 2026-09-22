# Modes (PRD-001 Phase 1)

The Harmonic Study Engine ships in three modes -- Compose, Etude, and
Explore -- plus a sticky-bottom Idea bar that carries a single
musical Idea between them. The mode selector sits at the top of the
app and is always one click away. Every mode's primary output is
packageable as an `Idea`, so a chord you discover in Etude can become
the seed of a Compose upload or an Explore preset. Phase 1 wires the
shell: the selector, the per-mode dirty prompt, and the Idea bar.
The deep feature surface for Compose (analysis card, accompaniment
generation, export) and Explore (reharmonize / substitute / expand)
arrives in Phases 4 and 5.

Requirements traced here come from PRD-001 sections 6.1 (mode
selector chrome), 8.1 (REQ-MODE-1..7, REQ-IDEA-1..4), 9.1 (top-level
chrome), 9.6 (empty states), 9.7 (keyboard shortcuts), 9.8
(accessibility), and 11.2 (URL serialization). The full design
rationale lives in `docs/PHASE-1-MODE-SELECTOR.md`; this doc is the
user-facing tour.

## What "modes" mean

A mode is a workspace, not a feature. Each mode owns one primary
output kind -- a MIDI file (Compose), a generated etude (Etude), an
exploratory idea (Explore) -- and the rest of the app bends around
that output. Switching modes keeps the audio engine and the global
transpose live; what changes is the main panel and the toolbar. The
app launches in Etude today (the same surface as before the mode
selector existed), and switching to Compose or Explore reveals an
empty-state stub for that mode.

## The three modes

### Compose

The MIDI-file workspace. Drop in a `.mid` file and the app analyzes
key, melody, and chord chart; Phase 4 wires the editable analysis
card and the style-driven accompaniment generator. **Phase 1 ships**
the empty state only: a faded `SynesthesiaCanvas` thumbnail (the same
component Etude uses, drawn at 30% opacity), the drop-zone copy
"Drop a .mid file to get started.", an "Open import / export" CTA
that opens the existing import modal, and a privacy `<aside>`
saying "All processing happens in your browser. Your MIDI file never
leaves this tab." (REQ-IO-70). No MIDI parser, no analysis card, no
accompaniment yet.

The Composer surface lives at `src/components/ComposeSurface.tsx`.

### Etude

The generated-etude workspace. Phase 1 keeps the entire existing
app body -- curated paths, practice loop, voicing picker, masterclass
catalog, MIDI / MusicXML export -- unchanged. The mode selector just
sits at the top, so the user has an exit door to Compose or Explore.
A bar click in the PlaySessionRail mints an Idea into the Idea bar;
the Idea bar's `Send to...` dropdown wires Etude as the universal
landing target.

### Explore

The exploratory workspace. **Phase 1 ships** the empty state only:
three random preset chips drawn from a fixed list of 12 (e.g.
"Cmaj7", "ii-V-I in C", "D dorian", "C blues", "Phrygian in E"),
plus the existing `<FormTemplatePicker>` + `<FormPlanner>` rendered
read-only. No reharmonize / substitute / expand operations yet -- a
small footer note points to Phase 5. The chip selection is purely
visual today: clicking a chip highlights it but does not commit a
plan. Each new entry into Explore mode re-draws the chips so the
user sees different options every time.

The Explorer surface lives at `src/components/ExploreSurface.tsx`.

## The mode selector

`src/components/ModeSelector.tsx` renders the persistent
`role="tablist"` segmented control in `<header>`, between the title
and the device controls. Three segments, each with a numeric `kbd`
chip on the label so the shortcut is visible:

| Segment | Label | Shortcut |
|---|---|---|
| Compose | `1` | `1` |
| Etude   | `2` | `2` |
| Explore | `3` | `3` |

The active segment has the brand-muted background and brand-strong
text; inactive segments are surface-1 with neutral-300 text. The
control is keyboard-navigable: `ArrowLeft` / `ArrowRight` move focus
between segments (no wrap -- the document-level `1`/`2`/`3` handler
is the cross-mode shortcut). Each segment is a `<button role="tab">`
with `aria-selected`, `aria-controls`, and roving `tabIndex`
(WAI-ARIA tablist pattern, PRD 9.8).

On mobile the selector collapses to a 36x36 icon row (three
squares, digits only, no labels).

## Switching modes

Three entry points, one action:

1. **Click** a segment in the mode selector.
2. **Press** `1`, `2`, or `3` anywhere in the app (additive to the
   existing keyboard handler in App.tsx; the `isTyping` guard inside
   inputs / textareas preserves prior behaviour).
3. **Land** on a URL with `?mode=compose|etude|explore` (canonical
   at boot; see below).

All three routes funnel through `useSessionStore.requestMode(next)`,
which consults the per-mode dirty flag and either commits
immediately or parks the request onto `pendingModeRequest` for the
dirty prompt (see next section). The three entry points are
equivalent; the keyboard shortcut fires even when focus is on the
canvas or a modal-trigger button.

### URL persistence

The URL `?mode=` query parameter is canonical at boot. Resolution
order (from `resolveEffectiveMode` in
`src/state/sessionStore.ts`):

```
URL ?mode=   ->  persisted hse.session.mode  ->  legacy "etude"
```

On store change a debounced (200 ms) subscription writes
`?mode=&transpose=` back via `history.replaceState` -- no `pushState`,
so the back stack is never polluted by ephemeral tweaks. Unknown
URL params are preserved. The full URL examples from PRD 11.2:

```
/?mode=etude&transpose=2
/?mode=compose
/?mode=explore
/?idea=<base64 idea JSON>
```

## The dirty prompt

`src/components/DirtyPromptModal.tsx` opens when you try to switch
modes while the current mode has unsaved work (REQ-MODE-4,
REQ-MODE-5). Phase 1 carries a real dirty flag for Etude only --
Compose and Explore always read `dirty === "none"` because no
editable surface ships in Phase 1. The dialog asks:

> **Unsaved changes in Etude**
> You have unsaved work. Save it before switching to <target>, or
> discard the changes?
> [Cancel]  [Discard changes]  [Save and switch]

| Choice | Effect |
|---|---|
| **Save and switch** | `saveCurrentIdea()` persists the current Idea to `hse.ideas` (capped at 100 entries per REQ-IDEA-4), clears `dirty.etude`, then commits the pending mode. |
| **Discard changes** | `discardCurrent()` dispatches a `hse:revert-last-accept` window event that App.tsx forwards to the legacy revert machinery, clears the current Idea, clears `dirty.etude`, then commits the pending mode. |
| **Cancel** | Clears `pendingModeRequest`; you stay on the current mode. |

`dirty` and `pendingModeRequest` are session-scoped and explicitly
excluded from `partialize` -- a reload never opens the prompt.

The modal is built on the existing `<ModalShell>`, so focus trap,
Escape (treats Escape as Cancel), backdrop click, and ARIA plumbing
are handled by the shared primitive. It mounts once at the top of
the tree and renders nothing when `pendingModeRequest` is null.

## The Idea bar

`src/components/IdeaBar.tsx` sits sticky at the bottom of `<main>`
(z-10), above the existing `MobileCommandBar` on mobile. It always
shows; empty or populated, the bar is part of the chrome.

### What an Idea is

`engine/core/idea.ts` defines the `Idea` discriminated union
(REQ-IDEA-1). Exactly one payload slot is populated per `kind`:

| `kind` | Populated slot | Example |
|---|---|---|
| `chord` | `chord: string` | `"Cmaj7"` |
| `progression` | `progression: readonly string[]` | `["Cmaj7", "Am7", "Dm7", "G7"]` |
| `scale` | `scale: string` | `"C dorian"` |
| `melody` | `melody: readonly number[]` (MIDI 0-127) | `[60, 64, 67, 72]` |
| `seed` | `seed: number` | `12345` |

Other fields: `source` (`"compose" | "etude" | "explore"`),
`tags` (optional, capped at 8), `createdAt` (epoch ms, UI display
only), and the ADR-005 brand-typed identity pair: `id` is a
deterministic `CanonicalId` derived from the payload so two
materials of the same Idea collapse to the same canonical id;
`instanceId` is a per-materialization `InstanceId` from
`makeInstanceId(nowMs, seq)`. The engine is pure -- `nowMs` flows in
from the caller; nothing in `engine/core/idea.ts` reads the clock.

The `isIdea(raw)` type guard validates shape at trust boundaries
(URL share link, `hse.ideas` reload).

### Empty state

```
Play something or generate an etude to start an idea.   [ + ]
```

The `+` button is a placeholder in Phase 1 -- the icon is visible
but disabled, with `aria-label="Create idea from current chord"` and
a dimmed background. Phase 1.5 wires the bar-click handler in
PlaySessionRail to materialize an Idea via
`ideaFromChord("etude", transposeChordName(step.name, transposeShift), Date.now())`.

### Populated state

The left side becomes a chip: chord symbol (large mono), source
pill (`from etude` / `from compose` / `from explore`), and a clear
`x` button (`aria-label="Clear current idea"`). The chip has a brass
left-edge accent (brand-strong) when an Idea is present.

### Actions

The right side has a `Send to...` native `<select>`, a `Save`
button, and a `Share` button. All three are disabled when no Idea
is present.

| Action | Effect |
|---|---|
| **Send to Compose** | Disabled placeholder today; emits `console.warn("[IdeaBar] Send-to-Compose: Phase 4 wires the upload surface")`. Phase 4 wires the actual handoff. |
| **Send to Etude** | Routes the Idea into the Etude surface (Etude is the default mode and accepts chord Ideas directly today). |
| **Send to Explore** | Disabled placeholder today; emits `console.warn("[IdeaBar] Send-to-Explore: Phase 5 wires idea cards")`. Phase 5 wires the landing surface. |
| **Save** | Persists the current Idea to `hse.ideas` (capped at 100 entries); emits `console.warn("[IdeaBar] Save: snapshot stored at hse.ideas")`. Saved ideas are accessible from any mode. |
| **Share** | Base64-encodes the Idea as JSON and copies `<origin>/<path>?idea=<base64>` to the clipboard via `navigator.clipboard.writeText` (falls back to a status pill when the API is unavailable or blocked). Server-less per REQ-IO-50. Emits `console.warn("[IdeaBar] Share: not yet implemented -- Phase 8")`. |

The share URL is a fully self-contained snapshot: opening
`?idea=<base64>` in a new tab seeds the Idea into the store via
`useSessionStore.setCurrentIdea(...)` (URL sync runs once on App
mount).

## Storage

`src/state/sessionStore.ts` is a new zustand 5 store with the
`persist` middleware:

```
key:        hse.session
version:    CURRENT_SESSION_VERSION = 1
partialize: { mode, globalTranspose, currentIdea }
```

The store is the *single* source of truth for Phase 1 mode state;
the existing `useSessionStore.ts` (paths, tempo, transpose, voicing,
...) migrates slice-by-slice in Phase 1.5 (ADR-004). `dirty` and
`pendingModeRequest` are explicitly *not* persisted -- they are
session-scoped Edit state, not cross-reload state.

`src/lib/storage.ts` registers the two new keys:

| Key | Storage | Shape |
|---|---|---|
| `K.session` (`hse.session`) | zustand persist JSON | mode slice: `mode`, `globalTranspose`, `currentIdea` |
| `K.ideas` (`hse.ideas`) | hand-managed JSON | `Idea[]`, capped at 100 entries (REQ-IDEA-4) |

Both keys are added to `STORAGE_KEYS` with their shape metadata so
the schema-version gate in `ensureStorageSchemaVersion()` covers
them on boot.

## Accessibility

- The mode selector is a WAI-ARIA `tablist` with roving tabindex,
  `aria-selected`, and `aria-controls`; focus moves on
  `ArrowLeft` / `ArrowRight`.
- The Idea bar's `Send to...` `<select>` carries
  `aria-label="Send idea to mode"`. Disabled options
  (Compose / Explore in Phase 1) get a `title` hint explaining when
  they'll land.
- The dirty prompt uses `<ModalShell>`: focus trap, ARIA labelling,
  Escape (Cancel), backdrop click (Cancel), body-scroll lock, focus
  restoration.
- Share status updates render inside `role="status"` /
  `aria-live="polite"`.

## Where to look

- Design rationale: `docs/PHASE-1-MODE-SELECTOR.md`
- PRD source of truth: `docs/PRD-001.md` (sections 6.1, 8.1, 9.6,
  9.7, 11.2)
- Engine data type: `engine/core/idea.ts`
- Store: `src/state/sessionStore.ts`
- Components: `src/components/ModeSelector.tsx`,
  `src/components/ModeGate.tsx`, `src/components/IdeaBar.tsx`,
  `src/components/DirtyPromptModal.tsx`,
  `src/components/ComposeSurface.tsx`,
  `src/components/ExploreSurface.tsx`
- Storage registry: `src/lib/storage.ts` (`K.session`, `K.ideas`)