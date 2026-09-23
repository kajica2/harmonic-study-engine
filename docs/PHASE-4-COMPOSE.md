# PRD-001 Phase 4 Design: Compose Mode (MIDI analysis + accompaniment generation)

Status: APPROVED DESIGN (from @architect research packet, 2026-09-23). Implementation authority for @developer.
Scope: PRD sec 8.2 (REQ-COMP-1..53) + sec 8.7 chord-chart paste (REQ-IO-10..16) + REQ-PED-4 Compose annotation portion + privacy (REQ-IO-70/71) + REQ-TRANS-3 Compose semantics. Phase 4 is PRD sec 14's largest slice (3-4 weeks nominal) and is cut into FOUR shippable slices (D55), mirroring the Phase 3 playbook. Full design for SLICE 1 (pure parse+analyze engine + golden corpus); Slices 2-4 designed to API level to prove Slice 1 unblocks them.
Baseline (verified this round at HEAD 2594e4c): `npm test` = 1508 passed / 1 skipped / 2 failed; the 2 failures are the pre-existing CSS-WIP component tests (FormPlanner.test.tsx, FormTemplatePicker.test.tsx) - do NOT fix. `tests/` it( count = 362 (FROZEN). engine purity floor = 21. check:paths 36/36. count-tunes pin 40, curatedBriefing pin 12 - untouched by Phase 4 (Compose artifacts are runtime data, never catalog files).

Rules for every new/edited file (inherited, standing): ASCII only; no `console.*` except warn/error (engine: fully silent); no `any`, no `@ts-ignore`; relative imports; engine/ purity absolute (allowlist: relative-only, no packages, no node:*, no clock, no Math.random); new component tests auto-register via `src/components/**/*.test.tsx` glob in vitest.config.ts JSDOM_FILES; src/lib tests are node-project and drift-gate-invisible; `tests/`, `src/lib/studies.ts`, README/SPEC counts, the 11 dirty components OFF-LIMITS; PHASE-2-01 live-gate rule and PHASE-3-03 StrictMode one-shot rule apply to every new effect; snapshot discipline: FILE-COPY snapshots, never `git checkout --` (PHASE-2-02).

---

## 1. Re-audit (anchors verified at HEAD 2594e4c; cite search strings, not line numbers)

| Anchor | Location | Verified content |
|---|---|---|
| ComposeSurface stub | src/components/ComposeSurface.tsx (69 lines, CLEAN) | Phase 1 stub: SynesthesiaCanvas placeholder at opacity-30 inside a relative card, heading "Drop a .mid file to get started.", body copy naming the "Phase 4" plan, one button -> `onOpenImportExport`, and a `<aside aria-label="Privacy statement">` ALREADY SHIPPING the REQ-IO-70 copy ("never leaves this tab"). Rendered by ModeGate: `if (mode === "compose") return <ComposeSurface .../>`. HARD CONSTRAINT: src/components/ModeGate.test.tsx asserts `/Drop a .mid file/i` in ~10 places (present when compose, absent otherwise) - the empty-state heading MUST survive the S2 rewrite. |
| ImportExportModal anatomy | src/components/ImportExportModal.tsx (585 lines, CLEAN - NOT in dirty-11) | FOUR text tabs (url/chart/json/realbook). File input `accept=".txt,.json,.irealb,..."` - it does NOT accept .mid/.midi, and `handleFile` reads `file.text()` (binary MIDI would arrive as mojibake). `onImport(preview: HarmonicPath[])` -> App prepends to the path catalog + `setActivePathIndex(0)` + transpose resets. VERDICT: this is the ETUDE catalog importer. It is NOT a MIDI reader (see correction C1) and must NOT be repurposed: Compose imports must never enter `paths`/`activePathIndex` (REQ-TRANS-3 + audit-area-4). Reusable pieces: `ModalShell` pattern, the preview-list card styling. Export half (`exportToMidiFile(currentPath)` + batch ZIP) stays etude-domain. |
| FUTURE_PLANNING drift | FUTURE_PLANNING.md "PRD Phase 4" table | Two rows are FALSE at HEAD and must be corrected when S2 lands: (C1) "ImportExportModal reads .mid files" - it does not (see row above); (C2) "WAV export SHIPPED (limited): Tone.Offline exists in src/lib/" - Tone.Offline does NOT exist; `tone` is a transitive of @magenta/music with ZERO `Tone.` imports in src/. Offline rendering DOES exist via raw `OfflineAudioContext` in src/lib/loopWav.ts (form-aware, 16-bit mono PCM, hand-rolled `encodeWav`). |
| MIDI write path | src/lib/midiExport.ts (195 lines, CLEAN) | midi-writer-js, input = HarmonicPath, fixed `setTempo(120)`, one NoteEvent per step, duration strings ("2","4","8") - NO tick-level API, no time-signature events. Fine for etude exports; structurally incapable of REQ-COMP-40 (preserve imported tempo map + meters). The PARSE side is virgin: `@tonejs/midi@2.0.28` is in package.json with ZERO imports in src/engine/tests (grep-verified; only package.json, package-lock, docs). |
| @tonejs/midi reality | node_modules/@tonejs/midi/dist/*.d.ts | Parser gives MORE than the PRD assumes and the packet feared: `header.tempos[{ticks,bpm}]`, `header.timeSignatures[{ticks,timeSignature:[num,den]}]`, `header.keySignatures[{ticks,key,scale}]`, `Note{midi,ticks,durationTicks,velocity 0..1}`, `Track{name,channel,notes,instrument{number},pitchBends,endOfTrackTicks}`, `Midi.durationTicks`, `Midi.toJSON()` -> plain `MidiJSON`. ENCODER verified (dist/Encode.js): writes setTempo + timeSignature + keySignature meta back -> round-trip export is real. LIMITATION (format 0): each SMF track becomes ONE Track; multi-channel format-0 files are flattened (per-note channel lost, `Track.channel` = last seen). Format 1/2 are per-track and correct. |
| Step model collision | src/lib/paths.ts | `HarmonicStep = {name, notes, descriptions}` - no ticks, no velocity, no track, no tempo. `padPath` forces 24..64 bars (96..256 steps): a 5-min import (~150 bars) would be TRUNCATED to 64; a 12-bar blues padded to 24. Two step conventions coexist (paths.ts labels 1 step = 1 BEAT; W2 audio truth renders 1 step = 1 BAR). An imported song cannot live here without lying about its length, tempo map, or per-bar content. Basis of D45. |
| Session store | src/state/sessionStore.ts + engine/migrations/index.ts | zustand v5, persist key `hse.session`, `CURRENT_SESSION_VERSION = 3` (MIRRORED in both files), migrate delegates to `createSessionRunner()` (SESSION_MIGRATIONS chain v1->v2->v3). partialize persists mode/globalTranspose/exerciseTranspose/keyCycleActive/currentIdea/etudeConstraints. `DirtyMap.compose` is typed as the LITERAL `"none"` (ADR-007). The task hint "zustand v3->v4" = the SESSION MIGRATION VERSION, not the library. Basis of D48. |
| Audio graph | src/lib/audio.ts (682 lines, CLEAN) | melodyBus -> {warmth, masterGain}; masterGain -> compressor (STORED AS FIELD since D33) -> destination (+reverb send); metronomeGain -> compressor. `getCtx?()` public (App uses it); `connectMasterTo` is the recorder tap on masterGain. `playNote(midi, velocity)` = realtime single voice on melodyBus, instrument = `setInstrument(InstrumentType: epiano|sine|pad|pluck|trumpet|guitar|sax)`. NO generic scheduled-voice API, NO per-group mixer. Basis of D50. |
| Backing engine | src/lib/backingEngine.ts (817 lines, CLEAN) | ALREADY HOLDS THE MIXER PATTERN: own ctx init, masterBus -> {drumBus, bassBus(->bassEq), pianoBus}, `setLevels({drums,bass,piano, *Muted})`, `scheduleAhead(path: HarmonicStep[], beatNumber, barInLoop, startSec, secPerBar)` 4-bar lookahead, synth drums (playKick etc.), soundfont bass/piano via loadSoundfont. Its masterBus connects to `ctx.destination` directly (bypasses audioEngine compressor - precedent, not a template). App drives it from a playbackClock subscribe effect gated on `isPlayingAuto` (search `backingEngine.scheduleAhead` in App.tsx). NOT reusable as-is for accompaniment (it renders its OWN BackingStyle beats from chord `notes`, not from a StyleProfile realization), but its bus/levels/lookahead shape is the design template for ComposeMixer. |
| playbackClock | src/lib/playbackClock.ts | rAF singleton dispatching `tick {step, beat, phase, timeSec}`; hardcoded "4 beats per bar" universal converter; wall-clock approximation (slice-3 D42 verdict). Unsuitable as the Compose transport spine (tempo maps, meters != 4/4, arbitrary lengths). Compose gets its own scheduler (D50). |
| Chord/voicing assets | src/lib/theory.ts (819 lines, CLEAN) | Has `applyVoicing(notes, VoicingId)` (interval-target stacking), `applyVoiceLeading(prev, target)` (greedy nearest-pc octave matching - the REAL voice-leader), `alternativeVoicing` (drop2/spread/rootless/simplify), `voiceLeadingDistance/Score`, `analyzeChord`. AUDIT FINDINGS: `analyzeChord` root detection is DEAD CODE (`let root = bassPc; for (...) { ... break; }` never reassigns root - inverted chords are mislabeled; function assumes C is tonic). `applyVoicing("minimum_motion")` is a stub ("requires prior chord; App handles"). These are display glue for ChordInspector (DIRTY), NOT a trustworthy inference base. Engine cannot import src anyway. Basis of D47. |
| Engine reuse (THE gold) | engine/etude/harmony.ts | ALREADY EXPORTS `parseNumeral`, `spellChordName(rootPc, qualitySymbol, keyTonicPc, mode)`, `NumeralRealization`, and module-level (NOT yet exported) `QUALITY_INTERVALS` (16 qualities), `NAME_SUFFIX`, `keyUsesFlats`. Close-voicing realization inside `profile.voicing.registers.chords` + drop2 spread already implemented (step 7). The accompaniment voicing engine EXTENDS this data rather than porting theory.ts. Basis of D47. |
| StyleProfile finally consumed | engine/styles/types.ts + profiles/jazz.ts | `VoicingStyle = close|drop2|quartal|spread|block` (exactly REQ-COMP-32); `BassPatternId = walking|twoFeel|rootFifth|eighthPulse|shuffleBoogie|drone` (superset of REQ-COMP-34); `ChordPatternId = freddieGreen|charleston|block|pulse|offbeat|lazy|sustain|alberti` (exactly PRD Appendix C); `gridDivisions`, `swingRatio`, `densityDefault`, `registers` (Appendix D values). The ids exist but there is NO pattern step library anywhere - the 8+6 patterns must be AUTHORED as data in S3 (D52). |
| Undo + download | src/lib/useHistory.ts; src/lib/download.ts | `useHistory<T>` hook (push/undo/redo controls) exists and is CLEAN - REQ-COMP-24 undo reuses it (S2). `downloadText`/blob helpers exist for S4 exports. |
| Spelling + rng + ids | engine/core/spelling.ts, rng.ts, ids.ts | `parseKey(raw)` handles "C major" style strings -> {tonicPc, mode, literal} (use for MIDI key-signature meta); `spellTonic(pc, mode, literal)`; `createRng(seed): Rng {next,int,range,bool,pick,weighted,shuffle}`; `deriveCanonicalId(kind, seed, obj)` + `makeInstanceId(nowMs, seq)` (clock as parameter, ADR-005). All directly consumed. |
| Pedagogy reuse | engine/pedagogy/types.ts | `AnnotationTarget` ALREADY includes `{kind:"chord", bar}` and `{kind:"melody"}` (designed forward in Phase 3: "the rest exist so later slices never need a breaking union change"). Compose analyzers return `annotations` per REQ-PED-1 with ZERO type changes. `getConcept(id)` + ConceptDrawer (shipped S3) are the click-through target for REQ-PED-5 on the Compose surface. |
| Test infra | tests/setup.ts; vitest.config.ts | localStorage polyfilled; NO OfflineAudioContext polyfill (the `web-audio-api` attempt was abandoned - see setup.ts header). loopWav tests mock around it (tests/loopWav-mock.ts). Compose WAV-export tests must stay at pure-helper level (encodeWav unit-testable on a Float32Array without a ctx); the offline render path is manual-verified. Component tests auto-register via the `src/components/**/*.test.tsx` glob. |
| Dirty-11 collision map | git status (verified this round) | ChordInspector, CoComposePanel, FormPlanner, FormTemplatePicker, InspectPanel, LiveScoreDisplay, MelodyToolbar, PathCatalog, PracticeSessionPlayer, PracticeSetBrowser, StylePackPicker. Phase 4 collides with NONE: chord-cell popover = NEW component (ChordInspector is the etude-side inspector, untouched); analysis card, drop zone, mixer, paste panel = all new. ImportExportModal and ComposeSurface are CLEAN but the modal is deliberately NOT edited (separate pipelines, see D45). F3 (etude sub-range loop math, FUTURE_PLANNING line "Section loop ranges on generated etude paths") is NOT needed by Compose - Compose owns its transport (D50); F3 stays USER-DECISION. |
| Findings (new, this audit) | F5-F9 | F5: the task packet's premise "ImportExportModal ALREADY reads .mid files" is FALSE (C1) - zero binary MIDI ingestion exists anywhere in src; every `.mid` grep hit is an export/download filename. Nothing to supersede; the parse pipeline is 100% greenfield. F6: @tonejs/midi format-0 channel flattening (see row above) - shapes the normalize contract and the edge-case UX. F7: `Midi.toJSON()` returns plain data -> the engine can own normalization by declaring a structural DTO type, keeping @tonejs/midi entirely OUT of engine/ (purity-legal, testable without the package). F8: `DirtyMap.compose` literal "none" - no widening needed IF compose state lives in the store (survives mode switches; nothing is lost on switch -> no dirty prompt, D48). F9: crypto.subtle is absent in jsdom - SHA-256 (REQ-IO-51 fileHash) must be feature-guarded with an honest "hash unavailable" fallback. |

---

## 2. Decisions

### D45 (THE load-bearing decision): Imported songs get a NEW NormalizedProject model. HarmonicPath is NOT the container.

Decision: `engine/compose/types.ts` defines `NormalizedProject` (PRD 11.1: ppq, tempo map, time signatures, key signatures, tracks of tick-native notes). Compose owns it end to end: analysis, accompaniment, playback, export. NOTHING in Compose is ever loaded into `paths`/`activePathIndex`.

Evidence (all verified this round):
1. `HarmonicStep {name, notes, descriptions}` carries no ticks, no velocity, no track/channel, no per-beat chords, no tempo map. REQ-COMP-3 (preserve ticks/tempo/time/key sigs) and REQ-COMP-14 (segment from ticks, not seconds) are UNSATISFIABLE on it.
2. `padPath` mutates length to 24..64 bars - a truncated 5-minute export violates REQ-COMP-40 ("preserving tempo map and time signatures") and the file-fidelity promise of the privacy copy ("your file, analyzed").
3. The reuse dividend is smaller than it looks: existing playback is chord-grid PRACTICE playback (rhythmEngine setInterval grid + backingEngine beats + count-in/cycle-12/persona machinery). Compose needs faithful multi-track SONG playback with a tempo map - a parallel path is required REGARDLESS of the container choice. Reusing HarmonicPath buys the wrong machinery and costs fidelity.
4. The Etude precedent (D24) proves the adapter pattern works for 1-step-per-bar GENERATED content; imported content is categorically different data (arrangement, not progression).
5. PRD 11.1 literally specifies NormalizedProject as the canonical import shape (also the future MusicXML target, REQ-IO-60).

Migration sketch: none - greenfield. The ONLY bridge to the existing world is OPTIONAL and lands in S4: "send chord chart to Etude" (grid -> HarmonicPath via the etudeToSteps shape) is a stretch idea, NOT in Phase 4 scope.
Confidence: HIGH.

### D46: Parse boundary = adapter owns @tonejs/midi; engine owns normalization via a structural DTO.

Decision: `src/lib/composeMidi.ts` (adapter, 5-line core): `parseMidiBytes(buf: ArrayBuffer): MidiJsonLike { return new Midi(buf).toJSON(); }` then `normalizeMidiJson(json, fileName)` (ENGINE, pure) converts the plain-JSON DTO to `NormalizedProject` with validation. The engine declares `MidiJsonLike` structurally (no import of the package - purity-legal, F7). All SMF quirks are handled in normalize (single choke point): missing tempo -> prepend `{ticks:0,bpm:120}` + warning; empty tempos/timeSigs defaults; notes sorted by tick; midi clamped 0..127 (out-of-range dropped + warning); velocity stays 0..1 (pinned); format 0 multi-channel flattening accepted with a `format0Composite` warning (F6) - chord/key analysis is channel-agnostic and correct; role classification degrades gracefully (unknown + top-line melody fallback, which REQ-COMP-11 already mandates).
Rejected: declaring `midi-file` as a direct dep to channel-split format 0 (undeclared-transitive use is worse; a real need would justify a NEW ADR with a raw splitter - the NormalizedTrack shape leaves room). Rejected: parsing in the adapter into engine types (duplicates validation, splits the test surface).
Confidence: HIGH.

### D47: Voicing/chord data reuse = extract shared tables to engine/core/chords.ts; NO port of src/lib/theory.ts.

Decision: MOVE `QUALITY_INTERVALS`, `NAME_SUFFIX`, `keyUsesFlats`, `spellChordName` from `engine/etude/harmony.ts` into `engine/core/chords.ts` (zero-dep core module; it may import core/spelling). `engine/etude/harmony.ts` re-exports them (its existing tests and every importer keep compiling - additive churn only). Compose modules import from core. Accompaniment voice-leading (S3) is a CLEAN-ROOM implementation in `engine/compose/voicing.ts` (greedy nearest-pc-per-voice matching - the same 40-line algorithm family as theory.applyVoiceLeading, written against engine types). An equivalence test (`src/lib/composeVoicingEquivalence.test.ts`, S3) imports BOTH and pins agreement on shared inputs so the two implementations cannot silently diverge. theory.ts itself is NOT touched (ChordInspector + personas consume it; its analyzeChord dead-code root bug and minimum_motion stub must not be laundered into the engine).
Rationale: engine cannot import src (purity allowlist); duplicating the INTERVAL TABLES would drift (numeral grammar is already pinned against them); porting theory.ts would import display-grade heuristics into the analysis core. Extraction + clean-room algorithm is the minimal honest middle.
ADR-worthy: yes - recorded here as the repo's third engine-reuse decision after D16/D17.
Confidence: HIGH.

### D48: Compose session state = zustand v4 slice. Project in-memory; overrides/request/mixer persisted. No compose dirty.

Decision: bump `CURRENT_SESSION_VERSION` 3 -> 4 (BOTH files in lockstep: engine/migrations/index.ts + src/state/sessionStore.ts) with `sessionV3ToV4` appending `composeSession: null`. The slice:

```ts
interface ComposeSession {        // persisted (partialize keeps this)
  fileName: string; fileHash: string | null;   // SHA-256 hex, F9-guarded
  overrides: AnalysisOverrides;   // key/tempo/meter/melodyTrack/chord cells
  request: AccompanimentRequest | null;  // styleId/roles/density/register/seed
  mixer: Record<string, { volume: number; mute: boolean }>;  // group id -> level
}
// NOT persisted, same store, excluded by partialize:
composeProject: NormalizedProject | null;
```

The project lives in the store (not component state) so ModeGate unmounting ComposeSurface on mode switch LOSES NOTHING -> `DirtyMap.compose` stays the literal `"none"` (F8; no type widening, ADR-007 intact). Reload with `composeSession` present but `composeProject === null` -> surface renders "Re-upload <fileName> (hash match)" (REQ-IO-51 semantics for free). URL serialization (REQ-IO-50/51, PRD 11.2): S4 stretch - the persisted slice is already the URL payload shape; fileHash + overrides + request + seed serialize cleanly. Do NOT block S1-S3 on it.
Rejected: legacy localStorage registry (wrong object - this IS session state, unlike metronome taste, per the D32 precedent reasoning); separate zustand store (two persist envelopes, two migration chains, zero gain).
Confidence: HIGH.

### D49: Every analyzer returns a discriminated-union Outcome; analyzers never throw; annotations ride alongside (REQ-COMP-15 / NFR-5 / PED-1).

Decision: `type Outcome<T> = { ok: true; value: T } | { ok: false; error: AnalysisError }` with `AnalysisErrorCode = "noNotes" | "parseFailed" | "unsupported" | "tooLarge" | "internal"`. The top-level pipeline `analyzeProject(project, opts): Outcome<ComposeAnalysis>` wraps every stage; a stage failure short-circuits to the error arm (never a throw into UI). `ComposeAnalysis` carries `annotations: readonly Annotation[]` (REQ-PED-1 for analyzers; truthful detectors only: "key C major (r=0.92, 78% diatonic mass)", "ii-V-I detected bars 5-6", melody provenance note, pitch-bend warning). Targets use the EXISTING chord{bar}/melody{} kinds - zero pedagogy type changes. The analysis card renders annotations under chords (REQ-PED-4 Compose portion) with ConceptDrawer click-through (REQ-PED-5, component shipped in Phase 3 S3).
Confidence: HIGH.

### D50: Compose playback = dedicated composePlayer (tick-accurate lookahead scheduler) + mixer buses into audioEngine's compressor. rhythmEngine/playbackClock/backingEngine are NOT reused.

Decision (S4): `src/lib/composePlayer.ts` - setInterval(25ms) lookahead (150ms window), converts tick cursor -> seconds via the project tempo map (pure engine math, D46), schedules per-group note voices (osc+ADSR recipes mirroring loopWav's scheduleChord - deterministic, no soundfont dependency) into `src/lib/composeMixer.ts` buses: `original:<trackIndex|composite>`, `genBass`, `genChords`, `genPad`. Mixer buses connect to a NEW additive audio.ts method `getMixBusInput(): AudioNode | null` returning the compressor field (stored since D33) so Compose shares the safety limiter + reverb send; pre-init fallback to destination. Per-group volume/mute from `composeSession.mixer`; solo computed at read time (solo set non-empty -> others 0). Tempo changes honored by re-deriving secPerTick at each bar boundary (piecewise map). Original tracks play back untransposed (REQ-TRANS-3: file key respected); accompaniment transposition is opt-in via the request (`transposeAccompaniment: number` applied at PLAN time in S3's assemble, never to the original). Space/O/A keyboard routing: one mode-gated branch in App's existing key handler (search `case "Space"` in App.tsx) - the ONLY App.tsx edit in Phase 4 outside S2's ModeGate prop passthrough review.
Rejected: driving backingEngine (its beats are BackingStyle patterns from chord notes - wrong object; generated accompaniment is pre-planned note data); reusing rhythmEngine (fixed 16th grid, no tempo map, W2-sacred).
Confidence: HIGH.

### D51: Combined MIDI export = @tonejs/midi encoder; midi-writer-js stays etude-domain.

Decision: `src/lib/composeExport.ts` builds `new Midi()`, sets header.tempos/timeSignatures/keySignatures from the NormalizedProject, adds one track per original track + one per generated role (notes via `addNote({ticks, durationTicks, midi, velocity})`), `writer.toArray()` -> Blob download (reuse download helpers). Encoder round-trip verified this round (Encode.js writes all three meta types) - REQ-COMP-40 "preserving tempo map and time signatures" is met with ZERO new deps. midiExport.ts is NOT extended (duration-string API cannot express ticks). Golden test: project -> encode -> parse -> normalize -> deep-equal (modulo name/defaults) - the strongest fidelity pin available.
Confidence: HIGH.

### D52: Pattern library = authored engine data (16th-step masks); density = deterministic thinning; bass idioms = seeded functions.

Decision (S3): `engine/compose/patterns.ts` - one entry per ChordPatternId: `{ id, stepsPerBar: 16 (per-beat grid expanded by meter), hits: readonly {step, accent, span}[] }` for freddieGreen (quarters, even), charleston (1 + "and-of-2"), block, pulse, offbeat, lazy (swung late hits), sustain (one whole-bar hit), alberti (broken 1-5-3-5 eighths). Meter expansion: 6/8/7/8 fold the per-beat grid onto compound beats (documented table, tested). `engine/compose/bass.ts` - walking (quarters through next-root with chromatic/diatonic approach, range-clamped to registers.bass), twoFeel (root bar / fifth bar), rootFifth, eighthPulse, shuffleBoogie (16th shuffle cells), drone (whole root). Density 0..5 THINS (REQ-COMP-33): keep step iff `stepWeight(step) >= threshold(density)` where stepWeight = accent rank (downbeat > beat > offbeat) - thinning NEVER reshapes (no rng in the mask; rng is reserved for pitch choices + rootless decisions, REQ-COMP-36 seed semantics). Realization: pattern x voicing x chord grid x ppq -> `MidiNote[]` per role. Determinism pinned by double-run byte-equality tests (Phase 3 precedent).
Confidence: HIGH.

### D53: Chord-chart paste = new engine parser; feeds the SAME grid + accompaniment pipeline (REQ-IO-16).

Decision (S4): `engine/io/chordchart.ts` - `parseChordChart(text): Outcome<ChordChart>` handling directives `{key: C} {tempo: 118} {time: 4/4} {style: jazz}`, whitespace-separated bar tokens, `/` = two chords in one bar, `%` = repeat previous bar, `|` ignored, non-chord tokens -> warnings not errors (REQ-IO-15). Token spelling via a local chord-symbol recognizer built on core/chords tables (root + quality suffix grammar; "Cmaj7", "F#m7b5", "Bb7", "Em7/A" bass slash). Output = ChordGrid-compatible cells + a synthetic single-"project" shape (no original tracks) so the S3 generator and S4 player/export treat MIDI-imported and chart-imported songs identically. The iReal importer in src/lib/ireal.ts is NOT reused (different token semantics, HarmonicPath output - catalog domain).
Confidence: HIGH.

### D54: Performance = main thread first, worker escape hatch designed-in, honest CI budget.

Decision: parse+analyze is a PURE FUNCTION of bytes-derived DTO (D46) - the Web Worker lift (vite-native `new Worker(new URL(...), { type: "module" })`, zero new deps) is mechanical and lands ONLY IF the perf harness fails the budget. Expected analysis cost is trivial (O(notes) histograms + 24 correlations + bars x 12 roots x 16 templates); the real cost is @tonejs/midi byte-parsing of a 30MB file (worst case, main thread, one-time). CI pin: synthetic 3-min 8-track (~30k notes) parse+normalize+analyze < 1500ms (flake-free margin); `scripts/compose-perf.ts` (tsx) prints p50/p95 over 10 runs locally against the < 500ms PRD target. 30MB cap enforced pre-parse (REQ-COMP-1) with a friendly error.
Confidence: MEDIUM-HIGH (CI hardware variance is the risk; the escape hatch is the mitigation).

### D55: Slice map - four shippable slices.

| Slice | Ships | PRD reqs closed | Est. |
|---|---|---|---|
| 1 (NOW) | engine/compose/ (normalize, tempo, roles, key, melody, harmony inference) + engine/core/chords.ts extraction + src/lib/composeMidi.ts adapter + golden corpus + perf harness + purity floor 21->29 | REQ-COMP-2/3/4/10/11/12/13/14/15, 50/51/52/53 (engine side), REQ-FND-1, REQ-NFR-5, REQ-PED-1 (analyzers) | 4-6 dev-days |
| 2 | Real ComposeSurface (drop zone + file validation + edge-case UX + re-upload prompt), analysis card (editable everything, confidence tiers, chord-cell popover w/ autocomplete+split, undo via useHistory), piano-roll preview (melody-only, P1 carve), store v4 migration, SHA-256 hash, FUTURE_PLANNING corrections C1/C2 | REQ-COMP-1/5(P1 carve)/6/20/21/22/23/24, REQ-IO-70 (already shipped - preserved), REQ-PED-4 compose portion + PED-5 (drawer exists), REQ-PED-7 (Notes toggle reuse pattern) | 1-1.5 wk |
| 3 | engine/compose/voicing + patterns + bass + assemble (AccompanimentRequest -> note data), pattern library data, accompaniment panel UI (style/roles/density/register/seed+randomize) | REQ-COMP-30/31/32/33/34/35/36, REQ-STYLE consumption (first real StyleProfile consumer), REQ-FND-2/3 usage | 1-1.5 wk |
| 4 | composePlayer + mixer (per-group volume/mute/solo, O/A keys), combined MIDI export, WAV full mix (offline), chord-chart paste + preview grid, URL compose params (stretch), tiny e2e fixture spec | REQ-COMP-37/40/41(P1), REQ-IO-10..16, REQ-TRANS-3 (file key respected + opt-in offset), REQ-IO-50/51 (stretch) | 1-1.5 wk |

Total 3.5-5 weeks vs PRD's 3-4 nominal - flagged honest in Risks (RK1). Slice 1 is zero-UI, zero-risk, additive; every later slice depends ONLY on Slice 1's types + functions.
Confidence: HIGH.

### D56: Purity floor ladder.

21 -> 29 (S1: core/chords.ts + compose/{types,normalize,tempo,roles,key,melody,harmony}.ts) -> 33 (S3: compose/{patterns,voicing,bass,assemble}.ts) -> 34 (S4: io/chordchart.ts). Bumped in the SAME commit as the first new source (D20 precedent). Guard auto-walks; no other change.
Confidence: HIGH.

---

## 3. Slice map - unblock proof (Slice 1 API -> later slices)

- `NormalizedProject` + `MidiJsonLike` + `normalizeMidiJson` -> S2's drop zone is `file.arrayBuffer() -> new Midi -> toJSON -> normalize -> analyze -> dispatch(store)`. Nothing UI-side knows MIDI.
- `analyzeProject` -> S2's analysis card reads `ComposeAnalysis` + writes `AnalysisOverrides`; merge is a pure function (`mergeAnalysis(analysis, overrides)` in types.ts) so the card renders merged truth.
- `ChordGrid` (bars of regions, tick-aligned) -> S3's `generateAccompaniment(request, grid, project)` signature takes EXACTLY this; S4's chart-paste produces the same grid shape.
- `tempo.ts` (`ticksToSeconds`, `barBoundaries`) -> S4's player scheduler and export writer import the same functions the analyzer used (one tempo-map truth).
- `Outcome` + `AnalysisError` -> every UI error string maps from `error.code` (no exceptions anywhere, REQ-COMP-15).
- `confidenceTier(c)` in types.ts -> S2's tier UI (>0.80 auto / 0.50-0.80 highlight / 0.30-0.50 radio / <0.30 manual, REQ-COMP-22).

---

## 4. Slice 1 - file tree

```
engine/
  core/
    chords.ts             shared quality/name tables + spellChordName (MOVED from etude/harmony)
    chords.test.ts        table completeness + spelling pins
  compose/
    types.ts              NormalizedProject, MidiJsonLike, Outcome, analysis types, overrides, confidenceTier
    normalize.ts          normalizeMidiJson(json, fileName): Outcome<NormalizedProject>
    tempo.ts              tempo map math: ticksToSeconds, secondsToTicks, barBoundaries, durationSec
    roles.ts              classifyRoles(project): readonly TrackRoleAssignment[]
    key.ts                detectKey(project, window?): KeyResult (Krumhansl-Schmuckler)
    melody.ts             extractMelody(project, roles): MelodyResult
    harmony.ts            inferChords(project, grid): ChordGrid; segmentGrid(project, slotsPerBar)
    normalize.test.ts  tempo.test.ts  roles.test.ts  key.test.ts  melody.test.ts  harmony.test.ts
    corpus.test.ts        golden corpus: synthetic-song key accuracy + hand-built edge DTOs + round-trip fixtures
  etude/
    harmony.ts            EDIT: import { QUALITY_INTERVALS, NAME_SUFFIX, keyUsesFlats, spellChordName } from "../core/chords"; re-export (zero behavior change)
  purity.test.ts          EDIT: MIN_SCANNED_FILES = 29
src/lib/
  composeMidi.ts          adapter: parseMidiBytes(ArrayBuffer): MidiJsonLike (the ONLY @tonejs/midi import in the repo)
  composeMidi.test.ts     encoder round-trip: build Midi -> bytes -> parse -> normalize -> project assertions
  composeMidi.perf.test.ts  3-min synthetic file, CI budget < 1500ms (D54)
scripts/
  compose-perf.ts         local bench, p50/p95 vs 500ms target (tsx, not in CI gate)
```

Rules for new engine files: ASCII only; no console; no Math.random/Date.now/new Date/performance.now; relative imports only; NO @tonejs/midi or tonal inside engine/ (the DTO makes it unnecessary); all randomness via injected Rng (S1 analyzers use NONE - detection is deterministic by construction); plain-serializable data everywhere (worker-liftable, D54).

## 5. Slice 1 - type definitions (copyable)

### engine/compose/types.ts

```ts
import type { Versioned } from "../core/versioned";
import type { Annotation } from "../pedagogy/types";

/** REQ-COMP-15 / NFR-5. Analyzers return outcomes; they never throw. */
export type AnalysisErrorCode =
  | "noNotes"        // REQ-COMP-50: empty MIDI
  | "parseFailed"    // corrupt / not a MIDI file
  | "unsupported"    // SMF format > 2, ppq 0, etc.
  | "tooLarge"       // > 30MB cap (checked pre-parse, REQ-COMP-1)
  | "internal";      // bug guard: message is generic, never a stack

export interface AnalysisError {
  readonly code: AnalysisErrorCode;
  readonly message: string; // human-readable, ASCII, UI-safe
}

export type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AnalysisError };

