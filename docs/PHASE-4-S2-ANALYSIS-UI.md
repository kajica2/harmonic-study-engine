# PRD-001 Phase 4 Slice 2 Design: Upload UI + Analysis Review

Status: APPROVED DESIGN (from @architect research packet, 2026-09-23). Implementation
authority for @developer. Parent: `docs/PHASE-4-COMPOSE.md` (D45..D56 + ERRATA +
FIX ROUND - read ALL THREE alongside this doc; the fix-round S2 constraint
"blend declared-key + functional evidence before auto-accept" is requirement
H1/H2 below and is the make-or-break UX honesty item).

Scope: PRD sec 8.2 upload + review surface (REQ-COMP-1, 5, 6, 20..24, 50..53),
REQ-PED-4 Compose portion + PED-5 click-through (closes the last open Phase-4-P0
annotation item), REQ-IO-70/71 (verify + extend), D48 compose session state
(zustand v3 -> v4). NO audio, NO accompaniment (S3), NO transport/export (S4).

Baseline (re-verified this round at HEAD d435a0d, `npm test` run fresh):
1627 passed / 1 skipped / 2 failed (the 2 = pre-existing CSS-WIP
FormPlanner.test.tsx + FormTemplatePicker.test.tsx - do NOT fix). `tests/`
it( = 362 FROZEN. check:paths 36/36. count pins 40/12 untouched. Engine purity
floor MIN_SCANNED_FILES = 29 (tree scans 30). Dirty-11 confirmed via
`git status`: ChordInspector, CoComposePanel, FormPlanner, FormTemplatePicker,
InspectPanel, LiveScoreDisplay, MelodyToolbar, PathCatalog, PracticeSessionPlayer,
PracticeSetBrowser, StylePackPicker. Slice 1 shipped f92a0c4; kai record d435a0d.

Standing rules for every new/edited file: ASCII only; no `console.*` except
warn/error (none needed here); no `any`, no `@ts-ignore`; relative imports;
`tests/`, `src/lib/studies.ts`, README/SPEC counts, AGENTS.md, `.kai/` OFF-LIMITS;
PHASE-2-01 live-gate + PHASE-3-03 StrictMode one-shot apply to every new effect;
FILE-COPY snapshots, never `git checkout --` (PHASE-2-02); new
`src/components/**/*.test.tsx` auto-register via the vitest JSDOM_FILES glob
(verified: the glob is in the list); src/lib tests are node-project; TD-040
guardrail: zero etude mode-UI changes.

---

## 1. Re-audit (anchors verified at HEAD d435a0d; cite search strings, not line numbers)

| Anchor | Location | Verified content |
|---|---|---|
| ComposeSurface stub | src/components/ComposeSurface.tsx (69 lines, CLEAN, NOT in dirty-11) | Props `{ onOpenImportExport, className }` only - no store subscription today. Structure: section[role=region, aria-label "Compose mode (empty state)"] > relative card > SynesthesiaProvider + Suspense(SynesthesiaCanvas 800x400) at opacity-30 aria-hidden (anti-pop-in on mode switch, header comment) > h2 "Drop a .mid file to get started." + stub body copy + button "Open import / export" -> `onOpenImportExport` + `<aside aria-label="Privacy statement">` shipping the REQ-IO-70 copy ("never leaves this tab"). STAYS: section shell, canvas backdrop, pinned heading, privacy aside, import/export button. GOES: "Phase 1 stub" body copy only. |
| ModeGate pins | src/components/ModeGate.test.tsx (311 lines) | `/Drop a .mid file/i` asserted 13x (8 positive when compose, 5 negative other modes) AND **an additional hard pin the task packet did not name: line ~86 `screen.getByText(/Open import \/ export/).click(); expect(opened).toBe(1)`** - the import/export button MUST survive in the empty state. Tests use the REAL store (setMode via getState) with `localStorage.clear()` + `resetModeSlice()` in beforeEach - never upload a project, so the loaded-state branch is unreachable there: the S2 surface renders the empty state (heading + button + aside) whenever `composeProject === null`, and ALL pins survive untouched. |
| ModeGate wiring | src/components/ModeGate.tsx (98 lines, CLEAN) | `if (mode === "compose") return <ComposeSurface onOpenImportExport={...} />`. App.tsx passes the prop; ModeGate itself needs ZERO changes in S2 (the surface reads the store directly). |
| readMidiFile seam | src/lib/composeMidi.ts (109 lines, CLEAN) | `readMidiFile(file: ReadableMidiFile): Promise<Outcome<NormalizedProject>>` - `ReadableMidiFile = { name, size, arrayBuffer() }` is STRUCTURAL (the header comment says "tests pass a plain stub - no casting"), so the surface can read the buffer ONCE and hand `readMidiFile` a caching wrapper + hash the same buffer (no double disk read on 30MB files). Arms: tooLarge (pre-parse, 30MB), parseFailed (read error / not MIDI), internal (normalize throw guard). `sha256Hex(buf): Promise<string | null>` F9-guarded (null in jsdom/insecure ctx). NEVER throws. |
| analyzeProject | engine/compose/index.ts (159 lines) | `analyzeProject(project, opts?: { window?, slotsPerBar? }): Outcome<ComposeAnalysis>` - never throws (internal arm). `inferenceKey()`: declared key wins for chord inference (correlation forced 1); else candidates[0]. Annotations built: key (suppressed on chromaticFallback - the fixed 0%-false-fire rule), ii-V-I (`conceptId: "ii-v-i"`, target progression{fromBar,toBar}), melody provenance. Public re-export surface at bottom (types, normalize, tempo, roles, key, melody, harmony incl. `reinferBar`). |
| Types consumed verbatim | engine/compose/types.ts (337 lines) | `Outcome` + `AnalysisErrorCode` (5 arms), `NormalizedProject` (fileName, durationSec, warnings, tracks[].usesPitchBend, tempos[0].bpm, timeSignatures[0]), `ComposeAnalysis` (roles/key/melody/grid/window/truncated/percussionOnly/annotations), `AnalysisOverrides` (sparse: key/tempoBpm/timeSignature/melodyTrackIndex/chordCells "bar:slot"/roles), `EMPTY_OVERRIDES` (frozen), `restCell()`, `confidenceTier(c)` boundaries (>0.80 auto / >=0.50 highlight / >=0.30 radio / else manual), `mergeAnalysis` (pure; key override -> candidates[0]; role override -> confidence 1; melody override records the index, notes NOT re-extracted; tempoBpm/timeSignature NOT merged - S4 consumes them). |
| mergeGrid LIMITATION (new finding) | engine/compose/types.ts, `mergeGrid` | `region.slots.map(...)` - a patch keyed "bar:slot" where slot >= that bar's slots.length is SILENTLY DROPPED. The REQ-COMP-23 "split bar in two" flow (write both "bar:0" and "bar:1" after reinferBar(slots:2)) is therefore UNSATISFIABLE through the shipped merge. One justified engine behavior fix: mergeGrid APPENDS out-of-range slot patches (sorted by slot index). See D60. |
| reinferBar | engine/compose/harmony.ts, search `export function reinferBar` | `(project, grid, bar, key: KeyCandidate, slots: 1 | 2): readonly ChordCell[]` - prev-bar last-chosen context threaded (carry-over), regionSlots reuses bar's real startTick/endTick. Consumed verbatim by the popover split button on the MERGED grid + MERGED key candidate. |
| defaultWindow | engine/compose/tempo.ts, search `secondsToTicks(project, 240)` | 4-minute window in ticks via the tempo map; `truncated = endTick > window.toTick` set by analyzeProject. `barBoundaries(project, upToTick)` meter-change aware. REQ-COMP-53 "analyze full file" = re-run `analyzeProject(project, { window: { fromTick: 0, toTick: project.endTick } })` - pure, p95 ~70-150ms measured (S1 harness), main-thread legal. |
| Key detection | engine/compose/key.ts (164 lines) | `detectKey` returns candidates top-3 (r desc), `declared = keySignatures[0] ?? null` (SEPARATE, never blended into r), `chromaticFallback` = (r < 0.50) OR (< 5 distinct windowed pcs) OR (< 16 windowed notes) - the FIXED arms (0/24 false-fire on diatonic). NO blend exists yet - the fix-round HONESTITY REQUIREMENT (KS 18.3% top-1 on adversarial jazz) is NOT implemented anywhere in the shipped engine: `confidenceTier(candidates[0].correlation)` alone would happily auto-accept a 0.85 false-fire. The blend is S2's core new logic (D58). |
| Melody re-extraction | engine/compose/melody.ts + roles.ts (index exports) | `extractMelody(project, roles, window)` - picks the highest-confidence "melody" role track, else synthesizes top line. A melody-track override can drive REAL re-extraction: build patched roles (`{ trackIndex: chosen, role: "melody", confidence: 1 }`, all others non-melody) and call extractMelody - pure + cheap. mergeAnalysis only records the index (its header says "note RE-extraction needs the project and is S2's job"). |
| Session store v3 | src/state/sessionStore.ts (341 lines, CLEAN) | `CURRENT_SESSION_VERSION = 3` (MIRRORED in engine/migrations/index.ts), persist key `hse.session` (K.session), partialize keeps mode/globalTranspose/exerciseTranspose/keyCycleActive/currentIdea/etudeConstraints. `DirtyMap.compose` typed literal "none" (ADR-007) - stays untouched (F8). `resetModeSlice` resets the mode slice only - compose gets its OWN `clearCompose()`; do NOT widen resetModeSlice (sessionStore.test.ts pins its shape; ModeGate tests never set compose state). |
| Migrations chain | engine/migrations/index.ts (83 lines, CLEAN) | SESSION_MIGRATIONS = [v1->v2, v2->v3], copy-on-write `up`, tolerate empty payloads, `validateMigrationChain` requires contiguity. v3->v4 appends `composeSession: null` in the SAME pattern; bump CURRENT_SESSION_VERSION to 4 in BOTH files in lockstep (the persist envelope version mirrors it). |
| Global keydown | src/App.tsx, search `const handleKeyDown` (~line 1107) | `isTyping` guard: input/textarea/select/contentEditable -> early return (native field behavior intact). Bound: Escape (modal ladder then playback stop), ? cheatsheet, 1/2/3 modes (modifier-yield guard `isModeShortcutModifierKey`), [ ] transpose (e.code), arrows, Space (etude auto play - fires in compose too, PRE-EXISTING stub behavior, S4 routes it), M, , . tempo. **Cmd/Ctrl+Z is NOT bound anywhere** (search `metaKey` -> only comment hits; tempo undo is a BUTTON via `tempoHistory` in the legacy hook, App ~3540). No collision for a surface-local undo listener. Handler deps `[path.steps.length, paths.length]` = stale-closure-prone monolith: S2 makes ZERO App.tsx edits. |
| useHistory | src/lib/useHistory.ts (101 lines, CLEAN) | Component-scoped push/undo/redo (cap 32, dedupe). Header references `useHistoryRef` - DOES NOT EXIST (grep: only the comment). NOT used for S2: ComposeSurface unmounts on mode switch (ModeGate conditional render) -> component-scoped history would be LOST while overrides survive, violating the D48/F8 "nothing is lost on switch" promise. Undo stacks live in the store (D59). |
| EtudePianoRoll | src/components/EtudePianoRoll.tsx (241 lines, CLEAN) | Props `{ etude: Etude, transposeShift, activeBar }` - STEP-native (SLOTS_PER_BAR = 8, `EtudeNote.slot`, syncopation flags, canonicalId aria). Compose notes are TICK-native (`NormalizedNote.tick/durationTicks`, arbitrary ppq). Reuse would mean fabricating a fake `Etude` object = adapter lie + coupling to phase-3 invariants. VERDICT: new read-only `ComposePianoRoll.tsx`; import ONLY `ROLL_PALETTE` (exported Okabe-Ito constants - single source of truth, zero etude-UI change, TD-040 safe). |
| ConceptDrawer | src/components/ConceptDrawer.tsx (191 lines, CLEAN) | Props `{ conceptId, onClose }`; host pattern (EtudeViews, D37/D38): local `drawerConceptId` state + `key={conceptId}` remount + chip buttons for `conceptId !== null`, static text for null. Compose annotations reuse this verbatim (targets use EXISTING pedagogy kinds - `scale`, `progression{fromBar,toBar}`, `melody`; zero type changes). `getConcept("ii-v-i")` exists (concepts.ts). |
| Chord-symbol validation | src/lib/ireal.ts, search `export function parseChordToMidi` | Returns `number[] | null` (MIDI notes) with its OWN lossy quality grammar ("m7b5", "maj7"...) - CANNOT round-trip to `(rootPc, qualitySymbol)` in the ENGINE grammar (QUALITY_INTERVALS keys: maj/min/dim/dim7/halfdim/maj7/m7/dom7/alt/sus4/maj6/min6/majadd9/minadd9/maj9/dom9/min9 - 17, errata D8). PARENT-SKETCH CORRECTION: parseChordToMidi is NOT usable as the popover validator (it accepts symbols the ChordCell cannot express, e.g. "C13", and returns pitches, not a cell). New pure helper `src/lib/chordInput.ts` (D61). |
| Privacy REQ-IO-70/71 | ComposeSurface aside (search "Privacy statement") + PRD lines 646/647 | REQ-IO-70 aside ALREADY SHIPS ("never leaves this tab") - preserved verbatim in the empty state. REQ-IO-71 (never upload without opt-in): S2 adds ZERO network calls (no fetch/XHR/WebSocket in any new file - greppable pin). Extension: compact privacy line in the loaded state (D64). |
| Error arms -> UI | types.ts `AnalysisErrorCode` + normalize warnings | normalize pushes UI-safe ASCII warnings (assumed 120 BPM, assumed 4/4, dropped out-of-range notes, unrecognized key sig ignored, format-0 re-grouping, MAX_NOTES 200k -> tooLarge). `percussionOnly` + `chromaticFallback` + `truncated` ride the ok-arm. Every string maps to a banner (D62 table) - no UI ever sees an exception. |
| e2e convention | e2e/ (app.spec.ts, count-in.spec.ts, etude-composer.spec.ts) + playwright.config.ts | Serves built dist/ on :4173 (`npm run build` REQUIRED first); specs run in NODE - `@tonejs/midi` is importable there (etude-composer already imports src/lib/paths.ts at spec level, precedent for spec-side source imports). NO fixture directory exists in public/ (only rnn bundle files). |
| FUTURE_PLANNING C1/C2 | FUTURE_PLANNING.md, search "premise corrected" | BOTH rows ALREADY FIXED in the slice-1 commit (verified: "SHIPPED (parse, engine)" row + "Tone.Offline does not exist" row). The parent doc's S2 checklist item "correct C1/C2" is DONE - S2 only verifies, does not edit. |
| Test infra | vitest.config.ts JSDOM_FILES + tests/setup.ts | `src/components/**/*.test.tsx` glob registered (new component tests need NO config edit). localStorage polyfilled; crypto.subtle ABSENT in jsdom -> sha256Hex returns null in tests (F9 path IS the tested path there). `src/state/sessionStore.test.ts` already jsdom-registered - extend in place. |

---

## 2. Decisions (D57..D65, continuing the parent numbering)

### D57 (D48-LANDING): zustand v4 ships in S2 with the minimal honest persisted payload; project + undo live in-memory in the SAME store.

Decision: bump `CURRENT_SESSION_VERSION` 3 -> 4 in BOTH files (sessionStore.ts +
engine/migrations/index.ts) with `sessionV3ToV4` appending `composeSession: null`
(copy-on-write, same pattern as v2->v3, chain stays contiguous).

```ts
/** PERSISTED (partialize keeps this) - small by construction: */
interface ComposeSession {
  fileName: string;
  fileHash: string | null;            // F9: null = "hash unavailable"
  overrides: AnalysisOverrides;       // sparse; chord cells + key/tempo/meter/melody
  analyzeFull: boolean;               // REQ-COMP-53 window choice
}
/** IN-MEMORY ONLY (same store, excluded by partialize): */
composeProject: NormalizedProject | null;   // up to 30MB - NEVER localStorage
composeAnalysis: ComposeAnalysis | null;    // pure function of (project, analyzeFull)
composeUndo: AnalysisOverrides[];           // cap 32, snapshot-per-edit
composeRedo: AnalysisOverrides[];
```

Actions (all pure setters; the only computation is `setComposeAnalyzeFull`
re-running `analyzeProject` - deterministic, no clock/rng, legal in-store):

```ts
setComposeFile(project, analysis, meta: { fileName; fileHash })
  // resets overrides -> EMPTY_OVERRIDES, both stacks, analyzeFull -> false
patchComposeOverrides(next)   // pushes PREVIOUS onto undo (cap 32, shift-oldest), clears redo
undoCompose() / redoCompose() // swap whole-map snapshots
setComposeAnalyzeFull(b)      // recompute composeAnalysis = analyzeProject(project, {window: b ? full : default})
clearCompose()                // full reset (the "start over" button)
```

Size strategy (the 30MB question): the project is NOT persisted, period. A
reload with `composeSession` present but `composeProject === null` renders the
re-upload prompt (D62). Overrides are tiny (sparse map of spelled cells);
fileHash makes the re-upload matchable (REQ-IO-51 semantics for free).
`request`/`mixer` (D48's S3/S4 fields) are DELIBERATELY NOT in the v4 payload -
adding fields to the persisted object later needs no migration (missing fields
default at read: `session.request ?? null`), so S3 widens the type without a v5.
One envelope bump, one time.

Rejected: component-local state (mode-switch unmount loses everything - breaks
F8/D48); legacy localStorage registry (wrong object, D32 precedent); persisting
the project (quota + 5x JSON bloat); deferring the migration to S3 (S2 is the
first slice where a user can HAVE session state worth keeping).
Confidence: HIGH.

### D58 (THE HONESTY ITEM): key confidence = declared x functional x KS blend; KS correlation ALONE can never auto-accept.

Decision: new PURE function in the EXISTING `engine/compose/key.ts` (edit, not a
new file - zero purity-floor change; the blend is music-theoretic judgment, it
belongs in the engine, not in UI glue):

```ts
export type KeyAgreement = "agree" | "conflict" | "declared-only" | "inferred-only" | "none";
export type ConflictKind = "relative" | "parallel" | "other" | null;
export interface KeyBlend {
  readonly agreement: KeyAgreement;
  readonly conflictKind: ConflictKind;
  readonly selected: KeyCandidate;        // what the card shows as current
  readonly blended: number;               // 0..1 - feeds confidenceTier
  readonly functional: number;            // 0..1 (exposed for the tooltip honesty)
  readonly reason: string;                // ASCII, UI-safe one-liner
}
export function blendKeyEvidence(a: ComposeAnalysis): KeyBlend;
export const KEY_BLEND_WEIGHTS = { ... } as const;   // named + test-pinned
```

Inputs: `ks = clamp01(candidates[0].correlation)` (negative r -> 0);
`declared = key.declared`; `fallback = key.chromaticFallback`; functional
evidence over the analysis's OWN grid:

- `diatonicMass` = fraction of non-rest cells whose rootPc is in
  scale(selected candidate); `0` when fewer than 4 cells (too little to judge).
- `cadence` = 1 if an ii-V-I annotation exists OR a direct V->I adjacency
  (cell quality dom7/alt rooted tonic+7 immediately followed by a cell rooted
  tonic with quality maj/maj7/m7); 0.5 if a tonic+7 dominant exists with no
  resolution; else 0.
- `functional = clamp01(0.7 * diatonicMass + 0.3 * cadence)`.

Agreement (declared vs candidates[0]):

| state | condition | conflictKind |
|---|---|---|
| agree | declared && !fallback && same(declared, top) | null |
| conflict | declared && !fallback && !same | relative (top == relative of declared: mode flips, tonic pc differs by +9 or +3 mod 12) / parallel (same tonic, mode differs) / other |
| declared-only | declared && fallback | null |
| inferred-only | !declared && !fallback | null |
| none | !declared && fallback | null |

Blend formula (the auto-accept gate; tier = `confidenceTier(blended)`,
boundaries strict `> 0.80` per shipped `confidenceTier`):

| state | blended | consequence |
|---|---|---|
| agree | `0.60 + 0.25*ks + 0.15*functional` (range .60..1.00) | auto ONLY when ks+functional carry it: (.70,.60)->.865 auto; (.50,.50)->.80 highlight (boundary) |
| inferred-only | `ks * (0.55 + 0.45*functional)` | the jazz guard: ks .83 / functional .25 -> .55 highlight; ks .90 / functional .0 -> .495 radio. Auto needs ks .80+ AND functional .55+ |
| declared-only | `0.65` fixed | highlight + "from the file's key signature" badge - never auto (fallback means non-tonal material), never manual (there IS a real value) |
| conflict | `0.60` fixed | highlight + the CONFLICT banner (below) - never auto |
| none | `0` | manual entry (REQ-COMP-52 forces the manual chart) |

`selected`: agree/inferred-only -> candidates[0]; declared-only/conflict ->
declared as a KeyCandidate (composers' intent is the default, the shipped
key.ts header rule); none -> candidates[0] as a placeholder behind the manual
input.

UI honesty rules, as hard requirements:

- **H1**: the key field NEVER renders in the auto tier unless
  `agreement === "agree" || agreement === "inferred-only"`. A pure-KS r of 0.95
  with weak functional reading MUST NOT auto-accept (this is the 18.3%
  adversarial-jazz guard from the fix round).
- **H2**: `conflict` ALWAYS shows the banner regardless of tier: "The file
  declares X; the notes suggest Y (Z relation)." with a 2-way radio (declared /
  inferred) + "Other..." -> manual input, default selection = declared. The
  banner is the honesty UX - a silent pick of either value is a spec violation.
- Tier visuals (shared with cells, D63): auto = plain text + "detected"
  tooltip; highlight = amber ring + "confirm" tooltip; radio = inline candidate
  picker; manual = input. Blend tooltips expose the components
  ("correlation r=0.62, functional fit 81%, cadence: V-I in bars 4-5").

Rejected: putting the blend in src (it is analysis truth, reused by S3/S4
tooltips; engine is its home); a new engine file (floor bump for zero gain);
blending INTO `KeyResult.candidates[].correlation` (would poison the raw
evidence the banner must display separately); learned calibration (no training
data; RK-S2-2 tracks a corpus follow-up).
Confidence: HIGH (structure), MEDIUM (constants - property tests pin the
RELATIONS H1/H2/monotonicity, not the exact numbers, so tuning stays safe).

### D59: undo = store-resident snapshot stacks + a surface-local Cmd+Z listener; zero App.tsx edits.

Decision: `composeUndo`/`composeRedo` (in-memory, cap 32, whole-map snapshots -
the overrides object is sparse and tiny; snapshotting the FULL map per commit
is the simplest correct model and "undo restores previous chord values"
(REQ-COMP-24) is exactly what a map snapshot does). `patchComposeOverrides`
pushes the previous map; every committed edit is ONE entry: cell apply, cell
delete, bar split (both cells + any meter-change clear ride the same push),
key/tempo/meter/melody commit. Text inputs commit on Enter/blur (not per
keystroke - the hook's dedupe would still spam history otherwise).

Keyboard: ComposeSurface registers its OWN `keydown` listener (effect with
cleanup, StrictMode-safe) for `z` with meta||ctrl (Shift -> redo). Guards:
(a) replicate App's `isTyping` check VERBATIM (input/textarea/select/
contentEditable -> return; native field undo untouched, and Cmd+Z inside the
popover's autocomplete input never double-fires); (b) only active while a
compose project is loaded. The global handler has NO z binding (verified) -
zero collision. 1/2/3 mode keys stay global and work in compose (guarded by
isTyping inside fields); Escape closes the popover via the popover's own
handler before any global effect matters (the global Escape no-ops in compose
- no compose transport exists yet).

Rejected: `useHistory` (component-scoped; lost on mode-switch unmount while
overrides survive - two sources of truth + broken F8 promise); editing the
App.tsx monolith handler (stale-closure-prone deps `[path.steps.length,
paths.length]`, 4340 lines, zero need).
Confidence: HIGH.

### D60: the ONE engine behavior fix - mergeGrid appends out-of-range slot patches.

Decision: `engine/compose/types.ts` `mergeGrid`: when a patch key "bar:slot"
targets slot >= region.slots.length, APPEND (growing the bar to 2 cells;
multiple out-of-range slots land in ascending index order, gaps filled with
`restCell()`). `ChordGrid.slotsPerBar` stays the NOMINAL default (renderers
already read `region.slots.length` per bar; S3's assemble iterates per-bar
slots - variable-length bars are already representable in the shipped data
model, `inferChords` just never produced them). `types.test.ts` gains the pin:
split flow = `reinferBar(..., 2)` -> write "b:0"+"b:1" -> merged bar b has 2
cells; out-of-range patch on an unsplit bar appends; in-range behavior
byte-identical (existing pins untouched).

Justification under the "engine only if a pure helper genuinely belongs"
constraint: this is merge SEMANTICS (pure, engine-domain, unsatisfiable from
UI without forking mergeAnalysis - which would fork the truth). It is the ONLY
engine behavior change in S2; D58 is additive-only in an existing file. No new
engine files -> purity floor stays 29.
Confidence: HIGH.

### D61: chord-cell popover = new component + new pure symbol parser; parseChordToMidi is NOT the validator (parent-sketch correction).

Decision: `src/lib/chordInput.ts` (pure, node-tested):

```ts
interface ParsedSymbol { rootPc: number; qualitySymbol: string; bassPc: number | null }
parseChordSymbol(raw: string): ParsedSymbol | null
  // grammar: ^([A-G][b#]?)\s*(\S*)(?:/([A-G][b#]?))?$ ; suffix reverse-mapped
  // from NAME_SUFFIX (longest-suffix match, case-folded aliases: "M7"->maj7,
  // "-"->min, "m7b5"->halfdim, "o"->dim / "o7"->dim7; the slashed-circle glyph
  // alias is OPTIONAL and must be written as a \u00f8 unicode ESCAPE - source
  // files stay ASCII; ""->maj, "m"->min). REJECTS anything not expressible as
  // a ChordCell (e.g. "C13", "C7#9") - the popover must not accept what the
  // grid cannot hold.
buildCellFromSymbol(p: ParsedSymbol, key: KeyCandidate): ChordCell
  // name = spellChordName(rootPc, quality, key.tonicPc, key.mode) (+ "/"+bass
  // when bassPc != root and in template); confidence 1; alternatives []; isRest false
suggestChordSymbols(query, key, limit = 8): readonly string[]
  // spelled roots (key-family aware via the D11 rules inside spellChordName) x
  // 17 qualities, prefix-filtered; PLUS the cell's top-3 alternatives FIRST
  // (engine-provided candidates) PLUS recent symbols (last 8 edits, in-memory
  // module state in the SURFACE, passed in as an argument - chordInput stays pure)
```

`src/components/ChordCellPopover.tsx`: NOT a modal (ModalShell's focus trap +
scroll lock is wrong for inline grid editing). Absolutely-positioned card
inside the cell wrapper: text input (role=combobox + listbox suggestions,
arrow keys + Enter), the cell's 3 alternatives as buttons ("common options",
REQ-COMP-23), Delete (-> `null` override -> rest), Split bar in two (->
`reinferBar(project, mergedGrid, bar, mergedKey, 2)` -> write both cells in
ONE patchComposeOverrides = ONE undo entry). Close: Escape (own onKeyDown),
pointerdown-outside, or apply. Focus returns to the cell button on close.
jsdom covers the drag/drop + popover paths; Playwright covers the file-input
path (D65).

Popover writes go through the SAME patch action (undo-unified). Cell tier
rendering (REQ-COMP-22 per cell): auto = plain; highlight = amber ring; radio
= the cell button shows its top alternative inline as a second chip; manual
(conf 0.30 floor / rest / percussion-only) = dashed empty cell, click opens
the popover with the input focused.
Confidence: HIGH.

### D62: edge-case UX mapping - every shipped signal lands on exactly one surface.

| Signal (source) | Surface state | UI |
|---|---|---|
| tooLarge (readMidiFile) | empty state | red banner "File is larger than the 30 MB limit" + pinned heading untouched |
| parseFailed / unsupported / internal | empty state | banner with the error's message (never a stack) |
| noNotes (REQ-COMP-50) | empty state | banner "No notes found in this file." |
| !ok arms | empty state | drop zone stays; nothing enters the store |
| percussionOnly true (REQ-COMP-51) | loaded | banner "This file has only percussion - enter chords manually."; grid all-rest (manual tier); key tier = none/manual |
| chromaticFallback (REQ-COMP-52) | loaded | banner "No clear key detected - enter the key and chords manually."; key field manual input; cells keep their own tiers |
| truncated (REQ-COMP-53) | loaded | banner "Showing the first 4:00 of 6:23." + [Analyze full file] -> setComposeAnalyzeFull(true); loaded state persists the choice (analyzeFull); re-analysis keeps overrides (bar keys are prefix-stable from tick 0; key re-spell note in the banner copy) |
| usesPitchBend on any track (REQ-COMP-6) | loaded | warning banner "N track(s) use pitch bends - analyzed at 12-TET (notated) pitches." |
| project.warnings[] (normalize) | loaded | collapsible "Parse notes (k)" list under the card header - every string is already UI-safe ASCII |
| key conflict / declared-only / fallback | loaded, key field | D58 banner/badge/tier |
| composeSession present, project null (reload) | PROMPT state | "Re-upload <fileName>" card (heading survives - it IS the drop zone) + hash display: match -> restore overrides + analyze; MISMATCH -> "This file does not match your saved session" + [Use anyway -> clearCompose + fresh] [Cancel]; hash null (F9) -> overrides DROPPED with an inline notice "previous edits could not be verified" (honest, never silently mis-applied) |
| drop while loaded | loaded | replaces the session (stacks reset); undo does NOT cross files - documented, flagged RK-S2-5 |

### D63: analysis card layout + state flow (merged truth only).

```
ComposeSurface (reads store; owns the async pipeline + busy/error)
  empty state      : UploadDropZone + heading(pin) + browse + import/export btn(pin) + aside(pin)
  prompt state     : re-upload card (D62)
  loaded state     : AnalysisCard
                       header: fileName | duration mm:ss (durationSec) | tempo* | meter* | key (D58) | melody track
                       chord chart: per-bar rows, per-slot cells (tier-styled, popover editor)
                       annotations: chips under the chart (EtudeViews pattern: conceptId -> button
                                    -> local drawerConceptId -> <ConceptDrawer key=.../>; null -> static)
                                    + progression chips highlight their bar range in the chart
                       ComposePianoRoll (melody-only static SVG, D64)
                       privacy line + [Start over] (clearCompose)
  * tempo override: recorded, consumed by S4 (tooltip "affects playback and export")
    meter override: RE-RUNS analysis on a patched project copy
    ({...project, timeSignatures: [{tick:0, num, den}]}) and CLEARS chord-cell
    overrides (bar alignment changes make them unsafe) - the clear is ONE
    patchComposeOverrides push, so undo restores both the cells and the meter.
    Tempo override: NO re-run (tick grid is tempo-independent).
    Melody-track override: patched roles -> extractMelody(project, patchedRoles,
    window) -> roll re-renders from real notes (the override is not just a label).
```

State flow: `file -> arrayBuffer (once, cached) -> readMidiFile(stub) ->
sha256Hex(same buf) -> analyzeProject -> setComposeFile` - all awaited inside
one `handleFile` (busy flag + aria-busy; parse+analyze p95 ~70-150ms, main
thread legal per D54; the FILE READ is async by contract). Render truth is
ALWAYS `merged = mergeAnalysis(analysis, overrides)` + `blendKeyEvidence(analysis)`
- components never read raw analysis fields for display, never mutate, one
write path (patchComposeOverrides). No new engine recompute in render
(merged/blend memoized with useMemo on [analysis, overrides]).

### D64: piano-roll preview = new read-only tick-native component; ROLL_PALETTE import only.

`src/components/ComposePianoRoll.tsx`, props
`{ project, melody: MelodyResult, window: AnalysisWindow, truncated: boolean }`.
Static SVG (EtudePianoRoll precedent: tiny data, never animates, jsdom-assertable):
x = `(tick / ppq) * PX_PER_QUARTER` (ticks-linear, NOT seconds - barlines stay
evenly spaced across tempo maps; the analysis grid is tick-based, so the roll
aligns with the chord chart); y = semitone rows over the note range padded 1
(60..72 fallback when empty); rects per note, fill-opacity
`0.35 + 0.65 * velocity` (decorative, never sole-carrying); barlines via
`barBoundaries`, labels every 4 bars; window edge drawn when truncated +
caption "first 4:00 shown". TD-041 HONESTY CAPTION when `melody.synthesized`:
"Synthesized top line - silences are absorbed into note tails (known
limitation)." Exported pure `rollSummary(notes, ppq): string` for the
role=img aria (count, range, span). REQ-IO-70 extension: the loaded state
carries the compact privacy line "Analyzed locally in your browser - this file
never leaves this tab." (REQ-IO-71: S2 adds ZERO network calls - greppable).
Rejected: reusing EtudePianoRoll (fake-Etude adapter lies about slots/ppq and
couples phase-3 invariants); canvas (no rAF work).
Confidence: HIGH.

