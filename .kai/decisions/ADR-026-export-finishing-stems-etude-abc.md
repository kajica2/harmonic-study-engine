# ADR-026: Export finishing - stem-per-role ZIP and the etude ABC button

- Date: 2026-09-28
- Status: Accepted (PRD-001 Phase 8 Slice 2, D152..D157)
- Context: REQ-COMP-42 (stems, deferred per X10 since Phase 4) + REQ-IO-42's etude half (the .abc download that never existed). The shipped mixer renders 4 baked groups; WAV export folds them to one mono mix. TD-046 predicted stems as "nearly free".

## Decision

1. **Stems = stem-per-role, one WAV per MIX GROUP** (D152): REQ-IO-32's "one WAV per track" contradicts the shipped architecture (all uploaded tracks merge into one "original" group) - resolved by reading note in the PRD (Kai-applied): ORIGINAL/bass/chords/pad, labeled groups-everywhere (button title, `_stem-<group>` filenames, docs). Per-track stems would need finer rendering than the shipped mixer.
2. **Unnormalized, gain-baked, present-groups contract** (D153): stems ship the SAME `computeGroupGains` + `accumulateGroupInto` primitives as the D88 mix path (the two cannot drift); pre-peak-normalize buffers (stems are raw material, not artifacts); muted groups still ship as silent members; absent groups honestly skipped; ZIP member order = MIX_GROUPS insertion order (deterministic). The encode runs inside the sequential callback so peak stays one buffer + one Float32 + finished member bytes (LOW-001 end-of-loop qualification recorded).
3. **The load-bearing law gets a load-bearing pin** (fix-round): the shipped UNNORMALIZED pin tested only the shared primitives - a `normalizePeak` inserted IN the stems path would pass CI. Extracted the scale step into `scaleGroupSamples(data, gain)` (exported pure, called by the shipped path) and rewrote the pin as `toEqual(gain-baked) + not.toEqual(normalized)` on the helper the path calls; discrimination PROVEN by injecting the leak and watching the assertion fail. Spec §6.1 #6's promise kept literally.
4. **No new surface, no new plumbing** (D154/D155): third mixer button under the EXISTING `!canExport || rendering` sibling law (fast double-click inherits the same in-flight gap as WAV - TD-065); etude ABC button in the panel result row under the D27 absence-gate with soundingShift parity to the Staff tab; filenames `${pid}.abc` with the TD-033 prefix riding unchanged. Byte fidelity = node goldens on deterministic fixtures; e2e = download bytes + envelope regex in the SHIPPED journey spec (no new spec file, RK-S4-6 degrade ladder present).
5. **Carve-outs stand** (D156/D157): ABC parsing REQ-IO-61 is a separate parser slice; stereo/SR REQ-IO-31 stays carved; practice/masterclass/explore have no mixer and get no buttons; S1 needed no revisiting (overlap is file-level, hunk-disjoint; TD-061 stays a product ruling, no code).

## Consequences

- REQ-COMP-42 + REQ-IO-42(etude) CLOSED (with the D152 reading note); TD-046 CLOSED (prediction validated: folded into composeExport, zipSync-only fflate import, no preview/renderer edits). ABC PARSING remains the only open I/O item before the editor.
- Suite 2743 -> 2762 (+19 = 12+3+3+1 - the doc's "+16" was an arithmetic slip, corrected in §14), e2e 41 -> 43; break-guard 2/2 legs fail pre-S2. Purity floor 56; tests/ it( 362; sacred handler zero-hunk.
- Follow-ups: TD-065 (export-in-flight guard, uniform across all three compose buttons - the gap is inherited from WAV), LOW-003 sibling gap now has a home, RK-S4-1 listen queue gains stems balance-by-ear.