/** PRD 11.1 MidiNote. Tick-native (REQ-COMP-14); velocity normalized 0..1
 *  (pinned to @tonejs/midi's convention; adapters converting raw 0..127
 *  bytes divide by 127 - normalize.ts owns this). */
export interface NormalizedNote {
  readonly midi: number;          // 0..127 (REQ-FND-1)
  readonly tick: number;          // absolute start tick
  readonly durationTicks: number; // >= 1 after normalize (clamped)
  readonly velocity: number;      // 0..1
}

export type TrackRole = "melody" | "bass" | "harmony" | "percussion" | "unknown";

/** Parse output track (roles are ANALYSIS output, not parse output -
 *  roles.ts consumes a project and returns assignments). */
export interface NormalizedTrack {
  readonly index: number;         // 0-based, parse order
  readonly name: string;          // track name meta or ""
  readonly channel: number;       // 0..15; FORMAT 0 CAVEAT: last-seen channel
                                  // (F6) - roles/key/harmony never trust it
                                  // except channel===9 percussion detection on
                                  // format 1/2
  readonly program: number;       // 0..127 GM program, 128 = unknown
  readonly isPercussion: boolean; // channel === 9 (format 1/2 only, see above)
  readonly notes: readonly NormalizedNote[]; // ascending by tick (test-pinned)
  readonly endTick: number;       // last noteOff across notes
  readonly usesPitchBend: boolean; // REQ-COMP-6 warning source
}

