# TODO — Harmonic Study Engine, Phase 6 polish

Context: Phase 5 leftovers all closed (sequenceStepper, keyDrift, name
alias, MIDI IN listener). Local dev stack: vite on :5174, ddsp backend
on :8765 (verified HTTP 200).

Each item below should fit in one agent iteration (≤30 min). Mark
completed items `- [x]` to stop the loop.

## Open tasks

- [x] **DRY theory helpers** — `transposeChordName` + `NOTE_WHEEL` are
      duplicated verbatim in `App.tsx:68-101` and
      `LiveScoreDisplay.tsx:8-41`. Hoist to `theory.ts` as
      `transposeChordName(name, shift)` and `NOTE_NAMES_SHARP`. Update
      both call sites to import. Verifies tsc stays clean.

- [x] **Migrate hand-rolled modals to ModalShell** —
      `App.tsx:2976-2999` (Lead Sheet + Keyboard Shortcuts cheatsheet)
      render with raw `<div className="fixed inset-0 bg-black/70...">`
      and bypass `ModalShell`. Replace both backdrops with
      `<ModalShell labelledBy onDismiss>` for aria-modal + focus trap.

- [x] **MobileCommandBar "More" sheet → real modal** — lacks focus trap,
      `aria-modal`, Escape handler. Wrap in `ModalShell` (or lift a
      small `MobileSheet` helper). Click-outside-to-close would be nice.

- [x] **`usePersistedState<T>` hook** — replace 22 `try { localStorage.* }`
      blocks in `App.tsx:114-139, 930-1004` with a typed hook parallel
      to `useHistory`. Cuts ~120 lines, fixes stale-path migration.

- [x] **`tsconfig.json` strict mode** — add `"strict": true`,
      `"noImplicitAny": true`, `"strictNullChecks": true`. Surface ~12
      real bugs hiding behind `: any`. Fix in the same PR.

- [x] **Enable 2-3 masterclass tunes** — `masterclass.ts:36-200` has 39
      of 40 entries with `inApp: false`. Pick Solar / Cherokee /
      Stella, add 8-bar HarmonicPath entries in `paths.ts`, flip
      `inApp: true`. README boasts "33 working tunes" — only 1 works.

- [x] **CHANGELOG.md + `.editorconfig` + `.prettierrc`** — basic toolchain.
      ~10 min combined.

- [x] **sequenceStepper for Tchaikovsky** — When active persona =
      tchaikovsky AND active path has `sequenceStepper: true` (sequence_ascent
      already has it), the arpeggiator should auto-step the chord up by
      `sequenceInterval` (2 semitones for sequence_ascent) every bar. Wire via
      a per-bar transpose override that sits on top of the existing
      transposeShift. Test: load tchaikovsky persona, sequence_ascent path,
      set arp to "up" or "random", play — bars should climb Dm → Em → F#m → G.

- [x] **keyDrift for Mahler** — progressive_tonality path has
      `key: "D minor → C major"`. Implement per-step transpose shift that
      drifts from start to end key across the path's bars. Simplest: derive
      a per-bar shift from the path's `key` string (parse "X → Y") and add
      it to transposeShift before `applyVoicing`. Test: load mahler persona,
      progressive_tonality path, confirm the chord names in the bar strip
      visibly drift (e.g. Dm → Dbm → Cm area).

- [x] **Fix LiveScoreDisplay path.name regression** — `src/components/LiveScoreDisplay.tsx:121`
      reads `path.name`. We added `name?: string` to HarmonicPath as an
      alias of `title` for compat. EITHER populate `name` everywhere
      (paths.ts, studies.ts) from `title`, OR change the read site to
      `path.title`. Verify tsc stays clean.

- [x] **MIDI input listener** — `src/lib/midiOut.ts` outputs to MIDI; the
      reverse direction (input) does not exist. Add a `MidiInput` wrapper
      that subscribes to Web MIDI input events, normalizes to MIDI note
      numbers, and emits via a CustomEvent ("midin") on `window`. Surface
      in App.tsx with a small "MIDI: listening" indicator when an input
      device is connected. Do NOT auto-detect chords (out of scope) — just
      the listener + indicator.

## Constraints (read LOOP-PROMPT.md before each iteration)

- **Never** kill sibling processes (Hermes WhatsApp bridge owns :3000).
  Vite must run on :5174.
- **Never** commit secrets or `.env` files.
- **Always** run `npm run lint` and `npm run build` before committing.
  Both must pass.
- **Always** verify changes reach the dist bundle via
  `grep -o "<id>" dist/assets/index-*.js`.
- If a task would require >1 iteration, split it BEFORE starting the work.

## Post-loop verification

After all tasks are `- [x]`, run `npm run lint && npm run build` and
verify the live dev server (vite :5174) returns the expected strings.