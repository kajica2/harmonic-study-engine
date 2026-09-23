# ADR-012: abcjs retained for staff notation; VexFlow dropped (PRD deviation)

- Date: 2026-09-23
- Status: Accepted (PRD-001 Phase 3, resolves PRD open question Q2)
- Context: PRD §10.3/§14 lists VexFlow for staff notation (REQ-ETU-21, P1). Phase 3 audit found VexFlow was NEVER installed and abcjs already serves 5 live surfaces (LiveScoreDisplay, ChordInspector, RecordingModal, leadSheet, sheetMusicExport->jsPDF).

## Decision

Keep abcjs for ALL staff rendering; drop VexFlow from the stack. REQ-ETU-21 satisfied via abcjs at Slice 2. Documented as a deliberate PRD deviation.

## Rejected alternatives

- VexFlow for etude view only: two notation engines = bundle bloat + split maintenance for a read-only P1 view.
- Full migration to VexFlow: largest scope, zero user-visible gain; PRD §7.2 explicitly excludes notation editing (defer to MuseScore).
- MusicXML export does NOT require a renderer (scoreExport.ts already writes XML directly).

## Consequences

- The abcjs->SVG->jsPDF pipeline already serves print/PDF (REQ-ETU-32, Slice 3).
- Related audit correction recorded: PRD's Tone.js premise is fiction - playback is the hand-rolled Web Audio audioEngine (tone@15 is a transitive @magenta dep; zero Tone. imports). REQ-ETU-22 satisfied-in-fact; Q3 (synth-vs-sampler) effectively resolved-by-inheritance, recommend closing in PRD §15.
