# Ultimate Exercise development backlog

This is the implementation queue, not a list of delivered features. Statuses describe the proposed feature branch. Work through a complete student path before expanding the ecosystem. No dates, staffing commitments or automatic releases are implied.

## Delivery order

| ID    | Milestone                      | Status                | Depends on | Acceptance gate                                                                                        |
| ----- | ------------------------------ | --------------------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| UE-01 | Learning entry point           | Implemented on branch | —          | Seven original lessons, five levels, two languages, practice steps and loop studio work                |
| UE-02 | Development foundation         | Implemented on branch | UE-01      | Documented commands, replaceable storage, integration contracts, task/PR templates and tested workflow |
| UE-10 | Record and reopen              | Next                  | UE-02      | On a real phone: count-in, record, replay, reload and recover one local take                           |
| UE-20 | Hear and retest                | Planned               | UE-10      | Confident pitch observations lead to one timestamped listening comparison and useful follow-up         |
| UE-30 | Editable and printable studies | Planned               | UE-20      | Edited notes survive reload; MusicXML and PDF agree on rhythm and written/concert pitch                |
| UE-40 | Learning with music packs      | Planned               | UE-10      | Rhythm, voice, movement, ensemble and production activities work with low-data/offline packs           |
| UE-50 | Teacher-guided pilot           | Later                 | UE-10–40   | A reviewed assignment reaches a learner; only an explicitly selected take is shared                    |

## UE-10: record and reopen

**Student story:** “I can hear a call, record my response and listen again tomorrow on this device.”

Implement `RecorderPort` and `TakeRepositoryPort` from `src/learning/ports.ts` as separate browser adapters. Keep the progress repository independent.

- [ ] User-initiated capability/permission flow; denied mic leaves lesson and import available.
- [ ] Format negotiation for audio on Chrome and Safari; retain actual MIME and capture settings.
- [ ] Count-in with a monotonic audio clock; explicit recording, stop, cancel and interruption states.
- [ ] Finalized audio blob, elapsed seconds, lesson revision, instrument, tempo, tuning and latency provenance.
- [ ] IndexedDB save/reopen, bounded metadata history, playback seek, download and delete.
- [ ] Duplicate stop is safe; cancelled capture does not create a take; resource cleanup works on navigation.
- [ ] Quota failure preserves the current recording in memory and offers a download.
- [ ] Mocked-device tests plus real Android/iPhone checks; ordinary practice sends no audio off-device.

**Exclude from this slice:** numeric grades, full-band transcription, teacher accounts and remote syncing.

## UE-20: hear and retest

**Student story:** “Show me one moment I can hear and help me make the next take better.”

- [ ] Implement `ReviewPort` with sounding MIDI/frequency and timestamps in original recording seconds.
- [ ] Fixtures for silence, a steady tone, a drifting release, vibrato and click leakage; add an authorized real horn sample when available.
- [ ] Confidence gaps and insufficient-signal state; no low score for untrackable audio.
- [ ] Attack/sustain/release inspection and a timestamped playback region.
- [ ] One follow-up: drone/leap, clap–sing–play or an expressive variation according to the lesson objective.
- [ ] Compare only takes with compatible lesson revision, instrument, reference and analysis settings.
- [ ] Preserve earlier take data and report the analyzer version.

**Exclude:** automatic overall tone grading, universal swing ratios and performance claims based only on synthetic fixtures.

## UE-30: editable and printable studies

**Student story:** “I can correct a draft, read it, hear it and print the same music.”

- [ ] Preserve performed timing separately from quantized beat positions.
- [ ] Confirm tempo/meter; edit pitches, note boundaries, rests, ties and bar placement.
- [ ] Adapt the existing MusicXML and PDF exporters through `NotationPort`.
- [ ] Verify B♭ written C4 plays concert B♭3; test round-trip transpose and proper instrument range.
- [ ] Render actual readable staff notation; compare score and audio; open MusicXML in a notation app.
- [ ] Reload preserves edits; reanalysis never silently overwrites them.
- [ ] Keep generated exercises original or explicitly cleared, with pentatonics and thirdless harmony represented as musical data.

## UE-40: learning with music packs

**Student story:** “I can explore music in a way that fits my skill, language, instrument and available connection.”

- [ ] Rhythm echo and movement; voice and one-note calls; melody, bass, harmony and time roles.
- [ ] Short physical sound labs: position, room response, level-matched comparisons and two-sound production.
- [ ] Add captioned founder footage from the shooting plan, with rights and reviewed transcripts.
- [ ] Add Serbian Cyrillic and an RTL test locale; keep notation and transport direction musically correct.
- [ ] Cache versioned app/content packs; test cold offline reopen rather than assuming local progress makes the app offline.
- [ ] Adjust one musical difficulty variable at a time; caregiver mode is independent of demonstrated skill.

## UE-50: teacher-guided pilot

**Student story:** “My teacher can assign one exercise and hear only the take I choose to send.”

Do this after the local practice loop is tested. Define the actual cohort, assignment format, permitted sharing destination and necessary account model before implementing an API. Keep public profiles, commerce, competitions, auditions and gig discovery as separate future decisions.

## Definition of done for each slice

The slice has a working student action, a focused implementation, representative failure handling, appropriate unit/browser tests, checked real-device limits, current documentation and a reviewable PR. “Implemented” does not mean production-released. Record the actual commit, commands and outcomes; keep incomplete adapters clearly unconnected.
