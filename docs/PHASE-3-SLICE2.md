# PRD-001 Phase 3 Slice 2 Design: Etude UI Wiring

Status: APPROVED DESIGN (from @architect research packet, 2026-09-23). Implementation authority for @developer.
Scope: Slice 2 ONLY (constraint panel, adapter, load pipeline reuse, piano roll, abcjs staff view, MusicXML melody voice, URL constraint serialization, TD-032 drive-bys). Slice 3 (practice mechanics, annotation surfaces, concept drawer, print CSS) is NOT this pipeline.
Baseline (verified this round): `npm test` = 1365 passed / 1 skipped / 2 failed; the 2 failures are the pre-existing CSS-WIP component tests (FormPlanner.test.tsx, FormTemplatePicker.test.tsx) - do NOT fix. `tests/` it( count = 362 (verified by count this round). Slice 1 shipped at 1f3cbc4 (engine/etude + engine/pedagogy, purity floor 21, green CI).

Rules for every new/edited file (inherited, standing): ASCII only; no `console.*` except warn/error; no `any`, no `@ts-ignore`; relative imports; engine/ purity absolute (adapter + views live in src/, engine may not import src); new component tests are auto-registered by the `src/components/**/*.test.tsx` glob in vitest.config.ts JSDOM_FILES (line 14) - verify, do not duplicate; src/lib tests are node-project and drift-gate-invisible.

---

## 1. Re-audit (anchors re-mapped at HEAD 884a5de; App.tsx = 3960 lines)

Line numbers shift; every anchor below was verified THIS round and is given with a search string. Cite the search string in PR descriptions if an anchor moved.

| Anchor | Location | Verified content |
|---|---|---|
| StageFrame meta region | App.tsx ~2939-2984 (`<StageFrame` + `TransposeControls showExercise`) | eyebrow/title/meta/actions slots; meta carries the +/-5th ToolChips, `TransposeControls` (2974), `EffectiveKeyBadge sourceKey={path.key}` (2977-2982). Phase 2's pattern for "session-level readout row" - Slice 2 does NOT add to this region (etude readouts live in the panel). |
| Etude AppMain fragment | App.tsx 1844-3832 (`<ModeGate` / `AppMain={`) | Full-width section stack: PathBriefing (1855) -> FormTemplatePicker/FormPlanner IIFE (1859-1874) -> StylePackPicker (1880) -> CoComposePanel IIFE (1897-1909) -> QuizPanel (1915) -> PersonaLensBanner (1927) -> ComposerChartViewer (1932) -> TexturePanel (1941) -> **PlaySessionRail (1952-~2168)** -> RecentTakesPanel (~2170-2184) -> Personas ribbon (2186-2331) -> two-column flex (2333: left sidebar 2334-2934, right content 2936-3589) -> canvas area (3591-3665) -> `{showLiveScore && (` block 3667-3790 (MelodyLane + lazy LiveScoreDisplay) -> PianoKeyboard (3793) -> IdeaBar (3824). |
| handleCoComposeAccept | App.tsx 498-536 | Writes 4 beat-steps via `setHarmonicStep`, then `useNewSessionStore.setState({ dirty: { compose: "none", etude: "etude-pending-accept", explore: "none" } })` (527-533). THE dirty shape Slice 2 acceptance must reproduce (D30). |
| setPaths call sites | 1405 (handleGeneratePath), 1448 + 1463 (handleGenerateEtude ML / sync branches), 1957 (rail `prependPath`, idempotent dedupe), 2170 (rail commit-voicing rewrite), 3842 (ImportExportModal), 3926 (ChordInspector apply) | The generated-content LOAD template is 1463-1467: `setPaths([{ ...newPath, name: newPath.name ?? newPath.title }, ...paths]); setActivePathIndex(0); setActiveStepIndex(0); setTransposeShift(0); resetTransposeSlice();` |
| Reset sites (5) | 1409, 1452, 1467, 1496 (persona switch), 3846 (import) | All call `resetTransposeSlice()` (350-353: setExerciseTranspose(0) + setKeyCycleActive(false)). Slice 2's load site is a SIXTH site with the same sequence (D31). |
| URL boot read | App.tsx 1128-1185 (`PRD-001 Phase 1: URL <-> store sync`) | Runs ONCE (empty deps): reads `mode` (1131), `transpose` precedence via `resolveBootTranspose` (1159-1165), `?idea=` base64 with warn-and-drop (1166-1183). Slice 2 extends THIS effect (ADR-011 read-once rule). |
| URL debounced write | App.tsx 1187-1210 | Single store->URL writer: subscribes to the store, 200ms debounce, `history.replaceState`, reads current `URLSearchParams` and sets/deletes only `mode` + `transpose` (param-preserving). Slice 2 extends THIS writer - never add a second replaceState writer (race, D28). |
| Keyboard handler | App.tsx 987-1117 | Typing guard 989-997 (input/textarea/select/contentEditable bail - panel inputs are safe from global keys); `1/2/3` mode keys 1049-1061 (modifier-guarded via `isModeShortcutModifierKey`); Phase 2 transpose `[`/`]`/Shift by e.code 1063-1078; tempo `,`/`.` 1104-1111. NO `G` binding exists (PRD 9.7 lists it; Slice 2 does NOT add it - NOT-doing list). |
| Legacy Etude Assistant | App.tsx 2585-2714, inside the "Generator Lab" fold (2465-2734; `isGenFolded` defaults TRUE, line 563) | NOT a component, NOT a modal: an inline JSX block in the left sidebar. Anatomy: "Etude Assistant" header (2586-2589), algorithm `<select>` with Local-deterministic / Local-ML / Cloud optgroups (2591-2623), `GENERATE ETUDE` button -> `handleGenerateEtude` (2624-2630, async-guarded by `isGeneratingML`), `etudeStatus` aria-live line (2634-2642), export cluster (2645-2711: Loop WAV / Score21 / MusicXML of the ACTIVE path). State lives in `useGeneratorPanel.ts` (clean hook). Engine: `src/lib/etude.ts` (206 lines, OFF-LIMITS) - gimmick algs, `Date.now()` ids, 1 step per beat-ish, NO padPath at load. |
| PlaySessionRail (DIRTY) | App.tsx 1952-~2168; props interface PlaySessionRail.tsx:32-86 | Takes `paths`, `prependPath`, `activePath`, `activePathIndex`, transport/loop/tempo/transpose/persona/step props, export callbacks, `optimizedStepsNotes`, `behavioralMarkers`. A generated HarmonicPath flows through it via `paths`/`activePath` PROPS ONLY - zero edits, confirmed. |
| sessionStore.ts | src/state/sessionStore.ts (303 lines) | v2 (`CURRENT_SESSION_VERSION = 2`, line 52); fields mode/globalTranspose/exerciseTranspose/keyCycleActive/currentIdea/dirty/pendingModeRequest; `partialize` (228-234) persists mode+transposes+idea; `resetModeSlice` (202-211, test-only callers); `resolveEffectiveMode` URL>persisted>etude (249-258); `resolveBootTranspose` (285-303). Migrations: engine/migrations/index.ts `CURRENT_SESSION_VERSION = 2`, `SESSION_MIGRATIONS = [sessionV1ToV2]`; runner.test.ts:262-267 PINS version 2 + chain [[1,2]] (must be updated with the v3 bump, D23). |
| Engine surface (slice 1, shipped) | engine/etude/{types,assemble}.ts, engine/pedagogy/*, engine/styles/*, engine/core/{ids,rng,spelling}.ts | `generateEtude(constraints, {nowMs, seq}): EtudeResult` (throws RangeError on invalid - validate first); `etudeToSteps(etude): readonly EtudeBarStep[]` (one step per BAR, finding 4); `feasibilityOf(c): string | null` (conservative-sound: null => NEVER throws for any seed); `validateEtudeConstraints(unknown): {ok, errors[]}`; `shippedStyleIds() = ["jazz","pop","classical"]`; `SLOTS_PER_BAR = 8` (melody.ts:29); `deriveCanonicalId("etu", seed, constraints)`; `spellTonic(pc, mode, "")` + `parseKey` (round-trips "Eb minor" style strings); `EtudeNote {slot, midi, durationSlots, velocity, strongBeat, syncopated}` - durationSlots CAN cross the barline (next-onset math, melody.ts:250). |
| MusicXML | src/lib/scoreExport.ts:75-148 (`toMusicXml`) | Single part P1, `<divisions>1</divisions>`, one `<measure>` per step + measure-0, `<harmony>` + per-note `<pitch>`. FROZEN pins in tests/scoreExport.test.ts:47-57: `/<measure number="\d+">/g` count === steps+1 for the NO-melody call. Extension must be strictly additive (D27). |
| abcjs precedent | LiveScoreDisplay.tsx (DIRTY, lazy-mounted App.tsx:117-118, renderAbc at 298); leadSheet.ts (CLEAN: `buildLeadSheetAbc` 70-148, `renderLeadSheet` 169-180); sheetMusicExport.ts (CLEAN, jsPDF); scoreGenerator.ts:26 `midiToABCName` (sharps-only, octave-correct) | READ-ONLY references. Slice 2 builds a NEW clean ABC module + NEW lazy staff view; LiveScoreDisplay is never edited. |
| Canvas vs SVG precedent | SynesthesiaCanvas.tsx (canvas, rAF-animated live note blobs, DPR + ResizeObserver plumbing via useCanvasSize) vs abcjs = SVG everywhere else | Static data grids in this repo are SVG (abcjs output, LeadSheet); canvas is reserved for per-frame animation. Informs D25. |
| Count pins | tests/count-tunes.test.js -> tunesCount()=40 (reads `inApp:` lines in src/data/masterclass.ts); tests/pathBriefing.test.ts -> curatedBriefingCount()=12 (src/lib/pathBriefing.ts); assets/check-links.cjs counts it( in tests/*.test.ts ONLY | SAFE by construction: Slice 2 touches none of those files; `briefingForPath` (pathBriefing.ts:47) returns null for unknown ids, so PathBriefing renders nothing for `etu-*` paths. Keep the property: never register generated etudes in masterclass.ts / pathBriefing.ts. |
| Path invariants | src/lib/paths.ts:54-56 (`STEPS_PER_BAR=4`, `MIN_PATH_BARS=24`, `MAX_PATH_BARS=64`), `padPath` 72-87; scripts/check-path-bars.ts scans paths.ts RAW_PATHS only | Generated runtime paths are invisible to check:paths (36/36 unaffected). `HarmonicStep` is MUTABLE (`notes: number[]`) vs `EtudeBarStep` readonly - the boundary cast is resolved by explicit copies, D24. `HarmonicPath.key` convention: "F", "Bb", "G-" (paths.ts:17-19). |
| TD-032 targets | (a) engine/pedagogy/concepts.ts:151-152 (AXIS_PROGRESSION.definition says "major thirds or tritones ... axis of Bartok" while the body correctly says Bartok axis = MINOR thirds); (b) engine/pedagogy/annotate.test.ts:92-94 (comment claims "major-quality chord on the tonic ROOT" but the fixture at :95 is `II7` dom7-quality a whole step up - the comment half-describes the wrong thing); (c) docs/PHASE-3-ETUDE.md sec 6 item 4 says "75 cases" - shipped matrix is 45 (determinism.test.ts:6 already notes the slip) | concepts.test.ts pins definition SHAPE (<=160 chars, ASCII, non-empty) but NOT wording - (a) is safe. tests/ untouched. |

---

## 2. Decisions

### D22: Panel placement - full-width AppMain section after PlaySessionRail; legacy assistant coexists untouched.

Decision: `EtudeComposerPanel` mounts in the Etude surface (AppMain fragment) as a new full-width StageFrame section immediately AFTER the `<PlaySessionRail ... />` element (search `<PlaySessionRail`, ~1952; insert after its closing `/>`, before the RecentTakesPanel block ~2170). The piano-roll + staff views mount in the RIGHT column, immediately BEFORE `{showLiveScore && (` (~3667), wrapped in one `EtudeViews` component with a Roll/Staff tab toggle. The legacy Etude Assistant block (2585-2714) is NOT replaced, NOT moved, NOT gated.

Rationale (evidence from the JSX tree):
- Option (b) - replacing the legacy entry point - fails on two facts: the legacy "assistant" is not a component (it is inline JSX inside the Generator Lab fold, `isGenFolded` default TRUE at line 563), so the new P0 panel would be buried behind a default-closed fold; and replacing it forces a legacy-deletion product decision this slice explicitly avoids (src/lib/etude.ts is off-limits, "superseded-not-fixed").
- Option (c) - ModeGate sub-tab - invents a new navigation layer for one feature; ModeGate is a 3-tab surface switcher, not a tab container.
- Option (a) matches the established composition of AppMain exactly: it is a vertical stack of full-width feature sections (CoComposePanel, QuizPanel, TexturePanel, PlaySessionRail are all siblings). The panel is visible whenever the Etude surface is active, with no fold collision.
- Views go in the right column because that is where score/keyboard display real estate already lives (canvas 3591, LiveScoreDisplay 3667, PianoKeyboard 3793) and they only render for the active etude.

Confidence: HIGH.

### D23: State ownership - constraints in zustand (persisted, v3), draft local, result in memory.

Decision:
- `etudeConstraints: EtudeConstraints | null` + actions `setEtudeConstraints(c)` and `acceptEtude(c)` go into src/state/sessionStore.ts (the zustand store). `acceptEtude` sets constraints AND the dirty map in one action (D30). Persisted via `partialize` (it is cross-reload session state, exactly like globalTranspose).
- Session version bump: `CURRENT_SESSION_VERSION = 2 -> 3` in BOTH engine/migrations/index.ts and src/state/sessionStore.ts, with a new `sessionV2ToV3` step (`etudeConstraints: null` when absent, copy-on-write, same shape as sessionV1ToV2) appended to `SESSION_MIGRATIONS`. Update engine/migrations/runner.test.ts:262-267 registry pin (version 3, chain [[1,2],[2,3]]) - engine tests are editable, tests/ is not.
- The panel's DRAFT (mid-edit values before Generate) is local `useState` inside EtudeComposerPanel - transient UI per PRD 10.4, never in the store, never in the URL.
- The Etude RESULT (`Etude` object) is React state in App (`const [activeEtude, setActiveEtude] = useState<Etude | null>(null)`). It is NOT persisted and NOT in the store: it is a pure derivation of constraints (REQ-ETU-15 determinism), so persistence would be redundant state. Views consume it via props (they are direct children in App's JSX).
- Seed lives in both: inside `etudeConstraints` (store + URL) and echoed on the result (`etude.seed`).

Rejected: (a) all-etude-state-in-store including the result - bloats the persisted envelope with a derivable artifact and forces every view through store selectors for zero benefit; (b) panel-fully-local (constraints in component state, URL written by a panel-local effect) - creates a SECOND replaceState writer racing the existing 200ms debounced sync (see D28) and loses boot restore.
Confidence: HIGH.

### D24: Adapter - src/lib/etudeEngine.ts, copy-not-cast at the readonly boundary, padPath in the adapter.

Decision: one clean module owns every engine->src crossing:

```ts
// src/lib/etudeEngine.ts  (imports engine/etude/{types,assemble}, engine/core/ids,
// engine/core/spelling, ../lib/paths - src MAY import engine, never the reverse)
export const DEFAULT_ETUDE_CONSTRAINTS: EtudeConstraints;   // jazz, C major, diff 3, 8 bars, tempo null, seed 1, all advanced defaults (null/false)
export function etudePathId(etude: Etude): string;          // "etu-" + etude.canonicalId
export function generateEtudeFor(constraints: EtudeConstraints): Etude | null;
  // validateEtudeConstraints first -> null on invalid (REQ-NFR-5: never throw into UI);
  // feasibilityOf(c) !== null -> null (conservative-sound: null-feasibility guarantees no throw);
  // memo Map<canonicalId, Etude> capped 16 entries (FIFO evict) - same seed+constraints = same work, REQ-ETU-15;
  // clock read HERE: { nowMs: Date.now(), seq: ++moduleCounter } (adapter layer only, ADR-005).
export function etudeToHarmonicPath(etude: Etude): HarmonicPath;
```

`etudeToHarmonicPath` contract (the slice-1 design note resolved):
- `steps`: `etudeToSteps(etude).map((s) => ({ name: s.name, notes: [...s.notes], descriptions: s.descriptions }))` - EXPLICIT mutable copies, no `as` cast, no @ts-ignore; this is the readonly-notes -> mutable HarmonicStep boundary.
- Then WHOLE-CYCLE padding (adapter-local, padPath itself is NOT reused): repeat the step cycle in whole-form passes until `steps.length >= MIN_PATH_BARS * STEPS_PER_BAR` (96). For bars 4..32 this lands in 96..127 steps, inside MAX_PATH_BARS (256). Why not `padPath`: it truncates the final cycle to exactly 96, so a 7-bar form ends with a c4 -> c0 seam when the live loop wraps (96 % 7 !== 0). Whole-cycle padding keeps `steps.length % bars === 0`, so the live loop is seamless and `detectFormPeriod` returns the true form (bars, or a shorter honest period for internally-repeated templates - the slice-1 finding-4 caveat, unchanged). WAV export renders the etude exactly once either way.
- `id: etudePathId(etude)`, `title: etude.title`, `name: etude.title`, `description`: one ASCII line "Generated <style> etude - <bars> bars, difficulty <d>, seed <n>. The <bars>-bar form loops inside the padded practice track." (states the bars/period relationship honestly so the 24+-bar strip vs the true form is explained).
- `key`: `spellTonic(etude.key, etude.mode, "")` + (mode === "minor" ? " minor" : "") - the "G-" catalog suffix is NOT used because `parseKey("G-")` normalizes mode to "-" and would spell the tonic from the MAJOR table; "Eb minor" round-trips through `parseKey`/`effectiveKeyLabel`/`EffectiveKeyBadge` correctly (D11 keyed path).
- No `techniques`/markers set - generated paths stay plain.

Confidence: HIGH.

### D25: Piano roll = SVG, not canvas.

Decision: `EtudePianoRoll.tsx` renders a static SVG: one column per eighth slot (`bars * 8`), one row per MIDI pitch (range = min/max of melody + chord roots, padded 1 semitone), chord lanes as background shading (per-bar chord root row + voicing extent tint), melody notes as rects. Optional `activeBar` prop highlights the playing bar (App passes `Math.floor(activeStepIndex / STEPS_PER_BAR)` - a plain prop, no subscription, no useTick).

> **ERRATUM (fix round - docs-caught):** the `Math.floor(activeStepIndex / STEPS_PER_BAR)` formula above (and its repeat in the section-4 App.tsx manifest row) **contradicts slice-1 finding 4**: etude practice paths carry ONE STEP PER BAR, so that mapping advances the highlight at 1/4 speed and drops it out of range after the first third of the padded loop. Shipped code uses the step index as the bar index directly - `etudeActiveBarFor(etude, activeStepIndex)` = `stepIndex % etude.bars` (wraps seamlessly over whole-form padding), pinned in `src/lib/etudeEngine.test.ts` and guarded end-to-end in `e2e/etude-composer.spec.ts`.

Rationale:
- Data size is tiny and STATIC: <= 32 bars * 8 slots = 256 slots, <= ~256 note rects + ~2000 background cells at worst; SVG handles it at any zoom without DPR/resize plumbing. The canvas precedent (SynesthesiaCanvas) exists because that component animates per-frame note blobs with rAF - the etude roll does not animate.
- abcjs (the repo's notation house style) is SVG; font-scaling and print (REQ-NFR-11, later slice 3) come free with SVG.
- jsdom-testability: the test plan (T6) asserts structure (rect count === notes, bar column count, aria wiring). Canvas is opaque in jsdom - an untestable P0 view loses the CI guarantee.

Accessibility (PRD 9.8): `<svg role="img" aria-labelledby="<id>-title">` + `<title>` element; plus an sr-only summary line produced by a pure exported helper `melodySummary(etude): string` ("8-bar melody, 34 notes, range E4 to A5, 6 syncopated onsets, ends on the tonic") - keyboard-accessible via the summary (display-only view: no interactive cells in slice 2, so focusability is not required; aria-described is the chosen bar).
Color-vision-diversity: Okabe-Ito subset only - melody note #0072B2 (blue), syncopated note #D55E00 (vermillion), chord-root lane tint #009E73 at 12% opacity, grid/lanes neutral grays. Non-color redundancy (never hue-alone): strong-beat notes get a 1px light outline, syncopated notes get a dashed top edge (`stroke-dasharray`), bar lines are solid separators. All fills are constants in the component, ASCII hex.
Confidence: HIGH.

### D26: ABC build = new pure module src/lib/etudeAbc.ts; staff view = new lazy component.

Decision:
- `buildEtudeAbc(etude: Etude, opts?: { transposeShift?: number }): string` - PURE string builder (node-testable, no abcjs import, no DOM). Shape: header `X:<canonicalId>` / `T:<title>` / `M:4/4` / `L:1/8` / `Q:1/4=<tempo>` / `K:C`; then one line per bar: chord symbol `"^<ChordName>"` on the first token, melody tokens via `midiToABCName` (scoreGenerator.ts:26, sharps-only, already octave-correct), duration suffix (1 slot = bare eighth, d slots = `<d>`, 2 = quarter, 4 = half), rests `z<d>` filling every gap so each bar sums to exactly 8 eighths; a note whose `durationSlots` crosses the barline splits into `c2- | -c2` tie halves (abcjs tie syntax). `transposeShift` (default 0) shifts every MIDI before naming - the view passes `soundingShift` so staff matches audio, same contract as LiveScoreDisplay.
- K:C + explicit accidentals is deliberate: key-signature computation per mode is out of scope, abcjs renders every accidental correctly, and the output stays deterministic + golden-testable. Documented simplification.
- `EtudeStaffView.tsx` (new component): `props { etude: Etude; transposeShift: number }`. Lazy-imported by EtudeViews (`lazy(() => import(...))`, precedent App.tsx:117-118) which itself is lazy-imported by App - abcjs stays code-split. Effect: `abcjs.renderAbc(ref.current, buildEtudeAbc(...), { add_classes: true, staffwidth: 760, scale: 1, responsive: "resize" })` inside try/catch (`console.warn` + inline fallback text on throw). Container `role="img"` + aria-label + `<title>`-equivalent sr-only text (reuse `melodySummary`). Re-render on etude/transposeShift change only.
- LiveScoreDisplay is NOT edited (DIRTY) and NOT reused (it is a 4-bar-window playing-score with tick subscriptions - a different job). leadSheet.ts is NOT reused (it arpeggiates chords; the etude has a real melody grid) but its structure is the house precedent.
Confidence: HIGH.

### D27: MusicXML = additive second part in toMusicXml, never a re-shape.

Decision: extend `MusicXmlOptions` with `melody?: readonly EtudeNote[]` (type-only import from engine/etude/types - src->engine type imports are allowed and erased at build). When `melody` is absent/undefined the function output is BYTE-IDENTICAL to today (the frozen tests/scoreExport.test.ts regex counts stay green). When present:
- part-list gains `<score-part id="P2"><part-name>Melody</part-name></score-part>`;
- a second `<part id="P2">` is appended after P1 with its OWN measure-0 (`<divisions>2</divisions>` => one eighth = 1 division, key/time/clef treble) + `<tempo>` direction;
- measures: `bars` measures built by walking slots 0..bars*8-1 - gap -> `<note><rest/><duration>g</duration><voice>1</voice></note>`; note -> `<pitch>` via the existing `midiToXmlPitch(n, transpose)` (same `transpose` option applies to both parts), `<duration>min(durationSlots, remainingInBar)</duration>`, bar-crossing continuations emitted as a new note with `<tie type="stop"/>` + `<notations><tied type="stop"/></notations>` and the first half carrying `start` equivalents;
- velocity is ignored (MusicXML dynamics are out of scope); `strongBeat`/`syncopated` are not serialized (slice-3 print layout re-derives from slots).
- UI trigger: a dedicated "MusicXML (with melody)" download button inside EtudeComposerPanel's result row calling `downloadText(etudePathId + ".musicxml", toMusicXml(path, { melody: etude.melody, ... }), ...)`. The legacy sidebar MusicXML button (2692-2710) is UNCHANGED - chord-only export of any path stays exactly as-is.

Rejected: melody as voice-2 inside P1 with `<backup>` - keeps one part but the existing P1 measures have no voice plumbing at all (every note is voice 1 with per-note durations); interleaving a second voice via backup arithmetic in the SAME measure loop risks the frozen measure-shape pins for zero user-visible gain in MuseScore (two parts import cleaner anyway).
Confidence: HIGH.

### D28: URL scheme - extend the single debounced writer; `tmode` for tonal mode.

Decision:
- Params (all optional as a set): `style=jazz|pop|classical`, `key=C|Db|...` (letter names, parse via engine `parseKey`), `tmode=major|minor`, `diff=1..5`, `bars=4..32`, `tempo=<int>` (omitted when null = profile default), `seed=<uint32>`, plus the shipped advanced subset (D29): `start=<numeral>`, `end=<numeral>`, `chrom=1`, `straight=1`, `cts=1`, `maxint=<1..24>` - each omitted at its default (compact URLs).
- `mode` is NOT reused for the tonal mode: it is owned by the app mode (REQ-MODE-2, `resolveEffectiveMode` reads it). The PRD 11.2 example literally lists `mode=etude` and `mode=major` in one query string - an unresolved collision; `tmode` is the documented deviation (PRD example is illustrative; REQ-ETU-3 says "persist all constraints", not param names).
- Writer: the EXISTING debounced store->URL effect (App.tsx 1187-1210) is extended - subscription predicate gains `s.etudeConstraints !== prev.etudeConstraints`; `write()` applies `serializeEtudeConstraints(state.etudeConstraints)` (returns `Record<string, string | null>`; null values delete the key). ONE replaceState writer total - a second 200ms-debounced read-modify-write effect on `location.search` can lose the other's fresher value (classic lost-update race), which is why a "slice-2-local effect" is rejected.
- Reader: the EXISTING boot effect (1128-1185) gains `parseEtudeParams(new URLSearchParams(...))` -> `setEtudeConstraints(parsed)` when non-null. Precedence URL > persisted (zustand rehydrates before effects; the URL write-back lands second), matching the D10 transpose pattern. Malformed/partial etude params (any core key missing or `validateEtudeConstraints` fails) -> return null, `console.warn("[App] ?etude params malformed; ignoring")`, persisted value survives - same warn-and-drop shape as `?idea=`.
- Boot restore (rides the same boot effect, after the read): if constraints resolve non-null -> `generateEtudeFor` (memo hit or sub-ms regen) -> `setActiveEtude`; if `etudePathId` is NOT in `paths` (deep link on a fresh browser) -> prepend it WITHOUT activating, WITHOUT dirty, WITHOUT transpose resets (restore must not stomp the restored session's active path/offsets). If the path IS already in K.paths (normal reload), nothing to load - the user re-selects it from the Paths list and the views reappear.
- `parseEtudeParams` / `serializeEtudeConstraints` live in `src/lib/etudeUrl.ts` (pure, node-testable, no DOM - takes/returns URLSearchParams/plain objects).
- REQ-ETU-15 user-facing contract: same URL => same constraints => same seed => `generateEtudeFor` byte-identical etude (pinned end-to-end in test T2). The panel shows the seed field + Randomize; the URL is the share mechanism (no copy-link button in this slice - the address bar is the artifact).

Confidence: HIGH.

### D29: Advanced constraints (REQ-ETU-2, P1) - ship 6 of 9, defer 3.

Decision: the collapsible `<details>` "Advanced" section (default CLOSED, house pattern: StageFrame Advanced `<details>` at 3418-3439 with the `adv-live` aria-toggle announcement) ships:
1. `startOn` (text input, D21 numeral token, placeholder "e.g. ii7")
2. `endOn` (text input, placeholder "e.g. I")
3. `requireChromaticism` (checkbox)
4. `rhythm.straightRhythmsOnly` (checkbox)
5. `melody.chordTonesOnStrongBeats` (checkbox)
6. `melody.maxIntervalSemitones` (range 1-24 + "profile" off-state via checkbox or empty = null)

Deferred (stay null/false in committed constraints; no UI, no URL keys): `allowedQualities` (14-token multi-select), `allowedNumerals` (free-text grammar list), `melody.range` (dual-thumb MIDI slider). Rationale: these three need bespoke widgets with their own validation UX; the engine treats null as unrestricted so deferral is invisible to generation; REQ-ETU-2 is P1 and "6 of 9 in a P1 slice" is an honest partial ship - recorded here so slice 3 / a follow-up can close it. The panel's advanced section header carries a one-line note naming what is not yet exposed (no silent omissions).

Generate gating rule: `validateEtudeConstraints(draft).ok === true` AND `feasibilityOf(draft) === null`. Any feasibility string DISABLES Generate with the string shown inline (title + `aria-describedby` on the button - PHASE-1-02: never a bare disabled affordance; the tooltip says exactly what to widen). Blocking on the soft startOn/endOn-outside-filter warning too is deliberate: the message says the etude "will contain chords outside the allowed set", which is a user-visible lie of the constraint panel - make them fix it.

### D30: Dirty semantics - acceptance marks Etude dirty exactly like handleCoComposeAccept.

Decision: the store action `acceptEtude(c)` writes `dirty: { compose: "none", etude: "etude-pending-accept", explore: "none" }` - the identical literal shape of App.tsx 527-533. Called from the App accept handler on user-initiated Generate AND Randomize-seed. NOT called on boot restore (D28) and NOT called by the memoized compute (`generateEtudeFor` is pure). This supersedes the slice-1 section-9 sketch line ("generation does NOT set dirty") by explicit task instruction: a generated etude is unsaved work and the mode-switch prompt must fire (ADR-007). Known nuance (documented, accepted): "Discard" dispatches `hse:revert-last-accept` which reverts a step edit, not a prepended path - the etude path stays in the list after discard. That matches every existing generated path's behavior (legacy assistant paths survive too); a true undo-of-load is out of scope.
Confidence: HIGH.

### D31: Load pipeline reuse - the handleGenerateEtude sequence verbatim, plus activeEtude.

Decision: `handleEtudeAccept(constraints)` in App.tsx:

```
etude = generateEtudeFor(constraints); if (!etude) return;            // never throws (D24)
newPath = etudeToHarmonicPath(etude);
setPaths([{ ...newPath, name: newPath.title }, ...paths.filter((p) => p.id !== newPath.id)]);
setActivePathIndex(0); setActiveStepIndex(0);
setTransposeShift(0); resetTransposeSlice();                          // 6th reset site, same sequence
setActiveEtude(etude);
useNewSessionStore.getState().acceptEtude(constraints);               // store + dirty + (via writer) URL
```

Dedupe-by-id (vs legacy blind prepend) makes re-rolling the SAME seed a no-op on the list. Playback, loop, transpose, key-cycle, count-in-free, WAV export, MIDI export, effective-key badge: ZERO work - the loaded path flows through the existing chain (slice-1 findings 2/4/6; REQ-ETU-22/23/24/30 already shipped). Views render only when `activeEtude && path.id === etudePathId(activeEtude)` (selecting any other path hides them; re-selecting the etude path brings them back from memory).
Confidence: HIGH.

---

## 3. Component / module API sketches

```ts
// src/lib/etudeEngine.ts - see D24 for semantics
export const DEFAULT_ETUDE_CONSTRAINTS: EtudeConstraints;
export function etudePathId(etude: Etude): string;
export function generateEtudeFor(constraints: EtudeConstraints): Etude | null;
export function etudeToHarmonicPath(etude: Etude): HarmonicPath;

// src/lib/etudeUrl.ts - pure, node-tested
export const ETUDE_URL_CORE_KEYS: readonly string[];      // ["style","key","tmode","diff","bars","seed"]
export function serializeEtudeConstraints(c: EtudeConstraints | null): Record<string, string | null>;
export function parseEtudeParams(params: URLSearchParams): EtudeConstraints | null;

// src/lib/etudeAbc.ts - pure, node-tested
export function buildEtudeAbc(etude: Etude, opts?: { transposeShift?: number }): string;

// src/lib/scoreExport.ts - EDITED signature only
export interface MusicXmlOptions { /* existing */ melody?: readonly EtudeNote[]; }
export function toMusicXml(path: HarmonicPath, opts?: MusicXmlOptions): string;

