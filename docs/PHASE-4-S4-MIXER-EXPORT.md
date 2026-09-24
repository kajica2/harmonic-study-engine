# PRD-001 Phase 4 Slice 4 Design: Mixer + Export + Chord-Chart Paste + URL

Status: APPROVED DESIGN (from @architect research packet, 2026-09-23).
Implementation authority for @developer. Parent: `docs/PHASE-4-COMPOSE.md`
(D45..D56 + ERRATA + FIX ROUND - read ALL THREE) and
`docs/PHASE-4-S2-ANALYSIS-UI.md` (D57..D65) +
`docs/PHASE-4-S3-ACCOMPANIMENT.md` (D66..D76) - both shipped. S4 is the
FINAL Phase 4 slice. This doc FLESHES OUT the parent's S4 sketch
(D50/D51/D53 + sec 8 "S4" rows) and, at exactly TWO points, amends the
parent intent (D77 mixer architecture vs D50's live scheduler; D87
keyboard non-scope vs D50's "Space/O/A" line) - both stated explicitly
below with rationale. Everything else closes the sketch as designed.

Scope: REQ-COMP-37 (P0 mixer), REQ-COMP-40 (P0 combined MIDI export),
REQ-COMP-41 (P1 WAV full mix), REQ-COMP-43 (P2 filename key),
REQ-IO-10..16 (P0 chord-chart paste), REQ-IO-50 (P0 URL compose
portion), REQ-IO-51 (P1 fileHash in URL + cross-device restore -
IN, the machinery already exists), TD-043 close-out (tempo/meter
overrides become TRUE), GAP-3/TD-044 (fingerprint bassPc - fix
in-round), LOW-1/TD-045a (envelope clamp - fix in-round).
DEFERRED with TDs: REQ-COMP-42 stems ZIP (parent X10 pre-ruled),
REQ-IO-52 /play route, compose keyboard shortcuts.

Baseline (re-verified THIS ROUND at HEAD 2750bef, `npm test` run fresh):
1980 passed / 1 skipped / 2 failed (the 2 = pre-existing CSS-WIP
FormPlanner.test.tsx + FormTemplatePicker.test.tsx - do NOT fix).
`tests/` it( = 362 FROZEN. check:paths 36/36. count pins 40/12
untouched. Purity floor MIN_SCANNED_FILES = 33 (tree scans 34 - the
+1 slack is engine/compose/index.ts, errata D5). Dirty-11 confirmed via
git status: ChordInspector, CoComposePanel, FormPlanner,
FormTemplatePicker, InspectPanel, LiveScoreDisplay, MelodyToolbar,
PathCatalog, PracticeSessionPlayer, PracticeSetBrowser,
StylePackPicker. NONE collide with the S4 file plan (sec 6).

Standing rules for every new/edited file: ASCII only; no `console.*`
except warn/error (engine: fully silent); no `any`, no `@ts-ignore`;
relative imports; `engine/` purity absolute (allowlist: relative-only,
no packages, no node:*, no clock, no Math.random); `tests/`,
`src/lib/studies.ts`, `src/lib/theory.ts` (FROZEN, D47),
`src/lib/paths.ts`, README/SPEC/AGENTS/.kai OFF-LIMITS;
`rhythm.ts`/`backingEngine.ts`/`playbackClock.ts`/`audio.ts` OFF-LIMITS
(the compose player touches NONE of them - D88); new
`src/components/**/*.test.tsx` auto-register via the vitest JSDOM_FILES
glob (verified present); src/lib + engine tests are node-project and
drift-gate-invisible; PHASE-2-01 live-gate + PHASE-3-03 StrictMode
one-shot apply to every new effect; FILE-COPY snapshots, never
`git checkout --` (PHASE-2-02); TD-040 guardrail: zero etude mode-UI
changes; honesty rule: a tooltip/label that describes behavior MUST
describe what the code does (TD-043 close-out, D79).

---

## 1. Re-audit (anchors verified at HEAD 2750bef; cite search strings, not line numbers)

| Anchor | Location | Verified content |
|---|---|---|
| The absorb seam | src/lib/composeVoices.ts, search `The SHARED voice recipe`; src/lib/composePreview.ts, search `RENDER-AND-PLAY` | composeVoices exports `VOICE_RECIPES: Record<AccompRole, VoiceRecipe>` + `scheduleComposeNote(ctx: BaseAudioContext, dest, role, midi, whenSec, durSec, vel)` - BaseAudioContext-typed, works offline AND live (the S3 doc's D72 seam promise is real in the code). composePreview exports the pure math (`previewFullSec/previewIsCapped/previewRenderSec/previewFrameCount`), `renderAccompaniment(result, project)` (OfflineAudioContext mono 44.1k, master 0.9, 90s cap, notes past cap skipped) and the `composePreviewPlayer` singleton (`getState/subscribe/markRendering/cancel/play(buffer)/stop`, lazy live AudioContext, idle->rendering->playing). jsdom has NO OfflineAudioContext (tests/setup.ts) - S3 unit-tests the PURE surfaces only; render path is e2e + manual (loopWav precedent). |
| LOW-1 envelope bug (TD-045a) | src/lib/composeVoices.ts, search `env.gain.exponentialRampToValueAtTime` | Lines: sustain-ramp target `start+attack+decay`; hold `setValueAtTime(sustain, max(end, start+attack+decay))`; release-ramp target `end+releaseSec`. When `end+release < start+attack+decay` (durSec+release < attack+decay - pad: 0.3+0.5 = 0.8s hold floor vs short notes at fast tempos), the release ramp's endTime precedes the hold event's time -> Web Audio throws or clamps (spec: events must be non-decreasing; exponentialRamp to a time before the last event is an ordering violation). TD-045a's proposed fix (`clamp rel = max(end, start+attack+decay)`) is exactly right; D90 lands it as a PURE helper so jsdom can pin it. |
| Panel preview button + honest strings | src/components/AccompanimentPanel.tsx, search `accomp-preview` / `NOT applied until the mixer` | Button `data-testid="accomp-preview"` + `data-preview={previewState}` + tooltip "Uses the project tempo map: the tempo override is NOT applied until the mixer." - the S3 honesty string. S4 KEEPS this button (accompaniment-only quick check, mutation-proven S3 tests survive untouched) and adds the MIXER transport beside it (D77); the tooltip string becomes TRUE and must be UPDATED (D79) - panel + its component test are clean and editable. |
| Tempo-override tooltip is LYING | src/components/AnalysisCard.tsx, search `affects playback and export` | `title="affects playback and export"` on the tempo NumberField (testId `tempo-input`). Today NOTHING consumes `overrides.tempoBpm` (grep: consumers are the tooltip + the D46 comment only). D79 makes it true at the single `effectiveProject` choke point. AnalysisCard is CLEAN (not dirty-11). |
| effectiveProject choke point | src/components/ComposeSurface.tsx, search `MED-NEW-001` no - search `effectiveProject = useMemo` | ONE memo patches `timeSignatures` from `overrides.timeSignature` and EVERYTHING downstream (analysis re-run, `renderAccompaniment`, roll) consumes the patched project. Adding the tempo patch HERE (D79) makes the override true for preview, mixer, WAV and MIDI export simultaneously - zero other call-site churn. |
| Store v4 compose fields | src/state/sessionStore.ts, search `S3/S4 fields (request/mixer) widen ComposeSession later WITHOUT a v5` | The shipped header comment pre-authorizes S4 fields WITHOUT v5 (D57/D73 pattern: optional persisted field, default at read). `ComposeSession = {fileName, fileHash, overrides, analyzeFull, request?}`; partialize keeps composeSession only; `setComposeFile` KEEPS request across file swap ("taste, not file state"); result in-memory. D85/D84 widen with `mixer?` + `chartText?` - SAME pattern, NO v5. |
| Fingerprint omits bassPc (GAP-3/TD-044) | engine/compose/accompany.ts, search `gridFingerprint` | Serializes `bar:rootPc.qualitySymbol` only. TD-044 said "no UI path today writes bassPc" - S4 CHART PASTE WRITES THEM ("Em7/A" -> bassPc via the shared grammar), so the staleness chip must catch bassPc edits. D89 fixes the tuple (result is in-memory-only -> NO persisted-format migration concern). |
| Chord grammar authority | src/lib/chordInput.ts, search `REJECT anything the grid cannot hold` | Pure (imports engine/core/chords + engine/compose/types ONLY - no DOM, no clock, no console). `parseChordSymbol(raw)` -> `{rootPc, qualitySymbol, bassPc}` | null (rejects "C13", "C7#9", inner whitespace, non-chord-tone slashes like "C/D"); `buildCellFromSymbol(p, key)`; `suggestChordSymbols`. THE packet's "reuse as the token validator" REQUIRES an engine move (engine -> src imports are purity-ILLEGAL; D53's "local recognizer" would duplicate the grammar and drift). Consumers: ChordCellPopover + its test (import paths survive via a shim - D82). |
| @tonejs keySig bug (errata D6) | node_modules/@tonejs/midi/dist/{Encode,Header}.js | VERIFIED AT THE BYTE LEVEL: `encodeKeySignature` writes `key: keySignatureKeys.indexOf(key) + 7`; `keySignatureKeys` is the circle of fifths starting "Cb" (index 0 = sf -7), so the correct SMF signed byte is `indexOf - 7` - the encoder is off by exactly +14. midi-writer does `writeInt8(event.key)`; the READER (`Header.js` line ~77: `keySignatureKeys[event.key + 7]`) is CORRECT. Pre-compensation is IMPOSSIBLE (index space does not wrap). `Track` has NO addMetaEvent API. D80 routes around the broken path entirely. |
| midi-file is ALREADY in the bundle | node_modules/midi-file (1.2.4, hoisted, zero-dep, MIT); package-lock line 2258 | It is @tonejs/midi's dependency -> Vite already ships it in the app bundle. Direct import adds ZERO bundle bytes, ZERO supply chain, ZERO lockfile churn; only a package.json DECLARATION (D80). parseMidi/writeMidi round-trip is the library's purpose. |
| @tonejs encoder preserves what REQ-COMP-40 requires | node_modules/@tonejs/midi/dist/Encode.js, search `programChange` / `encodeTempo` / `encodeTimeSignature` | Encoder writes tempos, timeSignatures (both round-trip-pinned by S1's composeMidi.test.ts) AND programChange per track (line ~80) - GM programs survive export. `Midi.header.ppq` + `header.tempos[].ticks/bpm` + `header.timeSignatures[].ticks/timeSignature` are settable. |
| encodeWav is PRIVATE | src/lib/loopWav.ts, search `function encodeWav` (line ~32) | Hand-rolled RIFF (mono, 16-bit PCM, 44.1k) - NOT exported. `downloadWavFromBlob(blob, filename)` IS exported (line ~510). loopWav.ts is NOT off-limits and NOT dirty -> ADDITIVE `export` keyword on encodeWav + import from the compose exporter (D81). No duplication (a second RIFF writer would drift). |
| ZIP precedent exists | src/lib/midiBatchExport.ts, search `zipBatchExport` | fflate `zipSync` + `strToU8` -> Blob, proven in etude-land. Proves the stems-ZIP mechanics are cheap - but parent X10 ALREADY PRE-RULED "42 deferred (P2 honesty)". D81 keeps the deferral, TD-046 records that D77's per-group buffers make stems nearly free later. |
| URL single-writer | src/App.tsx, search `a second debounced read-modify-write effect` / src/lib/etudeUrl.ts; ADR-015 | ONE debounced 200ms `history.replaceState` writer (mode + transpose + etude keys via `serializeEtudeConstraints` record; null deletes). `shouldScheduleUrlWrite` predicate lives in src/lib/urlSyncPredicate.ts (pure, tested, TESTER GAP-1 pin). A SECOND writer is structurally banned (lost-update race). Compose keys RIDE THIS WRITER (D86) - a small, ARCHITECTURE-SANCTIONED App.tsx edit (~20 lines boot + ~6 lines write). |
| Space is GLOBAL practice playback | src/App.tsx, search `e.code === "Space"` | The window keydown handler is NOT mode-gated: Space -> `requestPlayState(toggle)` fires in ALL modes (pre-existing quirk: in Compose mode it starts hidden practice audio). D50's sketch ("Space/O/A routing: one mode-gated branch in App's existing key handler") would edit this sacred handler. D87 DEVIATES: zero key-handler edits, button-only mixer (the PRD requires no compose keys); the pre-existing Space quirk gets TD-048. |
| audio.ts buses | src/lib/audio.ts, search `private compressor` / `getMelodyBusInput` | audioEngine owns a lazy ctx + masterGain/compressor/melodyBus (D33). D50's `getMixBusInput()` proposal would couple compose to audioEngine's INIT LIFECYCLE (audioEngine may never have booted in Compose mode). D88 REJECTS the audio.ts edit: compose player keeps its OWN ctx + master 0.9 (S3 shipped exactly this; recipe peaks are conservative; no limiter need proven). |
| analyzeProject on empty tracks | engine/compose/normalize.ts search `noNotes` (line ~255); engine/compose/index.ts search `percussionOnly` | Zero-note input FAILS with noNotes - the chart-paste path must BYPASS normalize+analyze and construct `NormalizedProject` + `ComposeAnalysis` LITERALLY (D83's `buildChartSession`). All-rest grids downstream are already handled honestly (S3 D74 #6). |
| ChordGrid shape (Phase 5 seam) | engine/compose/types.ts, search `interface ChordGrid` / `slotsPerBar stays the NOMINAL default` | `{slotsPerBar, bars: BarRegions[]}`, per-bar `slots.length` VARIES (D60 append-merge; TD-043 pins per-bar reads). A chart parser returning THIS shape flows into `generateAccompaniment` UNCHANGED (REQ-IO-16) and into Phase 5's Explore->Compose progression handoff (same shape, no adapter). Confirmed compatible. |
| ModeGate pins | src/components/ModeGate.test.tsx, search `Drop a .mid file` | 13 assertions are PRESENCE checks (getByText regex) - adding a "Paste a chord chart" button to the empty state does NOT break them (S2's UploadDropZone precedent). The three pinned strings stay verbatim. |
| Download in e2e | playwright.config.ts; e2e/*.spec.ts | No existing spec asserts a download. Playwright `page.waitForEvent("download")` + `download.path()` works on chromium with `acceptDownloads` (default ON since 1.x). The export legs use it; if the served-dist download proves flaky, fall back to asserting the object-URL/anchor via a data-attribute + manual (documented in test plan, RK-S4-6). |
| spellKey does NOT exist | engine/core/spelling.ts, search `export function` | The packet's "spellKey exists" is FALSE. `parseKey(raw)` (handles "C major" style strings) and `spellTonic(pc, mode, literal)` DO exist - `spellTonic(tonicPc, mode, "")` is the filename-key API (D80). Flagged so the developer does not hunt for it. |
| Gate floors | vitest.config.ts; assets/check-links.cjs | JSDOM glob `src/components/**/*.test.tsx` present (new component tests need NO config edit). check-links counts it( in tests/ ONLY (362 - untouched; src/lib + engine + component tests are invisible). docs/ not scanned. `npm run build` = two configs; neither touches new files. |

---

## 2. THE two architecture warnings (read before anything else)

**W1 - the mixer is NOT a DAW.** PRD sec 7.2 excludes multi-track
mixing/effects; REQ-COMP-37's "per-group" is THE 4 DEFINED GROUPS:
Original (the file), Bass, Chords, Pad. No EQ, no sends, no per-track
rows, no automation lanes. The mixer UI is 4 rows x (level slider, M,
S). Everything else in this doc serves exactly those 4 buses.

**W2 - the PRD's export grammar is the CONTRACT, not the sketch.**
REQ-COMP-40 says "preserving tempo map and time signatures" - keySig is
NOT in the requirement text (verified: PRD sec 8.2 table). The
errata-D6 landmine ("do not rely on the @tonejs encoder for key
signatures") is therefore about a BONUS, not the requirement. D80
decides the bonus honestly (insert correct events via the already-
bundled midi-file; golden test asserts equality) with a one-line
fallback (skip keySigs) if the insertion fights the dev.

---

## 3. Decisions (D77..D92, continuing the parent numbering)

### D77 (MIXER ARCHITECTURE - THE HEADLINE): per-group BAKED buffers + live GainNode buses. NOT a live scheduler, NOT re-render-per-knob.

The packet framed the choice as baked-re-render (A) vs live-scheduler
(B, the parent D50 sketch). Both are wrong on the merits:

- A (re-render on every mixer change): a 90s offline render is
  100-500ms; dragging a slider re-renders per frame - UX-hostile, and
  the PRD's "playback must be mixed with per-group volume" implies
  LIVE knobs. REJECTED.
- B (setInterval lookahead scheduler, D50 sketch): a real mixer, but a
  NEW transport surface (clock, drift, note-window bookkeeping,
  pause/seek semantics nobody asked for), untestable in jsdom at the
  scheduling level, and it must still NOT touch rhythmEngine/
  playbackClock (packet constraint) - so it is a from-scratch
  mini-transport. The PRD has no seek/loop/pause requirement for
  Compose. REJECTED for cost/surface, not for capability.
- **C (CHOSEN): render each group ONCE to its own AudioBuffer (4 mono
  OfflineAudioContext renders in parallel), then play the 4 buffers
  through 4 GainNodes on one live AudioContext, started at the same
  instant.** Volume/mute/solo are AudioParam writes on the gain nodes -
  INSTANT, zero re-render. Re-render happens only when CONTENT changes
  (regenerate, new file, tempo override, meter override) - which is
  semantically correct. Sync is sample-accurate (same ctx, buffers
  started together, no drift by construction).

Why C is the honest middle: it satisfies REQ-COMP-37's literal text
("mixed with original tracks; per-group volume and mute/solo") with
real-time knob response, absorbs the S3 singleton IN PLACE (the
state machine idle->rendering->playing is unchanged - S3's
mutation-proven pure-surface tests survive), keeps the jsdom test
strategy identical to S3 (pure math + e2e browser + manual), and adds
ZERO transport surface. What C gives up vs B: seek/pause/loop (no PRD
require), and instant content-change audition (a regen costs one
~0.5s render on next Play - acceptable, labeled "rendering").

Seam details (composePreview.ts EDIT, in place - the file S3 named as
the absorb target):

```ts
// src/lib/composePreview.ts (EDIT - additive; existing exports UNCHANGED:
// previewFullSec/previewIsCapped/previewRenderSec/previewFrameCount/
// renderAccompaniment/markRendering/cancel/play(buffer)/stop/subscribe -
// the panel preview button keeps working byte-identically.)
export type MixGroup = "original" | "bass" | "chords" | "pad";
export interface MixRenderInput {
  readonly project: NormalizedProject;      // EFFECTIVE (overrides applied, D79)
  readonly result: AccompanimentResult | null;
  readonly tracks: readonly OriginalVoiceNote[]; // D78 mapping, [] for chart
  readonly endTick: number;                 // max(project.endTick, result.meta.endTick)
}
export async function renderMixGroups(input: MixRenderInput):
  Promise<Partial<Record<MixGroup, AudioBuffer>>>;   // 4x OfflineAudioContext, Promise.all

// Singleton gains (state machine + subscribe contract unchanged):
playMix(buffers: Partial<Record<MixGroup, AudioBuffer>>): void;
applyMix(gains: Readonly<Record<MixGroup, number>>): void; // setTargetAtTime 0.02 - live knobs
// stop() now tears down up to 4 sources + gains (same idempotent semantics).

export function computeGroupGains(m: MixerState, hasOriginal: boolean):
  Record<MixGroup, number>;  // PURE: level * (muted || (anySolo && !solo && !thisSolo) ? 0 : 1);
                             // original with hasOriginal=false -> 0.
```

`MixerState` + `MixGroup` data types live in engine/compose/types.ts
(additive - plain serializable session data; the store, mixer UI and
player all import from the engine model, no src->lib type coupling).
`computeGroupGains` lives with the player (src, jsdom-pure - table
tested in node). 90s cap applies to the AUDITION (all 4 groups share
`previewRenderSec`); WAV export uses its own cap (D81). Memory: 4 x
90s mono float32 ~= 64MB worst case - fine (S3 already bakes one).

StrictMode/PHASE-3-03: ONE singleton (the existing one) - a
double-mount cannot leak a second ctx; `playMix` stops prior sources
first (same `stopSource` discipline, now per-source list).

Confidence: HIGH.
### D78 (ORIGINAL-GROUP VOICE MAPPING): one "Original" bus = every NON-PERCUSSSION track, each voiced by its ROLE'S recipe. Percussion skipped with disclosure. No double-voicing.

Mapping (merged roles - the user's role overrides drive it; a track's
OWN notes are voiced, never the extracted top-line):

| TrackRole | Recipe | Notes |
|---|---|---|
| melody | "lead" (NEW recipe, D90) | The tune line as the file wrote it. |
| bass | "bass" | Same triangle recipe as generated bass. |
| harmony | "chords" | Two detuned sines; polyphonic tracks stack. |
| unknown | "chords" at 0.7x peak | Honest default; the mixer row exists because a practice tool should still HEAR the file's content. |
| percussion | SKIPPED | Channel-9 GM drums as synthesized voices = scope creep (a "simple kit" is noise bursts pretending to be a ride cymbal). The mixer row label says "Original (drums not played)" - disclosure, not silence. MIDI EXPORT still includes the percussion track (export is data, not mix - D80). |

`OriginalVoiceNote = { voice: MixVoice; midi; tick; durationTicks; velocity }`
is derived PURELY (exported for tests):

```ts
// src/lib/composePreview.ts (EDIT) - pure mapper, node-testable:
export function mapOriginalTracks(project: NormalizedProject,
  roles: readonly TrackRoleAssignment[]): readonly OriginalVoiceNote[];
// skips isPercussion, skips empty-note tracks, sorts by tick.
```

Why NOT "melody + harmony only" or "all tracks as separate rows":
W1 - 4 groups is the PRD's contract; separate rows re-open the DAW
gate. Why not the extracted melody: it is a VIEW over existing tracks
(synthesized top-line) - voicing it on top of its source tracks would
double the melody (the packet's "don't double-voice" warning). The
roll keeps showing the extracted melody (S2/S3 behavior, unchanged).

Chart-paste sessions have `tracks: []` -> Original group is empty:
the mixer row renders DISABLED with "no file - chart only" (D84),
`computeGroupGains` forces it to 0, and export/WAV skip it.
Confidence: HIGH.

### D79 (TD-043 CLOSE-OUT - the tempo/meter overrides become TRUE at ONE choke point): engine `withTempoOverride` + the existing effectiveProject memo.

```ts
// engine/compose/tempo.ts (EDIT - additive pure helpers, node-tested):
export function withTempoOverride(project: NormalizedProject, bpm: number | null): NormalizedProject;
// bpm null -> SAME object (identity preserved, memo-friendly);
// else tempos := [{tick: 0, bpm}] (the override REPLACES the file's
// tempo map - documented: a fixed practice tempo, not a tempo-map edit).
export function withTimeSignatureOverride(project, ts: readonly [number, number] | null): NormalizedProject;
// null -> identity; else timeSignatures := [{tick: 0, num, den}]
// (byte-identical to the inline patch ComposeSurface does TODAY -
// hoisted here, no behavior change).
```

ComposeSurface's `effectiveProject` memo becomes
`withTimeSignatureOverride(withTempoOverride(composeProject, overrides.tempoBpm), overrides.timeSignature)`.
EVERY downstream consumer (analysis re-run, `renderAccompaniment`
panel preview, `renderMixGroups` mixer, WAV export, MIDI export, the
roll's time axis) now honors both overrides with ZERO further call
changes - one truth (D46) at one point.

HONESTY EDITS (the lying tooltip + the S3 string):
- AnalysisCard tempo field title -> "affects playback and export"
  stays VERBATIM - it is now TRUE (do not touch the string; the code
  caught up to it).
- AccompanimentPanel preview tooltip: "the tempo override is NOT
  applied until the mixer" -> "Uses the effective tempo (overrides
  applied)." (string edit in panel + its component test -
  AccompanimentPanel.test.tsx line ~243 pins the substring "tempo
  override is NOT applied" via toContain; the e2e spec pins only the
  data-preview state machine and survives UNEDITED).
- REQ-COMP-40's "preserving tempo map" + the override: export writes
  the EFFECTIVE project's map - no override -> the file's map
  preserved (the golden test pins BOTH arms).
Meter-override re-analysis already exists (S2) - unchanged.
Confidence: HIGH.

### D80 (COMBINED MIDI EXPORT - REQ-COMP-40/43): src/lib/composeExport.ts (adapter-land, @tonejs allowed); keySig via midi-file EVENT INSERTION (bypass the broken encoder path entirely).

```ts
// src/lib/composeExport.ts (NEW)
export interface ComposeExportInput {
  readonly project: NormalizedProject;              // EFFECTIVE (D79)
  readonly result: AccompanimentResult | null;      // generated groups
  readonly roles: readonly TrackRoleAssignment[];   // merged (channel map uses tracks)
}
export function buildCombinedMidiJson(input): Midi;          // @tonejs Midi, pure-aside-from-lib
export function encodeComposeMidi(input): Uint8Array;        // toArray() -> keySig insert (below)
export function composeExportFilename(base, key: KeyCandidate | null, ext): string;
export function downloadComposeMidi(input): void;            // Blob + anchor (download.ts helper, D81)
```

Track plan:
- One Midi track per ORIGINAL NormalizedTrack (INCLUDING percussion,
  channel 9 preserved) - notes via `track.addNote({ticks, durationTicks,
  midi, velocity: vel*127})`; channel + program carried (encoder writes
  programChange - audit row verified). Original notes export
  UNTRANSPOSED (REQ-TRANS-3 / D50: the file's key is respected).
- One Midi track per generated role present in `result.meta.roles`
  (bass/chords/pad), GM programs: bass 33 (Electric Bass Finger -
  generic), chords 0 (Acoustic Grand), pad 89 (Pad - warm); channels =
  first UNUSED of 0..15 excluding the originals' channels (deterministic
  ascending pick; 9 reserved-skip for non-percussion generated roles).
  Generated notes carry their PLAN-time transpose already baked
  (S3 D71) - export never re-transposes.
- The extracted melody is NOT a track (D78's no-double-voice rule).
- Header: ppq + tempos + timeSignatures from the EFFECTIVE project
  (REQ-COMP-40 text, literally). Chart-paste sessions: the synthetic
  project's single tempo/meter (ppq 480) - same code path (D53's
  "identically" goal).

KEY SIG - the decision (W2):
`midi.header.keySignatures` is LEFT EMPTY (the buggy `encodeKeySignature`
path is never fed). After `midi.toArray()`, the bytes go through
`parseMidi` (midi-file), and correct `{type:"keySignature", deltaTime,
key: sf, scale}` events are INSERTED into track 0 at the right
cumulative ticks (project.keySignatures, tick-ordered; sf table below),
then `writeMidi`. The broken encoder is bypassed, not patched - if
@tonejs ever fixes theirs, our output is unaffected (we never wrote
their bytes). midi-file becomes a DECLARED direct dependency
(package.json +1 line; it is ALREADY in the lockfile tree at 1.2.4 and
ALREADY in the bundle via @tonejs - zero download, zero bundle delta).
sf table (major): C 0, G 1, D 2, A 3, E 4, B 5, F# 6, C# 7, F -1,
Bb -2, Eb -3, Ab -4, Db -5, Gb -6, Cb -7; minor = relative (A 0, E 1,
..., D -1, G -2, C -3, F -4, Bb -5, Eb -6, Ab -7, Db -5+1=-... developer:
derive minor sf = major sf of the relative tonic; table-test all 24
against the SMF spec values). Out-of-range theoretical keys (e.g. Gb
minor = -9): SKIP the event + the export adds no warning channel -
documented degradation in the function header (SMF sf is [-7,7]).
FALLBACK (if insertion fights the dev): drop the midi-file import,
export without keySig meta, and assert DEGRADATION in the golden test
(REQ-COMP-40 text still met - keySig is not in the requirement; file a
TD). The primary path is preferred; the fallback is honest.

GOLDEN TEST (the strongest pin available, node env):
project fixture (2 tempos, 2 time sigs, 2 key sigs, 3 tracks incl.
channel-9, generated result) -> encodeComposeMidi -> `readMidiFile`
(S1's own adapter!) -> normalize -> assert: ppq EQUAL, tempos EQUAL,
timeSignatures EQUAL, keySignatures EQUAL (kills the errata-D6 landmine
with a test - the round-trip now WORKS, by insertion not by luck),
per-track note tuples (tick, midi, durationTicks, vel-quantized-to-
nearest-1/127) EQUAL, track COUNT = originals + roles. Second pin:
tempo-override input -> exported map is the single override tempo.
Third: chart session -> no original tracks, generated present.

REQ-COMP-43 (P2, ships): filename = `<sanitizedBase>_accomp_<Key>.<ext>`
where Key = `spellTonic(tonicPc, mode, "")` of the MERGED key
(candidates[0]); `chromaticFallback` or no key -> omit the key segment
(`<base>_accomp.mid` - never a fake key). Base = project.fileName minus
extension (chart sessions: "chart"). Sanitize: strip [\\/:*?"<>|] +
collapse whitespace to "_".

Confidence: HIGH (insertion path MEDIUM-HIGH - the fallback is one
commit-local switch; every other element is pinned).

### D81 (WAV FULL MIX - REQ-COMP-41 P1; stems DEFERRED): reuse loopWav's RIFF encoder (export it, do NOT duplicate).

- `src/lib/loopWav.ts` EDIT: add `export` to `encodeWav` (one keyword,
  zero behavior change; loopWav's own tests keep passing - it is
  src/lib, node-env, editable but untouched). VERDICT: reuse, not
  duplicate - a second hand-rolled RIFF writer is a drift liability
  (D47's tables-not-algorithms logic inverts here: the encoder is a
  TABLE of byte offsets, cheap to share, expensive to fork).
- `src/lib/composeDownload.ts` NEW (3 helpers, or fold into
  composeExport.ts - FOLD, keep the file count honest):
  `downloadBlob(blob, name)` (createObjectURL + anchor + revoke -
  pattern copied from loopWav.downloadWavFromBlob, generalized).
- Full-mix render: ONE OfflineAudioContext over ALL groups with the
  CURRENT mixer gains baked (D77's renderMixGroups internals, summed to
  one destination at their computeGroupGains levels) -> mono Float32 ->
  encodeWav -> Blob. Cap: `EXPORT_CAP_SEC = 600` (10 min) with honest
  label ("WAV renders up to 10:00"); beyond, truncate + notice (the
  90s AUDITION cap does NOT apply to export). Mono 44.1k 16-bit
  (REQ-IO-31 stereo/SR selection is P2 - documented carve-out).
- Stems ZIP (REQ-COMP-42, P2): **DEFERRED** per parent X10
  ("42 deferred (P2 honesty)"). TD-046 records that D77 makes it
  nearly free (the 4 group buffers + midiBatchExport.zipSync precedent)
  - a fast-follow, not a redesign.
- Mixer UI buttons: [Export MIDI] + [Export WAV] call the surface
  handlers; disabled while `previewState === "rendering"` or when
  there is nothing to export (no result AND no original tracks ->
  both disabled; original-only export IS legal - exporting the file's
  MIDI back is a no-op-ish but the WAV of original-only is a real
  use case "hear my file synthesized").
Confidence: HIGH.

### D82 (GRAMMAR MOVE - the packet's "reuse chordInput" made purity-legal): chordInput.ts core MOVES to engine/compose/chordsym.ts; src keeps a re-export shim.

engine -> src imports are purity-ILLEGAL, so "reuse as the token
validator" forces the move (D53's "local recognizer" alternative is
REJECTED: two grammars for one ChordCell contract is exactly the drift
the S2 header warns about).

- `engine/compose/chordsym.ts` (NEW engine source): `parseChordSymbol`,
  `buildCellFromSymbol`, `suggestChordSymbols`, `ParsedSymbol`, the
  ROOT_PC/SUFFIX tables - MOVED VERBATIM (the file is already pure:
  imports only engine/core/chords + engine/compose/types). Header note
  records the move + the D61 contract ("REJECT anything the grid
  cannot hold") - the paste parser inherits the reject semantics for
  FREE (REQ-IO-15's "non-chord token" is D61's null).
- `src/lib/chordInput.ts` EDIT: becomes a 5-line re-export shim
  (`export { parseChordSymbol, buildCellFromSymbol,
  suggestChordSymbols } from "../engine/compose/chordsym";
  export type { ParsedSymbol } ...`). ChordCellPopover + every existing
  importer keep compiling UNTOUCHED.
- `src/lib/chordInput.test.ts` MOVES to
  `engine/compose/chordsym.test.ts` (import "./chordsym") - same test
  count, node-env either way (both invisible to check-links).
Confidence: HIGH.

### D83 (CHART PARSER - REQ-IO-10..13/15/16): engine/compose/chordchart.ts (pure) -> ChordChart + synthetic session builders.

The parent named `engine/io/chordchart.ts`; S4 puts it in
`engine/compose/` instead (FLAGGED parent-sketch deviation, S3's
assemble->accompany precedent): the parser is compose-domain (it
produces ChordGrid + consumes chordsym), and a one-file `io/` dir
contradicts D75's flat-compose-family convention.

```ts
// engine/compose/chordchart.ts (NEW engine source)
export interface ChartDirectives {
  readonly key: KeyCandidate | null;      // {key: C} / {key: F# minor}
  readonly tempoBpm: number | null;       // {tempo: 118}
  readonly timeSignature: readonly [number, number] | null; // {time: 6/8}
  readonly styleId: StyleId | null;       // {style: jazz} (shippedStyleIds-validated)
}
export interface ChordChart extends Versioned {   // version: 1
  readonly directives: ChartDirectives;
  readonly grid: ChordGrid;               // THE Phase 5 seam - same shape, always.
  readonly bars: number;
  readonly warnings: readonly string[];   // REQ-IO-15: non-fatal, one per bad token/directive
}
export function parseChordChart(text: string): Outcome<ChordChart>;
export function buildChartSession(chart: ChordChart, fileName?: string): {
  readonly project: NormalizedProject;    // synthetic (D53): ppq 480, ONE tempo/meter,
                                          // tracks: [], keySignatures from directive,
                                          // endTick = bars * ticksPerBar
  readonly analysis: ComposeAnalysis;     // grid = chart.grid, roles: [],
                                          // key = directive-as-candidates OR
                                          // chromaticFallback (no directive),
                                          // melody empty, window = whole, annotations:
                                          // honest "Pasted chart: N bars ..."
};
```

GRAMMAR (exact, testable):
1. Directive lines: `^\{(\w+)\s*:\s*([^}]+)\}$` (case-insensitive name).
   Unknown name -> warning; bad value -> warning + that directive null.
   key value via `parseKey` (bare letter = major; "Cm"/"C minor" honor
   minor if parseKey accepts, pinned by test); tempo: finite number in
   [20, 300]; time: `^(\d{1,2})/(\d)$` den power-of-2 in {1,2,4,8,16,32},
   num 1..16; style: `shippedStyleIds()` membership.
2. Body: strip `|` characters (REQ-IO-13 - "|C|Am|" -> tokens C, Am),
   split on whitespace/newlines. Each TOKEN = ONE BAR (REQ-IO-11).
   Cap: 512 bars -> `unsupported` error arm ("chart too long").
3. `%` = repeat the PREVIOUS bar's cells verbatim (REQ-IO-12). Leading
   `%` (no previous) -> rest bar + warning.
4. Rest tokens: `-`, `0`, `r` (case-insensitive) -> restCell().
5. Slash rule (the ambiguity the PRD did not see - REQ-IO-11's bar
   split vs chordInput's slash bass): try `parseChordSymbol` on the
   WHOLE token FIRST; if it parses (e.g. "Em7/A" - slash bass, chord
   tone honored), it is ONE cell. If it fails, split on "/" and parse
   each side: both parse -> TWO cells in the bar (e.g. "C/Am"; note
   "C/G" parses whole -> slash bass, NOT a split - documented, tested,
   deterministic); either side fails -> the failing side is a warning
   token and the parsing side still lands (best-effort, non-fatal).
   A 2-cell bar gets slots.length 2 (variable-length bars are legal -
   D60/TD-043; `slotsPerBar` = 2 if ANY bar splits, else 1).
6. Non-chord token -> restCell() + warning `bar N: '<tok>' is not a
   chord symbol` (REQ-IO-15 - NEVER an error arm unless the chart is
   empty after parsing -> `noNotes`-style "unsupported" with message
   "no chord symbols found").
7. All randomness: NONE. All clock: NONE. ASCII only (the parser
   REJECTS non-ASCII tokens with a warning - the whole repo is ASCII).

Output flows UNCHANGED into `generateAccompaniment` (REQ-IO-16 - the
grid is the grid) and into D77/D80/D81 (synthetic project = a project;
export/mixer/WAV never special-case charts). Phase 5's Explore->
Compose handoff feeds the SAME `ChordGrid` (seam verified: ChordGrid
is the parser's output field, not an adapter).
Confidence: HIGH.

### D84 (CHART-PASTE UX + STORE): empty-state entry, editable PREVIEW grid before commit, chartText persisted (no v5), auto-heal on reload.

- `ComposeSession` (EDIT): `chartText?: string | null` + `mixer?:
  MixerState | null` - OPTIONAL persisted fields, default at read,
  NO v5 (D57/D73's shipped comment is the authority). Actions:
  `setComposeChart(chartText, project, analysis)` (sets session with
  fileName "Chord chart (pasted)", fileHash null, EMPTY_OVERRIDES,
  KEEPS request + mixer like setComposeFile does; nulls
  composeAccompaniment), `setComposeMixer(state)`,
  `restoreComposeSessionFromUrl(session)`. `setComposeFile` CLEARS
  chartText (a real file supersedes a chart); `clearCompose` resets.
- Empty state gains a secondary button `[Paste a chord chart]` (the 3
  ModeGate-pinned strings stay verbatim - presence pins, additive
  element is legal, S2's drop-zone precedent).
- `src/components/ChartPastePanel.tsx` (NEW): textarea + live-parse
  footer ("N bars, key Bb, warnings: 2") + [Cancel] + [Use chart].
  The PREVIEW GRID (REQ-IO-14) renders below the textarea: bar chips,
  each cell an inline text input; edits re-parse via
  `parseChordSymbol` (same reject ring as the popover - red on reject,
  the D61 contract); edits mutate the PARSED CHART LOCALLY (component
  state) before commit - "editable BEFORE generating" is literal.
  [Use chart] commits: rebuild grid from edited cells ->
  buildChartSession -> store.
- Loaded-chart state: ComposeSurface renders a compact
  `ChartSummaryCard` (inline in ComposeSurface, ~40 lines - directives
  readout + [Edit chart] back to the paste panel + [Start over])
  INSTEAD of AnalysisCard (the card's key-confidence/melody-track UI
  is meaningless for a chart), then the SAME AccompanimentPanel +
  ComposeMixer + roll. Post-commit cell edits = [Edit chart] round
  trip (the popover grid is the S2/MIDI-path affordance; duplicating
  it for charts is Phase 8's editor, REQ-IO-20).
- Reload: `chartText` is TEXT - no re-upload prompt. Surface boot
  effect (StrictMode one-shot ref per PHASE-3-03): session present +
  project null + chartText present -> rebuild (parse + buildChartSession
  are pure + sub-ms) -> loaded. The MIDI-path prompt state is
  untouched.
- The accompaniment request's styleId pre-syncs from the `{style:}`
  directive ONCE at commit (user can still change it in the panel -
  the directive is a suggestion, not a lock; honest label in the
  summary card).
Confidence: HIGH.

### D85 (MIXER STATE PLACEMENT): inside composeSession (per-session taste), NOT K.composeMixer.

The packet's fork: global prefs (metronomeConfig precedent) vs
composeSession. DECISION: composeSession, because mixer levels are
INHERENTLY about THIS song ("mute this file's muddy bass"), the
session already travels with the file (restore flow) AND with the URL
(D86) - a global K-key would leak song-specific balances across files
and could not serialize into the share URL coherently. The "taste
survives file swap" wrinkle (D73's rule for request): mixer KEEPS on
setComposeFile TOO (consistent with request; resetting on every
re-upload of the same file during the prompt flow would be worse).
Shape (engine/compose/types.ts, plain + versioned-by-parent):

```ts
export interface MixerGroupState { readonly level: number; readonly muted: boolean; readonly solo: boolean; }
export type MixerState = { readonly [g in MixGroup]: MixerGroupState };
// defaults (exported MIXER_DEFAULTS): level 1 all; original 1 / bass 1 /
// chords 1 / pad 0.8 (the pad recipe's peak is already low; 0.8 is the
// taste default, documented); muted/solo false.
```

`setComposeMixer` does NOT touch undo stacks (D59 scope unchanged) and
does NOT dirty anything (DirtyMap.compose stays the literal "none",
ADR-007). UI: `src/components/ComposeMixer.tsx` (NEW) - 4 rows: label
(+ disclosure strings: "Original (drums not played)" / "no file -
chart only"), range input 0..1 step 0.01 (aria-valuetext percent), M +
S buttons (data-testid `mix-row-<group>`, `mix-mute-<group>`,
`mix-solo-<group>`), transport [Play mix]/[Stop] (data-testid
`mix-play`, data-preview state machine - the S3 pattern), [Export
MIDI] (`mix-export-midi`), [Export WAV] (`mix-export-wav`). Gains
apply LIVE via `composePreviewPlayer.applyMix` (a subscribe on mixer
changes); content changes (result/project identity) stop playback +
invalidate buffers (next Play re-renders; "rendering" state labeled).
Lives in the loaded state BELOW AccompanimentPanel (the packet's
placement), ABOVE the roll.
Confidence: HIGH.

### D86 (URL - REQ-IO-50 compose portion P0 + REQ-IO-51 P1 IN): composeUrl.ts rides the SINGLE writer; /play deferred.

`src/lib/composeUrl.ts` (NEW, pure, node-tested - etudeUrl.ts is the
template):

```ts
export const COMPOSE_URL_KEYS = ["cfile", "chash", "cchart", "creq", "covr", "canf", "cmix"] as const;
export function hasComposeParams(p: URLSearchParams): boolean;
export function serializeComposeSession(s: ComposeSession | null):
  { record: Record<string, string | null>; tooLarge: boolean };
export function parseComposeParams(p: URLSearchParams):
  { session: ComposeSession; malformed: boolean };  // malformed = keys present but unparseable
```

- Values: JSON + encodeURIComponent (chart TEXT is user-typed text,
  NOT uploaded file content - REQ-IO-70 honored; cfile/cHash are the
  MIDI identity). `covr` carries overrides (chordCells included -
  they are small); `creq` the request; `cmix` the mixer; `canf` "1".
  Defaults/absent fields DELETE their key (compact URLs).
- SIZE GOVERNOR: if the serialized compose payload exceeds 6000 chars,
  `tooLarge: true` -> the writer SKIPS all compose keys (practice/
  etude keys survive untouched) and ComposeSurface shows an honest
  notice: "Session too large to share via URL." (never silent
  truncation - honesty rule). A pasted chart is normally < 1KB; a
  200-cell override map is the blowout case.
- Writer (App.tsx EDIT, ~6 lines inside the EXISTING debounced
  `write()`): merge `serializeComposeSession(state.composeSession).record`
  entries (null -> delete) - ADR-015's single-writer architecture
  SANCTIONS this edit; a second writer is structurally banned.
  `urlSyncPredicate.ts` (EDIT): add `prev.composeSession !== s.composeSession`
  term + its pin test (TESTER GAP-1 machinery - dropping the term fails
  CI).
- Boot read (App.tsx EDIT, ~20 lines in the bootDoneRef one-shot):
  `parseComposeParams` -> PRECEDENCE URL > persisted (D28 precedent):
  cchart present -> parse + buildChartSession +
  restoreComposeSessionFromUrl (sync, pure); else cfile present ->
  restoreComposeSessionFromUrl({fileName, fileHash, overrides, request,
  mixer, analyzeFull}) -> the EXISTING prompt state renders
  "Re-upload <fileName>" WITH the URL-carried hash -> the S2 hash-gate
  restore flow works CROSS-DEVICE UNCHANGED (REQ-IO-51 - this is why
  51 is cheap IN for S4: every mechanism already shipped; the URL just
  seeds the same store fields). Malformed compose keys ->
  console.warn + drop (the ?idea= precedent).
- REQ-IO-50 "all modes' state": mode + transpose (Phase 1/2), etude
  constraints (Phase 3), idea (?idea= precedent), compose (THIS slice)
  - after S4, every mode's serializable state is in the URL. Explore
  has no state beyond idea (already carried).
- /play route (REQ-IO-52, P2): **DEFERRED** - no router exists, the
  app is single-route, a route adds a new top-level surface for a P2
  "minimal UI" the PRD never designed. TD-047.
Confidence: HIGH.

### D87 (KEYBOARD): ZERO App.tsx key-handler edits. No Space/O/A in Compose. DEVIATION from D50's sketch, flagged.

Audit finding (row "Space is GLOBAL"): App's window handler binds
Space to practice playback in ALL modes (pre-existing quirk - Space in
Compose mode today starts hidden practice audio). D50's fix ("one
mode-gated branch") edits the sacred handler AND the packet's own
constraint says "App.tsx edits ONLY if mixer UI wiring requires".
Neither is required for the P0s: the mixer has a transport BUTTON.
Decision: button-only. No capture-phase hijack (fragile, surprising).
The pre-existing Space quirk gets **TD-048** (fix = one mode-gate in
the global handler, Phase 5 hygiene, NOT this slice).
Confidence: HIGH.

### D88 (audio.ts): NO getMixBusInput(). Compose keeps its own ctx + master 0.9.

D50's compressor-sharing proposal REJECTED: it couples compose to
audioEngine's lazy-init lifecycle (audioEngine may never boot in
Compose mode - `getMixBusInput()` would return null and the fallback
is... the destination we already use), buys nothing testable, and
edits a Phase-3-frozen file (ADR-016 bus contracts). S3 shipped
destination + 0.9 master with conservative recipe peaks; the mixer
lowers levels, never raises (max sum = 4 x 0.9 x recipe peak,
practically < 1.0; worst-case dense files: the AUDITION clips -
documented, no limiter need proven; the WAV export normalizes by
dividing by the measured peak, clamped to <= 1.0 - two lines,
tested). Confidence: HIGH.

### D89 (GAP-3 / TD-044 - FIX IN ROUND): fingerprint includes bassPc.

`gridFingerprint` cell serialization:
`isSounding(c) ? rootPc + "." + qualitySymbol + (c.bassPc === null ? "" : "/" + c.bassPc) : "rest"`.
Justification: D82/D83 make slash-bass cells REACHABLE (chart paste
"Em7/A"), so the staleness chip MUST catch bassPc edits - the TD's
"S4 WATCH ITEM" condition is now TRUE. No migration: results are
in-memory-only (D73), fingerprints never persist; old in-memory
results die with a reload. Pins: accompany.test sensitivity (bassPc-
only edit changes the fingerprint) + stability (same grid -> same
string) + the existing subset pins unaffected. TD-044 CLOSED.
Confidence: HIGH.

### D90 (LOW-1 / TD-045a - FIX IN ROUND): envelope ordering helper + the "lead" recipe.

composeVoices.ts EDIT (it is being absorbed anyway - the packet's
explicit invitation):

```ts
export type MixVoice = "lead" | AccompRole;   // widen; AccompRole callers unchanged
export interface EnvelopeTimes { readonly peakT: number; readonly sustainT: number; readonly holdT: number; readonly endT: number; readonly stopT: number; }
export function voiceEnvelopeTimes(r: VoiceRecipe, start: number, dur: number): EnvelopeTimes;
// endT = max(start + max(0.02, dur), start + attackSec + decaySec)  <-- the clamp
// stopT = endT + releaseSec; all five fields monotone non-decreasing.
export const VOICE_RECIPES: Readonly<Record<MixVoice, VoiceRecipe>>; // + lead:
// sine x2 detune 3c, attack 0.01, decay 0.15, sustain 0.6, release 0.1,
// filter null, peak 0.35 - a clear lead line, distinct from chords' 5c/0.3.
```

`scheduleComposeNote` consumes the helper (param order fixed by
construction). Tests (composePreview.test.ts is the wrong home - the
helper lives in composeVoices): new `src/lib/composeVoices.test.ts`
(node, pure): monotonicity over dur in {0.001, 0.05, 4} x all 4
recipes (the fast-tempo stab case that triggered TD-045a), lead
recipe bounds. TD-045a CLOSED (b-g stay open - they are listed in
TD-045, untouched). Confidence: HIGH.

### D91 (FILE LAYOUT + PURITY FLOOR): 33 -> 35. Two new engine sources (chordsym.ts moved-in + chordchart.ts), flat in engine/compose/ (D75 convention; the io/ sketch deviation flagged in D83).

Floor bump in the SAME commit as the first new engine source (D20/D56
ladder). Tree: 34 -> 36 scanned. engine/purity.test.ts EDIT: one line.
The src/lib/chordInput.ts shim is NOT an engine source (src side).

### D92 (e2e - the S4 legs): new spec e2e/compose-mixer-export.spec.ts. The existing compose-accompaniment.spec.ts survives UNEDITED (the panel preview button + data-preview machine are preserved by D77; it asserts no tooltip string - verified).

Rails: in-spec fixture MIDI via createRequire (D65), served dist
(port 4173, `npm run build` first), NODE-side assertions. Legs (each
fails if its mechanism is removed):

1. MIXER STATE: upload -> generate -> mixer visible (4 rows,
   `mix-row-original` enabled) -> click M on original ->
   `aria-pressed` flips; click S on bass -> other rows get
   `data-dimmed="true"` (STATE + DOM assertions - audio output is
   manual, honest: jsdom-free browser proves the plumbing, exactly the
   S3 leg-5 precedent). Play mix -> data-preview rendering -> playing
   -> Stop -> idle.
2. TEMPO TRUTH: set tempo override 150 -> mixer Play -> STOP -> Export
   MIDI -> download file -> parse IN-SPEC (@tonejs via createRequire)
   -> header.tempos[0].bpm == 150. (The TD-043 close-out pinned
   end-to-end, and it kills two birds: the export leg doubles as the
   override-truth leg.)
3. EXPORT FIDELITY: same download -> assert timeSignatures preserved
   (fixture has a meter change), track count = originals + 2 roles,
   keySig round-trips (the D80 insertion - if the fallback path was
   taken in dev, this leg asserts its documented DEGRADATION instead).
4. WAV: Export WAV -> download -> first 4 bytes "RIFF", 8-12 "WAVE",
   filename matches /_accompanent|_accomp_/ ... EXACT regex:
   `/_accomp_[A-G][#b]?m?\.wav$/` per REQ-COMP-43 (fixture key pins
   the expected spelling).
5. CHART PASTE: empty state -> [Paste a chord chart] -> type
   "{key: Bb}\n{tempo: 132}\nBbmaj7 Gm7 | Ebmaj7 Ab7 | Bbmaj7 % |
   junk F7/Am" -> warnings count == 1 (junk) -> preview grid shows 4
   bars, bar 3 slot 2 == "Bbmaj7" (% repeat), bar 4 TWO cells (split)
   -> EDIT bar 1 cell to "Gm9" -> Use chart -> AccompanimentPanel
   visible, mixer `mix-row-original` DISABLED ("chart only") ->
   Generate -> roll layers appear -> Play mix -> playing.
6. URL ROUND TRIP (fresh context = the real cross-device proxy):
   after leg 5, read page.url() -> contains cchart + cfile absent ->
   `browser.newContext()` (fresh storage) -> goto that URL -> Compose
   loads the chart WITHOUT any upload (summary card + grid visible).
   Sub-leg: MIDI session URL (cfile+chash) -> fresh context -> prompt
   state shows the URL fileName + hash prefix -> upload matching
   fixture -> "edits restored" notice (REQ-IO-51 cross-device).
7. NO-OP VERIFICATION (existing spec): run compose-accompaniment.spec.ts
   UNCHANGED in the full-gates step - its legs must survive the absorb
   byte-identically (the panel preview button + state machine are
   preserved by D77; the only touched string lives in the COMPONENT
   test, not the e2e spec).

Download mechanics: `page.waitForEvent("download")` +
`download.path()` + `readFileSync` (chromium, acceptDownloads default).
If the dist-served download event proves flaky: assert via
`download.suggestedFilename()` only (no bytes) + move byte-level
fidelity assertions to the node golden test (already exist, D80) -
documented fallback, RK-S4-6.
Confidence: HIGH.

---

## 4. Component API sketches (UI)

```
src/components/ComposeMixer.tsx (NEW; loaded-state host, below AccompanimentPanel)
  props: {
    mixer: MixerState;
    hasOriginal: boolean;            // false = chart-only (row disabled)
    originalLabel: string;           // "Original (drums not played)" etc.
    previewState: PreviewState;      // SAME singleton state machine (D77)
    canExport: boolean;              // result or original present
    onPatchMixer: (m: MixerState) => void;   // -> setComposeMixer (live applyMix)
    onPlay: () => void;  onStop: () => void; // buffer-aware (surface owns render)
    onExportMidi: () => void;  onExportWav: () => void;
  }
  // reads NOTHING from the store (AnalysisCard/AccompanimentPanel pattern).

src/components/ChartPastePanel.tsx (NEW; empty-state overlay/inline)
  props: {
    onCommit: (chartText: string, editedGrid: ChordGrid) => void;
    onCancel: () => void;
  }
  // owns textarea + parse (parseChordChart) + editable preview cells
  // (parseChordSymbol reject ring) + warnings list + directives summary.

ComposeSurface.tsx (EDIT):
  - empty state: [Paste a chord chart] -> ChartPastePanel.
  - chart-loaded: ChartSummaryCard (inline) instead of AnalysisCard.
  - effectiveProject memo -> D79 helpers (tempo patch ADDED).
  - mixer wiring: mixer state from session (MIXER_DEFAULTS at read);
    onPatchMixer -> store + composePreviewPlayer.applyMix (no re-render);
    content-identity effect: result/project change -> player.stop() +
    buffersRef = null.
  - [Play mix] handler: ensure buffers (renderMixGroups once) ->
    playMix -> applyMix(current gains).
  - export handlers: composeExport pure calls + downloadBlob.
  - reload chart auto-heal effect (one-shot ref, PHASE-3-03).
  - the 3 ModeGate-pinned strings + the privacy aside: VERBATIM.

AccompanimentPanel.tsx (EDIT - ONE string + its test):
  preview tooltip -> "Uses the effective tempo (overrides applied)." ;
  button + state machine UNCHANGED (S3 pins survive).
```

---

## 5. Store / engine type deltas (summary, all additive - NO v5)

```
engine/compose/types.ts:
  + MixGroup, MixerGroupState, MixerState, MIXER_DEFAULTS   (D85)
engine/compose/tempo.ts:
  + withTempoOverride, withTimeSignatureOverride            (D79)
engine/compose/accompany.ts:
  ~ gridFingerprint tuple (bassPc)                          (D89)
engine/compose/chordsym.ts:      moved from src/lib/chordInput.ts (D82)
engine/compose/chordchart.ts:    NEW parse + buildChartSession (D83)
engine/compose/index.ts:         re-export chordchart surface
src/state/sessionStore.ts:
  ComposeSession + { chartText?: string | null; mixer?: MixerState | null }
  actions + setComposeChart / setComposeMixer / restoreComposeSessionFromUrl
  setComposeFile: keeps request + mixer, clears chartText; clearCompose resets all.
src/lib/composePreview.ts:       renderMixGroups/mapOriginalTracks/computeGroupGains
                                 + player playMix/applyMix (state machine UNCHANGED)
src/lib/composeVoices.ts:        MixVoice + lead recipe + voiceEnvelopeTimes (D90)
src/lib/composeExport.ts:        NEW (D80/D81)
src/lib/composeUrl.ts:           NEW (D86)
src/lib/chordInput.ts:           shim (D82)
src/lib/loopWav.ts:              + export keyword on encodeWav (D81)
src/lib/urlSyncPredicate.ts:     + composeSession term (D86)
src/App.tsx:                     boot compose read + writer merge (D86 ONLY)
package.json:                    + "midi-file": "^1.2.4" declaration (D80)
```

---

## 6. Exact file plan + dirty-collision check

NEW (engine, 2 sources + 2 tests):
```
engine/compose/chordsym.ts          D82 move (verbatim + header note)
engine/compose/chordsym.test.ts     moved from src/lib/chordInput.test.ts
engine/compose/chordchart.ts        D83 parser + buildChartSession
engine/compose/chordchart.test.ts
```
EDIT (engine): compose/types.ts (mixer types), compose/tempo.ts (2
helpers), compose/accompany.ts (fingerprint), compose/index.ts
(re-export), purity.test.ts (floor 35, ONE line), accompany.test.ts +
tempo.test.ts + types.test.ts (extend - engine tests are editable).
NEW (src): composeExport.ts (+ composeExport.test.ts node),
composeUrl.ts (+ composeUrl.test.ts node), composeVoices.test.ts
(D90), components/ComposeMixer.tsx (+ .test.tsx - glob auto-registers),
components/ChartPastePanel.tsx (+ .test.tsx).
EDIT (src): chordInput.ts (shim), composePreview.ts (+ its test),
composeVoices.ts, loopWav.ts (export keyword ONLY), urlSyncPredicate.ts
(+ its test), sessionStore.ts (+ sessionStore.test.ts),
ComposeSurface.tsx (+ ComposeSurface.test.tsx), AccompanimentPanel.tsx
(+ AccompanimentPanel.test.tsx - the ONE tooltip string), App.tsx
(D86 boot + writer ONLY).
NEW (e2e): compose-mixer-export.spec.ts.
EDIT (e2e): NONE - compose-accompaniment.spec.ts must survive UNEDITED
(D92.7 verification; if it fails, the absorb broke a contract - fix
src, not the spec).
DOCS: engine-compose.md (S4 section: chart grammar table, export
quirks incl. the keySig-insertion write-up), COMPOSE-MODE.md (mixer +
paste + URL), CHANGELOG.md (D77/D87 parent-intent deltas),
.kai/tech-debt/register.md (TD-044/045a CLOSED; TD-046 stems,
TD-047 /play, TD-048 Space-quirk OPEN).
NOT touched: ModeGate.*, audio.ts, rhythm.ts, backingEngine.ts,
playbackClock.ts, theory.ts, studies.ts, paths.ts, dirty-11 (NONE
collide - verified via git status this round: every EDIT file above is
CLEAN), tests/** (it( stays 362 - ALL new tests are engine/ or
src/lib/ or src/components/), README/SPEC/AGENTS/.kai (except the
tech-debt register - that IS .kai's own machinery, sanctioned),
vitest.config.ts (glob handles new component tests).
Purity floor: 33 -> 35 (D91), same commit as chordsym.ts.
package.json: +1 dependency DECLARATION (midi-file - already in the
lockfile tree + bundle; ZERO new downloads).

---

## 7. Test plan (expected +140..185 passing; baseline 1980/1/2 -> 1980+N/1/2)

Engine (node, colocated):
1. chordsym.test.ts: MOVED (count-neutral, existing pins intact).
2. chordchart.test.ts (~40): directives x4 valid + each bad-value arm
   -> warning + null; token grid: whitespace bars, "|" strip attached/
   bare, "%" (mid + leading -> warning), rest tokens, 512-bar cap;
   SLASH RULE all three arms ("Em7/A" one cell; "C/Am" two cells;
   "C/G" one cell - the documented ambiguity resolution); non-chord
   warnings non-fatal + exact copy; all-junk -> unsupported arm;
   buildChartSession: ppq 480, endTick = bars x ticksPerBar(6/8),
   key directive -> candidates[0] correlation 1, no directive ->
   chromaticFallback true, tracks [] ; DETERMINISM: double-run
   JSON byte-equality.
3. tempo.test.ts (extend): withTempoOverride identity-on-null +
   replaces-map; withTimeSignatureOverride == today's inline patch
   (byte-equal pin vs the S2 behavior).
4. accompany.test.ts (extend): fingerprint bassPc sensitivity/stability
   (D89) + existing pins UNTOUCHED (the fix must not shift any other
   tuple - subset pins re-run).
5. types.test.ts (extend): MIXER_DEFAULTS bounds, MixGroup union
   exhaustiveness (compile-time via runtime key list).

src (node):
6. composeVoices.test.ts: voiceEnvelopeTimes monotone over dur x4
   recipes incl. 0.001s (TD-045a pin), lead recipe bounds, VOICE_RECIPES
   covers exactly 4 MixVoices.
7. composePreview.test.ts (extend): mapOriginalTracks (role->voice
   table, percussion skipped, sort, empty tracks), computeGroupGains
   FULL TABLE (mute/solo/level x 4 groups + hasOriginal false ->
   original 0), render math helpers UNCHANGED (S3 pins must pass
   unedited - the absorb must not perturb them).
8. composeExport.test.ts (~25): golden round-trip via readMidiFile
   (D80 spec: tempos/timeSigs/keySigs EQUAL, note tuples, track
   count); override arm; chart arm (no originals); channel assignment
   determinism (origins ch1 + ch9 -> generated pick 0,2,3...);
   filename matrix (keys incl. fallback-omit + sanitize); sf table all
   24 pinned; out-of-range key -> skip-event arm.
9. composeUrl.test.ts (~18): serialize/parse round-trip (all 7 keys),
   absent -> deletes, tooLarge governor (>6000), malformed ->
   {session:null-ish, malformed:true}, chart text with newlines/
   percent-chars survives encoding.
10. sessionStore.test.ts (extend): chartText/mixer optional-at-read
    (NO v5), setComposeChart keeps request+mixer + nulls result,
    setComposeFile clears chartText + keeps mixer, setComposeMixer
    persists + does NOT touch undo, restoreComposeSessionFromUrl
    shape, clearCompose resets all.
11. urlSyncPredicate.test.ts (extend): composeSession change fires,
    unrelated state does not.

components (jsdom, auto-registered):
12. ComposeMixer.test.tsx: rows render, slider -> onPatchMixer, M/S
    aria-pressed, solo dims others, disabled original (chart mode),
    play/stop button state, export disabled arms.
13. ChartPastePanel.test.tsx: parse footer counts, warnings list,
    preview cell edit -> reject ring on "C13" -> accept on "Cm7",
    % repeat visible, commit payload shape.
14. ComposeSurface.test.tsx (extend): paste button in empty state
    (pinned strings UNTOUCHED - ModeGate suite runs explicitly in the
    checklist); chart-loaded renders summary card NOT AnalysisCard;
    mixer below panel; reload chart auto-heal (session.chartText +
    null project -> loaded, one-shot guard); tooltip string update.
15. AccompanimentPanel.test.tsx: the ONE string pin update; all S3
    pins otherwise byte-identical.
16. e2e (D92): 6 new legs + the existing-spec no-op verification,
    `npm run build` first.
17. Gates: lint -> test -> build x2 -> check:paths 36/36 ->
    node assets/check-links.cjs (362) -> e2e -> MANUAL LISTEN CHECK
    (mixer solo/mute audible + WAV export plays in VLC - record
    verdict in the dev report; RK-S4-1).

---

## 8. Ordered checklist (commit-sized)

1. [ ] D90: composeVoices (MixVoice + lead + voiceEnvelopeTimes clamp)
   + composeVoices.test.ts. Gate: `npx vitest run src/lib/compose`.
   Commit: `fix(compose): envelope ordering clamp + lead voice recipe (TD-045a, D90)`.
2. [ ] D79: tempo.ts helpers + pins; ComposeSurface effectiveProject
   switch; AccompanimentPanel + AnalysisCard string audit (tooltip
   becomes true - panel edit + test). Commit:
   `feat(compose): tempo/meter overrides become real at the effective-project choke point (TD-043, D79)`.
3. [ ] D89: fingerprint bassPc + accompany.test pins. Commit:
   `fix(engine): gridFingerprint honors bassPc - staleness catches slash-bass edits (TD-044, D89)`.
4. [ ] D82: chordsym move + shim + test move; purity floor 35 in THIS
   commit. Gate: `npx vitest run engine` + `npx vitest run src/components/ChordCellPopover`.
   Commit: `refactor(engine): chord-symbol grammar moves to engine/compose/chordsym (D82)`.
5. [ ] D83: chordchart.ts + chordchart.test.ts + index re-export.
   Commit: `feat(engine): chord-chart parser - directives, bar tokens, % repeat, slash rule (REQ-IO-10..15, D83)`.
6. [ ] D85 store: mixer types (engine types.ts) + chartText/mixer
   fields + 3 actions + store tests (NO v5). Commit:
   `feat(compose): store - chart text + mixer state persisted into v4 without bump (D84/D85)`.
7. [ ] D77/D78: composePreview renderMixGroups + mapOriginalTracks +
   computeGroupGains + playMix/applyMix + tests; loopWav export
   keyword. Commit: `feat(compose): per-group mix render + live gain playback (REQ-COMP-37, D77)`.
8. [ ] D80/D81: composeExport.ts + tests + package.json midi-file
   declaration. Commit: `feat(compose): combined MIDI export with keySig insertion + WAV full mix (REQ-COMP-40/41/43, D80/D81)`.
9. [ ] ComposeMixer.tsx + test + ComposeSurface wiring (transport,
   content-invalidate, exports). Commit:
   `feat(compose): mixer UI - 4 groups, volume/mute/solo live, export buttons (REQ-COMP-37 UI)`.
10. [ ] ChartPastePanel + ChartSummary + ComposeSurface empty/chart
    states + tests; ModeGate suite run EXPLICITLY. Commit:
    `feat(compose): chord-chart paste - editable preview grid into the accompaniment pipeline (REQ-IO-14/16, D84)`.
11. [ ] D86: composeUrl.ts + predicate + App boot/writer + tests.
    Commit: `feat(compose): URL compose params - chart, overrides, request, mixer, fileHash (REQ-IO-50/51, D86)`.
12. [ ] e2e new spec + run BOTH specs (existing must pass UNEDITED -
    D92.7) + FULL gates +
    MANUAL LISTEN/WAV CHECK. Commit:
    `test(e2e): compose mixer, exports, chart paste, URL round-trip`.
13. [ ] Docs: engine-compose.md (chart grammar + keySig-insertion
    quirks), COMPOSE-MODE.md, CHANGELOG, TD register closes/adds.
    Commit: `docs(compose): phase 4 slice 4 - mixer, export, chord-chart paste, URL`.

## 9. Risks

| Risk | P | I | Mitigation |
|---|---|---|---|
| RK-S4-1: mixer audio quality unverified by tests (S3 RK-S3-1 carried) | M | M | Checklist 12 makes the LISTEN + WAV-in-VLC checks gate items with recorded verdicts; computeGroupGains table-tested; peaks are sums of bounded recipes |
| RK-S4-2: keySig insertion (midi-file) misbehaves on dense files | M | L | Golden test is the arbiter; ONE-line fallback (skip keySig, assert degradation - W2: not in REQ-COMP-40 text); the errata landmine is now TESTED, not assumed |
| RK-S4-3: original-group render cost on dense 30MB files (thousands of nodes) | M | M | 90s audition cap already bounds node count; export caps 600s; offline renders are faster-than-realtime; manual perf note in dev report; fallback = skip unknown-role tracks (documented, not built) |
| RK-S4-4: slash ambiguity surprises a user ("C/G" read as inversion not 2 chords) | M | L | Intrinsic to the PRD grammar; deterministic rule + preview grid shows the interpretation BEFORE commit (REQ-IO-14 is the safety valve) + docs table |
| RK-S4-5: URL payload blows past browser limits silently | L | M | 6000-char governor + visible "too large to share" notice (D86) - never silent truncation |
| RK-S4-6: e2e download assertions flaky on served dist | M | L | D92 fallback (filename-only assertion; byte fidelity already lives in the node golden test) |
| RK-S4-7: App.tsx edit (boot/writer) regresses practice URL behavior | L | H | Edits are ADDITIVE inside existing blocks; etude/mode/transpose pins (urlSyncPredicate test + app.spec e2e) run in checklist 11 + 12; predicate term is pin-first |
| RK-S4-8: 4-buffer parallel offline renders leak contexts | L | M | OfflineAudioContexts are one-shot + GC'd after startRendering resolves (loopWav precedent); singleton owns the ONE live ctx |
| RK-S4-9: scope creep (stems, /play, keyboard, DAW-isms) | M | M | DO-NOT list below; parent X10 pre-ruled stems; TDs filed |
| RK-S4-10: snapshot discipline | L | H | PHASE-2-02 file-copy rule stands |

## 10. DO NOT build in S4

- NO live scheduler / transport / seek / pause / loop (D77 closed that
  door - do not re-litigate in code).
- NO audio.ts, rhythm.ts, backingEngine.ts, playbackClock.ts edits
  (D88; the compose player touches NONE).
- NO App.tsx key-handler edits, NO Space/O/A bindings (D87; TD-048).
- NO stems ZIP (D81; TD-046). NO /play route (D86; TD-047).
- NO per-track mixer rows, NO effects, NO soundfonts, NO drum kit
  synthesis (W1 - PRD sec 7.2).
- NO v5 session migration (D85's optional fields; the shipped comment
  is the authority).
- NO new npm DOWNLOADS (midi-file is a DECLARATION of an already
  locked + already bundled package - the only package.json change).
- NO edits to: dirty-11, tests/** (it( = 362), studies.ts, theory.ts,
  paths.ts, ModeGate.*, README/SPEC/AGENTS/.kai (except the TD
  register), vitest.config.ts.
- NO console.* anywhere new (engine fully silent; src warn/error
  arms only on real failure paths).
- NO auto-generate on chart commit (Generate stays user intent - S3
  rule).

## 11. Traceability

REQ-COMP-37 -> D77 (per-group buffers + live gains) + D78 (original
mapping) + D85 (mixer UI/state) + e2e leg 1 |
REQ-COMP-40 -> D80 (combined MIDI; tempo/timeSig from effective
project; golden round-trip) + D79 (override arm pinned) + e2e 2/3 |
REQ-COMP-41 -> D81 (full-mix WAV, encodeWav reuse, 600s cap) + e2e 4 |
REQ-COMP-42 -> DEFERRED TD-046 (parent X10) |
REQ-COMP-43 -> D80 filename (spellTonic; fallback-omit) + e2e 4 regex |
REQ-IO-10 -> D83 directives | 11 -> D83 tokens + slash rule | 12 -> %
| 13 -> | strip | 14 -> D84 preview editable BEFORE commit | 15 ->
warnings-not-errors, every arm | 16 -> ChordGrid straight into
generateAccompaniment (D83) + e2e 5 |
REQ-IO-50 -> D86 compose keys on the single writer (mode/transpose/
etude/idea already shipped - all modes now covered) |
REQ-IO-51 -> D86 cfile/chash + the EXISTING hash-gate prompt works
cross-device | 52 -> DEFERRED TD-047 |
TD-043 -> D79 CLOSED (override truth + tooltip honesty) |
TD-044 -> D89 CLOSED | TD-045a -> D90 CLOSED (b..g stay in TD-045) |
REQ-TRANS-3 -> D78/D80 (originals untransposed; accompaniment
transpose already baked at plan time; export never re-shifts) |
Phase 5 seam -> D83 ChordChart.grid IS the ChordGrid (progression
handoff needs no adapter) |
privacy REQ-IO-70/71 -> chart TEXT only (never file bytes) in URL;
zero network calls added.

```yaml
HANDOFF_TO_DEVELOPER:
  from: "@architect"
  to: "@developer"
  timestamp: "2026-09-23T23:30:00Z"
  DELIVERABLES:
    - name: "docs/PHASE-4-S4-MIXER-EXPORT.md"
      status: complete
      sections: "re-audit (20 anchors) + D77..D92 + API sketches + file plan + test plan + checklist + risks + traceability"
  CONSTRAINTS:
    - "baseline 1980/1/2 (2 = CSS-WIP, NOT yours); tests/ FROZEN it(=362; count pins 40/12 untouched"
    - "purity floor 33 -> 35 in the SAME commit as chordsym.ts (checklist step 4)"
    - "ZERO edits: audio.ts, rhythm.ts, backingEngine.ts, playbackClock.ts, App.tsx key handler, ModeGate.*, dirty-11, tests/**, studies.ts, theory.ts"
    - "App.tsx edits ONLY the boot-read + writer blocks (D86) - additive inside existing structure"
    - "store: chartText + mixer are OPTIONAL fields on the persisted ComposeSession (NO v5)"
    - "ASCII, no console.* (engine silent), no any/@ts-ignore; new component tests auto-register"
    - "package.json: +midi-file declaration ONLY (already in tree+bundle - zero downloads)"
  DECISIONS_MADE:
    - decision: "D77: mixer = per-group baked AudioBuffers + live GainNodes (render once per CONTENT change; knobs are param writes). Live scheduler (D50) and re-render-per-knob both rejected."
      confidence: HIGH
      rationale: "satisfies REQ-COMP-37 with instant knobs, zero new transport surface, absorbs the S3 singleton in place (mutation-proven tests survive)"
    - decision: "D78: Original group = all non-percussion tracks voiced by role recipes (new lead recipe); percussion skipped with disclosure; extracted melody NOT re-voiced"
      confidence: HIGH
      rationale: "4 groups is the PRD contract (sec 7.2 anti-DAW); drum synthesis is scope creep; melody re-voicing would double the line"
    - decision: "D80: keySig exported by INSERTING correct midi-file events after @tonejs encode (broken encoder path bypassed); golden test asserts round-trip EQUALITY; one-line skip+degrade fallback documented"
      confidence: MEDIUM-HIGH
      rationale: "midi-file is already bundled via @tonejs (zero cost); errata D6 landmine becomes a tested pin; keySig is NOT in REQ-COMP-40's text so the fallback is requirement-legal"
    - decision: "D82/D83: chord grammar MOVES to engine/compose/chordsym.ts (shim keeps importers alive); parser is engine/compose/chordchart.ts (io/ sketch deviation flagged); slash rule = whole-token parse wins, split fallback"
      confidence: HIGH
      rationale: "engine->src imports are purity-illegal; two grammars would drift; the slash ambiguity is intrinsic to the PRD and resolved deterministically + previewed before commit"
    - decision: "D85/D86: mixer + chartText persist inside composeSession (no v5); URL rides the SINGLE debounced writer with a 6000-char governor + honest too-large notice; /play + stems deferred (TD-047/046, parent X10)"
      confidence: HIGH
      rationale: "mixer is per-song taste that must travel with share URLs; ADR-015 bans a second writer; P2s stay deferred to keep the final slice shippable"
    - decision: "D87: NO compose keyboard routing - button-only mixer; the pre-existing global-Space quirk gets TD-048"
      confidence: HIGH
      rationale: "the PRD requires no compose keys; editing the sacred global handler violates the zero-App-preference; hijacking Space via capture would surprise practice users"
  IMPLEMENTATION_NOTES:
    - "the panel preview button + S3's pure-surface tests MUST survive byte-identical (absorb in place; only the tooltip string changes - D79)"
    - "effectiveProject is THE choke point: patch tempos THERE and every consumer (preview/mixer/WAV/MIDI/roll) inherits the truth"
    - "computeGroupGains: anySolo -> non-solos 0; thisSolo wins over muted; hasOriginal=false forces original 0 - table-test all 16 combos"
    - "playMix starts all sources at ctx.currentTime + 0.05 (small margin) - same start time = sample-accurate sync, no drift bookkeeping"
    - "content identity for buffer invalidation = (accompResult ref, effectiveProject ref); mixer changes NEVER invalidate"
    - "midi-file insertion: walk track 0's cumulative deltaTime; keySig at tick 0 goes FIRST with deltaTime 0; sf table in D80 (Cb=idx0 -> sf=idx-7)"
    - "the packet's 'spellKey exists' is FALSE - use spellTonic(pc, mode, '')"
    - "chart reload auto-heal must be one-shot guarded (PHASE-3-03) - rebuild is pure + idempotent but the effect must not re-run on every render"
    - "e2e downloads: chromium acceptDownloads default ON; if served-dist flakes, D92's filename-only fallback is pre-authorized"
  PROGRESS:
    phases_completed: "5/5 (handoff, re-audit at 2750bef, requirements mapping, design, roadmap+risk)"
    retries: 0
    quality_gates_passed: "5/5 (all S4 REQs mapped incl. honest deferrals; interfaces copyable; choices justified; absorb seam pinned; risks mitigated)"
  ESTIMATED_EFFORT:
    implementation_hours: "30-42"
    testing_hours: "14-18"
    documentation_hours: "3"
  CONCERNS:
    - "D80 keySig insertion is the only MEDIUM-HIGH (not HIGH) call - the fallback is pre-authorized and requirement-legal; do not spend > half a day on insertion"
    - "RK-S4-4: the slash rule is a judgment call on an under-specified PRD grammar - the editable preview (REQ-IO-14) is the user-facing safety valve; if user testing hates it, the rule is ONE function (chordchart.ts splitToken) - retune there, not in the UI"
    - "mixer audition peaks are sums of bounded recipes but dense original files can clip the audition (no limiter - D88); if the listen check reports clipping, lower MIXER_DEFAULTS original level to 0.8 (DATA change, not architecture)"
  AUDIT_TRAIL:
    - { phase: "re-audit", duration: "~30 min", tools_used: "read/grep/bash (npm test fresh: 1980/1/2 confirmed; @tonejs Encode/Header/midi-writer byte-level keySig verification; midi-file hoist+version check; fflate/midiBatchExport precedent; App.tsx Space + URL writer structure; sessionStore v4 header; encodeWav visibility; ModeGate presence-pins; spellKey falsified)", errors_encountered: "engine/ initially searched under src/ (it is repo-root); packet's spellKey claim falsified - documented" }
    - { phase: "design", duration: "~35 min", notes: "two parent-intent deltas (D77 architecture vs D50 scheduler; D87 keyboard non-scope vs D50 O/A); one sketch-path deviation (chordchart in compose/ not io/); GAP-3 + LOW-1 closed in-round; stems + /play deferred per parent X10 / P2 honesty" }
```

**End of Slice 4 design - and of Phase 4.**

## ERRATA (post-implementation, 2026-09-24)
- E1 (solo/mute convention): the HANDOFF note at line ~1048 ("thisSolo wins over muted") CONTRADICTS the normative body formula (`muted || (anySolo && !solo && !thisSolo)` = mute wins). CODE + TEST + USER DOCS are authoritative: `composePreview.test.ts` pins "MUTE WINS over solo" explicitly; COMPOSE-MODE.md documents mute-wins with the Ableton/Reaper-vs-Logic/Pro Tools honesty note. The handoff note is superseded; do not implement solo-wins.
- E2 ("zero lockfile churn", line ~66/829): inaccurate as stated - npm re-recorded 60 lines of wasm-helper metadata (@tailwindcss/oxide chain). Correct reading: zero NEW downloads, zero bundle delta (midi-file 1.2.4 was already hoisted transitively). Declaration-only change stands.
