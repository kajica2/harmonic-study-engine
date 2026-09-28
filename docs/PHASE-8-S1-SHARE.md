# PRD-001 Phase 8 Slice 1 - Sharing: URL-State Completion + /play Route

Status: DESIGN ONLY (research + architecture, no implementation in this
doc).
Baseline: HEAD 227c0c7 (clean tree, verified this session), suite 2664
passed / 1 skipped / 0 failed (202 files, verified live this session),
e2e 34 tests / 14 specs (verified live this session, 2.3m, all green),
tests/ it( = 362 + 29 backend (check-links green, verified live),
purity floor 56 (engine/purity.test.ts:73, verified), check:paths
36/36 OK (verified live).
Parent: docs/PRD-001.md Phase 8 (docs/PRD-001.md:982-989: "Session
sharing via URL" + "/play route for idea links"). Slices 1-7 of Phases
1-7 SHIPPED (this doc follows docs/PHASE-7-S4-INPUTS.md structure; S4
ended at D144).
Design authority for: REQ-IO-50 (P0, docs/PRD-001.md:631 - "Serialize
ALL modes' state to URL parameters (except uploaded file contents)" -
the last open P0 per the orchestrator's framing; corroborated by
FUTURE_PLANNING.md:232 "PARTIAL ... practice + explore serialize
nothing"), REQ-IO-52 (P2, :633, /play route), TD-027 (popstate
unwired, .kai/tech-debt/register.md:33), TD-047 (/play deferral,
:53), and the stale `"[IdeaBar] Share: not yet implemented -- Phase
8"` console.warn at src/components/IdeaBar.tsx:195 that fires AFTER a
successful clipboard copy.
Decisions numbered D145+ (S4 ended at D144).

---

## 0. RE-AUDIT (claims vs SHIPPED code at 227c0c7, read this session - S3-001 law)

Every claim below was verified by opening the actual file. The task
packet's claims were NOT trusted. Three claims are FALSE as stated -
corrections are load-bearing for the design.

| # | Claim (source) | file:line evidence | VERDICT | S1 relevance |
|---|---|---|---|---|
| 1 | ONE debounced 200ms replaceState writer + pagehide sync flush (task packet) | `src/App.tsx:1540-1604`: single `useEffect`, `timer = window.setTimeout(write, 200)` (:1581), `write()` = read-modify-write of `location.search` + `history.replaceState` (:1543-1573), doctrine comment "We never pushState (avoid polluting the back stack on ephemeral tweaks)" (:1396-1397); pagehide flush (:1592-1598): synchronous clearTimeout+write, listener :1598, cleanup :1599-1603 | **TRUE** | THE writer. ADR-015 bans a second one; every S1 addition rides it (D149 bus extraction) |
| 2 | Writer gated by `urlSyncPredicate.ts:38-47` tracking EXACTLY four slices | `src/lib/urlSyncPredicate.ts:38-47` `shouldScheduleUrlWrite`: mode, globalTranspose, etudeConstraints, composeSession (:43-46); snapshot interface :27-35; ref-compare law documented :13-18 | **TRUE** | Predicate is the tested seam (TESTER GAP-1 doctrine :8-11); D146/D149 grow it 4 -> 6 terms with per-term both-direction pins |
| 3 | Boot read is ONE-SHOT per ADR-011's read-once doctrine (App.tsx ~:1404-1538) | `src/App.tsx:1404-1407` `bootDoneRef` one-shot guard (MED-NEW-001 StrictMode law :1400-1403); effect body :1405-1538 reads mode (:1410), transpose (:1421-1444), idea (:1445-1462), etude (:1471-1477), compose (:1493-1505), etude prepend (:1506-1536); deps `[]` (:1538). ADR-011 sec 3 (.kai/decisions/ADR-011...md): "The URL is never re-read after mount ... re-reading would race the user's click" | **TRUE** | S1 boot additions (practice keys, eseed) land INSIDE this same one-shot effect, AFTER the etude prepend (D145 ordering law) |
| 4 | "Etude URL shipped (14 keys, src/lib/etudeUrl.ts)" (task packet) | `src/lib/etudeUrl.ts:32-52`: `ETUDE_URL_CORE_KEYS` = style,key,tmode,diff,bars,seed (6); `ETUDE_URL_KEYS` = core + tempo,start,end,chrom,straight,cts,maxint (7) = **13 keys**. ADR-015 sec 1 lists the same 13 | **FALSE - 13 keys, not 14.** | Correction matters: the packet's key-count was the only evidence for a 14th key; none exists. The bare `seed` key (integer domain, :147-148) is what forces D146's `eseed` rename for explore |
| 5 | "Compose URL shipped (7 keys, composeUrl.ts, 6000-char governor + honest wipe + field-wise boot merge - the PHASE-4-01 HIGH-001 fix)" | `src/lib/composeUrl.ts:46-54` (7 keys), `:58` `COMPOSE_URL_MAX = 6000`, wipe :88-91 + :113-115 (compose keys only - "practice/etude keys survive"), `mergeComposeUrlWithPersisted` :301-322 (URL wins ONLY for PRESENT keys :317-320, identity gate :307-312, HIGH-001 doctrine :272-300), presence `composeUrlPresence` :260-270 | **TRUE** | The structural template for S1: presence map + field-wise merge + per-family governor + honest notice. D145 reuses the doctrine, not the code |
| 6 | "PRACTICE state: localStorage only (App.tsx ~:2453-2456: paths/activePathIndex/activeStepIndex/tempo; persona/mechanics/latency in their own stores) - serializes to NOTHING" | `src/App.tsx:2452-2457` sync effect (K.paths/activePathIndex/activeStepIndex/tempo via `storageSet`); persona = legacy hook `src/hooks/useSessionStore.ts:402-403` (`loadString("synesthesia_selectedPersonaId", "")`, K registry `src/lib/storage.ts:133`); voicing `:353-354` (default "closed", K.voicingType storage.ts:114); tempo default `:296-297` (`loadNumber(..., 60)`); mechanics = zustand `practiceMechanics` on the v4 envelope (sessionStore partialize comment "practiceMechanics rides the v4 envelope as ONE optional top-level field - NO v5"); latency = K.practiceLatency "practice.latency" (storage.ts:79). The writer (:1543-1573) touches ONLY mode/transpose/etude/compose keys - no path/bpm/persona/voicing read or write anywhere (grep-verified: `params.get("path")` exists nowhere; the "path=7" at composeUrl.test.ts:361 is an unrelated-key SURVIVES fixture) | **TRUE** | The P0 gap. Note the architectural fact that shapes D145: practice state lives in the LEGACY HOOK (App component state), invisible to the zustand subscription - the URL sync for practice needs a React-deps effect, not a predicate term |
| 7 | "EXPLORE state: fully transient (ExploreSurface zero URL usage; 'Explore state stays transient' per FUTURE_PLANNING)" | `src/components/ExploreSurface.tsx:574-582` (seedText/seed/cards/history/varyInput/historyIndex/varyText/conceptOpen/hearState - ALL local useState); header comment :4-5 "LOCAL state only ... NO zustand change"; zero `location.`/`URLSearchParams`/`replaceState` in the file (grep-verified - the `history.length` at :779 is the local card-history ARRAY, not browser history); `FUTURE_PLANNING.md:200` "Explore state stays transient (no store change)" - verbatim | **TRUE** | Feeds D146. Also verified: ExploreSurface boots its seed from `currentIdea` one-shot (:728-737, `ideaToSeedText` :733) - so `?mode=explore&idea=<b64>` ALREADY works today via the shipped idea channel |
| 8 | "IdeaBar share-link assembles ?idea= base64 + copies (:68-76,:177-196) BUT logs 'Share: not yet implemented -- Phase 8' via console AFTER a SUCCESSFUL copy (:195)" | `src/components/IdeaBar.tsx:68-76` `buildShareUrl` (btoa(encodeURIComponent(JSON)), `?idea=`, base = origin+pathname - DROPS the current search, so the copied link carries NO mode/transpose/etude/compose keys); `handleShare` :177-196: clipboard write :186, status "Share link copied to clipboard." :187, then UNCONDITIONAL `console.warn("[IdeaBar] Share: not yet implemented -- Phase 8")` :195 - after the success path. docs/MODES.md:335 documents the warn as shipped behavior | **TRUE** | Stale warn (the copy works). Fix = delete :195 + retarget docs/MODES.md row. The search-dropping base (:74) is the second half of the bug: the "share link" loses the session context the URL writer already carries. D149 unifies both |
| 9 | "?idea= boot read exists (App.tsx ~:1445-1462) but only sets currentIdea - never plays" | `src/App.tsx:1445-1462`: atob + JSON.parse + `isIdea` guard (:1455) + `setCurrentIdea` (:1456); malformed -> console.warn + drop (:1458-1461). No playback, no navigation, no mode implication | **TRUE** | The decode logic (atob/encodeURIComponent-guarded b64 + isIdea + warn-and-drop) is EXTRACTED to `src/lib/ideaShare.ts` by D148 so App boot, IdeaBar, and PlaySurface share ONE codec (one truth per value) |
| 10 | "Routing: ZERO router (no dep, no pathname branch anywhere; index.html->main.tsx mounts App unconditionally)" | package.json: no router dep (grep "router\|reach" = zero hits); `src/main.tsx` (createRoot -> StrictMode -> ErrorBoundary -> App, unconditional); `index.html` -> `/src/main.tsx`; `location.pathname` appears in src ONLY at App.tsx:1571 (writer preserves it) and IdeaBar.tsx:74 (share base) - never branched on | **TRUE** | /play (D148) = ONE pathname check in main.tsx. Not a router; the honest name is "a second top-level surface behind a one-line branch" |
| 11 | "vercel.json rewrites ONLY /engine + /rnn - NO SPA fallback, so /play 404s in prod today. Dev/preview have implicit fallback" | `vercel.json`: rewrites = /engine, /engine/, /rnn, /rnn/ -> static HTMLs; no catch-all; trailingSlash false. Dev: vite dev server SPA fallback (appType default "spa", no override in vite.config.ts - grep-verified). `vite preview`: same spa fallback. **Vercel PREVIEW deployments: FALSE** - previews use the same vercel.json, so /play 404s on Vercel previews too; the rewrite ships only when it lands in vercel.json (this slice) | **TRUE with correction** - "preview" is ambiguous: local `vite preview` yes, Vercel preview no | /play must add the vercel.json rewrite (D148); until deployed, /play is reachable ONLY via dev/`vite preview`/e2e-serve.json |
| 12 | "No copy-link affordance outside IdeaBar (etude/practice/compose headers lack one)" | `navigator.clipboard` in src (non-test): `src/components/IdeaBar.tsx:183-186` + `src/components/ErrorBoundary.tsx:110` (stack-trace copy, unrelated). PracticeHeader.tsx / EtudeComposerPanel.tsx / ComposeSurface.tsx / ExploreSurface.tsx: zero clipboard hits (grep-verified) | **TRUE** | D149 adds Share to all four surfaces + refactors IdeaBar onto the same seam |
| 13 | "e2e serves dist - check how e2e serves and whether /play is reachable in preview at all" | `playwright.config.ts:29-33`: `webServer.command: "npx serve dist -p 4173 -L --no-clipboard"` - plain static serve, NO `--single`, no serve.json anywhere (repo grep); `serve` is NOT in package.json devDependencies (npx resolves at runtime). `serve` without --single/serve.json 404s unknown paths -> /play is unreachable in e2e TODAY | **TRUE** | D148 adds `public/serve.json` (vite copies public/* to dist/; `serve` reads serve.json from the served dir; Vercel ignores it - vercel.json wins). One config file, zero webServer-command change, mirrors the vercel.json rewrite shape |
| 14 | PRD 11.2 URL examples (task packet did not cite; DECISIVE for forks 2/4) | `docs/PRD-001.md:867-877`: `/app?mode=etude&style=jazz&key=C&mode=major&...` (the mode/mode collision ADR-015 resolved as `tmode`), `/app?mode=explore&seed=chord:Cmaj7` (explore = MODE + SEED ONLY in the PRD's own design), `/play?idea=<base64>` (the /play contract verbatim), "Uploaded file content is never in the URL - represented by hash" | **TRUE - and load-bearing** | The PRD itself designs explore's URL state as the SEED (D146 lands there - no erratum needed for the key set, only the name collision). `/play?idea=` is the literal REQ-IO-52 surface |
| 15 | D86's completion claim: "after S4, every mode's serializable state is in the URL. Explore has no state beyond idea (already carried)" (PHASE-4-S4-MIXER-EXPORT.md:578-581) | Practice serializes NOTHING (audit #6 TRUE); explore seed is real local state (audit #7); the writer's own comment :1398-1399 still says "`path` and `idea` arrive in later phases" (path never arrived). HEAD's own ledger commit 227c0c7 already corrected FUTURE_PLANNING:232 to "PARTIAL ... practice + explore serialize nothing" | **FALSE (stale premise, already self-corrected at HEAD)** | This is the S3-001 class the task warned about - the P0 gap is exactly what audit #6/#7 show; D145/D146 close it |
| 16 | Task packet: "/play minimal surface (reuse IdeaCard + the offline-preview singleton - 'no new AudioContext' precedent)" | The singleton precedent is REAL: `src/lib/exploreHear.ts:1-31` (hearIdeaCard renders through `renderAccompaniment` + `composePreviewPlayer`, "no new AudioContext, no new transport, no audioEngine coupling", ADR-020 law). But `IdeaCard` (src/components/IdeaCard.tsx:17-41) is the EXPLORE card: onHear/onSend/concept-link/Save props coupled to App-level drawers - NOT a minimal display | **TRUE for the singleton, FALSE for IdeaCard reuse** | D148 reuses the HEAR MACHINERY (exploreHear path), not the card component; PlaySurface renders its own minimal summary. Evidence-based deviation from the packet's wording |
| 17 | "A fresh code audit at HEAD 227c0c7 established ..." the popstate status quo (TD-027: "ModeGate reads URL once at boot; browser back/forward ... never switches surfaces (replaceState sync pushes no entries either)") | register.md:33 verbatim; ADR-011 consequences: "popstate / browser back-forward is NOT wired (never was; replaceState sync pushes no entries) - TD-027"; zero popstate listeners in src (the ONLY mention repo-wide is the doc comment at `src/components/ModeGate.tsx:29` which itself states back-forward is not wired - the codebase agrees); the mode-switch doctrine pin lives in EDITABLE files (`src/state/sessionStore.test.ts`, `src/components/ModeGate.test.tsx` - NOT in frozen tests/, verified) | **TRUE** | D147: with a replaceState-only writer there ARE no same-document history entries - popstate is a handler for events that cannot fire. The packet's option (c) is structurally dead (see D147) |
| 18 | Mode vocabulary: the "practice" surface IS the etude/home study surface (`Mode` = "compose" \| "etude" \| "explore") | `src/state/sessionStore.ts:640-644` `MODE_LABELS` (3 modes); `resolveEffectiveMode` :647-657 (URL > persisted > "etude" default); boot accepts only compose/etude/explore (App:1411); S4 docs: study surface = `storeModeForGate === null \|\| === "etude"`; the "mode=practice" string in composeUrl.test.ts:359 is a fixture, not a shipped mode | **TRUE (implicit in packet, pinned here)** | The practice URL keys (D145) ride the STUDY surface (mode absent or etude) - there is no `mode=practice` value to define, and inventing one would break the frozen boot accept-list |
| 19 | Baseline numbers (task packet) | `npm test` this session: **2664 passed / 1 skipped / 0 failed, 202 files** (14.9s). `npm run build`: OK (RNN + main). `npm run test:e2e` after build: **34 passed / 14 spec files** (2.3m, exit 0). `node assets/check-links.cjs`: "362 frontend + 29 backend = 391, all counts match". `npm run check:paths`: 36/36 OK. Purity floor 56 (engine/purity.test.ts:73). git HEAD 227c0c7, clean tree | **ALL VERIFIED LIVE** | The doc's numbers are this session's measurements, not the packet's |

---

## 1. REQUIREMENTS -> COMPONENTS MAP

| REQ | Priority | Component(s) | Law |
|---|---|---|---|
| REQ-IO-50 "all modes' state" - PRACTICE completion | P0 | `src/lib/practiceUrl.ts` (NEW pure) + App boot restore + App practice-sync effect + `urlSyncPredicate.ts` untouched-for-practice (legacy hook is invisible to the subscription - the React effect is the seam) | 4 keys: path, bpm, persona, voicing; field-wise URL-wins-for-present (HIGH-001 doctrine); `etu-*` paths NEVER serialize (they ride the 13 etude keys) (D145) |
| REQ-IO-50 - EXPLORE completion | P0 | `src/lib/exploreUrl.ts` (NEW pure) + ephemeral `exploreSeedUrl` store field + ExploreSurface push/boot + predicate term + `eseed` key | Seed IS the state (cards regenerate deterministically - Phase 5 pin + PRD 11.2's own example); op-history = playhead noise (D146) |
| REQ-IO-50 - IDEA sync | P0 | writer `idea` key + `src/lib/ideaShare.ts` (NEW pure codec) + predicate term | One codec for App boot, IdeaBar, PlaySurface; 1500-char governor wipes ONLY the idea key (D149) |
| REQ-IO-52 /play route | P2 | `src/lib/playRoute.ts` + `src/main.tsx` branch + `src/components/PlaySurface.tsx` + `src/lib/ideaHear.ts` + vercel.json + public/serve.json | No router; one pathname check; ARMED state = honest answer to the autoplay policy; hear machinery reused byte-identically, IdeaCard reuse REJECTED (audit #16) (D148) |
| Copy-link affordances + stale-warn fix | P0-adjacent | `src/lib/urlSyncBus.ts` + `src/lib/shareUrl.ts` (NEW) + Share buttons x4 surfaces + IdeaBar refactor (warn :195 deleted) | FLUSH-BEFORE-COPY is law: a copy that reads `location.href` within the 200ms debounce window copies a STALE URL - the pagehide pattern, reused synchronously (D149) |
| TD-027 popstate | P3 | none (adjudication) | Stays unwired; option (c) structurally dead; TD refined wording for Kai (D147) |
| REQ-IO-50 reading | - | docs + open_for_orchestrator | "all modes' state" = each mode's MUSICAL SESSION state, not device ergonomics or playheads; erratum note flagged for Kai (D151) |

---

## 2. FORK DECISIONS

### D145 (fork 1): PRACTICE serialization = 4 keys (path, bpm, persona, voicing); field-wise URL-wins; etu-* never rides

THE PICK-LIST (what is "session state worth sharing" vs device-continuity
noise). The test applied to every candidate: *does this value change
what the recipient HEARS or SEES when they open the link, or only what
this device remembers?*

IN (musical session identity):

| Key | One truth (store field) | Domain / compact law |
|---|---|---|
| `path` | `paths[activePathIndex].id` (legacy hook, App:340-343) - the id, NEVER the index | Catalog ids only: `path-N` (RAW_PATHS), `study-*` (STUDIES_PATHS), composer ids. Format-gated `/^[a-z0-9][a-z0-9-]{0,63}$/`; ids starting `etu-` are REJECTED at serialize AND parse. Always present when valid (path is the anchor - no default to delete at) |
| `bpm` | `tempo` (legacy hook, default 60 - useSessionStore.ts:296-297) | integer 20..400 (superset of UI clamps); DELETE at 60 (the shipped default - etude/compose compact law) |
| `persona` | `selectedPersonaId` (legacy hook, default "" - :402-403) | membership against the live PERSONAS ids (App passes the list - practiceUrl stays data-free, pure + injectable); DELETE at "" |
| `voicing` | `voicingType` (legacy hook, default "closed" - :353-354) | membership against `VOICINGS` keys (9-value union, theory.ts:142-151); DELETE at "closed" |

ALREADY GLOBAL (no new key): transpose rides `?transpose=` (shipped,
zustand). mode rides `?mode=` (shipped; note audit #18 - the study
surface is mode absent/etude, there is no `mode=practice`).

OUT (adjudicated device-continuity noise, each with a reason):
- `activeStepIndex` - the PLAYHEAD. A shared link should start at bar 1;
  "where you stopped listening" is not musical content. (The PRD's own
  11.2 sketch has no step key.)
- loop window / pause / AB / ramp (`practiceMechanics`, zustand v4) -
  drill ERGONOMICS keyed to bar indices of a local runner state; the
  A/B windows reference a form the recipient may never loop. Mechanics
  already persists per-device (the shipped law); sharing it is a
  separate product decision (if it ever matters, the predicate gains a
  ref-compare term - cheap later, not free now, because the payload
  shape for AB windows + ramp ladders is a design in itself).
- detection toggle (`practiceMechanics.detect`) - hardware-dependent
  (D138 gate: Web MIDI API OR fallback input); a link cannot promise
  the recipient's browser has either.
- noteInput (`enabled`, `rootOctave`) - hardware/ergonomics (the
  IMMUTABLE S4 surfaces; touching their serialization invites touching
  them - banned).
- latency (`practice.latency`) - DEVICE-PHYSICS, the task agrees: one
  device's 37ms tap path is another's lie.
- `beatType` / `timeSignature` / metronome / volume - backing-style and
  mixer ergonomics; excluded to keep the payload honest to the REQ
  ("session state" = what you practice, not how your speakers are set).
  If product wants "share the backing style", that is a round-2 ruling
  (open_for_orchestrator).

etu- INTERACTION (the packet's "beware"): a practice path can BE a
generated etude (`etu-etu-<hash>` ids, etudeEngine.ts:74-76 + ADR-015
cosmetic TD-033). Such a path is a RESULT, not a request - the shipped
13 etude keys already carry its full regeneration (parse -> generate ->
prepend via `planEtudeRestore`, App:1506-1536). So: serialize drops
`etu-*` pathIds (the URL keeps the etude keys instead); parse rejects
them (a hand-typed `?path=etu-etu-abc` is treated absent). One truth
per value: the etude keys own generated etudes, `path` owns catalog
paths. If BOTH ride (`?path=study-solar&style=...&seed=...`), boot
applies them in order: etude restore (existing) THEN path selection by
id lookup - index-safe because the lookup runs after the prepend shift
(never trust a stale index; this is the REVIEWER HIGH-001 lesson).

BOOT MERGE (HIGH-001 doctrine, simplified): URL wins for PRESENT keys
only (presence map `practiceUrlPresence` mirrors composeUrl.ts:260-270);
absent key = persisted value survives. NO identity gate is needed -
compose's gate protected a composite object's coherence; these are four
independent scalars, each with its own one-truth store field. Unknown
`path` id (well-formed, not in the live list - e.g. an imported path
the recipient lacks): SILENT drop (the id space is open; a warn would
fire on every stale share - the etude "absent is not malformed"
discipline, etudeUrl.ts:16-18, inverted: unresolvable-but-valid-format
is benign). Malformed values (bpm=abc, voicing=not-a-voicing): drop
the key silently too - practice keys are additive context, never a
session's identity; there is nothing to "fail" (contrast compose,
where a malformed session IS a broken identity -> warn-and-drop).
Pinned both directions.

REJECTED alternatives:
- (a) Serialize `activePathIndex` (the raw number): breaks the moment
  the recipient's paths list differs (generated etudes prepended,
  imports, deletions) - the exact class of bug planEtudeRestore exists
  to fix. Rejected: ids, not indices.
- (b) Full mechanics serialization (`pmode=ab&pab=0-7,8-15,4&...`):
  ~6 extra keys, a new mini-grammar, and a payload whose meaning
  depends on the recipient's form length. The PRD never sketches it;
  no user story demands it. Rejected: noise dressed as completeness.
- (c) Lift practice state into zustand so the predicate can see it:
  the Phase 7 migration's scope, not a sharing slice's. Rejected:
  blast radius (the monolith's 60+ legacy-hook reads) for zero user
  value.

### D146 (fork 2): EXPLORE serialization = `eseed` (the seed text IS the state); op-history stays transient; no erratum needed - the PRD's own example lands here

The fork asks "how much is URL-representable honestly - seed + op
history + cards, or is the honest ruling 'idea links ARE the explore
share unit'?" Answer: BOTH, and the PRD already agrees - audit #14:
docs/PRD-001.md:872 designs explore as exactly
`/app?mode=explore&seed=chord:Cmaj7`. Mode + seed. Nothing else.

Why the seed is the WHOLE state, honestly:
1. Determinism is shipped law: "same seed + inputs = same cards"
   (FUTURE_PLANNING.md:200, Phase 5 pin). The op pipeline is a pure
   function of (seed, rng) - `buildIdeaCards(seedRaw, op, attempts)`
   threads `createRng(hashSeed(...))` (ExploreSurface.tsx:208,:270).
   Serializing cards would serialize a DERIVED value - two truths for
   one fact, and the drift class the repo's determinism goldens exist
   to kill.
2. The op-history index (back/forward through generated cards, :779)
   is a playhead - same ruling as practice's activeStepIndex (D145).
3. The idea channel ALREADY works: `?mode=explore&idea=<b64>` boots
   seedText from currentIdea (ExploreSurface.tsx:728-737, audit #7).
   IdeaBar's Share (post-D149, full-location URL) will produce such
   links for explore users automatically.

So REQ-IO-50's "all modes" is satisfied for explore by: `mode`
(shipped) + `eseed` (NEW) + the idea channel (shipped, now synced by
D149). This is NOT an erratum - it is the PRD's own 11.2 design,
implemented. (The only erratum-adjacent note: the PRD's literal key
`seed=` collides with the etude core key `seed` (integer domain,
etudeUrl.ts:147-148 - a non-integer value there trips
hasEtudeParams -> a spurious "malformed etude params" warn, App:1474-
1477). Renamed `eseed`, exactly per the SHIPPED `tmode` precedent
(ADR-015 sec 1: the PRD's own example URL collided on `mode`; the repo
resolved it by renaming, "documented PRD deviation"). Flagged in
D151's erratum list for the PRD text.)

PLUMBING (the honest part - seedText is LOCAL component state, invisible
to both the zustand predicate and App):
- Ephemeral store field `exploreSeedUrl: string | null` +
  `setExploreSeedUrl` in sessionStore.ts - OUTSIDE partialize (the
  `pendingModeRequest` precedent: ephemeral fields already exist;
  NO v5, NO persist change, NO migration - the no-zustand-v5 law
  holds because the envelope never sees the key).
- ExploreSurface: one push effect (`seedText` -> store, skip when
  equal) + boot precedence `eseed` (store) > currentIdea > "" (the
  deep link wins over the carried idea; pinned).
- Writer: `eseed` key = raw seed text, `encodeURIComponent` (URLSearchParams
  does this natively), governor 200 chars: longer -> writer SKIPS the
  key (only `eseed` - never touches other families; the compose wipe
  discipline, composeUrl.ts:88-91) + ExploreSurface shows an honest
  notice (`explore-url-notice` testid, the shipped `compose-url-notice`
  pattern at ComposeSurface.tsx:619): "Seed too long for the share URL
  (200 chars max) - the link opens without it."
- Boot: `eseed` -> `setExploreSeedUrl` (URL-wins-for-present, D145's
  scalar doctrine; absent = untouched).
- Predicate: `exploreSeedUrl` term (primitive compare).

REJECTED alternatives:
- (a) "Idea links only" (the packet's minimal honest ruling): ALMOST
  right, but it leaves the PRD's own `seed=` example unimplemented and
  makes a plain explore session (typed seed, no idea minted)
  unsharable - chord/progression seeds often ARE the whole session and
  don't pass through the Idea channel. Rejected: the seed key is ~40
  lines of pure code + one ephemeral field.
- (b) Serialize op-history as an op chain (`eops=sub,re-harm,voice`):
  the attempt-namespaces law (TD-EXP-SLOT: "Vary/voicelead attempt
  namespaces must stay per-op") means the chain's RNG threading is a
  format I must version forever, for a value the seed already
  determines. Rejected: derived-state duplication.
- (c) Reuse the bare `seed` key with a mode sniff (explore parses it
  when mode=explore): two domains for one key = the exact collision
  ADR-015 resolved for `mode`/`tmode`. Rejected.

### D147 (fork 3): popstate = stays UNWIRED; the packet's option (c) is structurally dead; TD-027 refined, bundled with TD-047's routing decision

The physics (audit #17): the writer is replaceState-ONLY ("We never
pushState - avoid polluting the back stack on ephemeral tweaks",
App:1396-1397). Therefore the app creates NO same-document history
entries. Back/forward from a session on this app LEAVES the document
(the previous site) - popstate never fires for app states, because
there are none to fire for. This is why option (c) ("popstate only for
?idea= links") is a mirage: a popstate handler without pushState
entries is a listener for an event that cannot occur. Supporting
in-document back/forward AT ALL requires first inverting the writer's
law (pushState on mode changes = history entries) - which re-opens
exactly what ADR-011 sec 3's pin defends: "re-reading would race the
user's click", and every re-entry must then pass the ADR-007 dirty
prompts (Etude accept-dirty, Compose edit state) with cancel/restore
semantics nobody has designed.

Options adjudicated:
- (a) Full popstate re-entry: requires pushState inversion + re-entry
  pipeline + dirty-prompt cancel paths + the frozen-behavior doctrine
  re-pin (the mode-switch pins live in EDITABLE files - audit #17 -
  but the monolith's 60+ state setters were never designed for
  rewind). One slice's scope? No - it is a routing PROJECT. Rejected
  for S1; this IS TD-047's "revisit with a real routing decision".
- (b) Status quo (no-op): browser buttons behave honestly (they leave
  the app - standard for replaceState apps); shared links work because
  every load is a fresh document boot (the read-once doctrine is
  EXACTLY what makes deep links reliable). CHOSEN.
- (c) Narrow ?idea= slice: dead on arrival (above). Rejected with the
  mechanism as the reason.

S1's real deliverable on this fork is the FLUSH-BEFORE-COPY seam
(D149) - freshness of links, not rewind - plus documentation honesty:
docs/MODES.md + docs/ARCHITECTURE.md gain one line: "Back/forward
exits the app by design (replaceState-only sync); links are the share
channel." TD-027 stays Open, refined wording for Kai's register (this
doc does not edit .kai): "popstate unwired BY DESIGN: the
replaceState-only writer creates no history entries (D147); in-document
back/forward requires a pushState router + ADR-007 re-entry design -
decide together with TD-047's routing verdict, not before."

### D148 (fork 4): /play = one pathname branch in main.tsx (NO router dep), ARMED state as the honest contract, exploreHear machinery reused (IdeaCard NOT reused), e2e reachable via public/serve.json

ROUTE (the minimal honest "real routing decision" TD-047 asked for):
- `src/lib/playRoute.ts` (NEW pure): `isPlayRoute(pathname)` -> true
  for `/play` and `/play/` (trailingSlash:false canonicalizes to
  `/play`; accepting both is one `||`). NOT a router: no dep, no
  history API, no path table - one branch, one surface (audit #10
  confirms zero pathname branching exists today; this adds exactly
  one).
- `src/main.tsx` (EDIT, ~4 lines): inside the existing
  StrictMode/ErrorBoundary, `isPlayRoute(window.location.pathname) ?
  <PlaySurface/> : <App/>`. App's boot/writer effects NEVER run on
  /play - so the /play URL is never rewritten (a shared /play?idea=
  link stays pristine; no mode/transpose pollution - the minimal UI
  the PRD asked for, PRD:633 "minimal UI").
- `vercel.json` (EDIT): rewrites += `/play` -> `/index.html` and
  `/play/` -> `/index.html` (mirrors the shipped /engine + /rnn
  rewrite SHAPE - audit #11: today /play 404s in prod AND Vercel
  previews; NO catch-all SPA fallback is added - only routes the app
  actually branches on get rewrites, keeping the surface honest and
  404s still 404s).
- `public/serve.json` (NEW): `{ "rewrites": [{ "source": "/play",
  "destination": "/index.html" }, { "source": "/play/",
  "destination": "/index.html" }] }`. Mechanism (audit #13): vite
  copies `public/*` to `dist/`; `serve` reads `serve.json` from the
  served directory; Playwright's webServer command stays
  BYTE-IDENTICAL; Vercel ignores serve.json (vercel.json wins). This
  is why the e2e leg below is runnable at all - without it /play 404s
  against the static server and the leg could not pass. Alternative
  (rejected): `--single` in the webServer command - a full SPA
  fallback in e2e that would MASK real 404s (missing assets return
  index.html instead of failing loudly). serve.json rewrites exactly
  the one route, mirroring prod's shape.

THE AUTOPLAY CRUX (the packet is right: "immediately plays it" is
physically impossible cold): browsers suspend AudioContext until a user
gesture (the shipped law: audio.ts creates ctx lazily :192 and resumes
only from interaction paths :251-252). REQ-IO-52's literal "accepts a
base64-encoded idea and immediately plays it" cannot ship as written -
any attempt to auto-resume without a gesture either silently fails or
console-noises. The HONEST design is the ARMED state:
1. Decode `?idea=` via `ideaShare.decodeIdeaParam` (D149's shared
   codec - one truth with App boot and IdeaBar).
2. Missing / malformed / non-playable kind -> EMPTY state: idea
   summary if decodable, honest line "This link has no playable idea -
   open the full app to make one." + `<a href="/">` CTA (plain
   document navigation - no router).
3. Playable kind (chord / progression / melody - see payload ruling
   below) -> ARMED state: idea summary chip (kind + chord text, ASCII)
   + ONE big Play button (`data-testid="play-button"`, autofocus -
   keyboard users press Space/Enter, which IS the gesture).
4. Click -> `ideaHear.playIdea(idea)` -> renders through the shipped
   `renderAccompaniment` + `composePreviewPlayer` singleton (the
   exploreHear law verbatim, audit #16: "no new AudioContext, no new
   transport, no audioEngine coupling") -> PLAYING state (Stop +
   auto-return to Replay on end, the data-preview state pattern
   ExploreSurface already uses). The click is one gesture; audio
   starts within it - as close to "immediately" as physics allows.
5. StrictMode-safe: PlaySurface owns no timers; the player is the
   shipped singleton; unmount stops playback (the singleton's own
   law).

PAYLOAD kinds (honesty cut): chord / progression -> a transient
progression card fed through the EXISTING `cardToHearInput`/
`hearIdeaCard` machinery (IdeaBar already builds card shapes from
Ideas, IdeaBar.tsx:143-155 - the shape precedent). melody -> the
melody-carrying card arm (exploreHear's `mapOriginalTracks` lead
path). scale -> NOT played: rendering a scale needs voicing + octave +
register choices /play must not invent silently (PHASE-1-02: the
button renders disabled with an honest title "Scales open in the app -
pick a voicing there"). seed -> NOT played: a seed is a GENERATION
TOKEN, not music; the CTA is the truth ("Open the app to generate
from this seed"). `ideaToPlayCard` (pure, node-tested) returns null
for scale/seed - the surface maps null -> empty-with-summary state.
This is a deliberate REQ-IO-52 carve (3 of 5 kinds play) - flagged in
D151, not hidden.

e2e reachability (the packet's question, answered with the audit):
served dist has NO SPA fallback today (audit #13) - the public/
serve.json fix makes /play reachable in e2e; Vercel previews 404
until vercel.json deploys (audit #11 - the rewrite ships in this
slice's push); `vite preview` works (spa appType). The leg below
proves the e2e path.

REJECTED alternatives:
- (a) react-router dep: a library for ONE branch; violates the
  simplicity-first law and drags the frozen-count story (new dep,
  bundle, StrictMode interactions). Rejected.
- (b) A separate `play.html` entry (the /engine precedent - a real
  second HTML): doubles the build surface (vite input config + the
  RNN build order), can't share App's shims (process.hrtime), and
  serves a page whose only job is one component. The pathname branch
  reuses index.html, main.tsx's shims, and the whole error boundary.
  Rejected: more moving parts, less reuse.
- (c) Reuse IdeaCard (packet's suggestion): audit #16 - it is
  explore-coupled (onHear/onSend/Save/concept-link props -> drawers
  that don't exist on /play). Rejected with evidence; the HEAR
  MACHINERY is what gets reused.
- (d) Auto-attempt play on load, fall back to armed if the ctx stays
  suspended: creates a suspended AudioContext with no gesture (a
  resource leak + console noise in every browser), and the "attempt"
  is invisible to the user. Rejected: one honest button.

### D149 (fork 5): copy affordances = urlSyncBus (flush-before-copy) + shareUrl seam + 5 surfaces + idea-key sync + stale-warn kill

THE STALE-COPY BUG CLASS (the packet is right; pin it): the writer is
debounced 200ms (App:1581). A Share click within 200ms of a state
change reads `location.href` BEFORE the pending write -> the copied
URL is STALE (the exact HIGH-001 disease the pagehide flush cured for
RELOADS, :1584-1591). The cure already exists in shipped form
(`flush()` :1592-1597: clearTimeout + synchronous write) - it must be
REUSED, not duplicated.

`src/lib/urlSyncBus.ts` (NEW, tiny, jsdom-tested) - the scheduler
seam (NOT a second writer; ADR-015 stays byte-true: there is still
exactly ONE `write()` function, now registered):

- `registerUrlWriter(write: () => void): () => void` - App's writer
  effect registers its existing `write` (extended per below); returns
  the unregister (exact-inverses law, StrictMode).
- `scheduleUrlWrite(): void` - shared module timer, 200ms, idempotent
  re-arm (clearTimeout + set - the shipped shape).
- `flushUrlWrite(): void` - if pending: clearTimeout + write() NOW
  (the shipped pagehide law, :1593-1596); if not pending: NO-OP
  (the URL is already current - the shipped "no pending write -> no
  write" law). NEVER throws without a registered writer (SSR/jsdom
  safety, midiIn's try/catch philosophy).

App wiring (the refactor is behavior-preserving):
- The zustand subscription (:1574-1583) keeps calling the predicate;
  the `setTimeout` moves to `scheduleUrlWrite()`.
- pagehide listener (:1598) calls `flushUrlWrite()` (same behavior,
  now through the bus).
- NEW practice-sync effect (the legacy hook is invisible to the
  zustand subscription - audit #6): deps [activePathId, tempo,
  persona, voicing] -> write a ref (`practiceUrlRef`) +
  `scheduleUrlWrite()`. `write()` reads the ref. Mount fires a
  harmless idempotent schedule (the URL rewrites to itself - the
  writer is already idempotent, urlSyncPredicate.ts:16-18 law).
- NEW predicate terms: `currentIdea` (ref-compare - the store
  replaces, never mutates, the etudeConstraints law) +
  `exploreSeedUrl` (primitive). Snapshot interface gains both.

`write()` gains three key families (still ONE function):
- `idea`: `ideaShare.encodeIdeaParam(state.currentIdea)` -> set, or
  DELETE when null; governor: payload > 1500 chars -> skip the idea
  key ONLY (never wipe other families - the compose discipline).
  Rationale: melody ideas ~1KB base64 fit; the cap is a paste-bomb
  guard. Explicit COPY (below) always sets the param regardless of
  the governor - user intent beats compactness; boot decode has no
  cap (it accepts what it can parse).
- practice: `serializePractice({pathId (etu-guard), bpm, personaId,
  voicingId})` entries -> per-key set/delete (D145).
- `eseed`: `serializeExplore(store.exploreSeedUrl)` -> set / skip on
  >200 chars (D146).

`src/lib/shareUrl.ts` (NEW, jsdom-tested) - the copy seam:
- `copyShareUrl(opts?: { idea?: Idea | null }): Promise<ShareStatus>`
  - `flushUrlWrite()` FIRST (the anti-stale law), then build the URL:
  current `location.href`, optionally re-set the `idea` param via
  `ideaShare.withIdeaParam` (IdeaBar passes the live idea - the
  shipped behavior, upgraded from search-dropping origin+pathname,
  audit #8, to full-context URL + idea), then
  `navigator.clipboard.writeText` with the THREE shipped fallback
  states, copy byte-identical: "Share link copied to clipboard." /
  "Share link ready (clipboard unavailable)." / "Share link ready
  (clipboard blocked)." (IdeaBar.tsx:187-193 - the strings are a
  shipped contract; reused, not reworded).
- `ShareStatus = "copied" | "unavailable" | "blocked"`.

SURFACES (which headers get Share - the packet's menu):
- PracticeHeader (study surface): NEW button `data-testid=
  "share-url-button"`. Copies the current URL (path/bpm/persona/
  voicing/transpose/idea ride).
- EtudeComposerPanel: NEW button. Honest note (documented, not a
  code path): the panel's DRAFT (mid-edit values) is local per the
  shipped law (PHASE-3-SLICE2.md:57 "never in the store, never in
  the URL") - the copied link shares the last APPLIED constraints,
  which is exactly what the URL contains. One truth.
- ComposeSurface: NEW button next to the existing URL notice; when
  the 6000-governor notice is showing, the status text gains a 4th
  honest variant: "Share link copied - session too large, compose
  keys omitted." (PHASE-1-02: the copy result must not imply the
  session rode when it was wiped; pinned).
- ExploreSurface: NEW button (mode + eseed + idea ride - D146).
- IdeaBar (existing): refactored onto `copyShareUrl` +
  `ideaShare.encodeIdeaParam` (its private `buildShareUrl` :68-76
  deleted); the stale `console.warn` :195 DELETED (the copy is
  implemented - the warn is the Phase 8 promise this slice keeps).
  The Save warn (:174) stays (it is accurate).
- Masterclass/catalog surfaces: NO button - a catalog tune is a
  `study-*` path id; sharing it is `?path=study-...` from the study
  surface (one channel, no duplicate affordance).

jsdom/e2e testability (the packet's question): jsdom - mock
`navigator.clipboard.writeText` (the shipped IdeaBar.test.tsx:131-146
pattern already exists; reused); `flushUrlWrite` call-order pinned by
a registered fake writer (assert write ran BEFORE writeText when a
change is pending). e2e - Playwright reads the REAL clipboard with
`context.grantPermissions(["clipboard-read", "clipboard-write"])`
(chromium-supported); the freshness leg below is the bug-class gate,
with a documented degrade: if CI clipboard-read ever flakes, the leg
falls back to asserting the app's own status text (the 3-state copy)
- the flush is still unit-pinned in order.

REJECTED alternatives:
- (a) Copy handlers build the URL themselves from the store (a second
  serializer): drift magnet - two code paths must agree on 25+ keys
  forever. Rejected: the URL is the writer's output; copy FLUSHES the
  writer, then reads the location. One truth.
- (b) Shorten the debounce to 0 for "freshness": re-introduces
  replaceState-per-keystroke (the reason the debounce exists -
  perf + mobile history thrash). Rejected.
- (c) Copy on a `blur`/`mousedown` hack to beat the timer:
  untestable ordering. Rejected: the explicit flush seam.

### D150 (fork 6): slice boundary = ONE slice (Kai's bundle stands), with a pre-agreed cut line

The effort math (roadmap section 8): S1-core (D145+D146+D147+D149:
practice URL, eseed, idea sync, bus, shareUrl, 5 surfaces, tests,
docs, e2e share legs) = ~27h. /play (D148: playRoute, main branch,
PlaySurface, ideaHear, vercel/serve config, e2e play legs) = ~13.5h.
Total ~40.5h - between S4's 32h and S3's 46.5h, and the slice is
COHERENT: both halves ride the same seams (ideaShare codec,
urlSyncBus, the writer's key families) and both close the same story
("a link reproduces a session"). Splitting pays a FULL pipeline cycle
(review + gates + ship overhead) for a 13.5h tail whose shared code
(ideaShare extraction, bus) would have to ship in S1 anyway (the
stale-warn fix + copy freshness need it).

The CUT LINE (pre-agreed, zero-rework): roadmap steps 13-17 are the
/play block with a DISJOINT file manifest (playRoute.ts, ideaHear.ts,
PlaySurface.tsx, main.tsx, vercel.json, public/serve.json,
e2e/play-route.spec.ts). If the pipeline runs hot or the orchestrator
prefers P0-only shipping, steps 13-17 become S2 unchanged - S1 ships
green without them (nothing in steps 1-12 imports the /play files).
Evidence for keeping them together: /play's e2e leg is the ONLY
browser proof that the vercel rewrite shape works, and the slice's
release notes read as one feature ("every session is a link; idea
links play"). Recommendation: ship as one; the cut line is insurance,
not a hedge.

### D151: REQ-IO-50/52 readings + PRD erratum list (flagged here, applied by Kai - docs/PRD-001.md is orchestrator-owned, untouched by this slice)

1. REQ-IO-50 "ALL modes' state" adjudicated as: each mode's MUSICAL
   SESSION state (what the recipient hears/sees), explicitly excluding
   playheads (activeStepIndex, explore history index), device physics
   (latency), hardware-dependent gates (detection, note input), and
   drill ergonomics (mechanics) - per D145/D146's itemized tables.
   Requested PRD note: one sentence under REQ-IO-50 recording the
   reading, so the P0 can CLOSE honestly instead of lying open forever.
2. REQ-IO-52 "immediately plays it" -> "presents the idea armed; one
   click plays" (browser autoplay policy, D148). Requested erratum:
   the P2 line gains "(one user gesture - browsers forbid cold
   autoplay)".
3. REQ-IO-52 payload carve: chord/progression/melody play; scale/seed
   open the CTA (D148's honesty cut). Requested note.
4. 11.2 example drift: `seed=` -> `eseed=` (etude-key collision, the
   `tmode` precedent, D146) - the example URL also still shows the
   `mode=`-twice collision already resolved by ADR-015; one editorial
   pass fixes both.
5. TD-027 refined wording (D147) + TD-047 CLOSES with this slice's
   routing verdict (the "real routing decision" = no router, one
   pathname branch - D148).

---

## 3. TYPE DEFINITIONS (copyable)

### 3.1 src/lib/practiceUrl.ts (NEW, pure, node-tested)

```ts
/** PRD-001 Phase 8 S1 (D145): practice/study-surface URL <-> scalars.
 *  One truth per value: each key maps to exactly one shipped store
 *  field (never a second source). NO DOM, NO data imports - the
 *  persona list is INJECTED at parse (App passes live PERSONAS ids). */
export const PRACTICE_URL_KEYS: readonly ["path", "bpm", "persona", "voicing"] =
  ["path", "bpm", "persona", "voicing"];

/** Defaults that DELETE their key (the etude/compose compact law). */
export const PRACTICE_URL_DEFAULTS: { readonly bpm: 60; readonly voicing: "closed" } =
  { bpm: 60, voicing: "closed" };

export interface PracticeStateIn {
  pathId: string;        // "" when no active path
  bpm: number;
  personaId: string;     // "" = none
  voicingId: string;
}

/** Serialize; null values DELETE keys. LAWS (pinned):
 *  - pathId starting "etu-" -> key DROPPED (generated etudes ride the
 *    13 etude keys - ADR-015 "requests not results");
 *  - pathId failing /^[a-z0-9][a-z0-9-]{0,63}$/ -> key dropped;
 *  - bpm 60 (default) or non-finite -> key dropped; other integers
 *    written as-is (clamping is the boot reader's job);
 *  - persona "" / voicing "closed" -> keys dropped. */
export function serializePractice(s: PracticeStateIn): Record<string, string | null>;

export interface PracticeUrlPresence {
  readonly path: boolean; readonly bpm: boolean;
  readonly persona: boolean; readonly voicing: boolean;
}
/** Field-wise merge doctrine (HIGH-001): ONLY present keys may win. */
export function practiceUrlPresence(params: URLSearchParams): PracticeUrlPresence;

/** Parse the PRESENT subset. Absent keys are null (never "default" -
 *  the caller keeps the persisted value). Malformed or etu-* values
 *  are SILENTLY null (benign-drop, D145). bpm clamped 20..400. */
export interface PracticeUrlOut {
  readonly pathId: string | null;          // valid-format, non-etu
  readonly bpm: number | null;             // integer 20..400
  readonly personaId: string | null;       // membership-checked
  readonly voicingId: string | null;       // membership-checked
}
export function parsePracticeParams(
  params: URLSearchParams,
  validPersonaIds: readonly string[],
  validVoicingIds: readonly string[],
): PracticeUrlOut;
```

### 3.2 src/lib/exploreUrl.ts (NEW, pure, node-tested)

```ts
/** PRD-001 Phase 8 S1 (D146): explore seed text. The seed IS the
 *  state (cards regenerate deterministically - Phase 5 pin); op
 *  history is a playhead and NEVER serializes. */
export const EXPLORE_URL_KEYS: readonly ["eseed"] = ["eseed"];
/** Governor (D146): longer seeds skip the key + show the notice. */
export const ESEED_URL_MAX = 200;

export function hasExploreParams(params: URLSearchParams): boolean;
/** null/""/over-cap -> null (skip key; the surface owns the notice). */
export function serializeExploreSeed(seedText: string | null): Record<"eseed", string | null>;
/** Raw text round-trip (URLSearchParams handles encoding). */
export function parseExploreSeedParam(params: URLSearchParams): string | null;
```

### 3.3 src/lib/ideaShare.ts (NEW, pure - the SINGLE idea codec; extracted from App boot + IdeaBar)

```ts
/** PRD-001 Phase 8 S1 (D148/D149): ONE codec for ?idea= shared by App
 *  boot, IdeaBar, PlaySurface (the shipped scheme byte-compatible:
 *  btoa(encodeURIComponent(JSON.stringify(idea))) - App:1450 decodes
 *  it, IdeaBar:72 encodes it). */
export const IDEA_URL_KEY = "idea";
/** Writer governor (D149): the DEBOUNCED writer skips the idea key
 *  past this; explicit copyShareUrl() always sets it; boot decode has
 *  no cap. */
export const IDEA_URL_MAX = 1500;

export function encodeIdeaParam(idea: Idea | null): string | null; // null -> delete key; >IDEA_URL_MAX -> null (writer skips)
export function decodeIdeaParam(raw: string | null): Idea | null;  // malformed -> null + console.warn (the shipped App:1458-1461 behavior, relocated)
/** Read-modify-write ONE param on a full href (preserves all other
 *  keys - the writer's own discipline, reused for copy). */
export function withIdeaParam(href: string, idea: Idea | null): string;
```

### 3.4 src/lib/urlSyncBus.ts (NEW, jsdom-tested - the scheduler seam, NOT a second writer)

```ts
/** PRD-001 Phase 8 S1 (D149): shared debounce scheduler + synchronous
 *  flush for the ONE writer (ADR-015 intact: one write() function).
 *  The pagehide law (App:1592-1597) relocated so copyShareUrl can
 *  reuse it: a copy within the 200ms window otherwise copies a STALE
 *  URL (the HIGH-001 disease). */
export const URL_WRITE_DEBOUNCE_MS = 200;
export function registerUrlWriter(write: () => void): () => void; // unregister = exact inverse (StrictMode law)
export function scheduleUrlWrite(): void;                          // re-armable single timer
export function flushUrlWrite(): void;                             // pending -> clearTimeout + write() NOW; none -> no-op; no writer -> NEVER throws
```

### 3.5 src/lib/shareUrl.ts (NEW, jsdom-tested)

```ts
/** PRD-001 Phase 8 S1 (D149): the copy seam. LAW: flushUrlWrite()
 *  BEFORE reading location.href (pinned by call-order test). */
export type ShareStatus = "copied" | "unavailable" | "blocked";
export function copyShareUrl(idea?: Idea | null): Promise<ShareStatus>;
/** Status copy (VERBATIM shipped strings, IdeaBar.tsx:187-193 - a
 *  contract, not prose): "Share link copied to clipboard." /
 *  "Share link ready (clipboard unavailable)." /
 *  "Share link ready (clipboard blocked)." */
export function shareStatusText(s: ShareStatus): string;
```

### 3.6 src/lib/playRoute.ts + src/lib/ideaHear.ts (NEW)

```ts
/** D148: the whole "router". */
export function isPlayRoute(pathname: string): boolean; // "/play" || "/play/"

/** D148: Idea -> the exploreHear card shape (the shape precedent is
 *  shipped: IdeaBar.tsx:143-155 builds one inline). PURE + node-tested;
 *  null for scale/seed (honest CTA - /play never invents voicing or
 *  generation context). Audio itself flows through the EXISTING
 *  cardToHearInput + hearIdeaCard + composePreviewPlayer (zero new
 *  audio code - the ADR-020 law). */
export function ideaToPlayCard(idea: Idea): IdeaCardData | null;
export function playIdea(idea: Idea): boolean;  // false = not playable kind
export function stopIdea(): void;               // delegates to the singleton
```

### 3.7 src/state/sessionStore.ts ADDITION (ephemeral - the pendingModeRequest precedent)

```ts
/** D146: the explore seed text mirror for the URL writer. EPHEMERAL:
 *  NOT in partialize, NOT persisted, envelope version UNCHANGED (the
 *  no-v5 law - the store already ships ephemeral fields). */
exploreSeedUrl: string | null;
setExploreSeedUrl(seed: string | null): void;
```

### 3.8 src/lib/urlSyncPredicate.ts EDIT (4 -> 6 terms)

```ts
export interface UrlSyncSnapshot {
  /* existing 4 (App:1540-1604 writer) */
  currentIdea: Idea | null;      // NEW - ref-compare (store replaces, never mutates)
  exploreSeedUrl: string | null; // NEW - primitive
}
// shouldScheduleUrlWrite gains:
//   next.currentIdea !== prev.currentIdea ||
//   next.exploreSeedUrl !== prev.exploreSeedUrl
// Practice scalars are NOT here: the legacy hook is invisible to the
// zustand subscription (audit #6) - the App practice-sync effect calls
// scheduleUrlWrite() directly (D149).
```

---

## 4. DATA FLOW (three links, end to end)

```
PRACTICE SHARE OUT (study surface, user clicks Share)
  tempo 132, path study-solar, persona coltrane, voicing drop2
    -> legacy hook state changes -> App practice-sync effect
       -> practiceUrlRef = {study-solar,132,coltrane,drop2}
       -> scheduleUrlWrite()  [200ms debounce, shared bus timer]
    -> write(): mode?(etude absent=default) transpose + 13 etude keys?
       + 7 compose keys? + idea? + eseed? + path=study-solar&bpm=132
       &persona=coltrane&voicing=drop2  -> replaceState (ONE writer)
  user clicks Share FAST (within 200ms of the tempo change):
    copyShareUrl() -> flushUrlWrite() [cancels timer, writes NOW]
    -> location.href (fresh) -> clipboard -> "Share link copied..."

PRACTICE DEEP LINK IN (recipient, fresh browser)
  ?path=study-solar&bpm=132&persona=coltrane&voicing=drop2&style=...&seed=42
    -> bootDoneRef one-shot (App:1404): mode -> transpose -> idea
       -> etude parse + restore/prepend (existing, shifts indices)
       -> eseed -> setExploreSeedUrl
       -> parsePracticeParams (presence map; etu-* rejected)
          path: findIndex(paths, id) AFTER prepend -> setActivePathIndex(idx)
                (unknown id -> silent drop)
          bpm 132 -> setTempo(132)   persona -> setSelectedPersonaId
          voicing -> setVoicingType
    -> predicate NEVER fired for practice (no store term) - the sync
       effect fires once on mount -> URL rewrites to ITSELF (idempotent)

/play?idea=<b64>  (recipient, any browser)
  main.tsx: isPlayRoute("/play") -> PlaySurface (App NEVER mounts -
  no writer, no boot effects, URL stays pristine)
    -> decodeIdeaParam -> isIdea guard -> summary chip
    -> kind chord|progression|melody -> ARMED (big Play, autofocus)
       click (the gesture autoplay requires) -> playIdea ->
       ideaToPlayCard -> cardToHearInput -> renderAccompaniment ->
       composePreviewPlayer (the shipped singleton - no new ctx)
       -> PLAYING -> end -> Replay
    -> kind scale|seed|malformed -> EMPTY state + "Open the full app" CTA
  prod: vercel.json rewrite /play -> /index.html (ships on deploy)
  e2e: dist/serve.json rewrite (public/serve.json, vite-copied)
  browser back/forward: leaves the app (D147 - replaceState pushes no
  entries; documented, not broken)
```

---

## 5. EXACT FILE PLAN (E edit / N new; complete manifest for directory staging - GIT-001)

```
N src/lib/practiceUrl.ts               serialize/parse/presence, etu-guard (3.1)
N src/lib/practiceUrl.test.ts          node: round-trip/clamp/drop/etu x14
N src/lib/exploreUrl.ts                eseed codec + 200 governor (3.2)
N src/lib/exploreUrl.test.ts           node: round-trip/cap/absent x7
N src/lib/ideaShare.ts                 THE idea codec (3.3)
N src/lib/ideaShare.test.ts            node: shipped-scheme compat/governor/withIdeaParam x9
N src/lib/urlSyncBus.ts                register/schedule/flush singleton (3.4)
N src/lib/urlSyncBus.test.ts           jsdom (JSDOM_FILES +=): debounce/re-arm/flush/no-throw x8
N src/lib/shareUrl.ts                  flush-before-copy seam (3.5)
N src/lib/shareUrl.test.ts             jsdom (JSDOM_FILES +=): call-order/3-states x6
N src/lib/playRoute.ts                 isPlayRoute (3.6)
N src/lib/playRoute.test.ts            node: exact-match x3
N src/lib/ideaHear.ts                  ideaToPlayCard/playIdea/stopIdea (3.6)
N src/lib/ideaHear.test.ts             node: pure builder (kinds/nulls/shape) x6
N src/components/PlaySurface.tsx       armed/playing/empty minimal page
N src/components/PlaySurface.test.tsx  jsdom AUTO-GLOB: decode/armed/CTA x8
N src/components/PracticeHeader.test.tsx jsdom AUTO-GLOB: share button x4 (no header test exists today - S4 D-10 precedent)
N public/serve.json                    /play rewrite for the e2e static server (D148)
E src/lib/urlSyncPredicate.ts          +2 terms (currentIdea, exploreSeedUrl) (3.8)
E src/lib/urlSyncPredicate.test.ts     +4 its (both directions per new term - TESTER GAP-1 doctrine)
E src/state/sessionStore.ts            ephemeral exploreSeedUrl + setter (3.7 - NOT partialize)
E src/state/sessionStore.test.ts       +2 its (envelope STILL v4 + field absent from persist = the no-v5 pin)
E src/components/ExploreSurface.tsx    seed push effect + eseed boot precedence + notice + Share btn
E src/components/ExploreSurface.test.tsx +4 its (push/precedence/notice/share)
E src/components/IdeaBar.tsx           ideaShare + copyShareUrl; buildShareUrl + STALE WARN (:195) DELETED
E src/components/IdeaBar.test.tsx      share pins retargeted (URL now full-location + idea; no-warn pin)
E src/components/EtudeComposerPanel.tsx      Share button (applied-constraints honesty)
E src/components/EtudeComposerPanel.test.tsx +1 it
E src/components/ComposeSurface.tsx          Share button + 4th honest status (governor case)
E src/components/ComposeSurface.test.tsx     +1 it
E src/components/PracticeHeader.tsx          Share button
E src/App.tsx                                writer registers into bus; write() gains idea/practice/eseed
                                             families; practice-sync effect (refs + scheduleUrlWrite);
                                             boot += eseed + practice restore (AFTER etude prepend);
                                             ?idea= decode relocated to ideaShare. ~110-130 lines,
                                             ZERO handler hunks (:1238-1380 sacred), writer behavior-identical
E src/main.tsx                               isPlayRoute branch -> PlaySurface (~4 lines)
E vercel.json                                rewrites += /play, /play/ -> /index.html
E vitest.config.ts                           JSDOM_FILES += urlSyncBus.test.ts, shareUrl.test.ts
E e2e/share-url.spec.ts                       NEW spec: 4 legs (6.2)
N e2e/play-route.spec.ts                      NEW spec: 3 legs (6.2)
E docs/MODES.md                               Share row: stale-warn text removed, full-URL behavior; URL key table
E docs/ARCHITECTURE.md                        URL-state section: 4 -> 10 key families; back/forward-by-design line
E docs/EXPLORE-MODE.md                        eseed + share row (transient law amended: seed rides URL, history stays local)
E docs/TERMINOLOGY.md                         "share URL" / "flush-before-copy" / "eseed" / armed state
E AGENTS.md                                   Kai lockstep: suite count line 2664/202 -> final (checklist item 15)
```

/play block (steps 13-17, the D150 cut line) = playRoute.ts(+test),
ideaHear.ts(+test), PlaySurface.tsx(+test), main.tsx, vercel.json,
public/serve.json, e2e/play-route.spec.ts. DISJOINT: nothing in the
S1-core manifest imports these.

NOT touched (hard): `tests/**` (byte-frozen; it( 362 gate),
`src/lib/noteInputBus.ts` / `useNoteInput.ts` / `NoteInputPiano.tsx`
(IMMUTABLE S4 surfaces), `src/components/PianoKeyboard.tsx`,
`src/lib/midiIn.ts`/`midiOut.ts`, `src/App.tsx:1238-1380` (sacred
handler - ZERO hunks), `src/lib/etudeUrl.ts` / `composeUrl.ts`
(consumed as-is; the writer calls them, neither file edits),
`src/lib/storage.ts` (ZERO new K keys - URL keys are not storage keys),
`engine/**` (ZERO files added/removed - purity floor stays 56),
`src/data/**` / personas.json / masterclass.ts (no count pins move:
tunes 40, briefing 12, personas), README/SPEC (check-links values
unmoved), `.kai/**` (Kai-only: TD-027/TD-047 wording + PRD errata are
open items), `docs/PRD-001.md` (orchestrator-owned), `playwright.config.ts`
(webServer command byte-identical - serve.json does the routing).

---

## 6. TEST PLAN

### 6.1 Unit (node env unless noted; colocated; suite 2664 -> ~2743 / 1 skipped / 0 failed; files 202 -> 211)

- practiceUrl.test.ts (+14): serialize - etu-* pathId dropped (the
  ADR-015 interaction pin); format-garbage pathId dropped; bpm 60 ->
  key absent, 132 -> "132", NaN/0/9999 -> absent; persona ""/voicing
  "closed" dropped; presence map = raw params.has (the composeUrl
  :244-249 lesson: parsed-non-default != present); parse - absent keys
  -> ALL null (never defaults - the field-wise law), bpm clamped
  20..400, etu-* rejected, unknown persona/voicing (outside injected
  lists) -> null, round-trip serialize->parse identity for the whole
  domain.
- exploreUrl.test.ts (+7): round-trip raw text (spaces/#/=/& in seeds
  survive URLSearchParams), 200-cap boundary (200 ok, 201 -> skip),
  null/"" -> skip, hasExploreParams.
- ideaShare.test.ts (+9): encode EXACTLY matches the shipped IdeaBar
  scheme (btoa(encodeURIComponent(JSON)) - byte-compat pin against the
  CURRENT App boot decoder, the no-drift law), decode EXACTLY matches
  the shipped App:1450 path (atob->JSON->isIdea; malformed -> null +
  console.warn once), 1500 governor -> writer-encode null, decode has
  NO cap, withIdeaParam preserves every other key (set/replace/
  delete).
- urlSyncBus.test.ts (jsdom, +8): schedule coalesces within 200ms
  (fake timers), re-arm extends, flush pending -> write once + timer
  cleared, flush no-pending -> NO write (the shipped law :1593),
  register/unregister inverses (StrictMode), flush without writer ->
  no throw.
- shareUrl.test.ts (jsdom, +6): THE call-order pin - pending schedule
  + copy -> registered fake writer ran BEFORE clipboard.writeText
  (this is the stale-copy bug-class gate); three statuses map to the
  three VERBATIM strings; writeText throw -> "blocked"; absent
  clipboard -> "unavailable"; idea param set via withIdeaParam.
- urlSyncPredicate.test.ts (+4): each new term fires alone
  (currentIdea ref swap; exploreSeedUrl value change) + unrelated
  store churn does NOT fire (the both-direction doctrine).
- sessionStore.test.ts (+2): setExploreSeedUrl round-trips in the
  live store; the persisted envelope NEVER contains exploreSeedUrl
  (the ephemeral/no-v5 pin - partialize byte-shape).
- ExploreSurface.test.tsx (+4): seedText edit pushes store field
  (skip-when-equal); boot precedence eseed > idea (seed both, assert
  eseed wins); >200 seed -> explore-url-notice renders; Share button
  calls copyShareUrl.
- IdeaBar.test.tsx (retarget, net +2): share now copies
  location-based URL INCLUDING mode/transpose fixtures (replaces the
  origin+pathname-search-drop assertion - the shipped behavior
  upgrade); NO console.warn on share success (stale-warn kill pin);
  malformed-idea decode warning still routes through ideaShare.
- EtudeComposerPanel.test.tsx (+1) / ComposeSurface.test.tsx (+1) /
  PracticeHeader.test.tsx (new, +4): button renders, click ->
  copyShareUrl, status text renders, (compose) governor-visible ->
  4th status string.
- PlaySurface.test.tsx (jsdom, +8): valid chord idea -> armed (never
  auto-play - the autoplay-honesty pin: NO playIdea call before
  click); click -> playIdea called; scale/seed idea -> empty+summary
  + CTA href="/"; malformed idea -> empty state, no throw; absent
  idea -> empty.
- ideaHear.test.ts (+6): ideaToPlayCard - chord/progression -> card
  shape (progression array, id via cardId), melody -> melody card,
  scale/seed -> null (the CTA carve pin), playIdea false for null-
  card kinds.
- playRoute.test.ts (+3): "/play" true, "/play/" true, "/" false,
  "/play/x" false, "/other" false (exact-match law, S4 D-11
  precedent).

### 6.2 e2e boundary (Playwright; 34 -> 41 tests, 14 -> 16 specs)

e2e/share-url.spec.ts, 4 legs:
1. PRACTICE ROUND-TRIP (positive, fresh context): boot -> change tempo
   to 132 + pick a study-* path + persona + voicing -> poll url()
   contains bpm=132&path=study-... -> `browser.newContext()` (fresh
   storage = cross-device proxy, the shipped compose leg-6 pattern) ->
   goto(url) -> assert tempo input shows 132, active path title,
   persona chip, voicing select (the D145 field-wise restore, in a
   REAL browser). FAILS pre-S1 (keys never written).
2. FLUSH-BEFORE-COPY (THE discriminative break-guard leg): grant
   clipboard permissions -> change tempo via the input (Enter) and
   IMMEDIATELY (<200ms, no poll) click the PracticeHeader Share button
   -> read `navigator.clipboard.readText()` in the page -> assert the
   copied URL contains the NEW bpm value. Pre-S1: no share-url-button
   in the header -> locator timeout -> FAILS (structural). This leg
   pins the exact bug class the packet named. Flake law: the app's own
   status text ("copied to clipboard") is asserted FIRST; the
   clipboard read is the discriminator with a documented degrade to
   status-text-only if CI read ever flakes (flush order stays unit-
   pinned in 6.1).
3. EXPLORE eseed ROUND-TRIP: type a seed -> poll url() contains
   eseed= -> reload -> seed input restored (ephemeral field -> boot
   -> surface precedence). Then a 250-char seed -> explore-url-notice
   visible + eseed ABSENT from URL (governor honesty). FAILS pre-S1.
4. IDEA SYNC + STALE-WARN: mint an idea (the + button, shipped path)
   -> poll url() contains idea= -> click IdeaBar Share -> copied URL
   contains BOTH idea= and mode/context keys (the search-dropping
   behavior is gone) -> assert no console error/warn matching
   "not yet implemented" during the click (page.on("console")
   collector - the stale-warn kill, browser-proven). FAILS pre-S1
   (URL lacks context keys + warn fires).

e2e/play-route.spec.ts, 3 legs:
5. /play ARMED -> PLAYING (positive): goto("/play?idea=" + encoded
   Cmaj7 chord idea) -> play-surface visible + idea summary +
   play-button (autofocus) -> click -> data-state="playing" appears
   (the composePreviewPlayer state attr - UI state, never audio
   bytes; headless autoplay is gesture-satisfied by the click).
   DISCRIMINATIVE: pre-S1 `serve` 404s /play (audit #13) -> goto
   returns the 404 body, locator timeout -> FAILS. (Post-S1 this
   passes ONLY because public/serve.json shipped - the leg doubles as
   the config's own pin.)
6. /play EMPTY honesty: goto("/play") -> play-empty visible +
   "Open the full app" link href="/" -> click -> App boots (mode
   gate renders). goto("/play?idea=%%%garbage%%%") -> play-empty, no
   crash. FAILS pre-S1 (404).
7. /play URL PRISTINISM: on /play armed, wait 1s -> page.url()
   UNCHANGED (no writer runs - App never mounts; the minimal-UI
   contract). FAILS pre-S1 (404).

BREAK-GUARD protocol: legs 1-7 all fail pre-S1 (missing keys/buttons/
route); run legs 1+2 on the stashed pre-S1 build, restore, green
(the shipped S3/S4 discipline).

### 6.3 Manual checklist (truths no bot can prove)

- [ ] Phone: Share -> paste -> open in another browser: practice link
      lands on the SAME path/tempo/persona/voicing; /play shows the
      armed button and ONE tap starts audio (real device, real
      autoplay policy).
- [ ] /play on Vercel PREVIEW (post-deploy): /play?idea= loads (the
      rewrite ships) - verify once, since audit #11 says previews 404
      until this config deploys.
- [ ] Back/forward from any surface: leaves the app (documented
      behavior, D147) - confirm no half-state.
- [ ] Fast-reload staleness: change tempo, reload within 100ms ->
      restored tempo matches (pagehide flush still intact after the
      bus refactor - the regression this slice could introduce).
- [ ] Draft-vs-applied honesty (EtudeComposerPanel): edit constraints
      WITHOUT Generate, Share -> link opens with the PREVIOUS applied
      constraints (documented D149 honesty - verify it reads as
      intended, not broken).
- [ ] Compose governor: paste a huge override set -> notice shows ->
      Share copies WITHOUT compose keys and says so (4th status).

---

## 7. INTERFACE CONTRACTS

### 7.1 DOM / testids (e2e + a11y)
- Share buttons (all five surfaces): `share-url-button` (one id,
  five instances - never mounted simultaneously; each renders its own
  `share-url-status` sibling with the 3(+1) state strings).
- ExploreSurface notice: `explore-url-notice` (pattern:
  ComposeSurface.tsx:619).
- PlaySurface: `play-surface` (root), `play-armed` / `play-empty` /
  `play-playing` (state wrappers), `play-button` (the big one,
  aria-label "Play idea"), `play-idea-summary` (kind + chord text),
  `play-open-app` (CTA link).
- Writer: no DOM. Predicate: no DOM.

### 7.2 Copy (VERBATIM obligations, ASCII)
- Share statuses (SHIPPED strings, reused byte-identical): "Share
  link copied to clipboard." / "Share link ready (clipboard
  unavailable)." / "Share link ready (clipboard blocked)."
- Compose governor variant: "Share link copied - session too large,
  compose keys omitted."
- Explore notice: "Seed too long for the share URL (200 chars max) -
  the link opens without it."
- PlaySurface armed hint: "One tap to play - browsers keep audio
  asleep until you interact."
- PlaySurface empty (no/malformed idea): "This link has no playable
  idea - open the full app to make one."
- PlaySurface scale/seed CTA: "This idea kind needs the full app -
  pick a voicing or generate there."
- Docs (MODES.md): the Share row loses the stale warn sentence
  (audit #8) and gains the full-URL + flush behavior.

### 7.3 URL key table (the slice's contract; docs/ARCHITECTURE.md mirrors it)

| Family | Keys | Owner module | Governor |
|---|---|---|---|
| core | mode, transpose | shipped (App writer) | - |
| idea | idea | ideaShare.ts (NEW) | 1500 chars, skips idea only |
| etude | style,key,tmode,diff,bars,seed,tempo,start,end,chrom,straight,cts,maxint (13 - audit #4) | shipped etudeUrl.ts | validator |
| compose | cfile,chash,cchart,creq,covr,canf,cmix (7) | shipped composeUrl.ts | 6000, wipes compose only |
| practice | path,bpm,persona,voicing (4) | practiceUrl.ts (NEW) | small by construction |
| explore | eseed | exploreUrl.ts (NEW) | 200, skips eseed only |

---

## 8. IMPLEMENTATION ROADMAP (ordered, atomic)

1. [ ] practiceUrl.ts + test (+14 its) - 2.5h - deps: none
2. [ ] exploreUrl.ts + test (+7) - 1h - deps: none
3. [ ] ideaShare.ts + test (+9; the shipped-scheme byte-compat pin FIRST) - 2h - deps: none
4. [ ] urlSyncBus.ts + test (+8; JSDOM_FILES +=) - 2.5h - deps: none
5. [ ] shareUrl.ts + test (+6; JSDOM_FILES +=; call-order pin) - 1.5h - deps: 3,4
6. [ ] sessionStore ephemeral field + predicate 4->6 terms + tests (+6) - 2h - deps: none
7. [ ] App: writer registers into bus; write() gains idea/practice/eseed; practice-sync effect; boot += eseed + practice restore AFTER prepend; ?idea= decode -> ideaShare - 4h - deps: 1,2,3,4,6
8. [ ] ExploreSurface: push/boot/notice + Share button + tests (+4) - 2.5h - deps: 2,5,6,7
9. [ ] IdeaBar: refactor onto ideaShare/shareUrl, DELETE stale warn :195, retarget tests - 1.5h - deps: 3,5,7
10.[ ] PracticeHeader Share + new test file (+4); EtudeComposerPanel + ComposeSurface Share (+2 incl. governor variant) - 2.5h - deps: 5,7
11.[ ] e2e/share-url.spec.ts (4 legs incl. the flush-before-copy break-guard) - 3h - deps: 8,9,10
12.[ ] docs (MODES/ARCHITECTURE/EXPLORE-MODE/TERMINOLOGY) - 1.5h - deps: 7-10
--- CUT LINE (D150): steps 13-17 may split to S2 with zero rework ---
13.[ ] playRoute.ts + ideaHear.ts + tests (+9) - 2.5h - deps: 3
14.[ ] PlaySurface.tsx + test (+8) - 3h - deps: 13
15.[ ] main.tsx branch + vercel.json + public/serve.json - 1h - deps: 14
16.[ ] e2e/play-route.spec.ts (3 legs) - 2h - deps: 15
17.[ ] full gate order + AGENTS.md count lockstep + release notes - 1.5h - deps: all

Total: ~40.5h (S1-core steps 1-12 ~27h; /play steps 13-17 ~13.5h).

---

## 9. RISKS

| Risk | P | I | Mitigation |
|---|---|---|---|
| Writer/bus refactor regresses the shipped debounce/flush contract (the slice's own highest-blast-radius edit) | med | high | Behavior-preserving extraction only (write() body unchanged except new key loops); urlSyncBus unit pins replicate the pagehide law; the THREE shipped e2e round-trip legs (etude reload, compose leg 6 x2) re-run untouched; manual item "fast-reload staleness" |
| ?path= boot restore fights the etude prepend (index shift class - REVIEWER HIGH-001) | med | med | D145 ordering law: practice restore runs AFTER etude restore, resolves by ID lookup on the live list, never stores an index; pinned unit (etu-* rejection) + e2e leg 1 (deep link with both families) |
| Stale-copy class recurs at a new call site (someone adds a 6th Share button that reads href directly) | med | med | copyShareUrl is the ONLY sanctioned copy path (DO-NOT: raw writeText for links); call-order unit pin + e2e leg 2 make the disease fail CI |
| eseed push effect churn (store write per keystroke) | low | low | skip-when-equal guard; ephemeral field is outside partialize (no localStorage per keystroke); predicate fires the DEBOUNCED writer, not replaceState directly |
| Idea-key governor interacts with explicit copy (writer skips at 1500, copy sets anyway) | low | med | intentional asymmetry (D149: user intent beats compactness), pinned both directions; boot decode uncapped so copied links always land |
| /play 404 on Vercel previews until the vercel.json rewrite deploys (audit #11) | high | low | documented + manual item 6.3#3 verifies post-deploy once; the rewrite ships IN this slice, so the window is pre-merge only |
| serve.json silently ignored (wrong location / serve version drift; `serve` is not pinned - audit #13) | low | med | the leg-5 break-guard doubles as the config's pin (pre-S1 404, post-S1 green); if serve.json ever stops being read, leg 5 fails LOUDLY, it cannot false-pass |
| Clipboard read flakes in headless CI (leg 2) | med | low | documented degrade to status-text-only assertion (app's own truth) - flush order stays unit-pinned in jsdom; never a silent skip |
| Autoplay policy differences (mobile Safari arms fine, but a desktop browser with engagement heuristics could differ) | low | low | the design NEVER auto-plays (armed state) - policy-proof by construction; the click path is the same in every target browser |
| App.tsx grows again (~5269 -> ~5390; S1 adds ~120) | high | med | all logic in libs; App gains registration + one sync effect + boot lines; sacred handler byte-identical (checklist grep); the monolith split stays TD-023's problem |
| Predicate grows 4->6 terms (dropping one silently desyncs a family) | low | med | the predicate EXISTS to make this fail CI (TESTER GAP-1); +4 both-direction pins |
| Old shared links regress (IdeaBar's new full-context URL, eseed/idea keys on old boots) | low | med | additive: old links carry only idea= (still decoded); new boot readers ignore absent keys (field-wise law); IdeaBar's URL is a superset of the shipped one - the decode path is unchanged |

---

## 10. DO-NOT LIST

- NO popstate handler, NO pushState, NO router dependency (D147/D148 -
  the whole "router" is one isPlayRoute call).
- NO second replaceState writer (ADR-015): the bus is a scheduler,
  write() stays singular.
- NO tests/** edits; it( stays 362; no count pins move (tunes 40,
  curatedBriefing 12, personas, check-links 362+29).
- NO new K.* localStorage keys (URL keys are not storage keys);
  storage.ts byte-identical.
- NO zustand v5, NO envelope version bump: exploreSeedUrl is
  EPHEMERAL (outside partialize - the pendingModeRequest precedent);
  sessionStore.test.ts pins the envelope shape.
- NO engine/** changes: zero files added/removed, purity floor stays
  56; all new pure helpers live in src/lib with colocated tests.
- NO changes to noteInputBus.ts / useNoteInput.ts / NoteInputPiano.tsx
  / PianoKeyboard.tsx / midiIn.ts / midiOut.ts (IMMUTABLE surfaces).
- NO new SHORTCUTS cheatsheet chips (frozen reverse pin - the D143
  precedent; the Share buttons are mouse/touch affordances, no key
  binding is added).
- NO serialization of: activeStepIndex, practiceMechanics (loop/
  pause/AB/ramp/detect/noteInput), latency, beatType, timeSignature,
  metronome, volume (D145's itemized OUT table - each with a reason;
  a future addition needs a ruling, not a drift).
- NO auto-play attempt on /play load (no gesture-less AudioContext -
  D148 rejected option (d)).
- NO IdeaCard reuse on /play (audit #16 - the machinery, not the
  card).
- NO catch-all SPA fallback in vercel.json (only /play + /play/ get
  rewrites; a real 404 must stay a 404).
- NO playwright.config.ts webServer-command change (serve.json does
  the routing).
- NO PRD/.kai edits (orchestrator-owned; D151's erratum list + TD
  wording are open items). NO docs/PHASE-4-S4-MIXER-EXPORT.md edit
  (historical doc; its false completion claim is already corrected at
  HEAD via FUTURE_PLANNING - audit #15).
- NO console.log/info/debug anywhere (only warn/error on error
  paths; the deleted :195 warn must NOT be "fixed" by downgrading it
  to log).
- ASCII in all new code strings + copy (PM-2026-009-004).

---

## 11. CHECKLIST (gate order; CI mirrors)

1. [ ] `npm run lint` (tsc - the predicate snapshot widening flags every call site)
2. [ ] `npm test` -> ~2743 / 1 skipped / 0 FAILED; `git diff --name-only -- tests/` EMPTY; it( stays 362
3. [ ] `npm run build` (RNN config first, then main - both pass; verify dist/serve.json EXISTS post-build - vite copied public/)
4. [ ] `node assets/check-links.cjs` -> 362 frontend + 29 backend; persona/tune counts unmoved
5. [ ] `npm run check:paths` -> 36/36 OK (no path data touched)
6. [ ] `npm run test:e2e` after build: 34 -> 41 green
7. [ ] BREAK-GUARD: stash the diff, run legs 1+2 (+5 if /play in scope) on the pre-S1 build -> FAIL (missing keys/button/route); restore -> green
8. [ ] Writer singularity proof: `git diff src/App.tsx` shows exactly ONE replaceState call site (the existing write()); urlSyncBus has NO history calls (grep)
9. [ ] Sacred-handler byte-proof: `git diff src/App.tsx` shows ZERO changes in the :1238-1380 handler region
10.[ ] IMMUTABLE proof: `git diff --stat` empty for noteInputBus.ts, useNoteInput.ts, NoteInputPiano.tsx, PianoKeyboard.tsx, midiIn.ts, storage.ts, etudeUrl.ts, composeUrl.ts
11.[ ] Purity: floor STAYS 56; `find engine -name "*.ts" ! -name "*.test.ts"` count unchanged
12.[ ] JSDOM_FILES gained EXACTLY: urlSyncBus.test.ts, shareUrl.test.ts (PlaySurface/PracticeHeader tests auto-globbed)
13.[ ] Ephemeral-field proof: sessionStore.test.ts persist-shape pin passes; `git diff src/state/sessionStore.ts` shows NO partialize change
14.[ ] Stale-warn kill: `grep -rn "not yet implemented" src/` EMPTY; IdeaBar no-warn pin green (unit + e2e console collector)
15.[ ] AGENTS.md lockstep: suite line updated to the FINAL count (Kai; this doc's prediction ~2743/211 - the per-file allocations in 6.1 sum to +79, 2664+79=2743)
16.[ ] No console.log/info/debug in new src; no any; ASCII in all new code strings + copy (grep the diff)
17.[ ] StrictMode audit: bus register/unregister, practice-sync effect, ExploreSurface push - all exact inverses, module singleton holds ONE writer + ONE timer
18.[ ] Kai register: TD-027 refined (D147), TD-047 CLOSED by D148's routing verdict, D151 erratum list applied to docs/PRD-001.md, FUTURE_PLANNING Phase 8 rows -> SHIPPED

---

## 12. RELEASE NOTES (Phase 8 Slice 1)

1. Every session is a link. The address bar now carries your practice
   setup - the study path, tempo, persona, and voicing join the mode,
   transpose, etude constraints, and compose session that already
   rode there. Open a link on any machine and land on the same
   musical session (your playhead, drill mechanics, and device
   calibration stay yours, on purpose).
2. Explore links carry the seed: the cards regenerate deterministically
   from it, so the link is the session. (The op-history back/forward
   strip stays local - it is a playhead, not content.)
3. Share buttons everywhere: the practice header, etude composer,
   compose surface, and explore surface all copy the current URL -
   and they flush the URL synchronously first, so a link copied
   milliseconds after a change is never stale.
4. The IdeaBar Share button now copies the FULL session link (mode,
   transpose, context included) - and the "not yet implemented"
   debug note it printed after every successful copy is gone: Phase 8
   shipped it.
5. /play?idea=... is a real page: a minimal screen that shows the
   idea and one big Play button. One click plays it (browsers keep
   audio asleep until you interact - the page says so). Chords,
   progressions, and melodies play; scales and raw seeds point you
   into the full app honestly.
6. Browser back/forward still leaves the app - by design, documented
   now: links are the share channel, history is yours.

---

## 13. HANDOFF

```yaml
HANDOFF_TO_DEVELOPER:
  from: "@architect"
  to: "@developer (via @engineering-team)"
  timestamp: "2026-09-28"
  deliverables:
    - name: "docs/PHASE-8-S1-SHARE.md"
      status: complete
      sections: re-audit (19 claims, 3 FALSE - etude key count, IdeaCard-reuse premise, Vercel-preview fallback),
        D145..D151 (6 crux forks + PRD erratum list), type definitions (practiceUrl / exploreUrl /
        ideaShare / urlSyncBus / shareUrl / playRoute / ideaHear / ephemeral store field /
        predicate widening), data flow, file plan (complete manifest + cut line), test plan
        (unit +79 its, 7 e2e legs with break-guards), checklist, risks, DO-NOT, release notes
  constraints:
    - "tests/** byte-frozen; 2664/1/0 -> ~2743/1/0 ZERO failures; it( stays 362; check-links 362+29 unmoved; AGENTS.md count line needs the Kai lockstep edit (roadmap 17)"
    - "sacred handler (App.tsx:1238-1380): ZERO hunks; the writer refactor is BEHAVIOR-PRESERVING (write() body gains key loops, debounce/flush semantics relocate to urlSyncBus unchanged)"
    - "ADR-015 single writer: urlSyncBus is a SCHEDULER (one timer, one registered write()), NOT a second writer; grep-proof: exactly one replaceState call site in App.tsx (checklist 8)"
    - "no zustand v5: exploreSeedUrl is EPHEMERAL (outside partialize, pendingModeRequest precedent); envelope stays v4; ZERO new K.* keys; storage.ts byte-identical"
    - "engine purity floor 56: zero engine files touched or added; all new pure helpers in src/lib with colocated tests"
    - "new DOM test files in JSDOM_FILES: urlSyncBus.test.ts + shareUrl.test.ts ONLY (PlaySurface/PracticeHeader auto-glob)"
    - "HIGH-001 doctrine: boot merges are FIELD-WISE (URL wins only for PRESENT keys - presence maps mirror composeUrl.ts:260-270); etu-* pathIds rejected at serialize AND parse"
    - "flush-before-copy is LAW: copyShareUrl() calls flushUrlWrite() before reading location.href (call-order unit pin + e2e leg 2)"
    - "IMMUTABLE: noteInputBus/useNoteInput/NoteInputPiano, PianoKeyboard, midiIn/midiOut, etudeUrl/composeUrl, tests/**, README/SPEC count pins, playwright.config.ts webServer command"
    - "ASCII code strings; no console.log/info/debug; share status copy byte-identical to the shipped IdeaBar strings"
  decisions_made:
    - { id: D145, what: "practice URL = 4 keys (path/bpm/persona/voicing), one truth per legacy-hook store field; etu-* never rides (generated etudes belong to the 13 etude keys); playheads (activeStepIndex) + mechanics + detect + noteInput + latency + beatType adjudicated OUT as device-continuity noise (itemized table); boot restore AFTER etude prepend, id-based, silent-drop; rejected: index serialization, mechanics payload, zustand lift", confidence: HIGH }
    - { id: D146, what: "explore URL = eseed (the seed IS the state - deterministic regeneration pin + PRD 11.2's own example); op-history stays transient; plumbing = ephemeral store field + push/boot effects; 200-char governor skips the key ONLY + honest notice; bare 'seed' key REJECTED (etude integer-domain collision -> spurious malformed warn; tmode precedent); idea channel kept (?mode=explore&idea= already works)", confidence: HIGH }
    - { id: D147, what: "popstate stays UNWIRED: the replaceState-only writer creates no history entries, so the packet's narrow ?idea= option is structurally dead (nothing to popstate for); full support = pushState inversion + ADR-007 re-entry design = TD-047's routing project; TD-027 refined wording for Kai; S1 ships link FRESHNESS (flush), not rewind", confidence: HIGH }
    - { id: D148, what: "/play = one pathname branch in main.tsx (NO router dep), PlaySurface minimal page, vercel.json /play rewrite (prod+preview 404 today - audit) + public/serve.json (e2e reachability, webServer command untouched); ARMED state is the honest autoplay contract (one click plays - 'immediately' is physically impossible cold, erratum flagged); chord/progression/melody play via the shipped exploreHear machinery (composePreviewPlayer singleton, ADR-020 law); scale/seed = honest CTA; IdeaCard reuse REJECTED with evidence (audit #16)", confidence: HIGH }
    - { id: D149, what: "copy affordances: urlSyncBus (register/schedule/flush - the pagehide law relocated so copy reuses it) + shareUrl (flush-before-copy, 3 shipped status strings byte-identical) + Share buttons on PracticeHeader/EtudeComposerPanel/ComposeSurface/ExploreSurface + IdeaBar refactor (stale warn :195 DELETED, link upgraded from search-dropping origin+pathname to full-context URL) + writer gains idea key (1500 governor, idea-only skip) + predicate 4->6 terms; etude DRAFT-vs-APPLIED honesty documented", confidence: HIGH }
    - { id: D150, what: "slice boundary: ONE slice (Kai's bundle stands - shared seams, ~40.5h between S4's 32h and S3's 46.5h), with a PRE-AGREED CUT LINE: roadmap steps 13-17 (/play block, disjoint manifest) split to S2 with zero rework if the pipeline runs hot", confidence: MEDIUM }
    - { id: D151, what: "REQ-IO-50 reading (musical session state, not device ergonomics/playheads) + REQ-IO-52 erratum set (armed-one-gesture, scale/seed carve, eseed rename) - flagged for Kai, PRD untouched by this slice", confidence: HIGH }
  implementation_notes:
    - "step 3 FIRST: ideaShare.ts's byte-compat pin (encode == shipped IdeaBar scheme, decode == shipped App:1450 path) - every later step consumes this codec; drift here breaks links already in the wild"
    - "the writer refactor (step 7) is the slice's highest-blast-radius edit: move the timer/flush into urlSyncBus WITHOUT touching write()'s read-modify-write body; the three shipped e2e round-trip legs are your regression net - run them before building anything new"
    - "practice restore MUST run after the etude prepend in the boot effect (index-shift class - REVIEWER HIGH-001); resolve path by ID against the live list, never store an index"
    - "the predicate does NOT (and cannot) see practice state - the legacy hook lives outside zustand; the React-deps sync effect + refs is the seam; resist 'tidying' by lifting practice state into the store (TD-023's project, not this slice's)"
    - "shareUrl call-order pin: register a fake writer in the test, schedule, copy, assert write ran BEFORE clipboard.writeText - this single test is the stale-copy bug-class gate"
    - "PlaySurface must NEVER touch audio before the click (no AudioContext construction on mount either - the singleton is lazy); the armed state IS the autoplay-policy answer; autofocus the Play button so Space is the gesture"
    - "public/serve.json is load-bearing for e2e leg 5 (serve 404s /play without it) and harmless on Vercel (vercel.json wins); verify dist/serve.json exists after build (checklist 3)"
    - "IdeaBar retarget note: the existing test asserts the copied string contains ?idea= - it will still pass; ADD the full-context assertion (mode/transpose present) and the no-warn assertion (the killed line)"
    - "if cutting /play to S2 (D150), steps 1-12 ship green alone - do not 'partially' wire main.tsx"
  estimated_effort:
    implementation_hours: 24-27
    testing_hours: 13-15
    documentation_hours: 2
  progress:
    phases_completed: 5/5
    retries: 0
    quality_gates_passed: 5/5
    audit_notes: "baseline verified live (2664/1/0 202 files; build OK; e2e 34/14 in 2.3m; it( 362+29 check-links green; purity floor 56; check:paths 36/36; HEAD 227c0c7 clean); 3 packet claims FALSE: 'etude 14 keys' (actual 13, etudeUrl.ts:43-52), 'preview has implicit fallback' (Vercel previews 404 /play - only local vite dev/preview fall back), and the D86 'every mode serialized' completion claim (practice+explore serialize nothing - already self-corrected at HEAD 227c0c7); packet's 'reuse IdeaCard' premise overridden (audit #16); PRD 11.2's own explore example (mode+seed) found and lands the D146 ruling"
  risks_top3:
    - "writer/bus refactor regresses the shipped debounce+pagehide contract (mitigated: behavior-preserving extraction, unit replication of the flush law, 3 untouched e2e round-trip legs, manual fast-reload item)"
    - "?path= boot restore vs etude prepend index-shift class (mitigated: ordering law, id-based resolution, etu-* rejection pins, e2e leg 1 with both families)"
    - "stale-copy race at a future call site (mitigated: copyShareUrl is the only sanctioned seam, call-order pin, e2e leg 2 break-guard, DO-NOT raw writeText)"
  open_for_orchestrator:
    - "D151 erratum set for docs/PRD-001.md (orchestrator-owned): REQ-IO-50 reading note (musical session state; playheads/device-ergonomics excluded - so the P0 can CLOSE honestly), REQ-IO-52 'immediately plays it' -> armed-one-gesture + scale/seed carve, 11.2 example seed= -> eseed="
    - "TD-027 refined wording (D147): 'popstate unwired BY DESIGN - replaceState-only writer creates no entries; in-document history needs a pushState router + ADR-007 re-entry design, decide with TD-047' - and TD-047 CLOSES with D148's routing verdict (no router, one branch) at ship"
    - "D150 cut-line ratification: /play (roadmap 13-17) ships in S1 or splits to S2 - architect recommends shipping together (shared seams, one release story); if budget pressure, split with zero rework"
    - "beatType/timeSignature ('share the backing style') ruled OUT of the practice pick-list (D145) - if product wants it, rule BEFORE step 1 (it changes the key table, not the architecture)"
    - "AGENTS.md suite-count lockstep (2664/202 -> final ~2743/211): dev reports the exact number at ship, Kai edits (checklist 15)"
    - "MODES.md:335 documents the stale warn as shipped behavior - the doc row is in this slice's manifest (step 12); no other doc cites :195 (grep-verified)"
```

**Version:** 1.2.2 | **Phase:** 8 S1 design | **Depends on:** Phases 1-7 shipped (S4 lineage: 763bb7c, ledger 227c0c7) | **Closes:** REQ-IO-50 (P0, with the D151 reading), REQ-IO-52 (P2, armed-state carve), TD-047 (routing verdict), the IdeaBar stale-warn | **Keeps open:** TD-027 (refined wording, D147 - by design), TD-023 (monolith split - untouched on purpose)

---

## 14. ERRATA (post-ship, Kai rulings + dev deviations)

Appended by @docs at ship time. Sections 0-13 are the design as
written at 6875eb2 - kept byte-unchanged as history (this section
is purely additive: git diff shows ZERO deleted lines). This is the
authoritative delta between design and shipped code; read it before
reusing any premise above.

### 14.1 D151 PRD erratum set - APPLIED (Kai, at 6875eb2)

The sec 2 D151 erratum list landed in docs/PRD-001.md in the same
commit that shipped this design (6875eb2): the REQ-IO-50 reading
note (musical SESSION state - playheads, drill ergonomics, device
physics and hardware gates excluded, so the P0 CLOSES honestly),
REQ-IO-52's "immediately plays it" amended to the armed-one-gesture
contract plus the scale/seed payload carve, and the 11.2 example
URLs fixed (`seed=` -> `eseed=`; the double-`mode` collision the
same example carried was already resolved by ADR-015's `tmode`).
PRD-ownership law honored: the design flagged, the orchestrator
edited - this slice touched no PRD line.

### 14.2 D150 cut line - NOT INVOKED (shipped whole)

The pre-agreed cut line (roadmap steps 13-17 -> S2) was NOT used:
the slice shipped S1-core AND the /play block as one pipeline - the
architect's recommendation ("ship as one; the cut line is
insurance, not a hedge"). /play is browser-proven by e2e legs 5-7
(armed -> playing through the shipped machinery; empty honesty +
the CTA landing in the real App; URL pristineness - no writer runs
because App never mounts). Leg 5 doubles as the public/serve.json
config's own pin: if serve.json ever stops being read, it fails
LOUDLY and cannot false-pass.

### 14.3 Design-claim corrections confirmed at ship

Two claims that circulated pre-ship were corrected in the sec 0
re-audit and re-confirmed against the shipped tree:

- The etude URL is 13 keys, NOT 14 (audit #4). The task packet's
  "14 keys" claim had no evidence: `ETUDE_URL_CORE_KEYS` (6) +
  advanced (7) = 13, exactly per ADR-015 sec 1. The sec 7.3 table,
  docs/MODES.md and docs/ARCHITECTURE.md all ship the 13.
- Vercel PREVIEW deployments 404 `/play` until THIS slice's
  vercel.json deploys (audit #11). "Preview has implicit fallback"
  is true only for local `vite dev` / `vite preview`; Vercel
  previews use the same vercel.json, so the rewrite ships with the
  push - the 404 window is pre-deploy only, and manual item 6.3
  verifies it once post-deploy.

### 14.4 Shipped deviations D-1..D-3 (dev report; statuses per Kai)

| ID | Deviation (design -> shipped) | Status |
|---|---|---|
| D-1 | ExploreSurface's boot effect reads `location.search` LIVE (child-first), not only the ephemeral store mirror: React passive effects run child-before-parent, so on a persisted-mode reload the child's boot can precede App's boot populating `exploreSeedUrl` - the deep link must still land (the store read stays as the same-session-mount fallback). Read-only, never touches history; the ADR-015 single writer is untouched. (The inline code comment self-labels this "D-2"; this table's numbering is the canonical one.) | ACCEPTED |
| D-2 | Cosmetic typo in a new e2e spec TITLE (display-only; zero pin or behavior impact - the leg itself is the shipped design's leg) | NOTED |
| D-3 | docs/ARCHITECTURE.md says "six key families" per the sec 7.3 AUTHORITATIVE table (core/idea/etude/compose/practice/explore), not the sec 5 file-plan shorthand ("4 -> 10 key families") | ACCEPTED |

### 14.5 Final counts vs predictions (sec 6.1/6.2; checklist 15)

The suite landed EXACTLY on the prediction: 2664 -> **2743 passed /
1 skipped / 0 failed** (202 -> 211 files; the sec 6.1 per-file pin
allocations sum to +79 - exact hit, checklist item 15). e2e 34 ->
**41 tests / 16 specs** (sec 6.2 predicted 41/16 - exact hit:
share-url 4 legs + play-route 3 legs). `it(` in tests/ stayed 362
(tests/** byte-frozen); the engine purity floor stayed 56 (zero
engine files added/removed); check-links 362 + 29 unmoved;
check:paths 36/36 OK. The AGENTS.md lockstep line
(2664/202 -> 2743/211) was updated by dev at ship.
