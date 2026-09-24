# ADR-019: Compose mixer architecture (per-group baked buffers + live gains) + export strategy

- Date: 2026-09-24
- Status: Accepted (PRD-001 Phase 4 Slice 4)
- Context: REQ-COMP-37 demands accompaniment mixed with original tracks, per-group volume/mute/solo. S3's preview singleton rendered accompaniment-only. The design fork: re-render-per-knob vs live scheduler vs baked-buffers-plus-live-gains.

## Decision

**Architecture C: per-group baked AudioBuffers + live GainNode buses.** Knobs are instant param writes (`setTargetAtTime` 0.02); re-render only on CONTENT change (content-identity invalidation). Absorbs the S3 singleton in place (its mutation-proven tests survive byte-identical). No live scheduler, no transport edits, no new transport surface.
- Mute-wins-over-solo (body formula authoritative; handoff-yaml note superseded - see ERRATA E1 in the S4 design doc). All-solo == no-solo; all-muted = silence.
- Original group: all non-percussion tracks voiced by role (new lead recipe + existing bass/chords); percussion skipped with disclosure; extracted melody NOT re-voiced (no double-voice). MIDI export still includes drums (data != mix).
- Key signatures: bypass the broken @tonejs encoder path - insert spec-correct signed keySig events via midi-file (declaration-only, already hoisted); golden test asserts round-trip EQUALITY, killing the S1 erratum landmine. encodeComposeMidi never feeds the +14-off path.
- Tempo truth: `withTempoOverride` at the existing effectiveProject choke point; preview/mixer/WAV/MIDI all inherit; the lying tooltip fixed to truthful.
- Boot restore: FIELD-WISE merge (URL wins only for PRESENT keys when persisted session shares identity; wholesale only for genuine cross-device empty-storage boots) + synchronous writer flush on pagehide. Fixes the stale-URL-clobbers-fresh-persisted race (HIGH-001) that flaked the S3 e2e spec ~50-70%.
- WAV export: SEQUENTIAL render + free-into-accumulator (peak ~212MB vs ~580MB concurrent); audition path stays parallel (bounded ~64MB).

## Consequences

- Stems ZIP + /play route DEFERRED (TD-046/047; D77 makes stems nearly free later).
- governor wipe is atomic-compose-only (all 7 c* keys, never mode/transpose/etude - pinned).
- chartText regeneration drifts on 2-cell bars ([C,G]->C/G, etc.) - guarded at commit with a hold/approve warning; lossless grammar is impossible, documented.
- RK6 (musicality) + full-mix listen check stay HUMAN-GATED - e2e pins plumbing, not sound.
