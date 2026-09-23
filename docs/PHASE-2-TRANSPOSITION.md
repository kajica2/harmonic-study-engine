# PRD-001 Phase 2 Design: Transposition (per-exercise offset, effective key, cycle-12)

Status: APPROVED DESIGN (from @architect research packet, 2026-09-23). Implementation authority for @developer.
Supersedes: FUTURE_PLANNING.md Phase 2 rows (which wrongly claimed global transpose was fully shipped - it had no persistence writer and its URL param drove nothing).

## 1. Headline findings (verified)

1. TWO disconnected global-transpose states: legacy `transposeShift` (src/hooks/useSessionStore.ts:307) drives playback/WAV/Score21/MusicXML but has NO persistence writer (K.transposeShift is read at boot, never written); zustand `globalTranspose` (src/state/sessionStore.ts:48) persists + URL-syncs but drives NOTHING -> `?transpose=2` had zero audible effect (latent Phase-1 bug).
2. Single-file MIDI export (`onExportMidi` App.tsx:1962-1970 -> exportToMidiFile = asWritten) IGNORES transpose. REQ-TRANS-7 violation.
3. Keyboard `[`/`]` are TEMPO -5/+5 today (App.tsx:1030-1035), not transpose. PRD §9.7 wants `[`/`]` = transpose +/-1, Shift+brackets = +/-12.
4. All 19 studies.ts paths have NO `key` field (key lives in description text) - badge needs a first/last-chord fallback heuristic.
5. 21 distinct key-string formats across paths.ts/conceptPaths.ts (maj/min/Lydian/Dorian/whole-tone/drift "A -> B"/slash "D Dorian / G Mixolydian"/parentheticals/blues).

## 2. Decisions

