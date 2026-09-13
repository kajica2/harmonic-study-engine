# Top-10 steps — post-briefing sprint

The briefing card shipped in 393078f. These are the next 10 steps,
ordered by what I think is the highest-leverage work that fits in
the "small blast radius, additive, independently revertable" pattern
the previous sprints established.

The order is dependency-first, not user-facing-urgency-first.

## Foundation (no deps on anything below this point)

### 1. Strip top area to a Practice loop (IMPROVEMENT_PLAN option A)

**What:** Refactor the top ~250 lines of `src/App.tsx` (the bar
strip, current-chord readout, Start button, and the first ToolGroup
of transport/loop/backing) into a single `<PracticeHeader>`
component. The header shows:

  - Current path title (already in `path.title`)
  - Bar / chord readout (e.g. "Bar 2/14 — Eb/F (F9sus)") — already
    partially visible in `path.steps[activeStepIndex]`
  - One Start/Pause button (currently split across PlaySessionRail's
    perform stage)
  - Compact tempo + loop + backing style + volume in one row
  - One objective line below the chord readout — already provided
    by `<PathBriefing>` (just shipped)

Everything else (voicing inspector, persona selector, arpeggiator,
generator lab, masterclass picker, recording controls, MIDI status,
synesthesia matrix) collapses behind a single "Tools ▾" disclosure
that expands into the same content as today.

**Why this, not the IMPROVEMENT_PLAN's 4-workspace split:** same UX
outcome (one clear practice loop dominates), ~3× smaller refactor.
The split would require routing state and moving every component
into a route folder. Progressive disclosure in a single screen
gets the user-perceived win without the navigation cost.

**Blast radius:** medium. ~250 lines of JSX reorganization, no
state-shape changes, no new persistence.

**Test surface:** the chord-readout string is a pure function of
state. ~5 tests for the formatter.

**Estimate:** 1 PR, ~300 lines diff.

---

### 2. Tooltips + terminology pass (option F)

**What:** Every musical-term label in the app gets a 5-15 word
tooltip. Targeted renames:

  - "Smoothest next voicing" → "Minimum-motion voicing (fewest
    semitones of total voice movement)"
  - "Optimize" toggle → "Optimize voicing" (verb)
  - "Closed / Open" → "Closed voicing / Open voicing" (noun pair)
  - "Step Chord" instruction → move above the A/B controls
    ("Choose a voicing, audition it, then commit it to advance")
  - Tooltips on every Persona name (3-word role hint)
  - Tooltips on every transport icon (currently symbolic)

**Why now, while option A is fresh:** A's refactor moves a lot of
labels around. Doing F right after captures the rename work as
part of the same PR, and the tooltips land in the new compact
Practice Header naturally.

**Blast radius:** small. ~30 tooltip additions + ~10 label changes.

**Test surface:** none new (tooltips are visual).

**Estimate:** 1 PR, ~150 lines diff, mostly JSX attribute changes.

---

### 3. Guide-tone feedback on MIDI input (option C)

**What:** When MIDI input arrives, classify the played note against
the current chord's 3rd / 7th / root / 5th / 9th. Render the result
inline next to the live score:

  - "On 3rd ✓" (green)
  - "On 7th ✓" (green)
  - "Landed on 9th — common tone or resolve" (amber, sus paths)
  - "Off guide tones" (neutral, normal)

If MIDI is not connected, show: "Connect MIDI / Use computer
keyboard / Practice without input" in the same slot, with three
real buttons (the keyboard-mode hook and the existing midiOut
listener are already wired).

**Why this before option D / E:** it's the highest-value feedback
ship. Every other improvement is content; this is a real-time
signal the player can act on immediately.

**Blast radius:** small-medium. New utility `classifyGuideTone()`
in `src/lib/theory.ts` (chord-relative note → role) + a small
component + a 3-button device picker.

**Test surface:** `classifyGuideTone()` is a pure function. ~12
tests covering 3rds / 7ths / 9ths / omitted-3rd (sus) / color tones
/ unknown notes.