// src/components/EtudeComposerPanel.tsx
export interface EtudeComposerPanelProps {
  committed: EtudeConstraints | null;                     // store value seeds the draft (boot/URL/accept echo)
  loadedTitle: string | null;                             // status line: "<title> (seed N)" or null
  onAccept: (constraints: EtudeConstraints, origin: "generate" | "reroll") => void;
}
// internal state: draft (EtudeConstraints), derived validation + feasibilityOf warning.
// controls: style select (shippedStyleIds), key select (12 spelled tonics), mode select,
// difficulty 1-5, bars range 4-32, tempo (auto checkbox + integer input), seed integer
// input + "Randomize seed" button, Generate button, Advanced <details> (D29 subset),
// feasibility/error inline status line (role="status" aria-live="polite", house pattern 2634-2642).

// src/components/EtudeViews.tsx - lazy boundary + tab state
export interface EtudeViewsProps { etude: Etude; pathId: string; transposeShift: number; activeBar: number | null; }
// local: useState<"roll" | "staff">; PianoRoll static import; StaffView lazy; Suspense fallback.

// src/components/EtudePianoRoll.tsx
export interface EtudePianoRollProps { etude: Etude; transposeShift: number; activeBar?: number | null; }
export function melodySummary(etude: Etude): string;      // pure, exported for tests + staff-view aria

