# MIDI Channel-Split for Bass - Feature Spec

## Goal

On a single MIDI input device, notes on a configurable "bass channel"
(default 2) are treated as bass input; everything else (channel 1 by
convention) keeps feeding the guide-tone practice loop. A small "BASS CH"
select in the header toolbar next to the IN picker lets the user pick the
bass channel so a Stick, bass-pedal, or any two-channel controller "just
works" without a second Web MIDI device.

## Why

`src/lib/midiIn.ts:137` masked off the low nibble of the MIDI status byte
(`status = msg.data[0] & 0xf0`), so notes on channels 2-16 were
indistinguishable from channel 1. Bass notes got counted in the
`useGuideToneTrail` tally alongside melody, corrupting the practice feedback.

## Already shipped on disk (this feature)

### 1. `src/lib/midiIn.ts` - expose the channel on incoming events
Added `channel: number` (1-16, human convention) to `MidiInEvent` and
the `window` "midin" CustomEvent detail. Parsed with
`const channel = (msg.data[0] & 0x0f) + 1;`. The existing Real-Time
passthrough and selected-input filter are unchanged.

### 2. `src/lib/midiOut.ts` - fan out the channel to input listeners
`wireInputs()` parses the channel from the status byte and passes it as
the third argument to the input-fan-out callbacks:
`onNoteOn(midi, velocity, channel)` / `onNoteOff(midi, channel)`.
Backward compatible - existing callers that ignore the extra argument
keep working unchanged. The OUTPUT side (`playNote` / `stopNote`) is
intentionally unchanged (single channel 1); output channel routing is
out of scope for this feature.

### 3. `src/hooks/useGuideToneTrail.ts` - exclude bass-channel notes
The hook now accepts an optional `bassChannel` parameter
(`useGuideToneTrail(chordNotes, bassChannel)`). When set, note-ons
whose channel equals `bassChannel` are dropped before classification
so the tally reflects only the upper / melody channel. `null` /
`undefined` preserves the pre-split behavior (count everything).

### 4. `src/lib/useBassNotes.ts` - merge live bass MIDI into the piano layer
The hook subscribes to BOTH `backingEngine.onBassNotes` (the synthesized
backing bass stream, preserved as-is) AND `midiOut.onNoteOn` /
`onNoteOff` filtered to the configured bass channel (default 2). The
returned set is the union, so the piano's amber bass layer lights up
whether the note came from the backing track or from the player's own
bass-channel controller. Both subscriptions clean up on unmount.

### 5. `src/App.tsx` - header UI + persisted config
A new `bassMidiChannel` state lives in `usePersistedState` (key
"bassMidiChannel", default 2) so a Stick / bass-pedal setup survives
reload. It's passed into both `useBassNotes(bassMidiChannel)` and
`useGuideToneTrail(currentChordNotes, bassMidiChannel)`. The header
toolbar gains a small "BASS CH" chip matching the existing visual
language (`bg-neutral-900/50`, neutral-800 border, status dot that
turns green when a bass channel is active, gray otherwise). Options
1-16; tooltip explains "Channel 1 = melody / guide tones, chN = bass".

### 6. `src/components/MidiInPicker.tsx` - status shows channel
The transient note-status string now includes the channel:
`♪ A4 v96 · ch2`. Cheap visual confirmation that the player's
controller is sending on the expected channel.

## Data Flow

```
        MIDI Input Device (ch1 = upper, ch2 = bass)
                          |
                          v
                src/lib/midiIn.ts
                  parse channel nibble
                          |
                          v
              window "midin" CustomEvent { ..., channel }
                          |
                          v
                src/lib/midiOut.ts
                  wireInputs() fan-out to listeners
                          |
                +---------+--------+
                v                  v
        useGuideToneTrail     useBassNotes
        (drop if              (keep if
         channel ==            channel ==
         bassChannel)          bassChannel)
                |                  |
                v                  v
       guide-tone tally    merged bass set (backing
       (melody only)        engine + live MIDI bass)
                                   |
                                   v
                          PianoKeyboard bass layer
```

## Tests (vitest)

- `src/lib/midiIn.test.ts` (jsdom) - new "channel parsing" describe with
  three pins: note-on 0x90 -> channel 1; note-on 0x91 -> channel 2;
  note-off 0x81 -> channel 2 + type "noteoff". The existing
  Real-Time passthrough suite still passes unchanged.
- `src/hooks/useGuideToneTrail.test.ts` (jsdom) - two new pins: with
  `bassChannel=2`, ch2 note-ons are excluded from the tally while ch1
  note-ons still count; without `bassChannel`, ch2 note-ons still
  count (backward compat).
- `tests/useBassNotes.test.ts` (jsdom) - extended with a `midiOut`
  stub. Seven new pins: subscribes to midiOut on mount; merges
  incoming bass-channel note-ons; ignores non-bass channels; respects
  a different bass channel (ch10); removes live bass on note-off;
  ignores non-bass note-offs; cleans up subscriptions on unmount. All
  existing pinning tests continue to pass.

All three test files were already in `JSDOM_FILES` in
`vitest.config.ts`. No config change needed.

## Gates (AGENTS.md order, all must exit 0)

```
npm run lint          # tsc --noEmit
npm test              # vitest run (expect 899+ passed, 1 skipped, + new pins)
npm run build         # vite.rnn build + vite build
npm run check:paths   # bar-count invariant (untouched)
```

## Constraints

- Pure ASCII source files. No em-dash, no curly quotes, no CJK. Plain
  hyphens and straight quotes in comments (project-wide rule; see
  docs/midiClock-feature.md).
- Do NOT change `MidiClockFollower` (`src/lib/midiClock.ts`) or its
  public API.
- Do NOT change the output side of `midiOut` (`playNote` / `stopNote`
  stay channel 1).
- Do NOT touch the Real-Time passthrough in `midiIn.ts`.
- Backward compatibility: existing `midiOut.onNoteOn` / `onNoteOff`
  callers must keep working with the new signature (extra channel
  argument is ignored by old callers).
- React components are intentionally NOT unit-tested (project
  convention). No new component tests.
- `console.log/info/debug` banned in `src/`
  (`tests/no-debug-logs.test.ts`).

## Commit

Style: `feat(midi): channel-split bass input - chN bass vs ch1 guide tones`.
Push to current branch.
