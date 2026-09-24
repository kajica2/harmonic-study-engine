# Modes (PRD-001 Phases 1-5)

The Harmonic Study Engine ships in three modes -- Compose, Etude, and
Explore -- plus a sticky-bottom Idea bar that carries a single
musical Idea between them. The mode selector sits at the top of the
app and is always one click away. Every mode's primary output is
packageable as an `Idea`, so a chord you discover in Etude can become
the seed of a Compose upload or an Explore preset. Phase 1 wires the
shell: the selector, the per-mode dirty prompt, and the Idea bar.
Compose's upload + editable analysis card shipped in Phase 4 slice 2
(`docs/COMPOSE-MODE.md`); accompaniment generation (slice 3) and
mixer + export + chart paste + session URL (slice 4) followed, and
Explore's operations + idea cards + Hear + crossover shipped in
Phase 5 (`docs/EXPLORE-MODE.md`). Phase 2 adds the
transposition layer on the Etude surface -- two offset rows, a
sounding-key badge, and a cycle-all-12 practice loop (see
Transposition below).

Requirements traced here come from PRD-001 sections 6.1 (mode
selector chrome), 8.1 (REQ-MODE-1..7, REQ-IDEA-1..4, REQ-TRANS-1..7),
9.1 (top-level chrome), 9.6 (empty states), 9.7 (keyboard
shortcuts), 9.8 (accessibility), and 11.2 (URL serialization). The
full design rationale lives in `docs/PHASE-1-MODE-SELECTOR.md` and
`docs/PHASE-2-TRANSPOSITION.md`; this doc is the user-facing tour.

## What "modes" mean

A mode is a workspace, not a feature. Each mode owns one primary
output kind -- a MIDI file (Compose), a generated etude (Etude), an
exploratory idea (Explore) -- and the rest of the app bends around
that output. Switching modes keeps the audio engine and the global
transpose live; what changes is the main panel and the toolbar. The
app launches in Etude today (the same surface as before the mode
selector existed); Compose became a real workspace in Phase 4 slice
2 (`docs/COMPOSE-MODE.md`), and Explore became one in Phase 5
(`docs/EXPLORE-MODE.md`).

## The three modes

### Compose

The MIDI-file workspace -- and since Phase 4 slice 2 (2026-09-23) it
is a real surface, not a stub. Drop in (or browse to) a `.mid` file
and the app analyzes key, tempo, meter, melody, and a per-bar chord
chart, all editable with confidence tiers that tell you exactly how
much the app trusts each answer. Your edits survive reloads (the
file itself does not -- it never leaves the tab, and nothing that
big goes into storage). Full user guide:
**`docs/COMPOSE-MODE.md`**. Accompaniment generation (slice 3) and
mixer + MIDI/WAV export + chart paste + session URL (slice 4) have
all shipped since; the Phase 1
empty-state copy ("Drop a .mid file to get started.", the
import/export CTA, the privacy aside) survives verbatim as the
upload state.

The Composer surface lives at `src/components/ComposeSurface.tsx`.

### Etude

The generated-etude workspace. Phase 1 keeps the entire existing
app body -- curated paths, practice loop, voicing picker, masterclass
catalog, MIDI / MusicXML export -- unchanged. The mode selector just
sits at the top, so the user has an exit door to Compose or Explore.
A bar click in the PlaySessionRail mints an Idea into the Idea bar;
the Idea bar's `Send to...` dropdown wires Etude as the universal
landing target.

Phase 3 slice 2 adds the **Etude Composer** to this surface: a
constraint panel below the practice rail (style / key / tonal mode /
difficulty / bars / tempo / seed) that generates deterministic
etudes, loads them into the practice session, and syncs them to
shareable `?style=...&seed=...` URLs, with piano roll + abcjs staff
views. User guide: `docs/ETUDE-COMPOSER.md`.