export interface ProjectTempo { readonly tick: number; readonly bpm: number; }
export interface ProjectTimeSignature {
  readonly tick: number; readonly numerator: number; readonly denominator: number;
}
export interface ProjectKeySignature {
  readonly tick: number; readonly tonicPc: number; readonly mode: "major" | "minor";
}

/** PRD 11.1 NormalizedProject. Plain-serializable (worker + future
 *  MusicXML import, REQ-IO-60). Versioned per REQ-FND-5. */
export interface NormalizedProject extends Versioned {
  readonly format: 0 | 1 | 2;
  readonly ppq: number;                    // ticks per quarter, > 0
  readonly name: string;                   // from header/first track
  readonly fileName: string;               // upload surface original
  readonly tempos: readonly ProjectTempo[];        // ascending, [0] = {tick:0}
  readonly timeSignatures: readonly ProjectTimeSignature[]; // ascending
  readonly keySignatures: readonly ProjectKeySignature[];   // ascending (may be [])
  readonly tracks: readonly NormalizedTrack[];
  readonly endTick: number;                // max across tracks
  readonly durationSec: number;            // derived via tempo map
  readonly warnings: readonly string[];    // ASCII, UI-displayable
}

/** Structural view of @tonejs/midi's MidiJSON - declared HERE so engine
 *  never imports the package (D46/F7). Field set = exactly what
 *  normalize.ts reads; extra fields are ignored. */
