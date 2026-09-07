# Improvement plan — Harmonic Study Engine

Based on the teardown of the current page. The teardown was right
about the diagnosis (top is dense, modes compete, persona is theme
not lens, MIDI under-served, no curriculum). Where I disagree with
specific prescriptions, the menu calls it out.

## The 8 options

### A. Strip the top area to a Practice loop

**What:** Refactor the top ~200 lines of App.tsx into a single
`<PracticeHeader>` component. The header shows:

  - Current path title + bar / chord readout
    (e.g. "Bar 2/14 — Eb/F (F9sus)")
  - One Start/Pause button (currently split across PlaySessionRail)
  - Compact tempo + loop + backing style + volume
  - One objective line below the chord readout (e.g. "Hold guide
    tones while bass shifts" — pulls from new per-path briefing data)

Everything else (voicing inspector, persona selector, arpeggiator,
generator lab, masterclass picker, recording controls, MIDI status,
synesthesia matrix) collapses into a single "Tools" disclosure that
expands into the same content as today but starts hidden.

**Why this vs. the teardown's 4-workspace split:** same UX outcome
(one clear practice loop), ~3× smaller refactor. The split would
require routing state, and every existing piece of UI already lives
in App.tsx — moving it to 4 separate surfaces adds navigation
without removing density from any one of them.

**Blast radius:** medium. ~200 lines of JSX reorganization, no
state-shape changes.

**Test surface:** minimal. The briefing line and the chord readout
are pure functions of state.

---

### B. Per-path briefing cards

**What:** When you load a path (from the masterclass picker or from
the path strip), a 3-line briefing card appears above the live score
for that path. Two sources of content:

  1. For the 1 path with `inApp: true` (star-eyes), write a hand-
     curated briefing: "Standard AABA; first half is the melody,
     second half is voice-leading. Listen for the bVII -> I in bars
     5-6."
  2. For the 37 paths with `inApp: false`, fall back to a generic
     briefing templated from the masterclass.ts `mainExercise` and
     `description` fields (which already exist; the README said
     "the picker shows it as 'Coming soon'").

The card is dismissible per-session and persisted to localStorage
(so the user opts back in if they want). It lives at the top of
`<LiveScoreDisplay>` only.

**Why this:** highest clarity-per-line-of-code ratio in the whole
teardown. The masterclass.ts data already has `mainExercise` and
`description` — the material is sitting in the repo, unrendered.
This is a 2-3 hour feature that gives the practice loop a vocal
identity immediately.

**Blast radius:** small. New component, no state changes.

**Test surface:** snapshot tests on the briefing renderer for one
inApp=true path + one inApp=false path.

---

### C. Guide-tone feedback on MIDI input

**What:** When MIDI input arrives, compare the played note against
the current chord's 3rd, 7th, root, and 5th. Render the result
inline next to the live score:

  - "On 3rd ✓"  (green)
  - "On 7th ✓"  (green)
  - "Landed on 9th — common tone or resolve" (amber, sus paths)
  - "Off guide tones" (neutral, normal)

If MIDI is not connected, show: "Connect MIDI / Use computer
keyboard / Practice without input" in the same slot, with three
real buttons (the keyboard-mode hook and the existing midiOut
listener are already wired).

**Why this, not the full "rhythm feedback / take comparison /
timing heat map" the teardown suggested:** those all need a take
parser and a performance log. Guide-tone feedback runs on every
note, no persistence needed, ships immediate value.

**Blast radius:** small-medium. New utility `classifyGuideTone()`
in `src/lib/theory.ts` (chord-relative note → role) + a small
component + a 3-button device picker.

**Test surface:** `classifyGuideTone()` is a pure function. ~12
tests covering 3rds/7ths/9ths/omitted-3rd (sus) / color tones /
unknown notes.

---

### D. Path filter surface

**What:** Add a filter bar above the masterclass picker. Five
multi-select chips:

  - **Difficulty** (foundation / intermediate / advanced)
  - **Topic** (II-V-I / modal interchange / rhythm changes /
    chromatic approach / Coltrane cycle)
  - **Goal** (voice-leading / ear training / sight reading /
    transposition / improv)
  - **Style** (swing / bossa / funk / ballad / odd meter)
  - **Time** (≤3 min / ≤10 min / ≤25 min)

The data is mostly missing — only 1 path is `inApp: true`, so the
filter is currently useless. This is a **two-stage** feature:

  - Stage 1: Filter UI + 5-10 hand-tagged paths (curate yourself
    from masterclass.ts entries — most have natural tags based on
    the class refs).
  - Stage 2: Persist filter state, "Recommended next" prompt.

**Why this:** real discovery value once 5+ paths are tagged. But
it's a content problem first, code second. Stage 1 is small.

**Blast radius:** medium. Schema additions to masterclass.ts
(every entry needs tags) + a new filter component.

**Test surface:** the filter reducer is a pure function.
~8 tests for tag intersection / union / "no filters".

---

### E. Persona → behavioral lens (proof of concept, 3 personas)

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
This is the proof of concept; if the model works, expand.

**Why this, not all 17 personas:** full curation across 17 personas
is a research project, not a feature. Three well-chosen lenses prove
the model and give you a template to expand when you have feedback.

**Blast radius:** medium. Scoring changes in the theory layer + UI
hints + persona metadata (new field `behavioralPrompt: string`).

**Test surface:** theory-layer scorer tests with persona=bach vs
persona=kandinsky produce different rankings on the same voicing
input.

---

### F. Tooltips + terminology pass

**What:** Every musical-term label in the app gets a tooltip
explaining it in 5-15 words. Targeted renames:

  - "Smoothest next voicing" → "Minimum-motion voicing (fewest
    semitones of total voice movement)"
  - "Optimize" toggle → "Optimize voicing" (verb)
  - "Closed / Open" → "Closed voicing / Open voicing" (noun pair)
  - "Step Chord" instruction → move above the A/B controls
    ("Choose a voicing, audition it, then commit it to advance")
  - Tooltips on every Persona name (3-word role hint)
  - Tooltips on every transport icon (currently symbolic)