Phase 6 adds the **Ear training** drills to this surface: a
section below the composer with 7 seeded hearing drills
(intervals, chord quality, inversions, progressions, scales, and
melodic + harmonic dictation) over difficulty 1-5, graded by
pitch class (Cb counts for B) with accuracy + streaks and no XP,
plus a per-concept SM-2 memory that resurfaces what is due.
Full user guide: **`docs/EAR-TRAINING.md`**.

The concept drawer is reachable from every mode: the header
search box opens any of the 10 concepts, each drawer plays a
generated example in C and sends its numerals to Explore, and
right-clicking a Compose chord cell opens the linked concept
(drawer tour in `docs/EAR-TRAINING.md`, "The drawer" section).

### Explore

The exploratory what-if workspace -- and since Phase 5 (2026-09-24)
it is a real surface, not a stub. Type any seed (a chord, a
progression, a scale, an interval, or free text; three preset chips
from the fixed list of 12 beside the input) and run honest harmonic
operations over it: reharmonize a progression, substitute or expand
a chord, voice-lead the same changes five ways, or vary a melody
line. Every result is an idea card -- label, technique chip naming
what was actually computed, rationale with concept-drawer links
(drawer footer tour: `docs/EAR-TRAINING.md`),
and a Hear audition -- with Send to Compose (lands as editable
chart text), Send to Etude (carries key + bar count under the
honest "Practice in this key" title, never literal chords), and
Save. There is deliberately no Modulate button (deferred,
TD-EXP-MOD). Full user guide: **`docs/EXPLORE-MODE.md`**. The
read-only form planners still render below the cards grid.

The Explorer surface lives at `src/components/ExploreSurface.tsx`.

## Transposition (PRD-001 Phase 2)

Two offset layers combine into the sounding shift. The Etude
StageFrame meta region carries both control rows
(`src/components/TransposeControls.tsx`) plus the sounding-key
badge; the practice rail keeps its own global-only control.

| Layer | Clamp | Controls | Notes |
|---|---|---|---|
| Global | +/-24 st | `-12 -1 0 +1 +12` row + `[` / `]` keys | persisted (`hse.session`) + URL-synced (`?transpose=`) |
| Etude (per-exercise) | +/-12 st | `-12 -1 0 +1 +12` row + `Cycle 12` toggle + `+N st` readout | Etude surface only |

Sounding shift = global + exercise. The sum is intentionally
unclamped (+/-36 is the reachable span). It is applied at
playback / display / export time only -- never baked into path
data (REQ-TRANS-7). Generate, persona switch, and import reset
the exercise offset to 0 and disengage the cycle; the row's `0`
chip zeroes it manually.

### Sounding-key badge

`src/components/EffectiveKeyBadge.tsx` announces what you actually
hear: `role="status"` + `aria-live="polite"`, so every keyboard
nudge is announced to assistive tech (PRD 9.8). Three content
forms (spelling in the pure `engine/core/spelling.ts`; ASCII only
-- no flat/sharp glyphs; ties go flat; the author's accidental
wins when it still names the target pitch class):

| Form | Example | When |
|---|---|---|
| Keyed | `Sounding: Gb major` | the path declares a `key` (curated / concept paths) |
| Drift | `Sounding: Eb minor -> Db major` | progressive-tonality key ("D minor -> C major"); each endpoint shifts independently |
| Pitch-only | `Sounding: +3 st` | no key can be claimed -- the studies paths carry no `key` field; a shared-root first/last-chord heuristic (plain maj/min triads or 7ths) may still claim one |

### Cycle all 12 keys

The `Cycle 12` toggle (Etude row) advances the exercise offset
+1 semitone (mod 12) at each FORM PASS. The boundary comes from
`detectFormPeriod()` (`src/lib/formPeriod.ts`), so a 32-bar form
padded to 96 bars advances 3 times per full loop (the 95 -> 0
wrap counts). The cycle is suppressed while a sub-range section
loop is active -- the loop window can wrap the form boundary at
arbitrary offsets. Turning the cycle off keeps the current
offset. The advance decision is pure in `src/lib/keyCycle.ts`
and never marks the session dirty (it is a view transform, not a
composition edit).

