# PRD-001 Phase 8 Slice 2 - Export Finishing: Etude ABC Download + Stems ZIP

Status: DESIGN ONLY (research + architecture, no implementation in this
doc).
Baseline: HEAD 6dd6d9d (clean tree, verified this session), suite 2743
passed / 1 skipped / 0 failed (211 files, verified live this session,
18.95s), e2e 41 tests / 16 specs (ship-commit 9f36944 message "41/41";
16 spec files verified live via `ls e2e/*.spec.ts`; full e2e re-run NOT
executed this session - 2.3m browser run, cited from the green ship
commit), tests/ it( = 362 (verified live), check-links 362 frontend +
29 backend green (verified live), check:paths 36/36 OK (verified live),
purity floor 56 (engine/purity.test.ts:73, verified), AGENTS.md lockstep
2743/211 (verified).
Parent: docs/PRD-001.md Phase 8 (docs/PRD-001.md:984-990: "WAV export +
stems" + "ABC export" + "Session sharing via URL" + "/play route for
idea links"). Slices 1-7 of Phases 1-7 SHIPPED plus Phase 8 S1 SHIPPED
(this doc follows docs/PHASE-8-S1-SHARE.md structure; S1 ended at D151).
Design authority for: REQ-IO-42 (P2, docs/PRD-001.md:625 - "Export ABC
notation for melody lines" - the etude half; lead-sheet half shipped +
S0-fixed), REQ-COMP-42 (P2, :386 - "Export WAV stems as a ZIP"),
REQ-IO-32 (P2, :616 - "Export stems as a ZIP (one WAV per track)" - the
literal granularity fork), TD-046 (stems ZIP deferral,
.kai/tech-debt/register.md:52), and REQ-COMP-43 (P2, :387 - filename
key; shipped in S4, reused here - NOT re-designed).
Decisions numbered D152+ (S1 ended at D151).

---

## 0. RE-AUDIT (claims vs SHIPPED code at 6dd6d9d, read this session - S3-001 law)

Every claim below was verified by opening the actual file. The task
packet's claims were NOT trusted. Two claims need correction /
adjudication - both are load-bearing for the design.

| # | Claim (source) | file:line evidence | VERDICT | S2 relevance |
|---|---|---|---|---|
| 1 | TD-046 text: "renderMixGroups already yields the 4 AudioBuffers; zip = midiBatchExport's fflate zipSync precedent + encodeWav per group" (register.md:52) | `.kai/tech-debt/register.md:52` verbatim; `src/lib/composePreview.ts:313-327` `renderMixGroups(input, capSec)` -> `Promise<Partial<Record<MixGroup, AudioBuffer>>>` (:316) via `Promise.all(buildMixGroupJobs...)` (:318-324); `src/lib/midiBatchExport.ts:29` `import { zipSync, strToU8 } from "fflate"` + `:137-148` `zipBatchExport` (zipSync(files) -> Blob `application/zip`); `src/lib/loopWav.ts:38` `export function encodeWav(samples, sampleRate): Blob` (the D81-shared RIFF writer) | **TRUE** | THE fast-follow mechanism. D153 routes the stems path through the SEQUENTIAL variant (MED-001), not the parallel one TD-046 names - same buffers, half the peak |
| 2 | "The export path folds to ONE mono mix (composeExport.ts ~:28-37, 343-380)" | `src/lib/composeExport.ts:28-37` header: "renderMixGroupsSequential (600s export cap) ... free-mixes each into a mono Float32 accumulator at the CURRENT computeGroupGains levels ... -> peak-normalize ... -> loopWav's encodeWav ... Mono 44.1k 16-bit"; `:343-378` `accumulateGroupInto` (:343-352, the SINGLE primitive) + `mixGroupBuffers(groups, gains)` (:362-378, pure sum over the 4 groups at `computeGroupGains` levels); `:385-396` `normalizePeak` (divide by peak, clamped <= 1.0, never amplify); `:412-430` `exportComposeWav` (sequential render + accumulate + normalize + encode + `composeExportFilename` download) | **TRUE** | The fold is the D152/D153 crux: stems must UNFOLD this sum without defeating MED-001's peak discipline. Decision: gain-baked per-group files, UNNORMALIZED (D153) |
| 3 | "Shipped granularity: 4 mixer GROUPS (types.ts ~:377 - all original tracks merged into one 'original' group)" | `engine/compose/types.ts:377` `export type MixGroup = "original" \| "bass" \| "chords" \| "pad"` + `:379` `MIX_GROUPS` (4); `:370-376` header: "the mixer's four GROUPS - exactly the PRD sec 7.2 contract (W1: NOT a DAW). 'original' is the file's non-percussion tracks voiced by role (D78)"; docs/PHASE-4-S4-MIXER-EXPORT.md:82-88 W1 + D78 (per-group baked buffers; percussion skipped with disclosure) | **TRUE** | Fork 1's ground truth. REQ-IO-32's literal "one WAV per TRACK" contradicts the shipped W1/D78 contract - D152 adjudicates with a reading note |
| 4 | "Was REQ-COMP-43 (filename key) actually shipped in S4 (X10 said '43 ships opportunistically')? Is there a filename scheme already?" | docs/PHASE-4-COMPOSE.md:515 X10 row: "43 ships opportunistically in S4; 42 deferred" ; `src/lib/composeExport.ts:282-299` `composeExportFilename(base, key, ext)` = `<sanitizedBase>_accomp[_<Key>].<ext>`, Key = `spellTonic(tonicPc, mode, "")`, null omits (never fake); `:301-305` `exportBaseName` (strip .mid/.midi; chart -> "chart"); e2e leg 4 pins `/_accomp_C\.wav$/` (compose-mixer-export.spec.ts:199) | **TRUE - shipped, reused, NOT re-designed** | D153 extends the scheme additively (`_stem-<group>` segment + `.zip` envelope). Zero new filename grammar to invent |
| 5 | "builder `buildEtudeAbc` in src/lib/etudeAbc.ts exists, EtudeStaffView renders only - NO download anywhere" | `src/lib/etudeAbc.ts:69-72` `export function buildEtudeAbc(etude: Etude, opts?: { transposeShift?: number }): string` (pure, header `X:/T:/M:4/4/L:1/8/Q:/K:C` :74-81, per-bar chord + tie-split melody :83-109); `src/components/EtudeStaffView.tsx:1-69` - full file: lazy abcjs host ONLY (`abcjs.renderAbc(host, buildEtudeAbc(etude, { transposeShift })` :37), try/catch warn :44-49, NO download/button/anchor anywhere (grep `download\|Blob\|createObjectURL` = zero hits); `src/components/EtudeViews.tsx:35-36` lazy import + `:201` mount (staff tab only) | **TRUE** | The gap is exactly as stated: pure builder ships, golden-tested (etudeAbc.test.ts:71-132), rendered - but no affordance calls it |
| 6 | "The S0 LeadSheet fix pattern (buildLeadSheetAbc -> downloadText(src/lib/download.ts:14-26), regression-pinned in LeadSheet.test.tsx)" | `src/components/LeadSheet.tsx:83-91` `downloadAbc` = `buildLeadSheetAbc(path, instrument)` (:89, "the SAME pure source that renderLeadSheet feeds to abcjs") -> `downloadText(`${path.id}_${instrument}.abc`, abc, "text/plain")` (:90); `src/lib/download.ts:14-26` `downloadText(filename, content, mime)` (Blob + objectURL + anchor click + 1s revoke, the Safari law :9-11); `src/components/LeadSheet.test.tsx:76-92` pins: startsWith `X:` (:86), contains `K:` (:87), byte-identical `toBe(buildLeadSheetAbc(PATH, "Concert"))` (:91); `:94-102` NOT-fallback pin vs `"ABC source unavailable"` | **TRUE** | THE template. D154 copies the seam verbatim (builder -> downloadText -> mocked-seam pins). S0 LESSON restated: never scrape rendered DOM for source text |
| 7 | "S0 LESSON: never scrape rendered DOM for source text, pin content (startsWith X:, contains K:, NOT a fallback string)" | LeadSheet.test.tsx:2-15 header documents the prod bug (textarea scrape always fell through - abcjs renders SVG, never a textarea) + the fix doctrine; pins at :86-88 (`startsWith("X:")`, `toContain("K:")`, `toContain("T:Test ii-V-I (Concert)")`, `toContain("M:4/4")`) + :94-102 (NOT the fallback, length guard) | **TRUE** | Etude ABC has no DOM scrape to kill (EtudeStaffView never had a download) - but the PIN SHAPE is reused: content pins, not locator pins |
| 8 | "The S4 download e2e precedent (compose-mixer-export.spec.ts download legs + RK-S4-6 fallback rule: waitForEvent('download') + download.path(), filename-only assertion if flaky)" | `e2e/compose-mixer-export.spec.ts:116-125` `grabDownload(page, click)` = `page.waitForEvent("download", { timeout: 30_000 })` + `dl.path()` + `readFileSync` + `dl.suggestedFilename()`; legs 2/3/4 assert BYTES in-spec (MIDI parse, RIFF/WAVE magic :197-198, filename regex :199); docs/PHASE-4-S4-MIXER-EXPORT.md:76 RK-S4-6: "if the served-dist download proves flaky, fall back to asserting the object-URL/anchor via a data-attribute + manual" | **TRUE** | D155 reuses `grabDownload` byte-identical + the RK-S4-6 degrade ladder. New wrinkle flagged: `downloadText` (etude ABC seam) does NOT append the anchor to `document.body` (download.ts:21-24) while S4's `downloadBlob` DOES (composeExport.ts:317) - the e2e leg doubles as the proof this still fires a download event |
| 9 | "ComposeSurface mixer wiring sites + export buttons; PracticeHeader/export menu? Does the practice path need stems too?" | `src/components/ComposeSurface.tsx:365-369` `mixInput` (effectiveProject + accompResult + originalNotes + endTick) + `canExport` (= result !== null \|\| originals present); `:378-382` `buffersRef` content-identity cache; `:445-451` `handleExportMidi`, `:453-459` `handleExportWav` (render-null guard, warn-only catch); `:719-736` `<ComposeMixer mixer/canExport/onExportMidi/onExportWav>` mount; `src/components/ComposeMixer.tsx:94-114` the two buttons (`mix-export-midi`, `mix-export-wav`, `disabled={!canExport \|\| rendering}`, honest titles :99/:109); `src/components/ComposeMixer.test.tsx:112-131` disabled-matrix pins. Practice exports live in `PlaySessionRail.tsx:1196-1235` (Export MIDI / Export WAV loop tiles) via App handlers (`src/App.tsx:3422-3448` `renderPathToWav` + `downloadWavFromBlob`) - a SINGLE-loop render, not mixer groups | **TRUE, with the D-scope verdict** | Practice-path stems = OUT (D156): there are no group buffers on the practice path - "stems" there would be a new rendering architecture, not a finishing slice. Masterclass/explore = OUT (no mixer, no etude object - grep-verified zero export affordances) |
| 10 | "REQ-IO-32 literal 'one WAV per TRACK' vs REQ-COMP-42 'WAV stems as a ZIP' (no granularity); REQ-IO-31 stereo/SR; REQ-IO-61 ABC parse; REQ-IO-42 ABC export" | `docs/PRD-001.md:616` REQ-IO-32 "Export stems as a ZIP (one WAV per track)."; `:386` REQ-COMP-42 "Export WAV stems as a ZIP."; `:387` REQ-COMP-43 "Filename must include the effective key (e.g., `song_accomp_Db.mid`)."; `:625` REQ-IO-42 "Export ABC notation for melody lines."; `:615` REQ-IO-31 "Support sample rate and channel selection."; `:640` REQ-IO-61 "Parse ABC notation into a melody line."; composeExport.ts:35-36 documents the REQ-IO-31 carve ("Mono 44.1k 16-bit (REQ-IO-31 stereo/SR selection is P2 - documented carve-out)") | **TRUE** | Fork 1 (D152) + fork 4 (D156) adjudicate every line: 42 ships per-group with a reading note on 32's literal; 31 stays carved; 61 stays OUT; 42's etude half closes here |
| 11 | "S1 seam disjointness: S1 touched URL, S2 touches export - confirm at file level" | S1 ship commit 9f36944 file list (verified via `git show --name-only`): practiceUrl/exploreUrl/ideaShare/ideaHear/playRoute/shareUrl/urlSyncBus/urlSyncPredicate/sessionStore/main.tsx/vercel.json/serve.json + 4 surfaces + IdeaBar + App (writer/boot) + e2e share/play specs. S2's manifest (sec 5) touches composeExport/ComposeMixer/ComposeSurface (stems hunks)/EtudeComposerPanel/App (etude-ABC handler hunk)/etudeAbc (untouched, consumed). OVERLAP at FILE level: `ComposeSurface.tsx` (S1: Share button + governor variant; S2: stems button + handler) and `App.tsx` (S1: writer/boot; S2: etude ABC handler) - DISJOINT at HUNK level (different regions, different concerns) | **TRUE with correction - disjoint at HUNK level, not file level** | D157 routes the overlap (non-overlapping regions, checklist greps). TD-061 (register.md:74, idea-cap asymmetry) needs NO S1 revisit - product ruling only, stays open |
| 12 | Baseline numbers (task packet) | `npm test` this session: **2743 passed / 1 skipped / 0 failed, 211 files** (18.95s). `git status --short` EMPTY; HEAD 6dd6d9d == origin/main 6dd6d9d. `node assets/check-links.cjs`: "362 frontend + 29 backend = 391, all counts match". `npm run check:paths`: 36/36 OK. Purity floor 56 (engine/purity.test.ts:73). tests/ it( = 362. e2e: 16 spec files (`ls e2e/*.spec.ts \| wc -l`); 41-test count cited from the green S1 ship commit message ("e2e 41/41") - full browser re-run NOT executed this session | **ALL VERIFIED LIVE except the full e2e browser run (honestly cited, not re-run)** | The doc's numbers are this session's measurements, not the packet's |

---

## 1. REQUIREMENTS -> COMPONENTS MAP

| REQ | Priority | Component(s) | Law |
|---|---|---|---|
| REQ-IO-42 etude half "ABC notation for melody lines" | P2 | `src/lib/etudeAbc.ts` (SHIPPED pure, consumed as-is) + App etude-ABC handler + `EtudeComposerPanel` ABC button (NEW prop `onDownloadAbc`) + `src/lib/download.ts` `downloadText` (SHIPPED seam) | S0-fix doctrine: builder -> downloadText, content-pinned (X:/K:/NOT-fallback), never DOM-scraped (D154) |
| REQ-COMP-42 "WAV stems as a ZIP" | P2 | `src/lib/composeExport.ts` (EDIT - `exportComposeStems` folds in, the S4 D81 file-count honesty) + `ComposeMixer` stems button + `ComposeSurface` stems handler + fflate `zipSync` (SHIPPED dep, midiBatchExport precedent) + `encodeWav` per group (SHIPPED, reused) | Per-GROUP stems (D152), sequential render (D153), gain-baked UNNORMALIZED, present-groups contract, REQ-COMP-43 filename extension |
| REQ-IO-32 literal "one WAV per track" | P2 | docs + open_for_orchestrator | READING NOTE (D152): satisfied as stem-per-role (per-GROUP); per-track would contradict the shipped W1/D78 mixer contract - erratum flagged for Kai, code ships per-group |
| REQ-COMP-43 filename key | P2 (shipped S4) | `composeExportFilename` + `exportBaseName` (CONSUMED as-is) | Extended additively: ZIP envelope + `_stem-<group>` file segments (D153); zero grammar invention |
| REQ-IO-31 stereo/SR selection | P2 | none (adjudication) | Stays carved (D156): mono 44.1k 16-bit rides; the header carve (composeExport.ts:35-36) is re-affirmed, not re-opened |
| REQ-IO-61 ABC parse | P2 | none (adjudication) | OUT (D156): a separate parser, not a download button - different slice, different risk |
| TD-046 stems ZIP deferral | P2 | this slice | CLOSES with this slice's shipment (D152/D153); the "nearly free" prediction holds with the MED-001 amendment (sequential, not parallel) |
| TD-061 idea-cap asymmetry | P4 | none (adjudication) | Stays OPEN (D157): product ruling wanted, no code in S2 touches the URL writer |

---

## 2. FORK DECISIONS

### D152 (fork 1): stems granularity = per-GROUP (4 files max, stem-per-role); the REQ-IO-32 literal gets a reading note, not an implementation

THE PICK. (a) per-GROUP ships; (b) per-TRACK literal is rejected with
evidence.

Why (a) is the only honest reading of the SHIPPED system:

1. The mixer contract is W1 (PHASE-4-S4-MIXER-EXPORT.md:82-88): "the
   mixer's four GROUPS - exactly the PRD sec 7.2 contract (W1: NOT a
   DAW)". The four buses (types.ts:377) are what the user MIXES
   (level/mute/solo per group, live GainNodes). A "stem" the user
   cannot solo in the mixer is a file without a mental model.
2. D78 merged ALL original tracks into ONE "original" bus (every
   non-percussion track voiced by role; percussion skipped with
   disclosure). Per-TRACK export would un-merge what D78 deliberately
   merged - requiring per-track OfflineAudioContext jobs (N tracks, not
   4), a new voice-routing table, and a memory model MED-001 never
   analyzed. That is a redesign wearing a finishing-slice costume.
3. REQ-COMP-42 (the compose-domain requirement this slice is chartered
   under) says only "Export WAV stems as a ZIP" - NO granularity. The
   per-track literal lives in REQ-IO-32 (the generic-I/O table). The
   compose-domain reading (stems = the mixer's groups) is available
   without contradicting any compose-domain text.
4. TD-046's own prediction ("renderMixGroups already yields the 4
   AudioBuffers") was written against groups. The "nearly free" math
   holds for 4 files; it does not hold for N-track renders.

The HONESTY PRICE of (a) - paid in full, three places:

- UI copy says "stems" with the per-group qualifier in the tooltip:
  "Per-group stems ..." (never "per track"). The mixer already labels
  its rows Original/Bass/Chords/Pad - the ZIP contents are those rows.
- Filenames say `_stem-<group>` (D153) - the group name is IN the file,
  so no recipient can mistake a stem for a track.
- Docs (COMPOSE-MODE.md, ARCHITECTURE.md) gain one line: "Stems are
  per mix GROUP (stem-per-role: original/bass/chords/pad), not per
  original MIDI track - REQ-IO-32 reading note."

READING NOTE for Kai (erratum, orchestrator applies - this slice
touches no PRD line): REQ-IO-32's parenthetical "(one WAV per track)"
is satisfied as "(one WAV per mix group)". Rationale: the shipped
mixer (W1/D77/D78, 4 groups) defines the only mixable units; exporting
finer than the mixer would ship files the UI cannot explain. If
product ever wants literal per-track stems, that is a NEW slice (new
render jobs + new mixer rows + new memory analysis), not a bug fix.

REJECTED alternative:

- (b) Per-TRACK literal: N OfflineAudioContext renders (a 12-track
  file = 12 contexts sequentially, ~3x the stems time), a new
  track->voice routing (D78's role-voicing would need per-track
  inversion), per-track gain semantics the mixer never had (tracks
  have no knobs - what gain bakes?), and filenames for tracks with
  hostile characters (sanitize per track, collision-dedupe per ZIP -
  the midiBatchExport `deduplicate` class, re-invented). Rejected:
  cost, surface, and contradiction with W1.

### D153 (stems render path): SEQUENTIAL per-group render + gain-baked UNNORMALIZED + present-groups contract + REQ-COMP-43 filename extension + fflate zipSync

THE MECHANISM (every element is a shipped precedent, re-composed):

1. RENDER: `renderMixGroupsSequential(input, EXPORT_CAP_SEC, onGroup)`
   (composePreview.ts:340-351, the MED-001 export path) - ONE group at
   a time, buffer handed to `onGroup`, renderer holds no reference
   after (`buf` goes out of scope :349). NOT the parallel
   `renderMixGroups` (TD-046 names it; MED-001 superseded it for
   export - peak 423MB -> 212MB at the 600s cap). The stems path
   inherits the fix by calling the sequential variant.
2. GAIN: each group's channel-0 is scaled by
   `computeGroupGains(mixer, hasOriginal)[group]` via the SHARED
   `accumulateGroupInto` primitive into a FRESH per-group Float32
   (not the shared accumulator - one group at a time, freed after
   encode). What-you-hear-is-what-you-get: mute/solo/levels honored
   exactly as the full mix hears them. Zero-gain groups still emit
   (silence, honest - the file set is stable, see contract below).
3. NORMALIZE: NONE per stem. The full mix applies `normalizePeak`
   (divide by measured peak, clamped <= 1.0). Per-stem normalization
   would destroy relative balance (a quiet pad normalized to full
   scale no longer sums with its bass). The stems therefore sum to
   the PRE-normalize mix. The tooltip + docs say so honestly
   ("stems are pre-normalize; the full-mix WAV is peak-safe").
   Rationale over the alternative (two-pass shared-scale): a shared
   scale needs either all 4 Float32s alive at once (defeats MED-001:
   423MB + accumulator at cap) or a double render (2x OfflineAudio
   time). DAW-standard is unnormalized stems; the full-mix WAV
   remains the peak-safe artifact.
4. ENCODE: `encodeWav(scaledFloat32, PREVIEW_SAMPLE_RATE)` per group
   (loopWav.ts:38, the D81-shared RIFF writer - no second writer) ->
   `await blob.arrayBuffer()` -> Uint8Array -> `zipSync({ filename:
   bytes })` (fflate, midiBatchExport.ts:29/:148 precedent) ->
   `downloadBlob(zipBlob, zipName)` (composeExport.ts:310-320, the
   S4-folded helper - appends anchor to body, unlike `downloadText`).
5. CONTRACT: one file per PRESENT group (the `Partial<>` keys the
   renderer actually yielded - chart-only has no `original`;
   role-absent sessions lack that role). Absent groups are simply not
   in the ZIP (same honesty as the mixer's disabled original row).
   Present-but-muted groups emit silence (stable set, no
   gain-dependent file-count surprise). The ZIP always has >= 1 file
   whenever `canExport` (the button's own gate - ComposeMixer
   :96-107 law).
6. FILENAMES (additive on the shipped REQ-COMP-43 scheme):
   - ZIP envelope: `composeExportFilename(base, key, "zip")` =
     `<base>_accomp[_<Key>].zip` (the S4 scheme, extension swapped).
   - Members: `<base>_accomp[_<Key>]_stem-<group>.wav`, group in
     `original|bass|chords|pad` (MIX_GROUPS order). ASCII-only
     (sanitize inherited; group names are already ASCII).
   - Example: `s4-fixture_accomp_C_stem-bass.wav` inside
     `s4-fixture_accomp_C.zip`. Key-omitted sessions (chromatic
     fallback) omit the segment in BOTH envelope and members (the
     never-fake-key law, composeExport.ts:285-287).

Memory at cap (honest accounting): peak = ONE group AudioBuffer
(~106MB at 600s) + ONE per-group Float32 (~106MB) + streaming ZIP
bytes (WAV 16-bit ~53MB per finished group, freed only at zipSync).
No accumulator (unlike full-mix). Worst case ~265MB transient at the
cap - under MED-001's 212MB+encode budget class, and realistic
sessions (8 bars ~15s) are ~7MB total. The 600s cap + "renders up to
10:00" label ride unchanged (EXPORT_CAP_SEC, composeExport.ts:89).

REJECTED alternatives:

- (a) Parallel render + `mixGroupBuffers` split-back-out: cannot
  un-sum (the sum is lossy - individual groups are unrecoverable
  from the accumulator). Rejected: information-theoretically dead.
- (b) Shared peak scale across stems (sum-to-normalized-mix): needs
  all groups alive or double render (above). Rejected: MED-001
  regression for a nicety the full-mix WAV already provides.
- (c) New `composeStems.ts` file: the logic is ~80 lines + filename
  reuse + gain reuse, all in composeExport's domain. S4 D81 folded
  `downloadBlob` for file-count honesty; same ruling here. Rejected:
  a one-function file.

### D154 (fork 2): button placement + affordance law (PHASE-1-02)

TWO buttons, two homes, both following shipped precedents:

STEMS (compose surface):

- Mount: `ComposeMixer` header row, third button after Export MIDI /
  Export WAV: `data-testid="mix-export-stems"`, label "Export Stems".
  Wiring: `ComposeMixerProps += onExportStems: () => void`;
  `ComposeSurface` owns `handleExportStems` (same guards as
  `handleExportWav`: `mixInput === null` early-return, warn-only
  catch) and passes it at the `:719-736` mount site.
- Disabled-when: `disabled={!canExport || rendering}` - BYTE-IDENTICAL
  to its siblings (ComposeMixer.tsx:97/:107 law). No analysis loaded
  (no result AND no originals) -> all three exports disabled
  together; rendering -> all three disabled together. Governor-tripped
  (600s cap) is NOT a disable: the cap truncates with the honest
  "renders up to 10:00" label (EXPORT_CAP_SEC doctrine) - same as WAV.
- Tooltip (honest, ASCII): "Per-group stems ZIP (original/bass/
  chords/pad as present, current levels, mono 16-bit, renders up to
  10:00). Stems are pre-normalize; the full-mix WAV is peak-safe."
  The "per-group" word is the D152 labeling obligation, IN the
  affordance itself.

ETUDE ABC (etude surface):

- Mount: `EtudeComposerPanel` result row, NEXT TO "MusicXML (with
  melody)" (`:327-336` precedent) - behind the SAME gate
  (`loadedTitle !== null && onDownloadAbc`). Label "ABC", title
  "Download ABC source (same notation as the Staff tab)".
- Plumbing mirrors D27 EXACTLY: panel receives OPTIONAL
  `onDownloadAbc?: () => void` (button renders only when provided
  AND loaded); App owns `handleEtudeAbcDownload` (guards
  `!activeEtude` return, resolves the TRUE-FORM path via
  `etudePathId` + bars slice like `:2667-2684`, calls
  `buildEtudeAbc(activeEtude, { transposeShift: soundingShift })`,
  `downloadText(`${pid}.abc`, abc, "text/plain")`).
  Transpose parity: the Staff tab renders
  `buildEtudeAbc(etude, { transposeShift })` (EtudeStaffView.tsx:37)
  - the download passes the SAME `soundingShift`, so file and view
  agree byte-identically (the TD-060 K:C caveat applies equally to
  both - no NEW drift).
- Why NOT inside EtudeStaffView: it mounts only on the Staff tab
  (EtudeViews.tsx:187-203) behind a lazy Suspense boundary - the
  affordance would vanish on the Roll tab. Why NOT in EtudeViews
  header next to Print: that header owns view chrome (tabs/notes/
  print), not downloads; the composer result row already owns the
  download family (MusicXML precedent). One channel, no duplicate
  affordance.
- Disabled-when: ABSENCE, not disabled (same as the MusicXML
  sibling): nothing loaded -> no button (the row is the loaded
  context; a disabled "ABC" with no etude would be PHASE-1-02 noise).
  When rendered, always enabled (`buildEtudeAbc` is total on a valid
  etude - no feasibility gate like Generate).
- Filename: `${pid}.abc` where pid = `etudePathId(activeEtude)` (the
  D27 convention, composeExport.ts:283 `downloadText(`${pid}.musicxml`
  ...) sibling). The TD-033 `etu-etu-<hash>` double-prefix cosmetic
  debt rides along UNCHANGED (documented, not fixed here).

PRACTICE path: NO stems button (D-scope verdict, audit #9). The
practice export tiles (PlaySessionRail.tsx:1196-1235) render a SINGLE
loop (`renderPathToWav` - block/arp/block_then_arp/mono modes); there
are no group buffers to zip. Practice "stems" would mean
per-voice/arp-lane renders - a new rendering architecture, not export
finishing.

REJECTED alternatives:

- (a) Stems in the PracticeHeader/export menu: the header owns
  session + share (S1), not compose artifacts; compose stems on the
  practice surface would need cross-mode plumbing (effectiveProject
  is ComposeSurface-local). Rejected: wrong surface.
- (b) Etude ABC inside the Staff tab view: tab-gated invisibility
  (above). Rejected.
- (c) A third "Export" dropdown menu unifying MIDI/WAV/stems: the
  mixer ships three honest buttons today (pinned testids,
  e2e-referenced); a menu adds hover/keyboard surface for zero user
  gain. Rejected: churn without value.

### D155 (fork 3): e2e vs node fidelity split - byte fidelity in node goldens + e2e download legs filename-first (RK-S4-6 precedent); timing budgets + flake mitigations

THE SPLIT (S3/S4 doctrine, unchanged):

- NODE (deterministic buffers, no AudioContext): golden tests over
  the PURE seams - `mixGroupBuffers` gain-baking (fake buffers with
  exact Float32 payloads), `normalizePeak` non-application to stems
  (stems path never calls it - pinned by absence: the stems helper's
  own unit asserts its output equals the gain-baked input, NOT the
  normalized mix), filename scheme (`composeExportFilename` +
  `_stem-<group>` segments, key-omitted arm, sanitize arm), ZIP
  structure (fflate `zipSync`/`unzipSync` round-trip in-node: member
  names exact, each member's bytes start `RIFF....WAVE` via REAL
  `encodeWav` -> `arrayBuffer` - Blob exists in Node 18+, no ctx
  needed). The OfflineAudioContext render itself is NEVER asserted
  in node (the MED-001 FakeOffline pattern proves ORDER, not audio -
  reused only if the stems path adds scheduling, which it does not:
  it calls the shipped sequential renderer).
- E2E (real browser, real OfflineAudioContext, served dist): TWO new
  legs in the EXISTING `e2e/compose-mixer-export.spec.ts` (extended
  journey, not a new spec - the fixture + upload + generate + mixer
  preamble is shared; a new spec would re-pay the 20s render
  preamble). Leg A (stems): click `mix-export-stems` via the S4
  `grabDownload` helper (`waitForEvent("download")` + `path()` +
  `suggestedFilename`) -> filename matches `/_accomp(_[A-G][#b]?m?)?\.zip$/`
  -> `unzipSync` IN-SPEC (fflate is a declared dep, requireable like
  midi-file) -> member count = present groups, names match
  `/_stem-(original|bass|chords|pad)\.wav$/`, each member magic
  `RIFF`/`WAVE`. Leg B (etude ABC): generate an etude (the
  etude-composer.spec.ts preamble precedent) -> click the panel ABC
  button -> `grabDownload` -> filename `/.+\.abc$/` -> content
  `startsWith("X:")` + `contains("K:")` + NOT the S0 fallback string
  (the LeadSheet pin shape, browser-proven).
- FILENAME-ONLY degrade (RK-S4-6 law): if either download ever
  flakes in CI, the leg degrades to filename regex + button-enabled
  matrix (the unit pins carry the byte fidelity) - documented in the
  spec header, never a silent skip. The `downloadText`-without-append
  wrinkle (audit #8) is EXACTLY what leg B proves: if the detached
  anchor ever stops firing a download event, leg B fails LOUDLY (it
  cannot false-pass).

TIMING BUDGETS (the 10:00 cap precedent + CI reality):

- Fixture discipline: e2e fixtures stay SHORT (the S4 8-bar fixture
  ~15s audio). The 600s cap is a PRODUCTION governor, never an e2e
  input - no leg renders more than ~20s of audio (the S4 leg-1
  `playing` timeout 20_000 is the ceiling precedent).
- Spec timeout: `test.setTimeout(120_000)` (S4 file :52 law) covers
  upload + generate + two WAV renders (full-mix leg 4 + stems leg A)
  + etude generate + ABC download. The stems render is ONE sequential
  pass over the SAME jobs the full-mix leg already rendered - wall
  time ~2x leg 4, well inside the budget.
- Download wait: `waitForEvent("download", { timeout: 30_000 })`
  (S4 :120 law) per download leg. ZIP encode (`zipSync` over ~4x
  15s WAVs ~5MB) is sub-second; the wait is dominated by the
  OfflineAudioContext render, not the zip.

FLAKE MITIGATIONS (TD-CI-E2E-FLAKE discipline):

- No new webServer config, no new spec file (the journey EXTENDS the
  shipped spec - one server boot, one preamble). In-spec fixture
  bytes (no network). NODE-side byte assertions (no audio-output
  listening - the RK-S4-1 LISTEN CHECK stays manual and OPEN).
- Break-guard protocol (S3/S4 discipline): legs A+B FAIL pre-S2
  (no `mix-export-stems` testid -> locator timeout; no panel ABC
  button -> locator timeout). Run on the stashed pre-S2 build,
  restore, green.

REJECTED alternatives:

- (a) Stronger e2e (decode stems audio, assert sample equality with
  the mix): OfflineAudioContext output in headless Chromium is
  deterministic per-machine but NOT byte-pinned across CI runners
  (floating-point scheduling jitter); the node golden already pins
  the math. Rejected: flake surface for zero additional bug class.
- (b) New standalone stems spec file: re-pays upload+generate+mixer
  preamble (~30s) and doubles webServer exposure to the
  startup-race flake. Rejected: extend the journey.
- (c) Node-only (no e2e download legs): the `downloadText` detached-
  anchor question (audit #8) and the fflate-in-bundle question can
  ONLY be proven in a real browser against served dist. Rejected:
  the legs are the proof.

### D156 (fork 4): scope keeps - ABC parse OUT, stereo/SR OUT, practice-path stems OUT, masterclass/explore OUT

Each OUT with its reason (no silent carves):

- REQ-IO-61 ABC PARSING ("Parse ABC notation into a melody line"):
  OUT. A parser is a grammar (tokenizer + pitch/duration algebra +
  error recovery + a melody-line target the repo never specified) -
  the inverse of a 12-line download call. It shares NOTHING with the
  download seam except the acronym. Separate slice, separate risk.
  Confirmed OUT.
- REQ-IO-31 STEREO/SR ("Support sample rate and channel selection"):
  OUT unless cheap - adjudicated OUT, not cheap enough. The carve
  lives in the shipped header (composeExport.ts:35-36: "Mono 44.1k
  16-bit (REQ-IO-31 stereo/SR selection is P2 - documented
  carve-out)"). Opening it here means: a sample-rate parameter
  through `renderOneGroup` (OfflineAudioContext constructor rate +
  `previewFrameCount` rescale + `encodeWav` header rate), a stereo
  interleave in the RIFF writer (mono->stereo doubles every buffer
  at the 600s cap), UI selection affordances on the mixer, and new
  golden pins for every combination. That is a format slice, not a
  finishing slice. The stems files ride the SAME mono 44.1k contract
  as the full mix (consistency > novelty). Confirmed OUT.
- PRACTICE-PATH STEMS: OUT (verdict, audit #9 + D154). The practice
  renderer (`renderPathToWav`) produces one loop, not groups. No
  buffers exist to zip; inventing them is new architecture.
- MASTERCLASS / EXPLORE surfaces: OUT (verdict). Neither surface
  owns a mixer or an etude object (grep-verified: zero export
  affordances, zero `renderMixGroups`/`buildEtudeAbc` imports). A
  catalog tune shared as audio is the practice loop export (already
  ships); explore ideas shared as audio is the Hear path (already
  ships). No new affordance belongs on either surface.

### D157 (fork 5): slice scope - S2 does NOT absorb S1 leftovers; S1/S2 are hunk-disjoint; TD-061 routes to product, not code

ADJUDICATION: NO by default, confirmed. The export legs share the
mixer CODE the S1 pred... no - S1 touched the URL bus/predicate/
PlaySurface/ideaShare (audit #11: disjoint at hunk level, overlapping
at file level only in ComposeSurface.tsx + App.tsx). Evidence:

- S1's ComposeSurface hunks: Share button + `share-url-status` +
  governor-variant copy (D149). S2's ComposeSurface hunks:
  `onExportStems` prop + `handleExportStems` + mixer mount line.
  Different regions (share lives near the URL notice ~:59/:370-375;
  exports live at :445-459/:719-736). A three-way merge applies both
  cleanly; the checklist greps (sacred-handler, IMMUTABLE, writer
  singularity) discriminate any collision.
- S1's App hunks: writer registration + write() key families +
  practice-sync effect + boot restore (D145/D146/D149). S2's App
  hunk: `handleEtudeAbcDownload` + panel prop pass-through (D27
  shape, ~:2667-2684 neighborhood). Different regions, different
  concerns (URL vs download).
- S1's store/predicate/playRoute/ideaHear/ideaShare/urlSyncBus/
  shareUrl/practiceUrl/exploreUrl: ZERO S2 hunks (S2 consumes none of
  them; stems + ABC are URL-free - downloads carry no state).

TD-061 (register.md:74: "Explore-surface Share copies without the
live idea ... Product ruling wanted if explore users mint big
melodies") is a PRODUCT ruling about URL payloads, not an export
mechanism. It needs an orchestrator decision (include idea in
explore copies? raise the governor? honest notice?), then a URL-slice
implementation. S2 implements neither. TD-061 stays OPEN, routed to
open_for_orchestrator - NOT a seam to revisit.

REJECTED alternative:

- (a) Absorb TD-061's ruling into S2 ("while we're here"): S2's
  charter is downloads; TD-061's fix (if any) edits `shareUrl.ts` /
  ExploreSurface copy call-sites / the 1500-governor - the S1 seam
  with its own pin matrix. Rejected: scope bleed into a shipped
  slice's tested contract.

---

## 3. TYPE DEFINITIONS (copyable)

### 3.1 src/lib/composeExport.ts ADDITION (folded, the S4 D81 file-count honesty - NO new lib file)

```ts
/** PRD-001 Phase 8 S2 (D152/D153): per-GROUP stems ZIP (stem-per-role).
 *  FOLDED into composeExport.ts (the S4 D81 precedent: downloadBlob
 *  folded rather than a one-function file). Consumes as-is:
 *  renderMixGroupsSequential + computeGroupGains (composePreview),
 *  encodeWav (loopWav), composeExportFilename/exportBaseName/downloadBlob
 *  (this file), zipSync (fflate, the midiBatchExport precedent). */

/** Member filename: <base>_accomp[_<Key>]_stem-<group>.wav.
 *  Group segment is the MIX_GROUPS literal (ASCII by construction);
 *  key-omission + sanitize inherit the REQ-COMP-43 law. */
export function composeStemFilename(
  base: string,
  key: KeyCandidate | null,
  group: MixGroup,
): string;

/** REQ-COMP-42: render + download the per-group stems ZIP at the CURRENT
 *  mixer gains (600s cap, mono 44.1k 16-bit per member).
 *
 *  LAWS (pinned):
 *  - SEQUENTIAL render (MED-001): one group at a time via
 *    renderMixGroupsSequential; each buffer is gain-baked (computeGroupGains)
 *    into a fresh Float32, encoded via encodeWav, then FREED (peak = one
 *    buffer + one Float32 + streaming ZIP bytes - no accumulator).
 *  - Gain-baked UNNORMALIZED (D153): stems sum to the PRE-normalize mix;
 *    normalizePeak is NEVER called on this path (the full-mix WAV stays
 *    the peak-safe artifact; tooltip + docs say so).
 *  - Present-groups contract: one member per yielded Partial<> key
 *    (MIX_GROUPS order); absent groups omitted; present-but-muted emit
 *    silence (stable set whenever canExport).
 *  - Envelope: composeExportFilename(base, key, "zip") (the S4 scheme). */
export async function exportComposeStems(
  input: MixRenderInput,
  mixer: MixerState,
  hasOriginal: boolean,
  key: KeyCandidate | null,
): Promise<void>;
```

### 3.2 Etude ABC seam (S0-fix shape, reused verbatim)

```ts
/** EtudeComposerPanel.tsx ADDITION (optional prop, the D27 shape):
 *  button renders only when provided AND loadedTitle !== null. */
export interface EtudeComposerPanelProps {
  /* ...shipped... */
  /** Optional "ABC" download trigger (S2); the button renders only
   *  when provided AND an etude is loaded (absence, not disabled). */
  onDownloadAbc?: () => void;
}

/** App.tsx ADDITION (D27 neighborhood, ~:2667-2684):
 *  handleEtudeAbcDownload: !activeEtude -> return; pid = etudePathId;
 *  TRUE-FORM path slice (bars, like the MusicXML handler); abc =
 *  buildEtudeAbc(activeEtude, { transposeShift: soundingShift });
 *  downloadText(`${pid}.abc`, abc, "text/plain"). */
```

### 3.3 src/components/ComposeMixer.tsx ADDITION

```ts
export interface ComposeMixerProps {
  /* ...shipped... */
  onExportStems: () => void;   // NEW (D154)
}
// Header row third button:
//   data-testid="mix-export-stems", label "Export Stems",
//   disabled={!canExport || rendering} (sibling law),
//   title="Per-group stems ZIP (original/bass/chords/pad as present,
//   current levels, mono 16-bit, renders up to 10:00). Stems are
//   pre-normalize; the full-mix WAV is peak-safe."
```

### 3.4 Unchanged consumers (read-only references)

```ts
// buildEtudeAbc(etude, { transposeShift?: number }): string  (etudeAbc.ts:69)
// downloadText(filename, content, mime): void               (download.ts:14)
// renderMixGroupsSequential(input, capSec, onGroup): Promise<void>  (composePreview.ts:340)
// computeGroupGains(m: MixerState, hasOriginal: boolean)    (composePreview.ts:195)
// encodeWav(samples: Float32Array, sampleRate: number): Blob (loopWav.ts:38)
// composeExportFilename(base, key, ext): string             (composeExport.ts:288)
// exportBaseName(fileName: string): string                  (composeExport.ts:303)
// downloadBlob(blob, name): void                            (composeExport.ts:310)
// zipSync(files: Record<string, Uint8Array>): Uint8Array    (fflate, via midiBatchExport.ts:29 precedent)
// MIX_GROUPS: readonly ["original","bass","chords","pad"]   (engine/compose/types.ts:379)
```

---

## 4. DATA FLOW (two downloads, end to end)

```
STEMS ZIP (compose surface, user clicks Export Stems)
  mixer {original 0.9, bass 1, chords 0.8 muted, pad 0.8} + hasOriginal true
  + effectiveProject + accompResult + accompKey(C major)
    -> handleExportStems (ComposeSurface): mixInput null? return
    -> exportComposeStems(input, mixer, hasOriginal, key):
         gains = computeGroupGains(mixer, hasOriginal)  // chords -> 0
         base = exportBaseName(project.fileName)         // "s4-fixture"
         await renderMixGroupsSequential(input, 600, (group, buf) => {
           scaled = fresh Float32(buf.length); accumulateGroupInto(scaled, buf, gains[group])
           wavBlob = encodeWav(scaled, 44100)            // shipped RIFF writer
           members[composeStemFilename(base, key, group)] = new Uint8Array(await wavBlob.arrayBuffer())
           // buf + scaled go out of scope here (MED-001 peak discipline)
         })
         zipBytes = zipSync(members)                     // fflate, midiBatchExport precedent
         downloadBlob(new Blob([zipBytes], {type:"application/zip"}),
                      composeExportFilename(base, key, "zip"))
  user unzips: 4 (or fewer, present-groups) mono WAVs, gain-baked,
  pre-normalize (sum = pre-normalize mix - documented, not silent)

ETUDE ABC (etude surface, user clicks ABC)
  activeEtude (bars 16, tempo 100, canonicalId etu-etu-<hash>) + soundingShift +2
    -> EtudeComposerPanel result row: loadedTitle !== null && onDownloadAbc
       -> ABC button (absence-gated, always enabled when shown)
    -> App handleEtudeAbcDownload: !activeEtude? return
       -> pid = etudePathId(activeEtude); formPath slice (bars, D27 true-form)
       -> abc = buildEtudeAbc(activeEtude, { transposeShift: soundingShift })
          (SAME call the Staff tab renders - EtudeStaffView.tsx:37 - file == view)
       -> downloadText(`${pid}.abc`, abc, "text/plain")
          (Blob + detached anchor + 1s revoke - the S0 seam byte-identical)
  recipient opens in any ABC tool: X:<canonicalId> / T:<title> / M:4/4 /
  L:1/8 / Q:1/4=<tempo> / K:C + one line per bar (chord + tie-split melody)
```

---

## 5. EXACT FILE PLAN (E edit / N new; complete manifest for directory staging - GIT-001)

```
E src/lib/composeExport.ts               exportComposeStems + composeStemFilename (3.1; fflate import += unzipSync? NO - only zipSync; unzipSync lives in the e2e spec)
N src/lib/composeStems.test.ts           node: gain-bake/stems-filenames/zip-roundtrip/unnormalized-law x12 ( colloc: src/lib, node project - NO JSDOM_FILES entry)
E src/components/ComposeMixer.tsx        onExportStems prop + third button (3.3)
E src/components/ComposeMixer.test.tsx   +3 its (button renders/enabled-matrix/click-routes; sibling-law pins survive)
E src/components/ComposeSurface.tsx      handleExportStems + mixer mount pass-through (D154; S1 Share/governor hunks untouched - hunk-disjoint per D157)
E src/components/ComposeSurface.test.tsx +1 it (stems handler routes onExportStems; canExport-false disables - the sibling matrix)
E src/components/EtudeComposerPanel.tsx  onDownloadAbc prop + ABC button in the result row (D27 gate shape; S1 Share hunk untouched)
E src/components/EtudeComposerPanel.test.tsx +3 its (absence-gate: no button when unloaded; renders when loaded+prop; click routes onDownloadAbc)
E src/App.tsx                            handleEtudeAbcDownload + panel prop pass-through (D27 neighborhood ~:2667-2684; ZERO writer/boot/predicate/sacred-handler hunks - D157)
E e2e/compose-mixer-export.spec.ts       legs A (stems ZIP) + B (etude ABC) appended to the shipped journey (D155; NO new spec file)
E docs/COMPOSE-MODE.md                   stems row: per-group contract + pre-normalize honesty + filename shape (D152/D153 labeling obligation)
E docs/ARCHITECTURE.md                   export section: stems per-group line + etude ABC line (one line each, no restructure)
E docs/ETUDE-COMPOSER.md                 ABC download row (mount point + transpose parity + filename convention)
E docs/TERMINOLOGY.md                    "stem-per-role" / "present-groups contract" / "pre-normalize stems" entries
E AGENTS.md                              Kai lockstep: suite count line 2743/211 -> final (checklist item 16)
```

NOT touched (hard): `tests/**` (byte-frozen; it( 362 gate),
`src/lib/etudeAbc.ts` (consumed as-is; golden pins stay green),
`src/lib/download.ts` / `src/lib/loopWav.ts` (seams reused; no edits
- stems needs no `encodeWavBytes` extraction: `blob.arrayBuffer()`
suffices), `src/components/LeadSheet.tsx` (S0-fixed, IMMUTABLE),
`src/lib/etudeUrl.ts` / `composeUrl.ts` / `ideaShare.ts` /
`urlSyncBus.ts` / `shareUrl.ts` / `practiceUrl.ts` / `exploreUrl.ts` /
`urlSyncPredicate.ts` (S1 URL seam - zero hunks, D157),
`src/state/sessionStore.ts` (no fields, no v5),
`src/components/PlaySurface.tsx` / `src/main.tsx` / `vercel.json` /
`public/serve.json` (S1 routing - untouched), `engine/**` (ZERO files
added/removed - purity floor stays 56), `src/lib/rhythm.ts` /
`backingEngine.ts` / `playbackClock.ts` / `guideToneTrail.ts` /
`midiIn.ts` / `midiOut.ts` / `etudeUrl`+`composeUrl` (immutable list),
`src/App.tsx:1238-1380` (sacred handler - ZERO hunks),
`src/components/ExploreSurface.tsx` / `PracticeHeader.tsx` /
`IdeaBar.tsx` (S1 share affordances - untouched),
`src/data/**` / personas.json / masterclass.ts (no count pins move:
tunes 40, briefing 12, personas), README/SPEC (check-links values
unmoved), `.kai/**` (Kai-only: TD-046 close + TD-061 routing),
`docs/PRD-001.md` (orchestrator-owned; D152 reading note flagged),
`docs/PHASE-8-S1-SHARE.md` + `docs/PHASE-4-S4-MIXER-EXPORT.md`
(historical docs - never edited), `playwright.config.ts`
(webServer command byte-identical), `package.json` (fflate already
declared - zero dep churn), `vitest.config.ts` (NO new JSDOM entries:
composeStems.test.ts is node-pure; component tests auto-glob).

---

## 6. TEST PLAN

### 6.1 Unit (node env unless noted; colocated; suite 2743 -> ~2759 / 1 skipped / 0 failed; files 211 -> 212)

- composeStems.test.ts (NEW, node, +12):
  1. `composeStemFilename` - full scheme: `s4-fixture` + C-major key +
     `bass` -> `s4-fixture_accomp_C_stem-bass.wav` (exact string).
  2. key-null arm: chromaticFallback -> `chart_accomp_stem-pad.wav`
     (no fake key, envelope parity with `composeExportFilename`).
  3. sanitize arm: hostile base `a/b:c?.mid`-derived -> no
     `[\\/:*?"<>|]`, whitespace -> `_` (inherits the S4 law).
  4. group-exhaustiveness: all 4 MIX_GROUPS produce distinct names
     (collision-free by construction).
  5. gain-bake: fake buffers (exact Float32 `[1, 0.5]` etc.) +
     gains `{original: 0.9, bass: 0, ...}` via `mixGroupBuffers` ->
     muted group contributes zeros (the WYSIHYG pin).
  6. UNNORMALIZED law: stems helper output `toEqual` the gain-baked
     array, `not.toEqual(normalizePeak(...))` on a hot fixture
     (peak > 1 - the discriminative pin: a future "helpful"
     normalize call breaks this test).
  7. ZIP round-trip: `zipSync` 2 fake WAV members -> `unzipSync` ->
     names exact + bytes exact (fflate mechanics, no audio).
  8. encodeWav reality: REAL `encodeWav(Float32Array, 44100)` ->
     `arrayBuffer` -> magic `RIFF`/`WAVE` (proves the Blob->
     bytes bridge the stems path depends on - no ctx needed).
  9. present-groups contract: Partial with missing `pad` -> ZIP has
     3 members, no `stem-pad` key (absence, not silence).
  10. silence-stability: present-but-zero-gain group still yields a
     member (stable set - the D153 contract).
  11. envelope parity: ZIP name == `composeExportFilename(base, key,
      "zip")` (one truth, not a second grammar).
  12. ASCII: every generated filename matches `/^[\x00-\x7F]*$/`
      (PM-2026-009-004).
- ComposeMixer.test.tsx (+3): stems button renders with the
  per-group title (the D152 labeling obligation, asserted
  verbatim); disabled matrix (`canExport false` -> all three
  disabled; `rendering` -> all three disabled - sibling law);
  click routes `onExportStems` exactly once.
- ComposeSurface.test.tsx (+1): stems handler routes through the
  mixer prop (seam routing pin; `mixInput null` -> no call - the
  guard arm).
- EtudeComposerPanel.test.tsx (+3): absence-gate (unloaded -> NO ABC
  button query; mirrors the MusicXML :181-197 pin shape); renders
  when loaded + prop provided; click routes `onDownloadAbc` once.
- Untouched suites as regression net: etudeAbc.test.ts goldens
  (builder byte-identical), LeadSheet.test.tsx (S0 pins - the seam
  template), composeExport.test.ts (mix/normalize/MED-001 pins),
  ComposeMixer sibling pins, urlSync/predicate/store pins (S1 seam
  untouched - must stay green untouched).

### 6.2 e2e boundary (Playwright; 41 -> 43 tests, 16 specs UNCHANGED - journey extended, no new spec file)

Leg A - STEMS ZIP (appended to e2e/compose-mixer-export.spec.ts,
after leg 4 WAV, reusing the SAME generated session + mixer state):

1. Click `mix-export-stems` via `grabDownload` (byte-identical
   helper :116-125: `waitForEvent("download", 30s)` + `path()` +
   `suggestedFilename`).
2. Assert filename matches `/_accomp(_[A-G][#b]?m?)?\.zip$/`
   (REQ-COMP-43 envelope, key-present fixture -> `_accomp_C.zip`).
3. `unzipSync(readFileSync(dlPath))` IN-SPEC (fflate requireable -
   the midi-file precedent :42-50) -> member names match
   `/^.+_accomp_C_stem-(original|bass|chords|pad)\.wav$/`, count ==
   present groups (fixture yields all 4: originals + 2 roles... note:
   the S4 fixture generates bass+chords (2 roles) so present =
   original+bass+chords = 3 + pad ABSENT (role not in result.meta)
   -> assert 3 members + NO `stem-pad` - the present-groups
   contract, browser-proven).
4. Each member bytes `subarray(0,4)=RIFF`, `(8,12)=WAVE` (magic, not
   audio - RK-S4-1 stays manual).
5. DISCRIMINATIVE: pre-S2 no `mix-export-stems` testid -> locator
   timeout -> FAILS (structural break-guard).

Leg B - ETUDE ABC (appended to the same journey OR the
etude-composer spec - architect recommends the etude-composer spec
IF its preamble generates faster; default: compose-mixer-export
journey continues - either way ONE preamble is reused):

1. Generate an etude (shipped preamble) -> panel ABC button visible
   (absence-gate positive: loaded -> renders).
2. Click via `grabDownload` -> filename `/.+\.abc$/` -> content
   `startsWith("X:")` + `contains("K:")` + `not.toContain("ABC
   source unavailable")` (the S0 pin shape, browser-proven) +
   `contains("M:4/4")`.
3. DISCRIMINATIVE: pre-S2 no ABC button -> locator timeout -> FAILS.
4. WRINKLE PROOF: this leg passes ONLY if the detached-anchor
   `downloadText` fires a real download event (audit #8) - if it
   ever stops, the leg fails LOUDLY (cannot false-pass).

BREAK-GUARD protocol: legs A+B fail pre-S2 (missing testids);
run on the stashed pre-S2 build, restore, green (S3/S4 discipline).
RK-S4-6 degrade: if either download flakes in CI, degrade to
filename-regex + enabled-matrix (unit pins carry bytes) - documented
in the spec header, never silent.

### 6.3 Manual checklist (truths no bot can prove)

- [ ] Stems listen: unzip a real session's ZIP, import all members
      into a DAW/Audacity - balance matches the in-app mix at the
      same knob positions (gain-bake truth); sum clips slightly
      hotter than the full-mix WAV (pre-normalize honesty - verify
      it reads as documented, not broken).
- [ ] Etude ABC open: download an etude ABC, open in an ABC tool
      (EasyABC/abcjs viewer) - notation matches the Staff tab
      (transpose parity, chord symbols, ties).
- [ ] Transpose parity spot: set a non-zero transpose, compare Staff
      tab vs downloaded ABC (same pitches - TD-060 applies equally,
      no NEW drift).
- [ ] Governor spot: export stems on a >10:00 session (or a long
      chart) - truncates at 10:00 with the honest label (same as WAV).
- [ ] Mute spot: mute Chords, export stems - `stem-chords.wav` is
      silence but PRESENT (stable-set contract); unmute, re-export -
      content returns.
- [ ] Chart-only spot: chart session stems ZIP has NO `stem-original`
      member (present-groups honesty); original row shows "no file -
      chart only" (unchanged disclosure).
- [ ] Fast-click spot: click Export Stems twice fast - second click
      while rendering is disabled (no double-render pileup).

---

## 7. INTERFACE CONTRACTS

### 7.1 DOM / testids (e2e + a11y)

- Mixer: `mix-export-stems` (NEW, third button; siblings
  `mix-export-midi`/`mix-export-wav` untouched). Disabled law:
  `!canExport || rendering` (sibling-identical).
- Etude panel: ABC button accessible name "ABC", title "Download ABC
  source (same notation as the Staff tab)" (the LeadSheet
  "Download ABC source" sibling, extended honestly). Absence-gated
  (no testid needed - role query like the MusicXML sibling).
- No new routes, no new modals, no new shortcuts (frozen SHORTCUTS
  reverse-pin holds - buttons are mouse/touch affordances).

### 7.2 Copy (VERBATIM obligations, ASCII)

- Stems button title: "Per-group stems ZIP (original/bass/chords/
  pad as present, current levels, mono 16-bit, renders up to 10:00).
  Stems are pre-normalize; the full-mix WAV is peak-safe."
- Etude ABC button title: "Download ABC source (same notation as
  the Staff tab)".
- Docs line (COMPOSE-MODE.md): "Stems are per mix GROUP
  (stem-per-role: original/bass/chords/pad), not per original MIDI
  track - REQ-IO-32 reading note."
- ZIP/README: none (no README in the ZIP - filenames + docs carry
  the contract; a README would need its own pin matrix).

### 7.3 Filename table (the slice's contract; docs mirror it)

| Artifact | Scheme | Example |
|---|---|---|
| Stems envelope | `composeExportFilename(base, key, "zip")` | `s4-fixture_accomp_C.zip` |
| Stem member | `<base>_accomp[_<Key>]_stem-<group>.wav` | `s4-fixture_accomp_C_stem-bass.wav` |
| Keyless envelope | key omitted (never fake) | `chart_accomp.zip` |
| Etude ABC | `` `${pid}.abc` `` (D27 convention) | `etu-etu-a1b2c3.abc` (TD-033 prefix rides unchanged) |
| Full mix / MIDI | unchanged S4 scheme | `..._accomp_C.wav` / `..._accomp_C.mid` |

---

## 8. IMPLEMENTATION ROADMAP (ordered, atomic)

1. [ ] `composeStemFilename` + `exportComposeStems` in composeExport.ts
   (folded; fflate `zipSync` import; `blob.arrayBuffer()` bridge) - 3h - deps: none
2. [ ] composeStems.test.ts (+12 node goldens incl. the UNNORMALIZED
   discriminative pin + ASCII pin) - 2.5h - deps: 1
3. [ ] ComposeMixer stems button + test (+3) - 1.5h - deps: none
   (parallelizable with 1-2)
4. [ ] EtudeComposerPanel ABC button + test (+3; absence-gate shape) - 1.5h - deps: none
5. [ ] ComposeSurface `handleExportStems` + mount + test (+1) - 1h - deps: 1,3
6. [ ] App `handleEtudeAbcDownload` + panel prop (D27 neighborhood;
   sacred-handler/URL hunks untouched) - 1h - deps: 4
7. [ ] e2e legs A+B (extend compose-mixer-export journey; break-guard
   pre-S2 FAIL run) - 3h - deps: 5,6
8. [ ] docs (COMPOSE-MODE/ARCHITECTURE/ETUDE-COMPOSER/TERMINOLOGY) - 1.5h - deps: 1-6
9. [ ] full gate order + AGENTS.md count lockstep + release notes - 1.5h - deps: all

Total: ~16.5h (etude ABC ~4h; stems ~8h; e2e ~3h; docs+gates ~3h).
Between S4's 32h and S1-core's 27h on the small side - COHERENT
("every export finishes"), no cut line needed (single pipeline; if
the pipeline runs hot, ship stems + ABC together anyway - the
manifests are additive, neither half blocks the other, but splitting
buys nothing: both halves are small).

---

## 9. RISKS

| Risk | P | I | Mitigation |
|---|---|---|---|
| Stems path defeats MED-001 (holds all 4 buffers + accumulator at the 600s cap) | low | high | D153 design holds ONE buffer + ONE Float32 at a time (no accumulator, no normalize); node test pins the absence of `normalizePeak` on the path; the cap math is documented in sec 2 |
| Gain-bake drifts from the mix (stems don't sound like the mixer) | low | high | SHARED primitives only: `computeGroupGains` + `accumulateGroupInto` (the same functions the full mix calls); node golden pins muted-group zeros + unity passthrough |
| `downloadText` detached anchor stops firing download events (etude ABC e2e leg B) | low | med | Leg B IS the pin (fails loudly, cannot false-pass); RK-S4-6 degrade to filename-only is documented; S4's `downloadBlob` (appended anchor) is the fallback shape if ever needed |
| fflate `zipSync` over 600s-capped WAVs blocks the main thread (UI freeze on huge sessions) | low | med | Realistic sessions are seconds of audio (sub-second zip); the cap bounds the worst case; no worker in S2 (midiBatchExport precedent is sync too) - a worker is a fast-follow, not a blocker |
| Present-groups contract surprises (user expects 4 files, gets 3 on a 2-role session) | med | low | Filenames carry group names; docs + tooltip state "as present"; chart-only disclosure already exists ("no file - chart only"); e2e leg A pins the 3-member case as CORRECT |
| Pre-normalize stems sum hotter than the full mix (user reports "clipping") | med | low | Tooltip + docs honesty (D152/D153 labeling); the full-mix WAV remains the peak-safe artifact; manual listen item verifies it reads as documented |
| S1-hunk collision in ComposeSurface.tsx / App.tsx (shared files) | low | med | D157 hunk map (different regions); checklist greps (writer singularity, sacred handler, IMMUTABLE) discriminate; S1 suites run untouched as regression net |
| App.tsx grows again (~5377 + ~20 lines) | high | low | Handler is ~15 lines + 1 prop line; all logic in libs; sacred handler byte-identical (checklist grep); the monolith split stays TD-023's problem |
| ZIP member order nondeterminism (fflate key order vs MIX_GROUPS) | low | low | Members inserted in MIX_GROUPS order; node round-trip pins names as a SET + spot-checks order; e2e asserts set membership, not order |
| Old shared links / old downloads regress | low | low | Additive only: no existing filename changes, no existing button changes, no URL changes; old ZIPs don't exist (new artifact); old ABC links don't exist (new button) |

---

## 10. DO-NOT LIST

- NO per-TRACK stems (D152 - W1/D78 contradiction; the REQ-IO-32
  literal gets a reading note, not code).
- NO per-stem normalize, NO shared-scale two-pass (D153 - MED-001
  discipline + balance honesty).
- NO new lib file for stems (fold into composeExport.ts - the S4 D81
  file-count honesty).
- NO `encodeWavBytes` extraction, NO loopWav.ts edits (the
  `blob.arrayBuffer()` bridge suffices; loopWav stays byte-identical).
- NO stereo/SR selection (D156 - REQ-IO-31 stays carved; mono 44.1k
  rides for stems and mix alike).
- NO ABC parser (D156 - REQ-IO-61 is a separate grammar slice).
- NO practice-path stems, NO masterclass/explore affordances (D156 -
  no buffers there, no mixer there).
- NO tests/** edits; it( stays 362; no count pins move (tunes 40,
  curatedBriefing 12, personas, check-links 362+29).
- NO new K.* localStorage keys; storage.ts byte-identical.
- NO zustand v5, NO envelope change; sessionStore.ts byte-identical.
- NO engine/** changes: zero files added/removed, purity floor stays
  56; the new test file lives in src/lib (node project).
- NO changes to etudeAbc.ts (consumed as-is), download.ts, loopWav.ts,
  LeadSheet.tsx (S0-fixed), etudeUrl.ts, composeUrl.ts, ideaShare.ts,
  urlSyncBus.ts, shareUrl.ts, practiceUrl.ts, exploreUrl.ts,
  urlSyncPredicate.ts, PlaySurface.tsx, main.tsx, vercel.json,
  serve.json (S1 seam - zero hunks, D157).
- NO changes to rhythm/backing/clock/guideTone, midiIn/Out,
  etudeUrl/composeUrl (immutable list); sacred handler
  (App.tsx:1238-1380) ZERO hunks.
- NO new SHORTCUTS cheatsheet chips (frozen reverse pin; the buttons
  are mouse/touch affordances, no key binding).
- NO PRD/.kai edits (orchestrator-owned; D152 reading note + TD-046
  close + TD-061 routing are open items). NO edits to historical
  docs (PHASE-8-S1-SHARE.md, PHASE-4-S4-MIXER-EXPORT.md).
- NO new e2e spec file (extend the shipped journey - TD-CI-E2E-FLAKE
  discipline). NO playwright.config.ts webServer-command change.
- NO console.log/info/debug anywhere (only warn/error on error
  paths - the stems catch is warn-only like handleExportWav).
- ASCII in all new code strings + copy + filenames
  (PM-2026-009-004).
- NO second replaceState writer, NO popstate, NO router (S1 laws
  stand untouched).

---

## 11. CHECKLIST (gate order; CI mirrors)

1. [ ] `npm run lint` (tsc - the ComposeMixer prop widening flags every mount site)
2. [ ] `npm test` -> ~2759 / 1 skipped / 0 FAILED (`git diff --name-only -- tests/` EMPTY; it( stays 362; files 211 -> 212)
3. [ ] `npm run build` (RNN config first, then main - both pass)
4. [ ] `node assets/check-links.cjs` -> 362 frontend + 29 backend; persona/tune counts unmoved
5. [ ] `npm run check:paths` -> 36/36 OK (no path data touched)
6. [ ] `npm run test:e2e` after build: 41 -> 43 green (legs A+B in the extended journey)
7. [ ] BREAK-GUARD: stash the diff, run legs A+B on the pre-S2 build -> FAIL (missing testids); restore -> green
8. [ ] Writer singularity proof: `git diff src/App.tsx` shows ZERO writer/boot/predicate hunks (only the etude-ABC handler + prop); urlSyncBus has NO new callers (grep)
9. [ ] Sacred-handler byte-proof: `git diff src/App.tsx` shows ZERO changes in the :1238-1380 region
10. [ ] IMMUTABLE proof: `git diff --stat` empty for etudeAbc.ts, download.ts, loopWav.ts, LeadSheet.tsx, etudeUrl.ts, composeUrl.ts, ideaShare.ts, urlSyncBus.ts, shareUrl.ts, practiceUrl.ts, exploreUrl.ts, urlSyncPredicate.ts, sessionStore.ts, rhythm.ts, backingEngine.ts, playbackClock.ts, guideToneTrail.ts, midiIn.ts, midiOut.ts, PlaySurface.tsx, main.tsx, vercel.json, serve.json
11. [ ] Purity: floor STAYS 56; `find engine -name "*.ts" ! -name "*.test.ts"` count unchanged
12. [ ] JSDOM_FILES unchanged (composeStems.test.ts is node-pure; component tests auto-globbed via `src/components/**/*.test.tsx`)
13. [ ] S0-lesson proof: new ABC pins assert content (`startsWith X:`, `contains K:`, NOT-fallback) - no DOM-scrape assertions anywhere (grep `querySelector.*textarea` in the diff = zero)
14. [ ] D152-labeling proof: grep the diff for "per-group" (stems title) + `_stem-` (filenames) + "stem-per-role" (docs) - all present; grep for "per track" in new copy = zero
15. [ ] UNNORMALIZED proof: composeStems.test.ts discriminative pin green (stems output != normalized mix on the hot fixture)
16. [ ] AGENTS.md lockstep: suite line updated to the FINAL count (Kai; this doc's prediction ~2759/212 - the sec 6.1 allocations sum to +16, 2743+16=2759)
17. [ ] No console.log/info/debug in new src; no any; ASCII in all new code strings + copy + filenames (grep the diff)
18. [ ] StrictMode audit: stems handler is event-driven (no effects); panel ABC button is a pure callback prop (no subscriptions); sequential render holds no cross-render refs
19. [ ] Kai register: TD-046 CLOSED by this slice's shipment; TD-061 stays OPEN (product ruling, D157); D152 reading note applied to docs/PRD-001.md REQ-IO-32

---

## 12. RELEASE NOTES (Phase 8 Slice 2)

1. Etude ABC download. The etude composer result row gains an ABC
   button next to "MusicXML (with melody)": one click downloads the
   same ABC notation the Staff tab renders (same transpose, same
   chords, same ties). Open it in any ABC tool - the lead-sheet ABC
   fix's younger sibling, pinned the same way (real headers, never
   a fallback string).
2. Per-group stems ZIP. The compose mixer gains "Export Stems": one
   ZIP with one WAV per mix group (original/bass/chords/pad as
   present) at your current knob positions - what you hear is what
   ships. Files are mono 16-bit, up to 10:00 like the full mix, with
   the effective key in every name. Honest fine print (in the
   tooltip, not the small print): stems are pre-normalize - the
   full-mix WAV stays the peak-safe file, and stems sum to the
   pre-normalize mix.
3. A naming promise. Stems say `_stem-<group>` in every filename, so
   a stem can never be mistaken for a track: these are stem-per-role
   files from the four mixer rows, not per-track splits (the generic
   I/O table's "(one WAV per track)" parenthetical is read this way
   - see the docs note).
4. Nothing else moved. No new formats, no stereo picker, no ABC
   importer, no practice/explore/masterclass affordances - those are
   separate slices with separate risks. This one finishes the two
   exports the plan left open.

---

## 13. HANDOFF

```yaml
HANDOFF_TO_DEVELOPER:
  from: "@architect"
  to: "@developer (via @engineering-team)"
  timestamp: "2026-09-28"
  deliverables:
    - name: "docs/PHASE-8-S2-EXPORT.md"
      status: complete
      sections: re-audit (12 claims, 11 TRUE + 1 TRUE-with-correction - S1/S2 hunk-level disjointness),
        D152..D157 (5 crux forks + scope/latency adjudication), type definitions (folded stems API /
        etude ABC seam / mixer prop / unchanged consumers), data flow, file plan
        (complete manifest, hunk-disjoint), test plan
        (unit +16 its, 2 e2e legs with break-guards), checklist, risks, DO-NOT, release notes
  constraints:
    - "tests/** byte-frozen; 2743/1/0 -> ~2759/1/0 ZERO failures; it( stays 362; check-links 362+29 unmoved; AGENTS.md count line needs the Kai lockstep edit (roadmap 9)"
    - "sacred handler (App.tsx:1238-1380): ZERO hunks; App gains ONLY handleEtudeAbcDownload + panel prop (D27 neighborhood); writer/boot/predicate hunks untouched (D157 hunk map)"
    - "no zustand v5: sessionStore.ts byte-identical; ZERO new K.* keys; storage.ts byte-identical"
    - "engine purity floor 56: zero engine files touched or added; the one new test file lives in src/lib (node project, NO JSDOM_FILES entry)"
    - "fold law: stems logic folds into composeExport.ts (S4 D81 precedent) - NO new lib source file; fflate already declared (zero dep churn); encodeWav reused via blob.arrayBuffer() (NO loopWav edit, NO second RIFF writer)"
    - "S0-fix doctrine: builder -> downloadText, content-pinned (X:/K:/NOT-fallback), never DOM-scraped; LeadSheet.tsx byte-identical (the template, not the patient)"
    - "RK-S4-6 download law: grabDownload byte-identical + filename-only degrade documented; legs A+B fail LOUDLY pre-S2 (cannot false-pass)"
    - "IMMUTABLE: etudeAbc/download/loopWav/LeadSheet, S1 URL seam (etudeUrl/composeUrl/ideaShare/urlSyncBus/shareUrl/practiceUrl/exploreUrl/predicate/store/PlaySurface/main/vercel/serve), rhythm/backing/clock/guideTone, midiIn/Out, tests/**, README/SPEC count pins, playwright.config.ts webServer command"
    - "ASCII code strings + copy + filenames; no console.log/info/debug; D152 labeling (per-group/stem-per-role/_stem-) in UI + filenames + docs"
  decisions_made:
    - { id: D152, what: "stems = per-GROUP (stem-per-role, 4 files max), NOT per-TRACK: W1/D78 mixer contract + TD-046 prediction + REQ-COMP-42 granularity-silence vs REQ-IO-32 literal; honesty price paid in tooltip + filenames + docs; REQ-IO-32 reading note flagged for Kai (satisfied as one-WAV-per-mix-group); rejected: N-track renders (new routing/gains/memory/architecture)", confidence: HIGH }
    - { id: D153, what: "stems mechanism: sequential render (MED-001, NOT parallel) + gain-baked via shared computeGroupGains/accumulateGroupInto + UNNORMALIZED (sum-to-pre-normalize-mix honesty; no shared-scale two-pass) + present-groups contract (absent omitted, muted emits silence) + REQ-COMP-43 filename extension (_stem-<group> members, .zip envelope) + fflate zipSync + encodeWav-per-group via blob.arrayBuffer() + downloadBlob; folded into composeExport.ts; rejected: sum-split-back-out (impossible), shared-scale (MED-001 regression), new file (count honesty)", confidence: HIGH }
    - { id: D154, what: "placement: stems = ComposeMixer third button (sibling disabled-law !canExport||rendering, honest per-group tooltip); etude ABC = EtudeComposerPanel result row next to MusicXML-with-melody (D27 absence-gate shape, App-owned handler with soundingShift parity, ${pid}.abc, TD-033 prefix unchanged); practice/masterclass/explore = NO affordance (no buffers/mixer there); rejected: header menus, Staff-tab mounting (tab-gated), export dropdown (churn)", confidence: HIGH }
    - { id: D155, what: "fidelity split: node goldens (deterministic fake buffers, filename/zip/unnormalized/ASCII pins incl. REAL encodeWav magic without ctx) + e2e legs A+B in the EXTENDED shipped journey (grabDownload byte-identical, unzipSync + RIFF/WAVE + content pins in-spec, detached-anchor proof for downloadText); budgets: short fixtures only (600s cap never an e2e input), 120s spec timeout, 30s download waits; TD-CI-E2E-FLAKE discipline (no new spec/server); rejected: sample-equality e2e (flake), new spec file (preamble cost), node-only (browser proof missing)", confidence: HIGH }
    - { id: D156, what: "scope keeps: REQ-IO-61 ABC parse OUT (separate grammar slice), REQ-IO-31 stereo/SR OUT (format slice - mono 44.1k rides for stems+mix alike, header carve re-affirmed), practice-path stems OUT (single-loop renderer, no groups), masterclass/explore OUT (no mixer/etude object) - each with its reason, none silent", confidence: HIGH }
    - { id: D157, what: "latency/scope: S2 absorbs NO S1 leftovers; S1/S2 overlap is FILE-level only (ComposeSurface + App) and HUNK-disjoint (URL vs download regions - merge-clean, checklist-discriminated); TD-061 stays OPEN as product ruling (no URL code in S2); rejected: absorb-TD-061 (scope bleed into a shipped pin matrix)", confidence: HIGH }
  implementation_notes:
    - "step 1 FIRST: composeStemFilename exact-string pin (example in 6.1 #1) - every later step consumes the scheme; drift here renames files users already unzipped"
    - "the UNNORMALIZED pin (6.1 #6) is the D153 load-bearing test: write the hot-fixture (peak > 1) case FIRST so a future 'helpful' normalize call breaks CI loudly"
    - "stems handler mirrors handleExportWav's guard/catch shape (mixInput null return, warn-only catch) - copy the shape, not the body; the render call differs (sequential + per-group encode)"
    - "etude ABC handler mirrors handleEtudeMusicXmlDownload's TRUE-FORM slice (bars, etudePathId) - the Staff tab renders buildEtudeAbc with soundingShift, so the download MUST pass the same shift (transpose parity is a user-trust property)"
    - "leg A present-groups assertion: the S4 fixture generates 2 roles (bass+chords) so the ZIP has 3 members (no stem-pad) - assert ABSENCE as correct (the contract), not as failure"
    - "leg B proves the detached-anchor downloadText fires a real download event - if it ever stops, the leg fails loudly; the fallback shape (appended anchor, S4 downloadBlob) is documented but NOT pre-implemented"
    - "if the pipeline runs hot, steps 1-6 are independently shippable (stems and ABC share no code) - but ship together: the release story is one feature ('every export finishes')"
  estimated_effort:
    implementation_hours: 9-11
    testing_hours: 5-6
    documentation_hours: 2
  progress:
    phases_completed: 5/5
    retries: 0
    quality_gates_passed: 5/5
    audit_notes: "baseline verified live (2743/1/0 211 files in 18.95s; check-links 362+29 green; check:paths 36/36; purity floor 56; it( 362; 16 e2e specs; HEAD 6dd6d9d clean == origin/main; 41-test e2e count cited from green ship commit 9f36944, browser re-run not executed this session); 1 packet claim corrected: S1/S2 'disjoint' is HUNK-level not FILE-level (ComposeSurface + App overlap, regions differ); REQ-COMP-43 confirmed shipped (X10 + composeExportFilename + e2e leg-4 pin); downloadText detached-anchor wrinkle found and turned into leg-B proof"
  risks_top3:
    - "stems path defeats MED-001 memory discipline (mitigated: D153 one-buffer-at-a-time design, no accumulator, no normalize, UNNORMALIZED pin, cap math documented)"
    - "gain-bake drifts from the heard mix (mitigated: shared computeGroupGains/accumulateGroupInto primitives only, muted-zero + unity pins, manual DAW listen item)"
    - "S1-hunk collision in shared files (mitigated: D157 hunk map, writer/sacred/IMMUTABLE checklist greps, S1 suites as untouched regression net)"
  open_for_orchestrator:
    - "D152 reading note for docs/PRD-001.md REQ-IO-32 (orchestrator-owned): '(one WAV per track)' -> satisfied as '(one WAV per mix group)' with the W1/D78 rationale, so the P2 can CLOSE honestly instead of lying open forever"
    - "TD-046 CLOSE at ship (this slice is its fast-follow); TD-061 stays OPEN (product ruling on explore-copy idea payload - D157, no code)"
    - "TD-033 etu-etu-<hash> double prefix rides into the new .abc filenames unchanged (documented cosmetic debt, not fixed here) - confirm deferral stands"
    - "REQ-IO-31 stereo/SR stays carved (D156) - if product wants it, rule BEFORE any stems follow-up (it changes the RIFF writer + render rates, not just the ZIP)"
    - "AGENTS.md suite-count lockstep (2743/211 -> final ~2759/212): dev reports the exact number at ship, Kai edits (checklist 16)"
    - "RK-S4-1 LISTEN CHECK stays OPEN (stems balance-by-ear joins the manual queue - no bot can close it)"
```

**Version:** 1.2.2 | **Phase:** 8 S2 design | **Depends on:** Phases 1-7 shipped + Phase 8 S1 shipped (S1 lineage: 9f36944, ledger 6dd6d9d) | **Closes:** REQ-IO-42 etude half (P2), REQ-COMP-42 (P2, with the D152 REQ-IO-32 reading note), TD-046 (stems deferral) | **Keeps open:** REQ-IO-31 (carved, D156), REQ-IO-61 (separate slice, D156), TD-061 (product ruling, D157), TD-023 (monolith split), TD-033 (cosmetic prefix), RK-S4-1 (listen check)

---

## 14. ERRATA (post-ship, 2026-09-28 - purely additive: sec 0-13 byte-unchanged)

### 14.1 D152 REQ-IO-32 reading note - APPLIED in PRD (Kai)

Kai applied the D152 reading note to `docs/PRD-001.md` REQ-IO-32
(orchestrator-owned edit; this slice touches no PRD line): "(one WAV
per track)" is satisfied as "(one WAV per mix group)" - ships as one
WAV per MIX GROUP (original/bass/chords/pad, all uploaded tracks merged
into the one "original" group), labeled honestly as stem-per-role in UI,
filenames and docs. Per-track stems would need finer rendering than the
shipped mixer (new render jobs + mixer rows + memory analysis); that is
a NEW slice, not a bug fix. REQ-COMP-42 CLOSES with this slice under
that reading.

### 14.2 TD-046 CLOSES at ship (stems deferral over)

This slice IS the fast-follow TD-046 predicted ("renderMixGroups already
yields the 4 AudioBuffers; zip = midiBatchExport's fflate zipSync
precedent + encodeWav per group") with the MED-001 amendment
(sequential, not parallel - D153): TD-046 CLOSED. TD-061 stays OPEN
(product ruling on explore-copy idea payload - D157, no code). TD-033
(`etu-etu-<hash>` double prefix) CONFIRMED deferred: it rides unchanged
into the new `${pid}.abc` filenames (documented cosmetic debt, not fixed
here). RK-S4-1 LISTEN CHECK stays OPEN (stems balance-by-ear joins the
manual queue - no bot can close it).

### 14.3 Count correction (+19 -> 2762/212, NOT the doc's +16/2759)

Shipped: suite 2743 -> 2762 passed / 1 skipped / 0 failed (211 -> 212
files). Delta +19 = +12 `src/lib/composeStems.test.ts` (node goldens:
filename scheme x4, gain-bake x2 incl. the UNNORMALIZED discriminative
pin, ZIP mechanics x6 incl. encodeWav-reality + ASCII) + 3
`ComposeMixer.test.tsx` (verbatim title, disabled matrix, click-routes)
+ 1 `ComposeSurface.test.tsx` (stems routing; empty-state absence) + 3
`EtudeComposerPanel.test.tsx` (absence-gate, renders-when-loaded,
click-routes). The doc's sec 6.1 header + checklist 16 predicted ~2759
(+16): arithmetic slip - the listed allocations sum to 19 (12+3+1+3),
not 16. Correct: +19 -> 2762/212 (AGENTS.md lockstep applied by dev).
e2e 41 -> 43 tests, 16 specs UNCHANGED (legs A+B extend the shipped
compose-mixer-export journey; no new spec file). tests/ it( stays 362
(byte-frozen). Engine purity floor stays 56 (zero engine files
added/removed).

### 14.4 Deviations (shipped vs design - all ACCEPTED)

| # | Deviation | Shipped shape | Judgment |
|---|---|---|---|
| 1 | Async bridge: design sec 4 sketched `await blob.arrayBuffer()` INSIDE the sequential render callback; shipped encodes to Blob inside the sync callback and runs `arrayBuffer()` after the loop | `encoded[group] = encodeWav(scaled, PREVIEW_SAMPLE_RATE)` in the `(group, buf)` callback (the scaled Float32 is freed as encodeWav copies it into the Blob); after `await renderMixGroupsSequential(...)`, per-group `await blob.arrayBuffer()` -> `zipSync` -> `downloadBlob` | ACCEPTED: the D153 memory accounting holds either way (peak = one AudioBuffer + one Float32 + finished Blob/ZIP bytes, no accumulator, no normalize); deferring the async bridge past the loop keeps the render callback sync and the sequential renderer untouched |
| 2 | True-form no-slice: design sec 3.2/4 said the App handler resolves "the TRUE-FORM path via etudePathId + bars slice like :2667-2684"; shipped does NO bars slice | `handleEtudeAbcDownload`: `!activeEtude` guard -> `etudePathId(activeEtude)` -> `buildEtudeAbc(activeEtude, { transposeShift: soundingShift })` -> `downloadText(`${pid}.abc`)` | ACCEPTED (and CORRECT): `buildEtudeAbc` consumes the Etude object directly (bars/chords/melody - never the padded practice loop), so there is no path to slice; the MusicXML handler's slice answers a different builder's need. File==view holds because the Staff tab renders the SAME pure call on the SAME etude (App passes `transposeShift={soundingShift}` to EtudeViews) - transpose parity is a user-trust property, pinned |
| 3 | Test factory: design test plan assumed direct handler coverage; shipped `ComposeSurface.test.tsx` mocks `exportComposeStems` (jsdom has no OfflineAudioContext) | Unit pins ROUTING (button -> handler -> exportComposeStems called once; empty state has no mixer); audio reality lives in e2e leg A (real browser, real OfflineAudioContext, served dist) | ACCEPTED: exactly the D155 fidelity split (node pins math + routing, browser proves audio + download); the mock is documented in-test |
| 4 | TD-033 double prefix in `.abc` names | `${pid}.abc` carries the `etu-etu-<hash>` prefix unchanged | CONFIRMED deferral (14.2): cosmetic debt, documented, not fixed here |
| 5 | Scope keeps | REQ-IO-31 stereo/SR carved (mono 44.1k 16-bit rides for stems and mix alike); REQ-IO-61 ABC parsing OUT (separate grammar slice); practice-path, masterclass and explore stems OUT (no group buffers / mixer / etude object there) | CONFIRMED per D156 - each OUT with its reason, none silent |