export interface MidiJsonLike {
  readonly header: {
    readonly ppq: number;
    readonly name: string;
    readonly tempos: readonly { readonly ticks: number; readonly bpm: number }[];
    readonly timeSignatures: readonly {
      readonly ticks: number; readonly timeSignature: readonly number[];
    }[];
    readonly keySignatures: readonly {
      readonly ticks: number; readonly key: string; readonly scale: string;
    }[];
  };
  readonly tracks: readonly {
    readonly name: string;
    readonly channel: number;
    readonly instrument: { readonly number: number };
    readonly notes: readonly {
      readonly midi: number; readonly ticks: number;
      readonly durationTicks: number; readonly velocity: number;
    }[];
    readonly pitchBends?: readonly unknown[];
    readonly endOfTrackTicks?: number;
  }[];
}

/** REQ-COMP-4. */
export interface TrackRoleAssignment {
  readonly trackIndex: number;
  readonly role: TrackRole;
  readonly confidence: number; // 0..1
}

/** REQ-COMP-10. */
export interface KeyCandidate {
  readonly tonicPc: number;    // 0..11
  readonly mode: "major" | "minor";
  readonly correlation: number; // Pearson r, -1..1
}
export interface KeyResult {
  readonly candidates: readonly KeyCandidate[]; // ranked, length 3
  readonly declared: ProjectKeySignature | null; // from SMF meta, if any
  readonly chromaticFallback: boolean; // REQ-COMP-52: top r < 0.50
}

/** REQ-COMP-11. */
export interface MelodyResult {
  readonly sourceTrackIndex: number | null; // null = synthesized top line
  readonly synthesized: boolean;
  readonly notes: readonly NormalizedNote[]; // ascending by tick
}

/** REQ-COMP-12/23. One cell = one chord slot. */
export interface ChordCell {
  readonly rootPc: number;         // 0..11
  readonly qualitySymbol: string;  // core/chords key, e.g. "maj7", "m7", "dom7"
  readonly name: string;           // spelled display, e.g. "Dm7" (D11 rules)
  readonly bassPc: number | null;  // slash bass if detected != root, else null
  readonly confidence: number;     // 0..1 (calibrated, see spec)
  readonly alternatives: readonly ChordCell[]; // top-3 EXCLUDING chosen,
                                               // confidence descending, each
                                               // alternatives[].alternatives = []
  readonly isRest: boolean;        // empty region -> rest (deletable cell)
}
export interface BarRegions {
  readonly bar: number;            // 0-based
  readonly startTick: number;
  readonly endTick: number;
  readonly slots: readonly ChordCell[]; // length = slotsPerBar for this bar
}
export interface ChordGrid {
  readonly slotsPerBar: number;    // 1 default; 2 when split (REQ-COMP-23)
  readonly bars: readonly BarRegions[];
}

/** REQ-COMP-53: default analysis window 4 minutes of musical time. */
export interface AnalysisWindow {
  readonly fromTick: number;
  readonly toTick: number; // exclusive; clamped to project.endTick
}

/** The S1 pipeline output. Versioned (future localStorage/URL safety). */
export interface ComposeAnalysis extends Versioned {
  readonly roles: readonly TrackRoleAssignment[];
  readonly key: KeyResult;
  readonly melody: MelodyResult;
  readonly grid: ChordGrid;
  readonly window: AnalysisWindow;      // what was ACTUALLY analyzed
  readonly truncated: boolean;          // REQ-COMP-53: file longer than window
  readonly percussionOnly: boolean;     // REQ-COMP-51
  readonly annotations: readonly Annotation[]; // REQ-PED-1 (truthful only)
}

/** REQ-COMP-21: every detected value overridable. Sparse by design. */
export interface AnalysisOverrides {
  readonly key: KeyCandidate | null;
  readonly tempoBpm: number | null;
  readonly timeSignature: readonly [number, number] | null;
  readonly melodyTrackIndex: number | null;
  readonly chordCells: Readonly<Record<string, ChordCell | null>>; // "bar:slot"; null = rest
  readonly roles: Readonly<Record<string, TrackRole>>;             // trackIndex -> role
}
export const EMPTY_OVERRIDES: AnalysisOverrides;
export function mergeAnalysis(a: ComposeAnalysis, o: AnalysisOverrides): ComposeAnalysis;
// Pure merged view the card renders; merge NEVER mutates a.

/** REQ-COMP-22 tiers. Boundary semantics pinned: >0.80 auto; >=0.50
 *  highlight; >=0.30 radio; else manual. */