// src/components/EtudeStaffView.tsx
export interface EtudeStaffViewProps { etude: Etude; transposeShift: number; }

// src/state/sessionStore.ts - EDITED slice
interface EtudeSlice {
  etudeConstraints: EtudeConstraints | null;
  setEtudeConstraints: (c: EtudeConstraints | null) => void;
  acceptEtude: (c: EtudeConstraints) => void;             // constraints + dirty (D30), single writer
}
```

Data flow (key scenario, Generate click):

```
panel draft --validate+feasible--> onAccept(constraints)
  --> App.handleEtudeAccept --> etudeEngine.generateEtudeFor (memo) --> Etude
  --> etudeToHarmonicPath (copy + padPath) --> setPaths prepend + activate + resets
  --> store.acceptEtude --> [dirty] + debounced writer --> URL(style,key,tmode,diff,bars,tempo,seed,...)
  --> React re-render: panel status line, EtudeViews (roll SVG / staff abcjs), rail/StageFrame
      see the new active path, playback/WAV/transpose chain untouched.
```

---

## 4. Exact file plan (dirty-collision check per file)

NEW files (none can collide - they do not exist):

| File | Role | ~LOC |
|---|---|---|
| src/lib/etudeEngine.ts | adapter + memo + defaults (D24) | 110 |
| src/lib/etudeUrl.ts | URL serialize/parse (D28) | 130 |
| src/lib/etudeAbc.ts | ABC builder (D26) | 90 |
| src/components/EtudeComposerPanel.tsx | REQ-ETU-1/2/4 panel (D22/D29/D30) | 260 |
| src/components/EtudeViews.tsx | roll/staff tabs + lazy boundary | 70 |
| src/components/EtudePianoRoll.tsx | SVG roll (D25) | 170 |
| src/components/EtudeStaffView.tsx | abcjs render host (D26) | 80 |
| src/lib/etudeEngine.test.ts | T1 (node) | 90 |
| src/lib/etudeUrl.test.ts | T2 (node) | 110 |
| src/lib/etudeAbc.test.ts | T3 (node) | 80 |
| src/lib/scoreExport.etude.test.ts | T4 (node) | 90 |
| src/components/EtudeComposerPanel.test.tsx | T5 (jsdom via glob) | 140 |
| src/components/EtudePianoRoll.test.tsx | T6 (jsdom via glob) | 80 |
| src/components/EtudeViews.test.tsx | T7 (jsdom via glob) | 60 |

EDITED files (all CLEAN - verified against `git status` dirty-11: ChordInspector, CoComposePanel, FormPlanner, FormTemplatePicker, InspectPanel, LiveScoreDisplay, MelodyToolbar, PathCatalog, PracticeSessionPlayer, PracticeSetBrowser, StylePackPicker - none appear below):

| File | Edit | Dirty? |
|---|---|---|
| src/App.tsx | imports (lazy EtudeViews, panel, engine helpers); `activeEtude` state; `handleEtudeAccept`; boot-effect extension (parse + restore); write-effect extension (etude keys); mount panel after PlaySessionRail; mount views before `{showLiveScore && (`; pass `activeBar={Math.floor(activeStepIndex / STEPS_PER_BAR)}` | CLEAN |
| src/state/sessionStore.ts | etude slice (2 fields + 2 actions), partialize += etudeConstraints, resetModeSlice += null, CURRENT_SESSION_VERSION -> 3 | CLEAN |
| src/state/sessionStore.test.ts | T8 (v3 round-trip, migration, acceptEtude dirty shape, reset) | CLEAN |
| engine/migrations/index.ts | sessionV2ToV3 + CURRENT_SESSION_VERSION = 3 + chain append | CLEAN |
| engine/migrations/runner.test.ts | registry pin 262-267 -> version 3, chain [[1,2],[2,3]] + v2->v3 upgrade case | CLEAN |
| src/lib/scoreExport.ts | optional `melody` second part (D27) | CLEAN |
| engine/pedagogy/concepts.ts | TD-032(a): AXIS_PROGRESSION.definition -> "Harmony that moves by minor or major thirds instead of fifths - the symmetric axis of Bartok and the Coltrane cycle." (<=160 chars, ASCII; body already correct) | CLEAN |
| engine/pedagogy/annotate.test.ts | TD-032(b): fix the :92-94 comment to describe the actual `II7` fixture (dom7-quality target a whole step above tonic - adjacency alone must not fire ii-v-i) | CLEAN |
| docs/PHASE-3-ETUDE.md | TD-032(c): one errata line under sec 6 item 4: "Errata (shipped): the matrix is 3x5x3 = 45 cases, not 75; see determinism.test.ts." | CLEAN |
| docs/PHASE-3-SLICE2.md | this document | n/a |

NOT touched (hard): the 11 dirty components, tests/** (it( stays 362), src/lib/etude.ts, src/lib/generator.ts, src/lib/studies.ts, src/hooks/useSessionStore.ts (legacy), src/hooks/useGeneratorPanel.ts, src/data/masterclass.ts, src/lib/pathBriefing.ts, README.md, SPEC.md, AGENTS.md, .kai/, vitest.config.ts (glob already registers new component tests - VERIFY in step 9, add explicit entries only if the glob surprises), vite configs, e2e/.

---

## 5. Test plan

T1 etudeEngine.test.ts (node): DEFAULT_ETUDE_CONSTRAINTS passes validate + feasibilityOf null; generateEtudeFor(invalid) === null (never throws); generateEtudeFor returns the SAME object identity on repeat (memo) and a byte-identical JSON across a fresh constraints literal; etudeToHarmonicPath: id === "etu-"+canonicalId, name/title set, steps.length >= 96 AND steps.length % etude.bars === 0 (whole-cycle padding, D24), `detectFormPeriod(steps) <= etude.bars` and divides steps.length (seamless-loop proof), every step mutable-copied (mutating one step's notes does not touch etude.chords), key string round-trips `parseKey` to the right pc+mode, `etudeToSteps` length === bars preserved pre-pad.
T2 etudeUrl.test.ts (node): serialize->parse round-trip identity over a 6-constraint fixture matrix (incl. all advanced off + all on); golden query string for a known constraint set (exact string); defaults omitted (compactness); missing core key -> null; garbage seed ("abc", "-1", "99999999999") -> null; unknown style -> null; END-TO-END determinism: parse(golden) -> generateEtudeFor twice + a third time via a re-serialized URL -> byte-identical etude JSON (REQ-ETU-3 + REQ-ETU-15 user-facing proof, "same URL => same etude").
T3 etudeAbc.test.ts (node): golden mini etude (hand-built Etude, 2 bars, one bar-crossing note) -> exact ABC string; barline count === bars + 1; every bar's tokens sum to 8 eighths (parse durations); tie tokens present iff a note crosses; ASCII-only regex; transposeShift shifts note names, chord symbols unchanged (staff shows concert chord names - matching the repo's concert-key convention).
T4 scoreExport.etude.test.ts (node): toMusicXml(path) WITHOUT melody === byte-identical to the pre-edit golden (embed the golden string in the test - the frozen tests/ stay untouched); WITH melody: part-list has P1+P2, P2 measure count === bars, P2 divisions=2, bar-crossing note splits with tie start/stop, rests fill gaps, total duration per P2 measure === 8 divisions; empty path + melody -> still throws (existing contract).
T5 EtudeComposerPanel.test.tsx (jsdom): all 7 core controls present with aria labels; Generate disabled + title/status text carries the feasibilityOf string when draft is infeasible (build an infeasible combo: style jazz + endOn token that empties templates - reuse an assemble.test.ts fixture shape); Randomize seed fires onAccept with origin "reroll" and a uint32 seed; committed prop change re-seeds the draft; advanced <details> closed by default, 6 shipped controls inside, deferred-fields note present; status line shows loadedTitle.
T6 EtudePianoRoll.test.tsx (jsdom): svg role="img" + title; note rect count === etude.melody.length; column count === bars * 8; activeBar highlight class present iff prop set; melodySummary golden snippet (bars, note count, range words); palette constants are the Okabe-Ito hexes (structure, not pixels).
T7 EtudeViews.test.tsx (jsdom): tab defaults to roll; switching to staff mounts the lazy boundary (await Suspense; abcjs renderAbc in jsdom is proven by src/lib/sheetMusicExport.test.ts); staff container has role="img" + aria-label; renders nothing-crashing for a 32-bar etude.
T8 sessionStore.test.ts (jsdom, EDIT): acceptEtude sets constraints + dirty === { compose:"none", etude:"etude-pending-accept", explore:"none" } (the exact CoCompose shape - grep-compare literals); partialize round-trip: constraints survive set->clear-store->rehydrate, dirty does NOT; v2->v3 migration through the REAL runner (stored v2 envelope gains etudeConstraints null); resetModeSlice zeroes the new field.
T9 (edit) engine/migrations/runner.test.ts registry pin (D23).
Existing pins that MUST stay green untouched: tests/count-tunes (40), tests/pathBriefing (12), tests/ it( = 362, no-debug-logs, check:paths 36/36, check-links (README/SPEC counts unchanged - zero tests/ edits).

---

## 6. Ordered implementation checklist

1. [ ] TD-032 drive-bys first (concepts.ts definition, annotate.test.ts comment, PHASE-3-ETUDE.md errata line) - `npx vitest run engine` green. Commit: `fix(pedagogy): TD-032 drive-bys - axis definition wording, annotate fixture comment, slice-1 errata`.
2. [ ] engine/migrations/index.ts v2->v3 + runner.test.ts pin + sessionStore.ts etude slice (fields, actions, partialize, reset, version) + T8/T9. Gates: lint + `npx vitest run src/state engine/migrations`. Commit: `feat(state): session store v3 - etude constraints slice + acceptEtude dirty semantics (ADR-007 shape)`.
3. [ ] src/lib/etudeEngine.ts + T1. Commit: `feat(etude): engine adapter - memoized generation, mutable-step copy, padded HarmonicPath load shape`.
4. [ ] src/lib/etudeUrl.ts + T2 (incl. the same-URL-same-etude proof). Commit: `feat(etude): URL constraint serialization - tmode key, warn-and-drop parse, determinism round-trip`.
5. [ ] src/lib/scoreExport.ts melody second part + T4 (golden pre-edit string FIRST, then implement). Commit: `feat(export): MusicXML additive melody part (REQ-ETU-31)`.
6. [ ] src/lib/etudeAbc.ts + T3. Commit: `feat(etude): pure ABC builder - eighth grid, bar-crossing ties, chord symbols`.
7. [ ] Components: EtudePianoRoll (+ melodySummary), EtudeStaffView, EtudeViews, EtudeComposerPanel + T5/T6/T7. Verify the three new .test.tsx files run under the jsdom project (vitest output shows project name; add explicit JSDOM_FILES entries ONLY if the glob misses). Commit: `feat(ui): etude composer panel + piano roll + abcjs staff view (REQ-ETU-1/2/4/20/21)`.
8. [ ] App.tsx wiring: activeEtude state, handleEtudeAccept, boot read/restore extension, URL writer extension, panel mount (after PlaySessionRail), views mount (before showLiveScore). Manual smoke (`npm run dev:vite`): generate -> playback -> loop -> WAV export -> mode-switch dirty prompt -> reload restores URL etude -> share URL in private window reproduces byte-identical. Commit: `feat(phase-3): slice 2 etude UI wiring - panel, load pipeline reuse, URL sync, views`.
9. [ ] Full gates: `npm run lint` -> `npm test` (expect 1365 + new passing; the 2 CSS-WIP failures unchanged; tests/ it( still 362) -> `npm run build` (both configs) -> `node assets/check-links.cjs` -> `npm run check:paths` (36/36).
10. [ ] Bundle sanity: confirm abcjs did NOT enter the eager main chunk (build output: EtudeStaffView chunk separate; main chunk delta < 20 KB gz from slice-2 code).
11. [ ] Docs: append a CHANGELOG.md entry (user-facing: "Etude Composer - generate deterministic practice etudes from the Etude surface; share via URL; piano roll + staff views").

### Explicit NOT-doing (slice 2)

- NO annotation display surfaces, NO concept drawer, NO margin notes (slice 3; the engine already ships annotations, they stay data-only).
- NO metronome volume/preset/accents/subdivision, NO count-in, NO print CSS (slice 3).
- NO melody AUDIO playback (etude.melody -> audioEngine/melodyByStep): the melody ships as notation + roll only; chord backing plays through the existing chain. Follow-up candidate: seed melodyByStep strong-beat subsamples on accept.
- NO `G` keyboard shortcut (PRD 9.7; the button + URL are this slice's affordances).
- NO edits to LiveScoreDisplay / PlaySessionRail / any dirty-11 file; NO reuse-edit of leadSheet.ts.
- NO deletion/gating/replacement of the legacy Etude Assistant or src/lib/etude.ts (coexist).
- NO allowedQualities / allowedNumerals / melody-range UI (D29 deferral).
- NO catalog/count changes (tunesCount 40, curatedBriefingCount 12, tests/ 362, README/SPEC).
- NO popstate/back-forward wiring (TD-027 stands), NO pushState.
- NO share-link copy button, NO "Generated" bar-strip badge for etu- ids.
- NO new npm dependencies.

---

## 7. Risks

| Risk | P | I | Mitigation |
|---|---|---|---|
| Two replaceState writers race (etude params vs mode/transpose) | M | H | D28 forbids a second writer; single extended effect; T2 + manual smoke check both key sets survive |
| Frozen MusicXML pins break on the melody extension | L | H | Additive-only rule + T4 golden byte-identity of the no-melody path; run tests/ before committing step 5 |
| abcjs renderAbc fails in jsdom for the staff view | L | M | Proven precedent (sheetMusicExport.test.ts runs abcjs in jsdom); try/catch + fallback text keeps the component honest |
| Boot restore double-prepends the etude path (persisted K.paths + restore) | M | M | Restore checks `paths.some(p => p.id === etudePathId)` BEFORE prepending; accept handler dedupes by id (D31) |
| Bar-crossing melody notes mangle ABC/MusicXML bar math | M | M | Explicit tie/split rules in D26/D27 + dedicated fixtures in T3/T4 (hand-built note at slot 6, duration 4) |
| Padded path confuses bar labels (strip says 24+ bars, etude is N) | M | L | Inherited convention (slice-1 finding 4); whole-cycle padding keeps the loop seamless; path description + panel status line state "N-bar form, looped"; roll/staff show the true form; WAV renders once |
| Dirty "Discard" does not remove the etude path (revert machinery is step-scoped) | M | L | Documented in D30; matches legacy generated paths; honest copy in the modal exists |
| Panel draft stomp when the accept echo re-seeds the draft | L | L | Echo values equal the draft (no visible change); committed-sync compares by canonicalId, not reference |
| Scope creep into slice 3 (annotations/metronome) | M | M | Section 6 NOT-doing list; review checks the file manifest in section 4 |
| Snapshot discipline regression | L | H | PHASE-2-02 stands: fresh per-round FILE-COPY snapshots, never `git checkout --`/`reset` |
| PHASE-2-01 (live gates) | - | - | No new gate-like component; views mount condition is a render-time prop comparison (live by construction) |

## 8. Traceability

REQ-ETU-1 -> EtudeComposerPanel core controls (D22) | REQ-ETU-2 (P1, 6/9) -> Advanced details (D29) | REQ-ETU-3 -> etudeUrl + single-writer sync (D28) | REQ-ETU-4 -> Generate + Randomize seed (D22/D30) | REQ-ETU-15 user-facing -> seed display + T2 same-URL-same-etude + memo (D24/D28) | REQ-ETU-20 -> EtudePianoRoll SVG (D25) | REQ-ETU-21 -> buildEtudeAbc + EtudeStaffView via abcjs (D26, ADR-012) | REQ-ETU-31 -> toMusicXml melody part (D27) | REQ-NFR-5 -> generateEtudeFor null contract (D24) | ADR-007 dirty -> acceptEtude (D30) | ADR-011 read-once + live-gate -> boot extension + render-time view gate (D28/D31) | ADR-014 slice map -> this document's scope. Closed by inheritance (zero code): REQ-ETU-22/23/24/30. Deferred: REQ-ETU-2 remainder, REQ-PRAC-1/2/10/11, REQ-PED-4/5/7, REQ-ETU-32 (slice 3).

**End of design.**