**Estimate:** 1 PR, ~250 lines diff.

---

## Content (depends on the data shape decisions in 1-3)

### 4. Path filter surface (option D, stage 1)

**What:** Add a filter bar above the masterclass picker. Five
multi-select chips:

  - **Difficulty** (foundation / intermediate / advanced)
  - **Topic** (II-V-I / modal interchange / rhythm changes /
    chromatic approach / Coltrane cycle)
  - **Goal** (voice-leading / ear training / sight reading /
    transposition / improv)
  - **Style** (swing / bossa / funk / ballad / odd meter)
  - **Time** (≤3 min / ≤10 min / ≤25 min)

Stage 1: filter UI + hand-tag 5-10 paths. Stage 2 (deferred):
"Recommended next" prompt.

**Why stage 1 only:** the data isn't there yet. Need to curate
5-10 paths before filters are useful. Stage 2 needs the mastery
log (option 8) to feed recommendations.

**Blast radius:** medium. New optional fields on `MasterclassEntry`
(every entry needs tags) + a new filter component + curation pass.

**Test surface:** the filter reducer is a pure function. ~8 tests
for tag intersection / union / "no filters".

**Estimate:** 1 PR for the filter component (~200 lines) + a
curation pass (manual, ~30 min) — separate commit.

---

### 5. Persona → behavioral lens, 3-persona PoC (option E)

**What:** Pick three personas and turn them from visual themes
into behavioral lenses:

  - **Bach**: voice-leading strictness boost — the optimize-voicing
    scorer weights parallel-fifth avoidance higher when persona =
    bach. Display the current voicing inspector with the lens active.
  - **Coltrane**: the loop range picker highlights symmetrical-
    substitution candidates (tritone-sub, ii-V cycling) when
    persona = coltrane. One sentence of prompt text under the
    notation: "Connect each resolution with a four-note cell."
  - **Miles**: backing track volume drops by 30% when persona =
    miles, and a "leave two beats of silence" prompt appears when
    the player is on a bar without a chord tone change.

The other 14 personas stay visual themes until/unless curated.

**Why this, not all 17:** full curation is a research project.
Three lenses prove the model and give a template for expansion.

**Blast radius:** medium. Scoring changes in the theory layer + UI
hints + persona metadata (new field `behavioralPrompt: string`).

**Test surface:** theory-layer scorer tests with persona=bach vs
persona=kandinsky produce different rankings on the same voicing
input. ~6 tests.

**Estimate:** 1 PR, ~200 lines diff + persona metadata.

---

## Polish (depends on 1-5 being shipped)

### 6. App.tsx structural split (deeper pass from option 6)

**What:** Continue the partial split from 4d766a1. Three concrete
extractions:

  - `useDDSPProbe` hook (lines ~860-900) — API health-pill state +
    fetch logic, currently inline
  - `useKeyboardShortcuts` hook (lines ~468-555, ~90 lines) — the
    `handleKeyDown` switch with 30+ cases
  - `usePathGenerator` hook — `handleGeneratePath`, `handleRegenerate`,
    `handleAI*` handlers (~120 lines)

Each is independently committable. Aim: App.tsx ~1500-1800 lines
after this round, with the rest of the extractable state in custom
hooks under `src/hooks/`.

**Why after 1-5:** those PRs will land additional state and
components in App.tsx. Doing the structural split first means
re-doing it twice. After 1-5, App.tsx has settled enough that
the split is durable.

**Blast radius:** large (3 PRs total, ~600 lines diff in aggregate).

**Test surface:** each hook is independently testable. ~10 tests
per hook.

**Estimate:** 3 PRs, each ~200 lines diff.

---

### 7. Display modes for the live score

**What:** Four named modes for `<LiveScoreDisplay>`:

  - **Lead-sheet mode** (default today): chord symbols + form
  - **Guide-tone mode**: only essential target notes (3rd + 7th)
  - **Trumpet-transposition mode**: Bb / C concert / Eb options
    — applies the existing `transposeChordName` + MIDI transpose
    together so the displayed pitch matches the horn
  - **Rhythm-first mode**: one-note rhythmic drill before pitch
    is introduced