export type ConfidenceTier = "auto" | "highlight" | "radio" | "manual";
export function confidenceTier(c: number): ConfidenceTier;
```

### engine/compose/normalize.ts

```ts
export function normalizeMidiJson(json: MidiJsonLike, fileName: string): Outcome<NormalizedProject>;
```
Contract: sorts notes by tick; drops midi <0/>127 (warning, count); clamps durationTicks to >= 1; velocity assumed 0..1 (values > 1 treated as 0..127 legacy and divided - defensive); empty tempos -> [{tick:0,bpm:120}] + warning "no tempo event; assumed 120 BPM"; empty timeSignatures -> 4/4 @0 + warning; key sigs parsed via core/spelling `parseKey(key + " " + scale)`; ppq <= 0 or format > 2 -> error arm; zero pitched notes across all tracks -> `{ok:false, error:{code:"noNotes"}}` (REQ-COMP-50; percussion-only is NOT noNotes - it proceeds with `percussionOnly: true` set by the analyzer); total note count > 200_000 -> "tooLarge" (defensive ceiling, message says so).

### engine/compose/tempo.ts

```ts
export function ticksPerBar(ppq: number, ts: ProjectTimeSignature): number; // num*ppq*4/den
export function barBoundaries(project: NormalizedProject, upToTick?: number): readonly {startTick:number; endTick:number; timeSignature: ProjectTimeSignature}[]; // REQ-COMP-13/14: tick-derived, meter-change aware
export function ticksToSeconds(project: NormalizedProject, tick: number): number;   // piecewise over tempo map
export function secondsToTicks(project: NormalizedProject, sec: number): number;
export function defaultWindow(project: NormalizedProject): AnalysisWindow; // first 4 min in TICKS via secondsToTicks(240); truncated = endTick > toTick
```
Bar length in ticks = `num * ppq * 4 / den` where den is the REAL denominator: 4/4 -> 4*ppq; 3/4 -> 3*ppq; 6/8 -> 3*ppq (six eighths = three quarters; cross-check with rhythm.ts's 6/8 grid: 12 sixteenth-steps x ppq/4 = 3*ppq - same truth, different unit); 5/4 -> 5*ppq; 7/8 -> 3.5*ppq (integer for every even ppq; for a pathological odd ppq, barBoundaries rounds and pins - tested). NOTE: the SMF time-signature denominator byte is a POWER-OF-TWO CODE (2=half, 4=quarter, 8=eighth). normalize.ts converts code -> real denominator BEFORE storage (`den = 2 ** code`); the formula above consumes the REAL value. Test pins both directions - the classic SMF gotcha, called out for the implementer.

### engine/compose/roles.ts

```ts
export function classifyRoles(project: NormalizedProject): readonly TrackRoleAssignment[];
```
Feature extraction per pitched track: meanMidi, midiSpan, noteCount, avgDurTicks, maxPolyphony (sweep-line), onsetRate (onsets per bar), name regex (`/melod|lead|solo|voice|flute|violin|trumpet|sax/i` -> melody prior; `/bass/i` -> bass; `/piano|guitar|pad|comp|keys/i` -> harmony prior). Percussion: `channel === 9 && format !== 0` OR name `/drum|perc|kit/i` -> role percussion, confidence 0.99 (skips features). Scores (all constants named + exported for tests):
- bassScore = registerLow(meanMidi < 45) * .5 + monophonic(maxPoly <= 2) * .3 + steadyPulse * .2
- melodyScore = registerHigh(meanMidi > 62) * .35 + linearity(maxPoly === 1) * .35 + moderateOnsets * .15 + namePrior * .15
- harmonyScore = polyphony(maxPoly >= 3) * .4 + sustain(avgDur long) * .3 + midRegister * .3
- confidence = topScore; role = argmax; topScore < 0.35 -> "unknown".
Format-0 single composite track: features over ALL notes (channel ignored, F6) -> typically "unknown" or "harmony"; melody extraction does not depend on it (fallback path). Deterministic, no rng, no clock.

### engine/compose/key.ts (Krumhansl-Schmuckler spec)

```ts
export function detectKey(project: NormalizedProject, window: AnalysisWindow): KeyResult;
export function pcProfile(notes: readonly NormalizedNote[], window: AnalysisWindow): readonly number[]; // 12 bins, duration-weighted (sum durationTicks within window), rest-normalized
export const KK_MAJOR: readonly number[]; // Krumhansl-Klinger 1982: [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]
export const KK_MINOR: readonly number[]; // [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]
export function pearson(a: readonly number[], b: readonly number[]): number; // hand-rolled, zero deps
```
24 candidates = 12 rotations x {major, minor}; ranked by r descending; `candidates` = top 3 (deduped by (tonicPc,mode)). Atonal edge (REQ-COMP-52): top r < 0.50 -> `chromaticFallback: true` (candidates still returned; UI forces manual chart). Fewer than 8 distinct pcs or total weight < 16 notes -> fallback true. `declared` key sig: surfaced SEPARATELY (never blended into r); the card's default selection = declared when present (composers' intent beats statistics), else top candidate. Profiles are the published KK values (data, cited in the header comment); hand-rolled math keeps engine purity (no tonal import).

### engine/compose/melody.ts (REQ-COMP-11)

```ts
export function extractMelody(project: NormalizedProject, roles: readonly TrackRoleAssignment[], window: AnalysisWindow): MelodyResult;
```
1. Highest-confidence role === "melody" track -> its notes (sourceTrackIndex, synthesized: false).
2. Else synthesize top line: sweep the window in onset order across non-percussion tracks; maintain a current sounding line; at each onset where another voice sounds HIGHER at that tick, JUMP to the higher pitch only if it is a metric advance (>= eighth at ppq/2) or a track change (hysteresis against trills); sustain otherwise. Output normalized to ascending ticks, no overlaps (test-pinned). Deterministic tie-break: lower trackIndex wins.

### engine/compose/harmony.ts (inference spec, REQ-COMP-12/13/23)

```ts
export function segmentGrid(project: NormalizedProject, window: AnalysisWindow, slotsPerBar: number): ChordGrid; // empty cells (isRest true, confidence 0)
export function inferChords(project: NormalizedProject, grid: ChordGrid, key: KeyCandidate): ChordGrid; // fills cells, returns NEW grid
export function reinferBar(project: NormalizedProject, grid: ChordGrid, bar: number, key: KeyCandidate, slots: 1 | 2): readonly ChordCell[]; // S2 split support
```
Per region: collect (pc, weight) with weight = durationTicks x metricWeight(onset position within bar: downbeat 1.0, other beats 0.6, off-beats 0.3). Template match over core/chords QUALITY_INTERVALS (16 qualities x 12 roots): `coverage = sum(weights of pcs in template) / totalWeight`; `foreign = sum(weights of pcs NOT in template) / totalWeight`; `bassPc` = pc with max weight among the region's LOWEST sounding pitches (bass window = first half of region); score = coverage - 0.6 * foreign - (bassPc !== root && !inTemplate(bassPc) ? 0.25 : 0). Chosen = argmax; `confidence = clamp01(score / bestTheoretical)` where bestTheoretical = 1 - 0.6*0 (perfect) scaled by distinct-pc count (2-note regions cap confidence at 0.6 - ambiguous by nature). Slash naming: bassPc !== root && bassPc in template -> `name + "/" + spelledBass`. alternatives = next 3 distinct (root,quality) scores. Region with < 2 distinct pcs -> carry previous bar's chosen at confidence x 0.5 (sus-style continuation) or rest if silent. Key weighting bonus: +0.05 when rootPc is diatonic to `key` (breaks maj/minor-relative ties toward the detected key). All arithmetic pure; no rng.
Spellings: `spellChordName(rootPc, qualitySymbol, key.tonicPc, key.mode)` (D47 core module) - flat/sharp family follows the key (D11 rules already pinned by etude tests).

### engine/core/chords.ts (D47 extraction)

Move verbatim from engine/etude/harmony.ts: `QUALITY_INTERVALS`, `NAME_SUFFIX`, `keyUsesFlats`, `spellChordName` (widen the mode param to `"major" | "minor"` local union `ChordMode`). etude/harmony.ts re-exports all four (its tests + assemble.ts keep their import paths). New named export `chordQualities(): readonly string[]` for the S2 popover autocomplete (quality suffix list) and `qualityIntervals(q): readonly number[] | null`.

### src/lib/composeMidi.ts (the ONLY package import site)

```ts
import { Midi } from "@tonejs/midi";
export const MAX_MIDI_BYTES = 30 * 1024 * 1024; // REQ-COMP-1
export async function readMidiFile(file: File): Promise<Outcome<NormalizedProject>>;
// size check -> file.arrayBuffer() -> try/catch new Midi(buf) -> toJSON ->
// normalizeMidiJson -> Outcome. NEVER throws (REQ-COMP-15).
export async function sha256Hex(buf: ArrayBuffer): Promise<string | null>;
// crypto.subtle guarded (F9): null when unavailable (jsdom/insecure ctx).
```

## 6. Slice 1 - test plan (colocated engine tests + src adapter tests; node env; invisible to the it( drift gate; tests/ untouched)

1. `normalize.test.ts` - hand-built MidiJsonLike fixtures: happy path (2 tracks, tempo map, 6/8, key sig Db major -> tonicPc 1); missing tempo -> default + warning; denominator CODE conversion (raw code 3 -> den 8); unsorted notes -> sorted; out-of-range midi dropped + warning; zero pitched notes -> noNotes error; ppq 0 -> unsupported; velocity > 1 legacy scaling; endTick/durationSec derivation.
2. `tempo.test.ts` - ticksPerBar table incl. the 6/8 pin (ppq 480 -> 720 ticks); piecewise ticksToSeconds across a tempo change (exact rational checks); barBoundaries across a mid-file meter change; defaultWindow at 240s exactly (secondsToTicks inverse pair).
3. `roles.test.ts` - synthetic tracks per archetype (walking bass line, single-line flute melody, sustained piano block chords, channel-9 drums, format-0 composite) -> role + confidence tier; name-regex priors; tie -> unknown; determinism (same input, two calls, deep-equal).
4. `key.test.ts` - hand-built pc profiles: C-major-diatonic corpus -> top candidate C major r > 0.9; A-minor corpus -> A minor; atonal (all 12 pcs flat) -> chromaticFallback true; declared-vs-detected separation; pearson self-test (r(x,x) === 1, anti-correlation).
5. `melody.test.ts` - melody-track path; top-line synthesis path (flute above piano comping -> flute wins; hysteresis: no trill jump on 16th alternation); no overlap invariant; window respected.
6. `harmony.test.ts` - unambiguous triads (C major block chord -> C maj, conf > 0.8); 7th vs triad preference (Bb present -> Cmaj7 over C); inversion slash detection (C/E); ii-V-I in D minor over the detected key (Dm7 | G7 | Cm7... minor mode table); split-region reinferBar (2 slots, first half F, second half G -> F + G); silent bar -> rest; alternatives top-3 ordering + empty nested alternatives.
7. `corpus.test.ts` (THE R1 mitigation):
   a. ACCURACY SUITE: 24 keys x major/minor synthetic songs (seeded via createRng, diatonic 4-voice realization + simple melody, 32 bars) -> `detectKey` top-1 >= 85% AND top-3 >= 95% (Appendix F bar, deterministic - same every run, no flake); chord top-1 bar-match >= 80% on block-chord variants.
   b. HAND-BUILT EDGE BYTES: raw SMF byte arrays (no @tonejs/midi needed - these are DTO fixtures): percussion-only (channel 9 format 1 -> percussionOnly true, grid all-rests, no throw); pitch-bend flag (usesPitchBend -> warning path); format 2 (two parallel clips, both kept, tick 0 starts); > 5 min (600s synthetic -> truncated true at default window).
   c. ROUND-TRIP: encode a small MidiJsonLike-shaped Midi via @tonejs/midi IN THE SRC TEST (composeMidi.test.ts) -> parse -> normalize -> assert field equality; and export-side preview: normalize -> Midi -> toArray -> re-parse -> normalize -> deep-equal (D51's fidelity proof, lives in composeMidi.test.ts).
8. `composeMidi.perf.test.ts` - generate a 3-min 8-track ~30k-note file IN MEMORY (@tonejs/midi encode), time parse+normalize+analyze; assert < 1500ms (CI-honest); prints ms via console.warn on failure only. `scripts/compose-perf.ts` runs 10 iterations, prints p50/p95 vs the 500ms target (manual gate, documented in DEVELOPING).
9. `chords.test.ts` - moved tables: every QUALITY_INTERVALS key spells through NAME_SUFFIX; qualityIntervals accessor; etude re-export identity (`import { spellChordName } from "./harmony"` === core export).
10. `types.test.ts` - confidenceTier boundary table (0.81/0.80/0.50/0.49/0.30/0.29); mergeAnalysis purity (input frozen - Object.isFrozen or deep snapshot); EMPTY_OVERRIDES round-trip.
11. purity floor 21 -> 29 in the same commit as the first new file (D20/D56 pattern).

Existing pins that MUST stay green untouched: tests/ it( = 362 (zero tests/ edits), count-tunes 40, curatedBriefing 12, no-debug-logs (src adapter: no console.* except warn/error), check:paths 36/36 (no new HarmonicPaths), check-links (docs/ is not scanned), tests/rhythm.test.ts, ModeGate empty-state copy (S1 does not touch UI - S2 must preserve). Expected vitest total: 1508 + ~90-120 new passing; skipped 1; failed 2 (CSS-WIP only).

## 7. Slice 1 - exact file plan + checklist

NEW: 8 engine sources + 8 engine tests + 3 src files (composeMidi.ts, composeMidi.test.ts, composeMidi.perf.test.ts) + scripts/compose-perf.ts. None exist -> zero collision.
EDITED: engine/etude/harmony.ts (extraction + re-export; CLEAN), engine/purity.test.ts (one line), CHANGELOG.md (standing practice).
NOT touched: everything else - zero UI, zero store, zero App.tsx, zero package.json (no new deps), zero tests/, zero dirty-11.

1. [ ] engine/core/chords.ts extraction + chords.test.ts + etude/harmony.ts re-export; `npx vitest run engine` green (etude tests prove zero behavior change). Commit: `refactor(engine): extract chord tables + spellChordName to core/chords (etude re-exports)`.
2. [ ] compose/types.ts (types + EMPTY_OVERRIDES + mergeAnalysis + confidenceTier) + types.test.ts.
3. [ ] compose/tempo.ts + tempo.test.ts (the denominator-code trap pinned first).
4. [ ] compose/normalize.ts + normalize.test.ts. Commit: `feat(engine): compose normalize + tempo map (tick-native SMF DTO)`.
5. [ ] compose/roles.ts + roles.test.ts; compose/key.ts + key.test.ts. Commit: `feat(engine): Krumhansl-Schmuckler key detection + track role classifier`.
6. [ ] compose/melody.ts + melody.test.ts; compose/harmony.ts + harmony.test.ts. Commit: `feat(engine): melody extraction + per-region chord inference with confidence + top-3`.
7. [ ] corpus.test.ts (accuracy + edge bytes). Commit: `test(engine): compose golden corpus - 85% key-accuracy property pin + SMF edge cases`.
8. [ ] src/lib/composeMidi.ts + round-trip + perf tests + scripts/compose-perf.ts; purity floor -> 29 (same commit as step 1's first engine file if the developer batches - the guard fails loudly otherwise). Commit: `feat(compose): @tonejs/midi adapter + round-trip + perf harness (first consumer)`.
9. [ ] Gates: `npm run lint` -> `npm test` -> `npm run build` (both configs) -> `npm run check:paths` -> `node assets/check-links.cjs`.
10. [ ] Commit style: `feat(compose): phase 4 slice 1 ...`.

## 8. Slice 2 sketch (upload UI + analysis card) - proves unblocking

- ComposeSurface rewrite: empty state KEEPS the pinned heading + privacy aside (REQ-IO-70 already shipped - do not regress); adds a real drop zone (drag events + file input accept=".mid,.midi"), size/format validation via readMidiFile Outcome (no throws), "Re-upload <fileName>" prompt when composeSession exists without a project, edge-case banners (noNotes/percussionOnly/chromaticFallback/truncated + "analyze full file" button REQ-COMP-53), pitch-bend warning (REQ-COMP-6).
- Store v4: ComposeSlice per D48 (sessionV3ToV4 in engine/migrations + version bump in BOTH files + partialize + actions setComposeProject/setComposeOverrides/setComposeSession); sessionStore.test.ts (jsdom, already registered) extended - it is a src test, editable.
- AnalysisCard.tsx: file name/duration/tempo/meter/key/melody track + chord grid; every field editable (REQ-COMP-20/21); tier rendering via confidenceTier (REQ-COMP-22: auto = plain text; highlight = amber ring; radio = 3-way candidate picker; manual = input); ChordCellPopover.tsx (NEW - NOT ChordInspector): autocomplete from `chordQualities()` + spelled root names + recent + `parseChordToMidi` from src/lib/ireal.ts as the symbol validator, delete + split buttons (split -> reinferBar at 2 slots, S1 API); undo via useHistory wrapping the overrides map (REQ-COMP-24); margin-note chips + About list reusing the slice-3 pattern (REQ-PED-4 compose portion + PED-5 -> existing ConceptDrawer, local state like EtudeViews D37).
- Piano roll preview (REQ-COMP-5 P1 carve): static SVG of the MELODY track only (EtudePianoRoll precedent), not a multi-track virtualized roll (that is the Phase 8 editor's job).
- App.tsx edits: none beyond what ModeGate already passes (surface reads the store directly).
- FUTURE_PLANNING.md: correct rows C1 + C2 in the same commit (docs honesty).

## 9. Slice 3 sketch (accompaniment engine + panel)

- engine/compose/voicing.ts: `voiceSequence(cells: readonly ChordCell[], profile, rng, register?): readonly number[][]` - first chord close-voiced in registers.chords; subsequent = greedy nearest-pc per voice (clean-room, D47), inversionAwareness honored, rootlessRate via rng, style shapes: close/drop2 (reuse etude realization math via core tables)/quartal (stacked 4ths filtered to chord pcs)/spread (alternating octaves)/block (triad only).
- engine/compose/patterns.ts + bass.ts per D52; engine/compose/assemble.ts: `generateAccompaniment(req: AccompanimentRequest, grid, project, clock): Outcome<AccompanimentResult>` - roles -> per-role MidiNote[] on the tick grid, density thinning, seed (REQ-COMP-36), transposeAccompaniment offset (REQ-TRANS-3 opt-in), determinism matrix test (seed x style x density double-run byte-equality), equivalence test vs theory.applyVoiceLeading (src-side, D47).
- UI: AccompanimentPanel.tsx (style select from shippedStyleIds, role checkboxes, density slider 0-5 + register select REQ-COMP-35, seed input + randomize REQ-COMP-36, Generate button); generation is <500ms trivially (pure loops over bars).
- Purity floor 29 -> 33 (D56).

## 10. Slice 4 sketch (mix + export + chart paste)

- composePlayer.ts + composeMixer.ts per D50 (transport: play/pause/seek/loop-range over bars - Compose-local, NOT the F3 machinery; stopAll on unmount guarded); audio.ts additive `getMixBusInput()`; PlaybackView.tsx: group rows (original tracks grouped by role + 3 generated) with volume sliders + M/S (REQ-COMP-37), O/A keys (App mode-gated branch), Space routes to composePlayer when mode === compose.
- composeExport.ts per D51 (combined MIDI: original tracks + generated, tempo map + time sigs preserved; filename `songkey` suffix = REQ-COMP-43 P2 stretch); WAV full mix (REQ-COMP-41 P1): OfflineAudioContext render of the SAME scheduling code (parameterize ctx), encodeWav extracted from loopWav.ts to src/lib/wav.ts (loopWav is CLEAN; its tests keep passing via re-export); stems ZIP (REQ-COMP-42 P2) DEFERRED (fflate exists - trivial follow-up, honest carve-out).
- engine/io/chordchart.ts + PastePanel per D53 (directives, tokens, preview grid = the same ChordCellPopover grid, REQ-IO-14; warnings inline REQ-COMP-15/IO-15; feeds generateAccompaniment directly REQ-IO-16).
- URL compose params (REQ-IO-50/51): stretch - reuse the single debounced writer pattern (ADR-015); fileHash + overrides + request + seed; recipient re-upload prompt.
- e2e: ONE spec `e2e/compose-upload.spec.ts` with a ~600-byte committed fixture in public/fixtures/ (tiny binary justified; generated deterministically from the S1 corpus script) - drop -> analysis card renders -> override key -> generate -> export button enabled. Purity floor 33 -> 34.

## 11. PRD-vs-reality conflicts (flagged, adjudicated)

| # | PRD says | Reality | Verdict |
|---|---|---|---|
| X1 | REQ-IO-30/COMP-41 "WAV via Tone.Offline" | Tone.Offline absent (tone is a transitive; zero imports). Raw OfflineAudioContext exists (loopWav). | D52/S4: raw OfflineAudioContext. Documented deviation (same class as D16 abcjs-not-VexFlow). |
| X2 | Alignment table: "ImportExportModal reads .mid" | FALSE (F5/C1) - text-only importer into the etude catalog. | New pipeline; modal untouched; table corrected in S2. |
| X3 | REQ-COMP-2 "SMF 0/1/2 via @tonejs/midi" | Library flattens multi-channel format 0 (no per-note channel). | Accepted: format-0 files analyze correctly at the composite level (key/harmony are channel-agnostic); roles/mix degrade; warning surfaced. midi-file direct-dep escape hatch deferred to a future ADR if real files demand it. |
| X4 | PRD 11.1 MidiNote.velocity (unit unstated) | @tonejs/midi normalizes 0..1. | Pinned 0..1 in types + test. |
| X5 | REQ-COMP-1 30MB cap + NFR perf <500ms p95 | 30MB parse on the main thread can exceed 500ms; analysis itself is O(notes) trivial. | D54: cap pre-parse; perf harness gates; worker lift is a designed-in mechanical follow-up. |
| X6 | REQ-IO-50 URL-serialize "all modes' state" P0 | Uploaded content never in URL (hash only); hash needs crypto.subtle (absent in jsdom, insecure contexts). | S4 stretch with F9 guard; persisted store slice already carries the payload; honest carve-out. |
| X7 | PRD sec 14 puts chord-chart paste in Phase 8 | Task packet scopes it into Phase 4 (S4). | Follow the packet; PRD phases are advisory groupings (sec 14 vs sec 8.7 P0 priorities). |
| X8 | REQ-COMP-5 piano-roll preview P1 | Multi-track virtualized roll is editor-scale work (Phase 8). | S2 ships melody-track-only static SVG; carve-out documented. |
| X9 | Sec 14 Phase 4 nominal 3-4 weeks | Four slices estimate 3.5-5 weeks. | Flagged (RK1); slices are independently shippable - partial Phase 4 is a valid state (Phase 3 precedent). |
| X10 | REQ-COMP-42 stems ZIP, REQ-COMP-43 filename key (P2) | fflate present; both small. | 43 ships opportunistically in S4; 42 deferred (P2 honesty). |

## 12. Risks & mitigations

| Risk | P | I | Mitigation |
|---|---|---|---|
| RK1: Phase 4 overruns the 3-4 week envelope | M | M | Four independently shippable slices; S1 ships value (engine + corpus) with zero UI risk; PRD sec 14 timings are planning aids. |
| RK2: Analysis accuracy poor on real-world MIDI (R1 carried) | M | H | corpus.test.ts 85%/95% property pins; confidence tiers + full overrides (D49/D55); warnings never dead-ends; golden corpus is deterministic (seeded). |
| RK3: 30MB parse jank on main thread | M | M | D54 budget gate; worker escape hatch (pure-function pipeline, D46); cap enforced pre-parse. |
| RK4: zustand v4 migration corrupts existing sessions | L | H | sessionV3ToV4 is append-only (`composeSession: null`); migration failure -> runner returns not-ok -> store warns + starts fresh (existing behavior, pinned by sessionStore.test.ts pattern); no shape changes to existing fields. |
| RK5: composePlayer drifts against WebAudio time | M | M | Tick-based lookahead (25ms/150ms) like rhythmEngine's proven pattern; tempo map unit-tested (tempo.test.ts exact rationals); no reliance on rAF clock (playbackClock explicitly NOT used, D50). |
| RK6: ModeGate.test.tsx empty-state copy breakage during S2 | M | L | Heading string pinned in the S2 checklist ("Drop a .mid file to get started." must survive); src test, editable only as a LAST resort with explicit PR note. |
| RK7: Engine/src voicing divergence (D47 clean-room) | L | M | Equivalence test imports both implementations on shared fixtures (S3); theory.ts frozen (no new callers added). |
| RK8: format-0 user files mis-mixed (channel loss) | M | L | Warning banner ("single-track file analyzed as composite"); melody top-line fallback already designed (REQ-COMP-11); future ADR if needed. |
| RK9: Scope creep into piano-roll editing / stems / MusicXML import | M | M | Section 13 DO-NOT list; PRD P1/P2 boundaries held. |
| RK10: Snapshot discipline (standing repo rule) | L | H | PHASE-2-02: FILE-COPY snapshots per round, never git checkout/reset during test iteration. |

## 13. DO NOT build in this pipeline (Slice 1)

- NO UI: ComposeSurface, store, App.tsx, components untouched (S2+).
- NO zustand/migration edits (S2 owns v4).
- NO audio.ts / backingEngine / rhythmEngine / playbackClock changes (S4 owns playback; the metronome bus and W2 handler are frozen contracts from Phase 3).
- NO accompaniment generation (S3); NO export (S4); NO chord-chart parser (S4).
- NO new npm deps (@tonejs/midi finally USED, not replaced); NO midi-file direct dependency (X3).
- NO edits to: tests/ (it( stays 362), the 11 dirty components, src/lib/studies.ts, src/lib/theory.ts (D47 freezes it), src/lib/paths.ts, src/lib/midiExport.ts, README.md, SPEC.md, AGENTS.md, .kai/, vitest.config.ts (engine + src/lib tests are auto-routed node; no new DOM tests in S1), package.json.
- NO Web Worker yet (D54 - only if the harness fails).
- NO Web MIDI / piano-roll editor / stems ZIP / MusicXML import (PRD Phases 7-8).

## 14. Traceability

REQ-COMP-1 (cap check) -> composeMidi.readMidiFile | 2 -> normalize + adapter (formats 0/1/2, X3 caveat) | 3 -> NormalizedProject fields + normalize | 4 -> roles.ts | 6 -> usesPitchBend + warnings | 10 -> key.ts (KS, ranked, correlations) | 11 -> melody.ts | 12 -> harmony.ts (confidence + top-3) | 13 -> tempo.ticksPerBar + 5/4,6/8,7/8 corpus fixtures | 14 -> tick-native types + barBoundaries | 15 -> Outcome everywhere | 20-24 -> (S2; types provide confidenceTier/mergeAnalysis/reinferBar/overrides) | 30-36 -> (S3; grid + core/chords ready) | 37 -> (S4 mixer; types unaffected) | 40-41 -> (S4; D51/D52) | 50 -> noNotes error | 51 -> percussionOnly | 52 -> chromaticFallback | 53 -> defaultWindow/truncated | REQ-FND-1 -> midi 0..127 pinned | REQ-NFR-5 -> Outcome | REQ-PED-1 -> ComposeAnalysis.annotations | REQ-PED-4/5 compose portion -> (S2 render; AnnotationTarget.chord exists) | REQ-IO-70 -> shipped in Phase 1 stub, preserved | REQ-IO-10..16 -> (S4 D53) | REQ-TRANS-3 -> (S3/S4 opt-in offset; originals untouched) | Appendix F 85% -> corpus.test.ts.

```yaml
HANDOFF_TO_DEVELOPER:
  from: "@architect"
  to: "@developer"
  timestamp: "2026-09-23T13:00:00Z"
  DELIVERABLES:
    - name: "docs/PHASE-4-COMPOSE.md"
      status: complete
      sections: "audit + D45..D56 + full S1 design + S2/S3/S4 sketches + risks + traceability"
  CONSTRAINTS:
    - "Slice 1 ONLY: engine + src/lib adapter + scripts; zero UI, zero store, zero audio"
    - "purity floor 21 -> 29 in the same commit as the first new engine source"
    - "tests/ FROZEN (it( = 362); count pins 40/12 untouched; baseline 1508/1/2 (2 CSS-WIP failures are NOT yours)"
    - "no new deps; @tonejs/midi imported ONLY in src/lib/composeMidi.ts"
    - "engine/etude/harmony.ts edit is extraction + re-export - etude tests must stay green UNCHANGED"
    - "ASCII, no console.* (engine silent), no any/@ts-ignore, relative imports, copy-not-cast at boundaries"
  DECISIONS_MADE:
    - decision: "NormalizedProject (new model), NOT HarmonicPath"
      confidence: HIGH
      rationale: "tick/tempo-map/meter fidelity (REQ-COMP-3/14) + padPath truncation + no per-beat chords; playback parallelism needed regardless"
    - decision: "engine consumes MidiJsonLike DTO; adapter owns the package"
      confidence: HIGH
      rationale: "purity-legal, testable, worker-liftable"
    - decision: "core/chords.ts extraction + clean-room voice-leading + equivalence pin; theory.ts frozen"
      confidence: HIGH
      rationale: "tables must not fork; theory heuristics are display-grade (dead-code root bug found)"
    - decision: "zustand v4 append-only compose slice; project in-memory; no compose dirty"
      confidence: HIGH
      rationale: "store residency survives mode switches -> nothing to prompt; quota-safe"
    - decision: "4 slices (S1 engine / S2 upload+card / S3 accompaniment / S4 mix+export+paste)"
      confidence: HIGH
      rationale: "each independently shippable; S1 unblocks all via types + pure functions"
  IMPLEMENTATION_NOTES:
    - "SMF time-signature denominator is a POWER-OF-TWO code - convert in normalize (den = 2**code); the classic trap, pinned first in tempo.test.ts"
    - "format-0 channel flattening is EXPECTED (@tonejs/midi limitation) - do not chase it; warning path only"
    - "encoder writes tempo/timeSig/keySig meta - export round-trip test is the fidelity proof (D51)"
    - "ModeGate.test.tsx pins the empty-state heading - S2 must keep 'Drop a .mid file to get started.'"
    - "perf: CI budget is 1500ms (honest); the 500ms PRD target lives in scripts/compose-perf.ts locally; do NOT pin 500ms in vitest"
    - "F3 (etude sub-range loop) is NOT needed by Compose (own transport) - leave USER-DECISION open"
  PROGRESS:
    phases_completed: "5/5 (reception, analysis, mapping, design, roadmap+risk)"
    retries: 0
    quality_gates_passed: "requirements->components mapped; interfaces defined; choices justified; scalability (worker hatch) + security (privacy/never-upload preserved) addressed; path atomic"
  ESTIMATED_EFFORT:
    slice1_hours: "28-44"
    phase4_total_days: "18-25 across 4 slices"
  CONCERNS:
    - "PRD sec 14 nominal (3-4 wk) vs 4-slice estimate (3.5-5 wk) - orchestrator should confirm slice budget"
    - "FUTURE_PLANNING Phase 4 table rows C1/C2 are factually wrong TODAY - corrected in S2; confirm no other doc cites them"
    - "REQ-IO-50 URL-serialize is P0 but scheduled S4-stretch - if the orchestrator needs it earlier, it changes S2's store shape ONLY by adding a URL writer (no redesign)"
  AUDIT_TRAIL:
    - { phase: "reception+analysis", duration: "~25 min", tools_used: "read/grep/bash (git status, vitest run, node_modules .d.ts/Encode.js inspection)", errors_encountered: "rg absent (used grep tool); no other" }
    - { phase: "mapping+design", duration: "~15 min", notes: "D45..D56; two task-packet premises falsified (ImportExportModal .mid claim, Tone.Offline) and re-grounded" }