- D10: zustand store = single source of truth. Add `exerciseTranspose: number` (clamped +/-12), `keyCycleActive: boolean`, actions setExerciseTranspose/nudgeExerciseTranspose/advanceKeyCycle, `resolveBootTranspose` pure helper (precedence: URL > hse.session > legacy synesthesia_transposeShift one-shot adoption, read-only > 0). CURRENT_SESSION_VERSION -> 2 + engine/migrations v1->v2 entry. Legacy hook `transposeShift`/`setTransposeShift` becomes a READ-THROUGH/WRITE-THROUGH BRIDGE to the store; returned API shape (Setter<number>) MUST stay byte-compatible (tests/useSessionStore.test.ts:30 + tests/usePathGenerator.test.ts pin it; tests/ is off-limits).
- D11: hand-rolled pure spelling at engine/core/spelling.ts (purity guard bans tonal inside engine). Rules: author's literal accidental wins; else fewest-key-signature-accidentals; TIES GO FLAT (pc6 major -> Gb; minor table: C#m not Dbm, F#m not Gbm, G#m not Abm, Ebm not D#m). Modal/unknown: spell tonic via major table, keep suffix verbatim. Drift "A -> B": each endpoint independently shifted, rendered "X -> Y", no blending. Slash "D Dorian / G Mixolydian": first endpoint wins. Studies paths (no key field): first+last step share root AND plain quality (""|maj|maj7|m|m7) -> tonic+mode; else null -> pitch-only fallback "Sounding: +3 st". API: parseKey(raw): ParsedKey|null; spellTonic(pc, mode, literal): string; effectiveKeyLabel(sourceKey, shift, fallbackFirstChord?, fallbackLastChord?): string|null; advanceKeyCycle(current): number ((n+1) mod 12).
- D12: new src/components/EffectiveKeyBadge.tsx rendered in StageFrame meta region (App.tsx:2809-2832, after transpose chips). Content "Sounding: Gb major" / drift two-key / pitch-only fallback. role="status" aria-live="polite" (PRD 9.8). ASCII only (no flat/sharp glyphs in badge; existing chips keep theirs).
- D13: cycle-all-12 advances `exerciseTranspose` +1 mod 12 per FORM PASS: in onMeasureStart wrap handler (App.tsx:1153-1185), formLen = detectFormPeriod(path.steps) memoized; advance iff next % formLen === 0. Suppressed while sub-range loop active (loopStartBar/loopEndBar). Cycle OFF keeps current offset; explicit reset chip zeroes it. Path switch/import/generate (5 reset sites: 1284, 1326, 1340, 1368, 3687) reset exerciseTranspose := 0 AND keyCycleActive := false. NEVER sets dirty (dirty written only at CoCompose accept; structural + pinned by test). Advance dispatched OUTSIDE the setActiveStepIndex updater (StrictMode double-invoke safety).
- D14: `[`/`]` -> global transpose -1/+1; `Shift+[`/`Shift+]` -> -12/+12; tempo -5/+5 MOVES to `,`/`.` (unbound today, DAW-conventional). CRITICAL: match `e.code === "BracketLeft"/"BracketRight"` + `e.shiftKey`, NEVER e.key (Shift+[ arrives as "{"). Pure classifier in src/hooks/useKeyDown.ts: classifyTransposeKey(e): "down1"|"up1"|"down12"|"up12"|null (null when meta/ctrl/alt held - guard coexistence; Shift passes). Branches placed AFTER isModeShortcutModifierKey guard (line 991). KeyboardShortcutsCheatsheet.tsx data updated (clean file). +/-7 chips KEPT.
- D15: soundingShift = globalTranspose + exerciseTranspose. Global stays +/-24 clamp; exercise +/-12; NO sum clamp (-12 must mean octave-down). No-crash pinned at +/-36 (midiToFreq total over R; MIDI export DROPS out-of-range notes - do not change midiExport.ts). Range warnings deferred Phase 7 (REQ-RANGE-1).

## 3. App.tsx read-site migration (15 sites)

Swap `transposeShift` -> `soundingShift` for audible/display surfaces: 726 (currentChordNotes), 748 (exportNotesOverride), 1290, 1690, 2020, 2549 (toScore21), 2563 (toMusicXml), 2808, 2822, 2870-2871, 3356, 3453, 3672. PlaySessionRail prop (1846) keeps GLOBAL-ONLY (its label says "Global transpose"). onExportMidi (1962-1970) -> exportMidiWithVariation(path, {kind:"transpose", semitones: soundingShift}).

**Erratum (2026-09-23, review round 1; verified against shipped code):**

1. The 15-site list MISSED the LiveScoreDisplay call site (App.tsx, Etude surface). It received the global-only `transposeShift` while the exports (toScore21/toMusicXml) and the "Sounding:" badge use `soundingShift`, so the on-screen score contradicted the badge whenever the exercise offset was active. Fixed in this round: the call site now passes `soundingShift`. PlaySessionRail remains the ONLY deliberate global-only read.
2. studies.ts has 36 key-less paths, not 19 (headline finding 4 understated the count; the badge's first/last-chord fallback heuristic is exercised by all 36, not 19).
3. Reset sites are generate / persona-switch / import (3 generate branches + persona-switch + onImport; 5 call sites total). A MANUAL path switch does NOT reset the exercise offset or the cycle -- this matches the shipped code and is the accepted behavior.
4. ModeGate mount-freeze was a Phase-1 defect surfaced during Phase 2
   fix round; gate + exercise-row now live (both subscribe to
   store.mode; URL precedence resolves at boot only, never re-read --
   the 200ms debounced store->URL sync would race). popstate remains
   open (TD).

## 4. File plan

NEW: engine/core/spelling.ts + .test.ts | src/lib/keyCycle.ts + .test.ts | src/components/EffectiveKeyBadge.tsx + .test.tsx | src/components/TransposeControls.tsx + .test.tsx (global row -12/-1/reset/+1/+12 + exercise row Etude-only + cycle toggle; imports ToolChip from StageFrame.tsx:192 - export exists, no edit).
EDITED: src/state/sessionStore.ts | engine/migrations/index.ts (v1->v2) | src/hooks/useSessionStore.ts (bridge; delete dead loadNumber boot read) | src/App.tsx (~180 LOC: subscribe, soundingShift derivation, 15 read-sites, boot adoption in URL effect, 5 reset sites, keyboard branches, meta region render, cycle advance, MIDI export fix) | src/hooks/useKeyDown.ts + .test.ts | src/components/KeyboardShortcutsCheatsheet.tsx (data only) | src/state/sessionStore.test.ts | vitest.config.ts (JSDOM_FILES += 2 new component tests).
OFF-LIMITS: the 11 dirty src/components files, tests/, src/lib/studies.ts, README/SPEC, AGENTS.md, paths.ts:49 labeling, transport step/bar semantics, barDriftShifts seam, midiExport.ts.

## 5. Test plan (all colocated; tests/ it( count stays 362)

- spelling.test.ts: 12x2 table incl. tie->flat cases; all 21 key strings parse without throw; drift at +1; parentheticals/slash; literal precedence; +/-12 identity; first/last-chord heuristic (Fmaj7...Fmaj7 -> "F major"; Gm7...Cmaj7 -> null); advanceKeyCycle(11)=0.
- keyCycle.test.ts: advance at 31->32, 63->64, 95->0 (formLen=32, steps=96); NO advance off-boundary; sub-loop -> never; inactive -> never; formLen==steps -> only at wrap.
- sessionStore.test.ts: exercise clamp; v2 persist round-trip (exercise+cycle persist; dirty/pending do NOT); advanceKeyCycle leaves dirty untouched; resetModeSlice zeroes new fields; resolveBootTranspose precedence; REQ-TRANS-7 no-bake proof (seed K.paths, mutate transposes, assert K.paths byte-identical); v1->v2 migration through real runner.
- useKeyDown.test.ts: code-based matching incl. "{"-key trap; meta/ctrl/alt -> null; non-bracket -> null.
- EffectiveKeyBadge.test.tsx: "Sounding: Gb major" for F+1; pitch-only fallback; role/aria-live present.
- TransposeControls.test.tsx: buttons invoke store (functional-update path); cycle toggle.

## 6. Checklist (ordered)

1. engine/core/spelling.ts + test (run engine tests only).
2. src/lib/keyCycle.ts + test.
3. sessionStore v2 slice + migrations entry + tests.
4. Legacy bridge -> verify tests/useSessionStore.test.ts + tests/usePathGenerator.test.ts green WITHOUT edits.
5. App.tsx store subscribe + soundingShift + 15 read-sites + boot adoption + reset sites. CHECKPOINT: ?transpose=2 now audible; hse.session persists.
6. onExportMidi transpose fix.
7. Keyboard classifier + branch swap + cheatsheet.
8. TransposeControls + wire into StageFrame meta (keep +/-7 chips).
9. EffectiveKeyBadge + same region.
10. vitest.config JSDOM_FILES.
11. Full gates. Manual: cycle advances every 32-bar form pass on Star Eyes; Shift+[ announces via badge.
12. Commit split (when approved): feat(transpose): store slice + spelling -> fix(export): session transpose to single-file MIDI -> feat(transpose): controls + badge + keyboard + cycle.

## 7. Explicit deferrals

REQ-TRANS-3 full Compose semantics (Phase 4); LeadSheet/PDF/batch transpose (Phase 4 notation pass); ?etudeTranspose= URL param; REQ-RANGE-1 warnings (Phase 7); visualTranspose integration; tonal adoption; naming dialog/session snapshots.

## 8. Risks

Bridge shape breakage (mitigated: API shape frozen + 2 existing tests/ pins verified); StrictMode double-dispatch (advance queued outside updater; pure keyCycle decision tested); ?transpose= suddenly audible for existing deep links (PRD-intended; CHANGELOG note); badge wrong key on modal paths (conservative pitch-only fallback beats false claims).