### D65: e2e = in-spec-generated MIDI bytes via setInputFiles; NO committed binary.

Playwright specs run in NODE where `@tonejs/midi` is importable (precedent:
etude-composer.spec.ts imports src sources at spec level). The spec builds an
8-bar C-major block-chord + melody song (ppq 480, 120 BPM, 4/4, NO key-signature
meta - the encoder keySig byte is broken per errata D6, and its absence
exercises the inferred-only blend path), `writer.toArray()` -> Buffer ->
`setInputFiles({ name, mimeType, buffer })` on the hidden input. Zero binary
in the repo, deterministic, self-documenting. Drag-and-drop itself is covered
by jsdom unit tests (fireEvent.drop with a DataTransfer) - the spec pins the
PIPELINE, not the mouse. Discriminative legs:
upload -> card shows fileName + "C" key + >= 8 cells -> override key via the
manual input -> reload -> RE-UPLOAD PROMPT names the file (D57 persistence,
the ONLY way to prove partialize residency in a browser) -> re-setInputFiles ->
overrides restored -> edit one cell via the popover -> Cmd+Z restores the
previous cell value (REQ-COMP-24 in a real browser).
Confidence: HIGH.

---

## 3. Keyboard collision table (compose loaded state)

| Key | Global handler (App) | S2 surface | Verdict |
|---|---|---|---|
| Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z | UNBOUND (verified) | undo/redo (local listener, isTyping guard) | no collision |
| 1/2/3 | mode switch | still global (fields guard it) | keep |
| [ ] , . | transpose/tempo (etude state) | harmless no-ops for compose; fields guard | keep (S4 revisits) |
| Space | toggles ETUDE auto playback (pre-existing in compose since the stub) | NOT S2's to fix (no compose transport yet) | pre-existing wart, flagged, S4 routes |
| Escape | modal ladder -> playback stop | popover closes via own onKeyDown first; global no-ops | no collision |
| z/Z bare | unbound | NOT bound (only with meta/ctrl) | safe |
| Tab/arrows inside popover | global arrows move etude step index | popover input focused -> isTyping guards global; own listbox arrows stopPropagation | spec'd |