Plus an "active-bar zoom": automatically enlarge the active bar
while dimming prior and upcoming material.

**Why this:** the code mostly exists (LeadSheet component,
chord transposition, instrument selection). The work is wiring
them as modes.

**Blast radius:** medium-large. Display-mode state in the session
store + LiveScoreDisplay branches + a mode picker UI.

**Test surface:** the mode selector is a reducer; LiveScoreDisplay
modes are mostly visual. ~6 reducer tests.

**Estimate:** 2 PRs, ~400 lines diff.

---

## Larger features (multi-week, defer if any of the above slips)

### 8. Mastery / performance log (option G)

**What:** A small persistence layer (`src/lib/performanceLog.ts`)
that records one entry per take:

  - timestamp
  - path id + bar range
  - tempo
  - "transitions hit / missed" (guide-tone classifier data from
    option 3 — this is why 8 depends on 3)
  - "first-try vs rep #3" snapshot
  - free-text self-rating (1-5)

Read side: a "Recent takes" panel under the masterclass picker.
Diff: "Your take on Bar 4 was 80% on guide tones; last week's
was 65%."

**Why this is NOT in the recommended top half:** biggest single
feature in the teardown. Requires schema migration, has no value
until option 3 (guide-tone classifier) is shipping real data into
it, and the metric might not be the right one. Wait until 3 has
2 weeks of feedback.

**Blast radius:** large. New persistence schema, migration story,
new UI panel, new API to compare takes.

**Estimate:** 2-3 PRs, ~600 lines diff.

---

### 9. Per-path briefing curation at scale

**What:** Curate `objective` field for the other 37 masterclass
entries (only `star-eyes` has one today). Each entry gets a 1-line
"when you open this path, …" written to match the existing
`mainExercise` field.

**Why after 1-8:** by then, players have feedback on whether the
briefing card format works. If the format survives contact with
real players, scale up the curation. If the team wants a different
shape (e.g. multi-paragraph, with audio examples), change the
shape first, then curate.

**Blast radius:** small per entry (one field), large in aggregate
(38 lines of content).

**Test surface:** the `curatedBriefingCount()` test (already in
`tests/pathBriefing.test.ts`) will start failing as more entries
gain the field — that's the signal to update SPEC + README.

**Estimate:** manual work, ~2 hours. Single PR (data-only).

---

### 10. Take parser for rhythm / contour feedback

**What:** Extend the guide-tone classifier (option 3) with:

  - Timing heat map (attacked ahead / behind the beat, by ms)
  - Held-note duration analysis (did you sustain the long tones?)
  - Contour comparison vs the reference melodic line
  - "Your top line moved E -> Eb -> D cleanly; keep that contour
    while changing the lower voice" type feedback

**Why last:** this is the most subjective feedback and the
hardest to get right. By the time the team is here, options 1-9
will have given the format enough real-user signal to know what
contour / rhythm feedback to write.

**Blast radius:** large. New take parser + new UI surface +
new persistence keys.

**Estimate:** 3-4 PRs, ~800 lines diff. Multi-week.

---

## Out of scope (deferred or rejected)

  - **4-workspace routing (IMPROVEMENT_PLAN option H)** — rejected
    in favor of progressive disclosure (option A captures the
    outcome without the routing cost).
  - **Beginner-orientation 4-button chooser** — the per-path
    briefing card (option 9 / already shipped) is the higher-
    leverage part of that idea.
  - **Full 17-persona behavioral lens** — option 5's 3-persona
    PoC proves the model first.
  - **Adaptive rhythm / take-comparison feedback** — wait for
    options 8 + 10 to land.
  - **Render backend provisioning** — requires your dashboard
    click; not a code change.
  - **App.tsx deeper split below option 6** (e.g. splitting
    `PlaySessionRail.tsx` which is also 900 lines) — separate
    project, only worth doing if option 1 reveals the rail is
    the bottleneck.