The metronome click settings (volume / sound / subdivision /
accents) and the count-in pre-roll live in the practice header's
Click-settings popover -- they ride this same transport on every
path, etudes included: `docs/PRACTICE-MECHANICS.md`.

### Keyboard map (changed in Phase 2 -- muscle memory!)

`[` / `]` used to be tempo -5 / +5. They now transpose the GLOBAL
offset (PRD 9.7):

| Keys | Action |
|---|---|
| `[` / `]` | Global transpose -1 / +1 semitone |
| `Shift+[` / `Shift+]` | Global transpose -12 / +12 (octave) |
| `,` / `.` | Tempo -5 / +5 BPM (the old bracket job) |

Matching is by physical key, so `Shift+[` (which arrives as `{`)
works; Cmd/Ctrl/Alt combos stay with the browser, and every
shortcut is inactive while a text field is focused. The existing
+/-7 chips (fourth / fifth) are unchanged.

Design authority: `docs/PHASE-2-TRANSPOSITION.md`.

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
| **Send to Compose** | Chord/progression Ideas transplant literally to the chart grid via the chart-text path (other kinds warn honestly and still navigate -- the landing surface boots from the carried Idea, never a dead end). |
| **Send to Etude** | Routes the Idea into the Etude surface as carried constraints (key/mode/bars/seed via `setEtudeConstraints`, NOT an accept -- no dirty; the user presses Generate). |
| **Send to Explore** | Switches to Explore; the current Idea is already the carrier (Explore boots its seed text from it). |
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
version:    CURRENT_SESSION_VERSION = 4
partialize: { mode, globalTranspose, exerciseTranspose,
              keyCycleActive, currentIdea, etudeConstraints,
              composeSession }
```

The store is the *single* source of truth for Phase 1 mode state
and the Phase 2 transpose slice; the legacy `useSessionStore.ts`
hook's `transposeShift` is now a read-through / write-through
bridge to `globalTranspose`. The rest of the legacy hook migrates
slice-by-slice in Phase 1.5 (ADR-004). `dirty` and
`pendingModeRequest` are explicitly *not* persisted -- they are
session-scoped Edit state, not cross-reload state. v1 payloads are
upgraded to v2 (transpose-slice defaults), v2 to v3 (Phase 3 slice
2's `etudeConstraints`, seeded to `null`), and v3 to v4 (Phase 4
slice 2's `composeSession`, seeded to `null` - the small persisted
record behind the Compose re-upload prompt; the parsed project
itself is in-memory only) by the migration runner in
`engine/migrations/index.ts`.

`src/lib/storage.ts` registers the two new keys:

| Key | Storage | Shape |
|---|---|---|
| `K.session` (`hse.session`) | zustand persist JSON | mode + transpose slice + etude constraints + compose session: `mode`, `globalTranspose`, `exerciseTranspose`, `keyCycleActive`, `currentIdea`, `etudeConstraints`, `composeSession` |
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

- Design rationale: `docs/PHASE-1-MODE-SELECTOR.md`,
  `docs/PHASE-2-TRANSPOSITION.md`
- PRD source of truth: `docs/PRD-001.md` (sections 6.1, 8.1, 9.6,
  9.7, 11.2)
- Engine data type: `engine/core/idea.ts`
- Engine key spelling (Phase 2): `engine/core/spelling.ts`
- Store: `src/state/sessionStore.ts`
- Components: `src/components/ModeSelector.tsx`,
  `src/components/ModeGate.tsx`, `src/components/IdeaBar.tsx`,
  `src/components/DirtyPromptModal.tsx`,
  `src/components/ComposeSurface.tsx`,
  `src/components/ExploreSurface.tsx`,
  `src/components/TransposeControls.tsx`,
  `src/components/EffectiveKeyBadge.tsx`
- Cycle-advance decision (Phase 2): `src/lib/keyCycle.ts`
- Storage registry: `src/lib/storage.ts` (`K.session`, `K.ideas`)