---

## 4. Exact file plan + dirty-collision check

NEW (src/components): `UploadDropZone.tsx`, `AnalysisCard.tsx`,
`ChordCellPopover.tsx`, `ComposePianoRoll.tsx` (+ 4 `.test.tsx`, auto-registered
via the existing glob).
NEW (src/lib): `chordInput.ts` + `chordInput.test.ts` (node project).
NEW (e2e): `compose-upload.spec.ts`.
EDITED: `ComposeSurface.tsx` (stub -> real surface; all three pinned strings
kept), `src/state/sessionStore.ts` (v4 + ComposeSlice), `engine/migrations/index.ts`
(v3->v4 step), `engine/compose/key.ts` (blendKeyEvidence - additive),
`engine/compose/types.ts` (mergeGrid append - D60), `engine/compose/key.test.ts`
(+ blend properties), `engine/compose/types.test.ts` (+ append pins),
`src/state/sessionStore.test.ts` (+ v4 migration/partialize/undo-stack pins),
`CHANGELOG.md`.
NOT touched: App.tsx (zero edits), ModeGate.tsx/.test.tsx (zero edits),
audio.ts, backingEngine, rhythmEngine, playbackClock, transport, theory.ts
(FROZEN), paths.ts, ImportExportModal.tsx (DIRTY-adjacent verdict: CLEAN but
NOT edited - S2 needs NOTHING from it: no .mid support exists there, compose
must never enter paths/activePathIndex, and the pinned button just re-triggers
the existing modal; nothing forces a collision), the dirty-11 (NONE collide -
ChordInspector stays etude-only, the popover is a new component), tests/**
(it( stays 362), studies.ts, README/SPEC, AGENTS.md, .kai/, vitest.config.ts,
package.json (zero new deps), FUTURE_PLANNING.md (C1/C2 already fixed),
EtudePianoRoll.tsx (import-from only).
Purity floor: UNCHANGED at 29 (zero new engine files; two existing-file edits).

---

## 5. Test plan (expected +75..100 passing; baseline 1627/1/2 -> 1627+N/1/2)

1. `key.test.ts` (extend): agreement-state matrix (5 states x relative/parallel/
   other); blend boundary table (auto requires agree-or-inferred + mass; the
   jazz-guard case ks .83/f .25 -> NOT auto); H1/H2 as universal properties
   over hand-built analyses; monotonicity in ks and functional; reason strings
   ASCII + non-empty.
2. `types.test.ts` (extend): mergeGrid append (split flow end-to-end at the
   merge level; gap fill = rest; in-range byte-identical regression; purity
   pins still pass on frozen inputs).
3. `chordInput.test.ts` (node): grammar accepts all 17 NAME_SUFFIX spellings +
   aliases + slash bass; REJECTS "C13", "C7#9", "H", "", "C sus4" (space);
   buildCellFromSymbol spells via key family (Eb minor -> flats); suggest
   ordering (alternatives first, prefix filter, limit).
4. `UploadDropZone.test.tsx`: dragenter counter (no flicker state), drop with
   File (name + type), wrong-extension rejection, busy disables input,
   keyboard-accessible browse button.
5. `ComposeSurface.test.tsx`: THE PIN DUPLICATION (deliberate): empty state
   renders heading + "Open import / export" click + privacy aside (if copy
   drifts, ModeGate AND this fail loudly); error-banner mapping per arm
   (stubbed File -> real readMidiFile path with tiny byte fixtures for
   parseFailed/noNotes; oversized stub for tooLarge); percussionOnly +
   chromaticFallback + truncated banners; re-upload prompt (session set,
   project null); hash-match restore vs hash-null drop-with-notice; analyze-
   full toggle recomputes; loaded-state privacy line; zero fetch calls.
6. `AnalysisCard.test.tsx`: merged truth rendering (override -> card flips);
   tier styling per confidenceTier; key blend UI states incl. the conflict
   banner radio default = declared; melody override re-extracts (roll notes
   change); meter override re-runs + clears cells in ONE undo entry; tempo
   tooltip; annotation chips -> ConceptDrawer open/close (key-prop pattern).
7. `ChordCellPopover.test.tsx`: open/apply/delete/split; autocomplete keyboard
   (arrows/Enter/Escape); outside-close; focus return; split writes 2 cells +
   reinferBar called with merged grid + prev-bar context (spy on engine? NO -
   assert OUTPUT cells match 2-slot shape); rejected symbols show inline error.
8. `ComposePianoRoll.test.tsx`: rect count = note count; tick->x mapping pins
   (ppq 480: quarter = PX_PER_QUARTER px); window truncation caption + edge;
   TD-041 caption only when synthesized; rollSummary; empty fallback.
9. `sessionStore.test.ts` (extend): v3->v4 appends composeSession null
   (and preserves v3 fields); chain contiguous (validateMigrationChain already
   covers); partialize EXCLUDES project/analysis/stacks; patch pushes undo
   (cap 32 shift) + clears redo; undo/redo swap; setComposeFile resets;
   setComposeAnalyzeFull recomputes (node-pure, no DOM audio).
10. undo keyboard: in ComposeSurface.test.tsx - dispatchEvent keydown z+meta
    with/without input focus (isTyping guard), shift variant -> redo.
11. `e2e/compose-upload.spec.ts`: D65 legs (needs `npm run build` first).
12. Gates: lint -> test -> build x2 -> check:paths 36/36 -> check-links 362
    (no README/SPEC count cites change) -> manual: `npm run test:e2e`.

---

## 6. Ordered checklist (commit-sized steps)

1. [ ] Store v4: sessionV3ToV4 + version bump BOTH files + ComposeSlice
   (project/analysis/session/undo/redo + 5 actions) + partialize + sessionStore
   test extension. Gate: `npx vitest run src/state engine/migrations`.
   Commit: `feat(compose): session store v4 - compose slice (D57)`.
2. [ ] Engine: mergeGrid append (types.ts + pins); blendKeyEvidence (key.ts +
   property tests). Gate: `npx vitest run engine`. Commit:
   `feat(engine): mergeGrid slot append + declared/functional key blend (D58/D60)`.
3. [ ] chordInput.ts + node tests. Commit with 4 if batched.
4. [ ] UploadDropZone + ComposeSurface rewrite (three states; pinned copy
   preserved) + tests. Gate: vitest run src/components/ComposeSurface src/components/ModeGate.
   Commit: `feat(compose): upload surface - drop zone, error banners, re-upload prompt (REQ-COMP-1, 50..53)`.
5. [ ] AnalysisCard + tier rendering + blend UI (H1/H2 banners) + annotation
   chips + ConceptDrawer wiring + tests. Commit:
   `feat(compose): analysis card - editable everything, confidence tiers + key blend, annotations (REQ-COMP-20..22, PED-4/5)`.
6. [ ] ChordCellPopover (autocomplete/delete/split) + undo keyboard wiring +
   tests. Commit: `feat(compose): chord-cell popover + store-resident undo (REQ-COMP-23/24)`.
7. [ ] ComposePianoRoll + TD-041 caption + tests. Commit:
   `feat(compose): tick-native melody preview (REQ-COMP-5 P1 carve)`.
8. [ ] e2e spec + full gate run (lint, test, build x2, check:paths, check-links,
   test:e2e). Commit: `test(e2e): compose upload -> override -> reload -> undo`.
9. [ ] CHANGELOG entry; verify FUTURE_PLANNING rows still true (no edit).

## 7. Risks

| Risk | P | I | Mitigation |
|---|---|---|---|
| RK-S2-1: blend constants mis-tuned (over/under-trusting) | M | M | Properties H1/H2/monotonicity pinned, not exact numbers; KEY_BLEND_WEIGHTS exported for tuning; RK2 corpus follow-up stays open (PRD 85% target remains honest-open) |
| RK-S2-2: mergeGrid append breaks a shipped pin | L | M | In-range regression pin (existing types.test.ts must pass UNCHANGED); S3 note in this doc |
| RK-S2-3: ModeGate copy drift | M | L | Heading + button + aside kept verbatim; duplicated pin test in ComposeSurface.test.tsx fails loudly at the source |
| RK-S2-4: popover a11y gaps (focus trap absent by design) | M | L | Focus return pinned by test; listbox semantics; ModalShell deliberately NOT used (wrong tool); audit pass in fix round |
| RK-S2-5: accidental file replace (drop while loaded) | M | L | Documented; [Start over] exists; undo does not cross files; confirm-dialog deferred (P2) |
| RK-S2-6: huge grids (full-file 30MB -> 1000+ cells) slow the DOM | L | M | Render-all v1 (buttons are cheap); virtualization explicitly OUT (Phase 8 editor); truncated default window keeps the common case ~150 bars |
| RK-S2-7: scope creep into S3/S4 (audio, accompaniment, export) | M | M | DO-NOT list below; tempo/meter overrides are RECORD-ONLY fields with S4 tooltips |
| RK-S2-8: reload-restore applies overrides to a different file | L | H | Hash-gated (D62): match -> restore; mismatch -> refuse; null-hash -> drop with notice, never silent |

## 8. DO NOT build in S2

- NO audio: no composePlayer, no mixer, no audio.ts/backingEngine/rhythmEngine/
  playbackClock/transport touches (any audio = scope violation, flag it).
- NO accompaniment (S3), NO export/URL-serialize/paste (S4).
- NO ImportExportModal edits, NO paths/activePathIndex writes ever (REQ-TRANS-3).
- NO etude mode-UI changes (TD-040); EtudePianoRoll.tsx imported-for-constants only.
- NO new npm deps; NO new engine FILES (floor stays 29); theory.ts FROZEN.
- NO tests/ edits (it( = 362); no count-pin changes; no README/SPEC/AGENTS/.kai edits.
- NO App.tsx edits (the surface is store-resident; ModeGate already wires it).
- NO piano-roll EDITING, no multi-track roll, no virtualization (Phase 8).
- NO console.* (warn/error only if a genuine error path needs reporting - none expected).

## 9. Traceability

REQ-COMP-1 -> UploadDropZone + readMidiFile cap + tooLarge banner | 2/3/4/10..15
-> (S1, consumed) | 5 -> ComposePianoRoll (P1 melody-only carve, X8 held) |
6 -> usesPitchBend banner | 20 -> AnalysisCard header fields | 21 -> every field
routes through patchComposeOverrides (key/tempo/meter/melody/cells) | 22 ->
confidenceTier + D58 blend (H1/H2) | 23 -> ChordCellPopover (autocomplete,
common options = top-3 alternatives, delete, split via reinferBar) | 24 ->
store undo stacks + Cmd+Z | 50 -> noNotes banner | 51 -> percussionOnly manual
prompt | 52 -> chromaticFallback manual chart | 53 -> defaultWindow + Analyze
full file + analyzeFull persisted | REQ-PED-4 (Compose) -> annotation chips
under the chart | REQ-PED-5 -> ConceptDrawer wiring | REQ-IO-70 -> aside
preserved + loaded-state line | REQ-IO-71 -> zero network calls (grep pin) |
REQ-IO-51 -> fileHash re-upload semantics (D62) | D48 -> v4 slice (S3/S4 fields
added later WITHOUT a v5).

```yaml
HANDOFF_TO_DEVELOPER:
  from: "@architect"
  to: "@developer"
  timestamp: "2026-09-23T18:40:00Z"
  DELIVERABLES:
    - name: "docs/PHASE-4-S2-ANALYSIS-UI.md"
      status: complete
      sections: "re-audit (23 anchors) + D57..D65 + collision table + file plan + test plan + checklist + risks + traceability"
  CONSTRAINTS:
    - "baseline 1627/1/2 (2 = CSS-WIP, NOT yours); tests/ FROZEN it(=362; count pins 40/12 untouched"
    - "three pinned strings survive UNCHANGED: 'Drop a .mid file to get started.', 'Open import / export' (click -> onOpenImportExport), privacy aside"
    - "ZERO edits: App.tsx, ModeGate.*, ImportExportModal, dirty-11, transport/audio, theory.ts, vitest.config.ts, package.json"
    - "engine changes = exactly two existing-file edits (key.ts additive blend, types.ts mergeGrid append); NO new engine files; purity floor stays 29"
    - "ASCII, no console.*, no any/@ts-ignore, relative imports; new component tests auto-register via the glob"
  DECISIONS_MADE:
    - decision: "D57 zustand v4 NOW, project+undo in-memory in-store, composeSession {fileName,fileHash,overrides,analyzeFull} persisted; S3/S4 fields added later without v5"
      confidence: HIGH
      rationale: "30MB never fits localStorage; store residency keeps F8 (nothing lost on mode switch); append-only migration once"
    - decision: "D58 declared x functional x KS blend; H1: KS alone never auto-accepts; H2: conflict always banners"
      confidence: "HIGH (structure) / MEDIUM (constants)"
      rationale: "fix-round evidence: KS 18.3% top-1 on adversarial jazz; correlation is not a calibrated probability"
    - decision: "D59 store-resident snapshot undo + surface-local Cmd+Z (unbound globally); NOT useHistory (component-scoped, lost on unmount)"
      confidence: HIGH
      rationale: "overrides live in the store; undo must share their lifetime; zero App.tsx collision"
    - decision: "D60 mergeGrid appends out-of-range slot patches"
      confidence: HIGH
      rationale: "REQ-COMP-23 split is otherwise unsatisfiable through the shipped merge; pure engine-domain semantics"
    - decision: "D61 new chordInput.ts parser; parseChordToMidi REJECTED as validator (parent-sketch correction)"
      confidence: HIGH
      rationale: "ireal parser is lossy one-way to MIDI notes; cannot round-trip to (rootPc, qualitySymbol); popover must reject what cells cannot hold"
    - decision: "D64 new ComposePianoRoll (tick-linear); EtudePianoRoll reuse REJECTED; ROLL_PALETTE imported"
      confidence: HIGH
      rationale: "step-native vs tick-native mismatch; fake-Etude adapter would lie; palette stays single-source"
    - decision: "D65 e2e fixture generated IN-SPEC via @tonejs/midi + setInputFiles buffer; no committed binary"
      confidence: HIGH
      rationale: "specs run in node; deterministic; self-documenting; no public/ growth"
  IMPLEMENTATION_NOTES:
    - "read the file buffer ONCE: cache it in a ReadableMidiFile-shaped stub for readMidiFile and hash the same buffer (the interface is structural by design)"
    - "render ONLY mergeAnalysis + blendKeyEvidence output; never display raw analysis fields; memoize both"
    - "meter override re-runs analyzeProject on a patched project copy and clears chord cells IN ONE undo push; tempo override is record-only (S4 consumes)"
    - "melody-track override must call extractMelody with patched roles (chosen track = sole melody, confidence 1) - the roll shows REAL notes, not a label"
    - "the Cmd+Z listener must replicate App's isTyping guard verbatim or popover-input undo double-fires"
    - "hash-null path must DROP overrides with a visible notice - silently re-applying edits to an unverifiable file is a spec violation"
    - "no key-signature meta in the e2e fixture (encoder keySig byte is broken - errata D6); the inferred-only blend path is what the browser leg exercises"
  PROGRESS:
    phases_completed: "5/5"
    retries: 0
    quality_gates_passed: "5/5 (requirements mapped; interfaces sketched; choices justified; perf/async contract set; honesty rules testable)"
  ESTIMATED_EFFORT:
    implementation_hours: "26-38"
    testing_hours: "10-14"
    documentation_hours: "2"
  CONCERNS:
    - "blend constants ship conservative; if the real-world corpus (RK2) lands, re-tune via KEY_BLEND_WEIGHTS + the property tests - do NOT loosen H1/H2"
    - "Space still toggles etude playback while compose is loaded (pre-existing since the stub) - deliberately untouched; S4 owns routing"
    - "REQ-IO-50 URL serialize stays S4-stretch; v4 payload shape already serializes cleanly - no S2 redesign needed"
  AUDIT_TRAIL:
    - { phase: "re-audit", duration: "~20 min", tools_used: "read/grep/bash (npm test fresh run: 1627/1/2 confirmed; git show f92a0c4 --stat; vitest.config JSDOM_FILES; playwright config; PRD req lines; TD-040/041 register)", errors_encountered: "none material; zsh glob quirk on grep --include (switched to grep tool)" }
    - { phase: "design", duration: "~25 min", notes: "three parent-sketch premises falsified and re-grounded: parseChordToMidi-as-validator, EtudePianoRoll-reuse, ModeGate heading-only pinning (the import/export button is ALSO pinned)" }
```

**End of Slice 2 design.**
