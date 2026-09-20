# MIDI Clock Sync from DAW - Feature Spec

## Goal
Slave the app's tempo + transport to a DAW's MIDI Real-Time clock (24 PPQN:
0xF8 tick, 0xFA start, 0xFB continue, 0xFC stop). User enables a toggle near
the existing MidiInPicker; tempo + transport then follow the DAW.

## Already shipped on disk (do NOT rewrite)
- `src/lib/midiClock.ts` - pure `MidiClockFollower` class (6299 B, ASCII-clean).
  Verified: `npm run lint` exit 0, vitest 78 files / 905 passed. 6/6 on the
  dedicated `src/lib/midiClock.test.ts`. Build green.
  API: `tick(nowMs)`, `start()`, `continueTransport()`, `stop()`, `reset()`,
  `onBpm(cb)`, `onTransport(cb)`, `snapshot()`, options
  (`warmupTicks`, `smoothing`, `minBpm`, `maxBpm`, `maxGapMs`, `bpmDeadband`,
  `minPublishIntervalMs`, `ppqn`).

## Deliverables (this task)

### 1. `src/lib/midiIn.ts` - add Real-Time passthrough
DO NOT modify existing note-handling behavior (the file already handles 0x90/
0x80). ADD a single `window.dispatchEvent(new CustomEvent("midiclock",
{ detail }))` for status bytes 0xF8/0xFA/0xFB/0xFC. Pass through a
monotonic timestamp via `performance.now()`. Detail shape:
```
{ kind: "tick" | "start" | "continue" | "stop", atMs: number }
```
Guard with `typeof window !== "undefined"` so node tests still load.

### 2. `src/App.tsx` - opt-in MIDI Clock toggle
Add a checkbox/toggle in the same panel as `MidiInPicker` (label: "MIDI clock
from DAW" or similar). When ON:
- Instantiate one `MidiClockFollower` (useRef).
- Add a window listener for the `"midiclock"` CustomEvent and route:
  - detail.kind === "tick"     -> follower.tick(detail.atMs)
  - detail.kind === "start"    -> follower.start()
  - detail.kind === "continue" -> follower.continueTransport()
  - detail.kind === "stop"     -> follower.stop()
- Subscribe to `follower.onBpm(bpm)` -> clamp into `[40, 240]` then call the
  existing tempo setter (`setTempo` / `setPlaybackBpm` - whichever App.tsx
  already exposes for its tempo slider). Throttle is handled inside the
  follower; no extra gating needed.
- Subscribe to `follower.onTransport(kind)` -> start/stop the audio engine
  and update the existing play-state state (`setIsPlaying`/`setTransport`).
- Cleanup on unmount and on toggle-off: remove listeners, follower.reset().

Keep the toggle OFF by default (no behavior change for existing users).

### 3. Tests (vitest, node + jsdom)
- `src/lib/midiIn.test.ts`: feed synthetic MIDI bytes via the Web MIDI test
  shim (see existing `tests/` patterns) and assert the dispatched
  CustomEvent detail for 0xF8/0xFA/0xFB/0xFC. Since `midiIn.ts` now touches
  `window`, this test is jsdom - add its path to `JSDOM_FILES` in
  `vitest.config.ts` per AGENTS.md.
- Optional smoke: an integration test that drives `MidiClockFollower` end
  to end through 60 stable ticks at 120 BPM and asserts snapshot.bpm in
  [118, 122] (the existing per-class tests already cover this; do not
  duplicate).

### 4. Gates (AGENTS.md order, all must exit 0)
```
npm run lint          # tsc --noEmit
npm test              # vitest run
npm run build         # vite rnn build + vite build
npm run check:paths   # bar-count invariant (untouched)
```

### 5. Commit + push
Style: `feat(midi): sync tempo + transport from DAW MIDI clock`.
Push to current branch.

## Constraints
- Pure ASCII source files. No em-dash, no curly quotes, no CJK. Plain
  hyphens and straight quotes in comments. (Disk files that violate this
  have been a real cost on this project already.)
- Do NOT touch existing note-handling code in `midiIn.ts`.
- Do NOT change the public API of `MidiClockFollower` (it is already
  tested + linted + green).
- Do NOT add to `vitest.config.ts` anything beyond the single
  `JSDOM_FILES` entry needed for the new midiIn test.
