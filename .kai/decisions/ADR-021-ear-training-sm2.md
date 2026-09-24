# ADR-021: Ear training (clean-room), SM-2 canonical ordering, Q10 scoring call

- Date: 2026-09-24
- Status: Accepted (PRD-001 Phase 6)
- Context: PRD §8.5 ear-training (7 types), SRS (SM-2), practice log, global drawer. In-repo anti-precedents: src/lib/quizEngine.ts (biased shuffle) and rhythmDrill (dead analyzeChord, immediate-fire loop). PRD Q10 open: pass/fail vs accuracy-% vs gamified.

## Decision

1. **Clean-room engine** (engine/ear-training/ + engine/pedagogy/{srs,log}.ts): zero imports from quizEngine/rhythmDrill (grep-verified). 7 drill types from seeded prompts (Rng-injected, 210-case byte-determinism); distractor pools exclude the answer ENHARMONICALLY (pitch-class filter - a "Bb" distractor can never shadow an "A#" answer); checker uses pc-equality everywhere (Cb==B, E#==F, double-accidentals table pinned, triple rejected).
2. **SM-2 ordering is canonical, not the popular variant**: interval computed FIRST with the CURRENT (old) EF, EF updated after - verified against SuperMemo's published step ordering AND the reference Delphi implementation (`Interval:=round(Interval*EF)` precedes the EF update). The tester's independent oracle encoded the NEW-EF variant and flagged 15 divergences; adjudication confirmed the implementation correct. Ordering documented in srs.ts header; goldens pin it.
3. **Q10 call: accuracy-% + streaks, NO XP/levels/badges** - no XP fields exist in any type; honest strings ("12/20 correct (60%) - streak 3"). Partial credit melodic-dictation-only (hit fraction + 0.1 contour bonus, correct at >= 0.85); harmonic dictation exact-match.
4. **Persistence outside zustand** (D73/D85 precedent): pedagogy.srs + pedagogy.log as K-registry localStorage keys (caps 10/500, corrupt->defaults, quota->void never-throws, pinned); prompts/config/drawer state local; NO store version bump. Attempts never dirty (DirtyMap.etude untouched - pinned).
5. **Audio via the existing preview singleton** (transient project+result through composePreviewPlayer; pure builder unit-tested; no new AudioContext/transport).
6. **PED-6 scoped**: right-click/long-press(500ms)/Shift+F10 on AnalysisCard chord cells ONLY (rest of hosts gated TD-PED-6-REST); resolution = nearest-annotation-or-search-prefill - NEVER invents a conceptId (bare-cell fallback pinned: dispatches hse:open-concept-search, no dialog).
7. **"Practice due" button** (MED-001): pickNextConcept weighted by overdue-days (starvation-free: unseen items surface, 500-pick property); due definition identical panel-side and engine-side (verified line-by-line at merge); disabled + honest title when nothing due (PHASE-1-02).

## Consequences

- REQ-PED-41 summary MATH + storage ship; on-screen summary panel is a documented carve-out (TD-PED-SUMMARY).
- Drawer "Hear an example" uses generated C-major-default numerals (D112 downgraded to reality); refs stay dormant (TD-037).
- utcDayKey is Hinnant civil-math (no Date in engine), verified vs Date over 3,288 datetimes incl. leap days; Feb-29 pinned.
- Full-suite e2e shows transient preview-server/trace flakes (infra, not product) - tracked for CI hygiene.