```

---

## ERRATA (2026-09-23, appended after Slice 1 shipped - original text above left intact)

Design-vs-shipped deltas flagged by the slice 1 developer (dev report
labels D1/D2/D5/D6/D7/D8 kept). S2-S4 implementers MUST read this
section alongside the design; the durable library-quirks write-up
lives in `docs/engine-compose.md` ("library quirks").

1. **D1 - the denominator instruction is FALSIFIED for @tonejs/midi
   2.0.28** (sec 5 tempo.ts note + sec 7 step 3 + HANDOFF
   IMPLEMENTATION_NOTES: "convert in normalize (den = 2**code)").
   `midi-file`'s parser ALREADY converts the SMF power-of-two byte
   (`event.denominator = 1 << readUInt8()`, midi-parser.js), so the
   DTO arrives with REAL denominators (1/2/4/8/16/32); applying
   `2 ** code` to @tonejs output DOUBLE-converts (6/8 -> 256).
   Shipped: `realDenominator()` passes real values through and
   converts raw codes only for hand-built DTOs. Pinned BOTH ways in
   `normalize.test.ts`; the real-DTO 6/8 -> 8 byte round-trip pinned
   in `composeMidi.test.ts`.
2. **D2 - 6/8 tick typo** (sec 6 test plan item 2: "the 6/8 pin
   (ppq 480 -> 720 ticks)"). 720 is a doc typo (that is 3/8); the
   authoritative formula `num*ppq*4/den` AND this doc's own
   cross-check ("6/8 -> 3*ppq") give **1440**. `tempo.test.ts` pins
   1440 with a comment calling out the typo.
3. **D5 - a 9th engine source shipped** (sec 4 tree + sec 7 "8 engine
   sources"): `engine/compose/index.ts` holds `analyzeProject` + the
   public surface (D49/sec 3 require the top-level pipeline; it
   cannot live in types.ts - import cycle). Engine tests are 9
   (8 compose + core/chords). The purity floor 29 is a MINIMUM; the
   tree actually scans 30 non-test sources.
4. **D6 - the key-signature round-trip claim is FALSE** (sec 1
   "@tonejs/midi reality" row: "ENCODER verified ... keySignature
   meta back -> round-trip export is real"; D51 leans on it). The
   claim came from READING Encode.js (it does emit the event), not
   from round-tripping. Actual bug: `encodeKeySignature` writes
   `keySignatureKeys.indexOf(key) + 7` where SMF wants the SIGNED sf
   byte (index - 7); the reader adds +7 again, so EVERY
   @tonejs-written key signature reads back `key: undefined` (only
   major/minor survives). Tempo + time signatures DO round-trip
   (pinned). Shipped behavior: normalize degrades gracefully +
   warns (pinned in `composeMidi.test.ts`); DTO-level key parsing is
   pinned separately (`normalize.test.ts`: "Db major -> tonicPc 1").
   **IMPACT - S4/D51: combined-MIDI export must NOT rely on the
   @tonejs encoder for key signatures** (skip, patch the byte, or
   write the meta yourself). This is the durable warning; do not
   rediscover it in slice 4.
5. **D7 - the format-0 premise is INACCURATE** (sec 1 row + F6:
   "each SMF track becomes ONE Track; multi-channel format-0 files
   are flattened (per-note channel lost, Track.channel = last
   seen)"). `Midi.js` runs `splitTracks()` for EVERY format: each
   SMF track is split by (program, channel), so a multi-channel
   format-0 file arrives as ONE Track PER program+channel group -
   per-note channel is preserved by the split. What IS lost:
   original track grouping (names/meta attach to the first group; a
   mid-track programChange forks a same-channel track). Shipped
   behavior stays conservative regardless (format 0 never trusts
   channel 9; multi-track format-0 DTO warning), pinned in
   `normalize.test.ts`. X3's acceptance verdict stands; its stated
   mechanism was wrong.
6. **D8 - 17 qualities, not 16** (sec 1 "Engine reuse" row + sec 5
   harmony spec: "QUALITY_INTERVALS (16 qualities)"). The extracted
   table in `engine/core/chords.ts` holds **17** (maj, min, dim,
   dim7, halfdim, maj7, m7, dom7, alt, sus4, maj6, min6, majadd9,
   minadd9, maj9, dom9, min9 - runtime-verified; the 17th is
   `min9`). Template scoring is 12 roots x 17 = 204 candidates per
   region.
7. Minor scoring deltas (verified in shipped code, listed so S2
   threshold-tuning isn't misled by sec 5's formulas): harmony adds
   a missing-tone penalty (`-0.3 * missingFraction`, not in the
   design's score line) and confidence is `clamp01(raw score)` - the
   design's `score / bestTheoretical` normalization was NOT
   implemented (the 2-note 0.6 cap and the x0.5 carry-over DID
   ship); bass is the LOWEST pitch in the region's first half (not
   "max weight among the lowest"); roles features are
   {meanMidi, maxPolyphony, avgDurTicks, onsetRate, steady} - the
   design's midiSpan/noteCount features do not feed the scores, and
   the bass name-prior (0.2) ships despite being absent from the
   design's bassScore line.

---

## FIX ROUND (2026-09-23, reviewer REQUEST-CHANGES + tester adversarial pass)

Durable deltas on top of the ERRATA above; S2-S4 implementers read BOTH
sections.

- **Supersedes D7's shipped note: the format-0 percussion gate was
  RELAXED.** `isPercussion = channel === 9` for EVERY SMF format (the
  `format !== 0` clause rested on the falsified F6 premise - see D7).
  The format-0 multi-track warning no longer claims channels were
  flattened (it now says the truth: re-grouping by (program, channel)
  loses original track grouping only). Pinned: `normalize.test.ts`
  (flipped F6 pin) + `corpus.test.ts` (format-0 + channel-9 subtrack ->
  percussionOnly true, all-rest grid).
- **KS fallback semantics FIXED (was a HIGH bug).** The v1 pc arm
  (`distinct < 8`) over-fired: EVERY strictly diatonic 7-pc piece got
  `chromaticFallback = true`, suppressing the key annotation on the
  engine's best answers (plain C I-IV-V-I: r=0.93-0.96, correct top-1,
  annotation gone). Coherent rule now (documented in `key.ts` header):
  fallback iff (a) top r < 0.50 [catches flat/chromatic/12-tone], OR
  (b) < 5 distinct WINDOWED pcs [sparse non-tonal material: drone,
  power chord, quartal shell - which spuriously correlate r ~ 0.68-0.83,
  so arm (a) alone cannot cover them], OR (c) < 16 WINDOWED notes [data
  floor; the v1 project-wide count was inconsistent with the windowed
  profile - unified to windowed]. Measured after fix: fallback fires on
  0/24 diatonic corpus songs (was 24/24), KS top-1 stays 24/24, chord
  root match stays 100%.
- **S2 DESIGN CONSTRAINT from the tester's KS corpus results (RK2
  evidence): KS ALONE IS UNRELIABLE ON JAZZ-FLAVORED MATERIAL - 18.3%
  top-1 on engine-generated SD/MI/tritone content. The S2 confidence
  tiers MUST BLEND DECLARED-KEY + FUNCTIONAL EVIDENCE (role of the
  candidate as a scale degree, cadence patterns) BEFORE AUTO-ACCEPTING
  > 0.80; the PRD > 85% key-detection target REMAINS OPEN pending a
  real-world corpus (RK2). Do not treat `candidates[0].correlation` as
  a calibrated probability on jazz material.**
- **Melody top-line synthesis FIXED (was a monotonic pitch tracker).**
  A descending C-major scale fused into ONE held note (72@0/3840); a
  crossing bass was never returned from; a cross-track 16th ornament
  hijacked forever (trackChange bypassed the metric gate). New rule
  (documented in `melody.ts` header, pinned in `melody.test.ts`):
  when the line's note stops sounding, ADVANCE to its own voice up OR
  down (returning to the home track if the line had hopped over a
  crossing voice); while it sounds, jump to a higher voice only if that
  candidate is metrically primary (>= eighth) AND sustained (>= eighth)
  - a track change alone never dethrones. Residual known limits (S1,
  see deferrals): if the home track goes permanently silent the line
  holds rather than migrating DOWN to another instrument, and gaps are
  absorbed (no rests emitted).
- **normalizeMidiJson hostile-input guards (NEVER-THROWS contract).**
  `tracks: [null]` / `notes: [null]` / non-object note entries used to
  THROW inside the track loop. They now fail the typed `parseFailed`
  arm with "malformed" in the message. `readMidiFile` additionally wraps
  the normalize call in its own try/catch (typed `internal` arm) as a
  second line of defense. Pinned in `normalize.test.ts`.
- **Chord tie-break prefers ROOT POSITION.** Symmetric pc sets (Bm7b5
  vs Dm6/B - identical {B,D,F,A}) scored identically and the v1
  root-ascending tie-break handed the cell to the alphabetically-lower
  root: Bm7b5 in A minor reported as "Dm6/B", conf 1.00. The comparator
  now ranks exact-score ties by root-position-first (bass == chord
  root), then root asc, then table order; the inversion reading is
  demoted to alternatives. Pinned BOTH directions (C/E slash still
  chosen when no exact-score rival exists).
- **Harmony carry-over now has test coverage** (single-pc region after
  a chord -> previous cell at confidence x0.5; mutation survivor from
  round 1).

### Deferrals recorded this round (NOT fixed here)

- **TD-040 - Phase 3 generator minor-mode defect (separate fast-follow,
  own cycle).** Jazz style templates emit major-functional harmony
  regardless of the requested mode: a "Bb minor" etude resolves Bbmaj9.
  Fixing it CHANGES ETUDE OUTPUT -> invalidates the determinism goldens,
  so it needs its own cycle (generator fix + golden refresh + count-pin
  audit together). Tracked in `.kai/tech-debt/register.md`.
- **TD-041 - melody gap absorption (S2 preview UX note).** The
  synthesized line absorbs silence into note tails (no rests are ever
  emitted). S2's preview must not render a held note across a gap as
  "sustain" without a UX caveat, or re-extract with rest support.
  Tracked in `.kai/tech-debt/register.md`.

**End of design.**