**Why this:** every small label fix reduces the cognitive load the
teardown correctly diagnosed. No state changes, no feature work.

**Blast radius:** small. ~30 tooltip additions + ~10 label changes.

**Test surface:** none new (tooltips are visual; capture with
playwright only if you want).

---

### G. Mastery / performance log

**What:** A small persistence layer (`src/lib/performanceLog.ts`)
that records one entry per take:

  - timestamp
  - path id + bar range
  - tempo
  - "transitions hit" / "transitions missed" (guide-tone count
    of 3rds and 7ths landed vs missed, from the classifier in
    option C)
  - "first-try vs rep #3" snapshot
  - free-text self-rating (1-5)

Read side: a "Recent takes" panel under the masterclass picker.
Diff: a "Your take on Bar 4 was 80% on guide tones; last week's
was 65%."

**Why this is NOT in the recommended top three:** it's the biggest
single feature in the teardown, it requires schema migration, and
it has no value until the guide-tone classifier (option C) is
shipping real data into it. Don't start this until C is live for
2 weeks and you have feedback on whether the metric is even the
right one.

**Blast radius:** large. New persistence schema, migration story,
new UI panel, new API to compare takes.

**Defer to a future sprint, after C is validated.**

---

### H. Multi-workspace routing (Practice / Explore / Create / Record)

**What:** React Router or hash-based switching between 4 surfaces.
Each surface contains only its relevant controls.

**Why I'm NOT recommending this:** adds navigation state, requires
hoisting practice-loop state into a context or store, and moves
every component into a route folder. The teardown's outcome (one
clear practice loop) is achievable with option A (progressive
disclosure in a single screen) at ~1/4 the blast radius. The 4-
workspace split is the right answer if the app grows to 4 distinct
product surfaces; today it doesn't, and the JSX reorganization in
option A captures the user-perceived win without the routing cost.

**Skip unless A proves insufficient.**

---

## Recommended order

1. **B (per-path briefings)** — cheapest, fastest clarity win.
2. **A (practice-loop top)** — biggest UX win for the user.
3. **F (tooltips + terminology)** — quick cleanup while A's refactor
   is fresh.
4. **C (guide-tone feedback)** — new value; needs A so the feedback
   lands in the right place.
5. **D (path filters)** — depends on C being live so filters have
   something interesting to filter (curate during C).
6. **E (3-persona behavioral lens)** — proof of concept; pick three,
   ship three.
7. **G (mastery log)** — only after C has 2 weeks of data.
8. **H (workspaces)** — only if A is shown insufficient.

## Out of scope for this round

  - Multi-page / route split (H) — defer
  - Full persona curation (E full version) — defer; 3-persona POC
  - Take-comparison UI / timing heat map — wait for mastery layer
  - Take parser for full rhythm / contour feedback — wait for C data
  - Beginner orientation 4-button chooser — wait for briefing data
