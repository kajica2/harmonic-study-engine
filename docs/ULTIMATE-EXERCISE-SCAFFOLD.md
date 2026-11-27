# Ultimate Exercise: student ecosystem scaffold

The `/learn` surface adds a small learning layer to harmonic-study-engine. It uses the existing React/Vite toolchain and links into the existing practice engine. It does not replace the root app, `/play`, `/engine`, or `/rnn`.

For ongoing implementation, start with the [development guide](ULTIMATE-EXERCISE-DEVELOPMENT.md) and [ordered backlog](ULTIMATE-EXERCISE-BACKLOG.md). The progress adapter is implemented in `src/learning/persistence.ts`; `src/learning/ports.ts` defines type-only boundaries for the next recorder, IndexedDB take store, review and notation slices.

## Run and review

```sh
npm ci
npm run dev:vite
# Open http://localhost:5173/learn
npm run lint
npm test
npm run build
npx playwright test e2e/learning.spec.ts
```

The repository's normal build produces both the RNN bundle and the main app. `/learn` and `/learn/` have explicit rewrites in Vercel and the local static test server. This change needs no backend, account, secret, API credit or new dependency. A branch does not change production; merge/deployment remains a separate decision.

## Implemented slice

| Surface        | Working behavior                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Learning paths | Seven original activities across First sounds, Foundation, Intermediate, Advanced and Open study; level filter, instrument preference and optional caregiver guidance |
| Practice room  | Listen–sing–play–review–create checklist, synthesized original reference, tempo control, visual pulse, keyboard/touch response pad, reflection                        |
| Loop studio    | Editable two-track/eight-step sequencer, Web Audio playback, stop and tempo controls                                                                                  |
| My progress    | Self-reported steps, completion counts, saved reflections, JSON backup download and restore                                                                           |
| Languages      | English and Serbian Latin UI and complete seed lesson instructions; language changes preserve work                                                                    |
| Engine handoff | Existing `mode`, `bpm`, and optional verified `path` URL parameters; full engine provides its own instrument settings, recorder and score/export tools                |
| Lesson media   | Typed audio/video slots with rights, language, transcripts and mandatory video captions; native media controls, no autoplay                                           |

Every level is open. Skill level is chosen independently of caregiver mode. The instrument preference describes the learner; it does not silently transpose reference audio or configure the separate engine. All reference event pitches are concert/sounding MIDI. The pentatonic lesson explains concert and written B♭ names explicitly. Steps are marked by the learner; completion is not an assessment, certification or automated promotion.

## Source map and extension seams

| File                               | Responsibility                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/learning/model.ts`            | Versioned lesson/profile/progress/media types, bounded import validation, checklist updates, engine URL adapter |
| `src/learning/catalog.ts`          | Original musical events and bilingual lesson content, organized by level and ensemble role                      |
| `src/learning/copy.ts`             | UI translations plus instrument, level and role labels                                                          |
| `src/learning/audio.ts`            | Small gesture-started synth; audio-clock scheduling and bounded loop look-ahead, closed on stop/unmount         |
| `src/learning/LearningSurface.tsx` | Student navigation, local state, practice, studio, backups and media rendering                                  |
| `src/learning/learning.css`        | Scoped responsive styles, visible keyboard focus and reduced-motion support                                     |
| `tests/learning.test.ts`           | Curriculum coverage, real path adapter, backup validation and completion semantics                              |
| `e2e/learning.spec.ts`             | Built-app practice, playback controls, persistence, translations, backup, mobile layout and engine handoff      |

Add a lesson to `catalog.ts` with a unique ID, one level, one ensemble role, bilingual text, original or cleared events and a finite beat length. Keep symbol/notation requirements optional in entry activities. Give the learner an audible demonstration, one concrete action and one listening question. Add a new language to the domain and translation packs, then verify every lesson and control before advertising coverage.

Attach cleared footage using the media schema and [shot list](ULTIMATE-EXERCISE-FOOTAGE.md). Do not embed external players that begin tracking or downloading before a learner acts. Media is developer-authored catalog content, not imported through student backups.

## Persistence and privacy

The learning state uses a separate `hse.ultimate.learning.v1` localStorage key. It does not alter existing session or performance stores. It contains preferences, selected lesson, checklist steps, reflections and two rows of eight sequencer switches. It stores no audio, names, ages or account identity. The opening learning workflow requests no microphone and sends no practice data to a server. The existing full engine has separate behavior and settings.

Backups are explicit JSON downloads. Restore accepts at most 1 MB, requires schema version 1, filters unknown lesson IDs/steps, bounds reflections to 2,000 characters and validates sequencer dimensions. Unsupported or malformed files leave the current state unchanged. Storage failures show a persistent notice and a download action; work remains usable in memory. This is a single-browser scaffold, without multi-tab conflict resolution or automatic cross-device synchronization.

App-shell and media offline installation are not implemented. Local persistence alone does not make the app an offline PWA. Bundled synthesized references need no network after the app loads; reloading offline is not a release promise.

## Next vertical slices

1. **Play and record:** integrate the existing recorder through a narrow local adapter; persist audio blobs in IndexedDB, count-in, replay, interruption handling and mic-denied import fallback. Keep child opening activities permission-free.
2. **Review and retest:** confidence-gated pitch trace, one specific follow-up drill and comparable takes. Never infer musical mastery from the checklist.
3. **Printable studies:** adapt the existing notation/MusicXML/PDF pipeline to the lesson event model; verify B♭ transposition, rhythm, ties and export imports.
4. **Learning with music:** expand listening, movement, voice, physical sound labs, ensemble-role rotation and small production projects through tested lessons.
5. **Content delivery:** captioned founder footage, English/Serbian Cyrillic and an RTL test pack; installable low-data lesson packs and IndexedDB audio persistence.
6. **Teacher pilot:** reviewed assignments and selected-take sharing through explicit adapters. Add accounts, caregiver consent and teacher workflows only when there is a concrete pilot. No invented teachers, bookings, scores or payments appear here.

MuseScripter and solokit are future adapter boundaries; neither is connected by this scaffold. Recording, transcription, assessment, teacher rosters, payments, public profiles, competitions, admissions and gig discovery are not implemented on `/learn`.

## Verification limits

Initial scaffold verification on 2026-11-27 (commit `64c4019`): TypeScript check, 3,196 unit tests passing (one existing skip), both production builds, seven browser checks (four learning workflows and three existing `/play` regressions), desktop/mobile visual review and all 83 path-length invariants. The learning workflows cover no microphone requests, no private API calls, keyboard tapping, reference/loop start-stop controls, tempo change, progress reload, English/Serbian switching, backup round-trip, incompatible import rejection, storage failure and 390px layout.

For this restricted test environment, a temporary packaged Chromium executable replaced the blocked Playwright browser download. A temporary Python static server read the built `serve.json` rewrites because the standard `serve` CLI could not enumerate network interfaces. These workarounds are outside the repository; CI keeps its existing Playwright setup.

Browser checks use desktop Chromium and phone-sized Chromium emulation. A visible playback state is not proof of audible quality or hardware timing. Before a student pilot, listen on real Android Chrome and iPhone Safari, test interruption/background behavior, keyboard/screen-reader navigation, storage quota handling and any added caption tracks. Actual instrument recordings and video footage have not been supplied in this change.
