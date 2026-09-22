/**
 * src/lib/midiIn.test.ts - jsdom test for the MIDI Real-Time passthrough
 * added on top of the existing note-on / note-off handling in midiIn.ts.
 *
 * The four MIDI 1.0 Real-Time messages (0xF8 tick, 0xFA start, 0xFB
 * continue, 0xFC stop) are 1-byte system messages. The pre-existing
 * handleMessage() bailed on msg.data.length < 2, so they were silently
 * dropped; the new branch dispatches a window CustomEvent "midiclock"
 * with detail { kind, atMs } so a downstream MidiClockFollower (see
 * src/lib/midiClock.ts) can slave the app's tempo + transport to a
 * DAW. This file pins the four dispatched event kinds and proves the
 * detail shape.
 *
 * NOTE: this file runs in the jsdom project (added to JSDOM_FILES in
 * vitest.config.ts). Vitest 5 multi-project mode ignores per-file
 * `// @vitest-environment jsdom` banners, so the global config is
 * the source of truth.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { midiIn, type MidiInEvent } from "./midiIn";

/** Detail shape dispatched on window for each Real-Time byte. Mirrors
 *  the docs/midiClock-feature.md contract. ASCII only. */
interface MidiClockDetail {
  kind: "tick" | "start" | "continue" | "stop";
  atMs: number;
}

/** Iteratable that yields the bound MIDI input ports. The shim
 *  installs this on the fake MIDI access returned by
 *  `navigator.requestMIDIAccess`. */
class IterableInputs {
  constructor(public readonly inputs: any[]) {}
  values(): Iterable<any> {
    return this.inputs;
  }
}

/** A minimal MIDIInputPort shim. Holds the onmidimessage callback the
 *  host (midiIn.ts) binds. */
function makeInput(id: string, name: string): any {
  return { id, name, onmidimessage: null as null | ((msg: any) => void) };
}

/** Install a one-input Web MIDI shim on the current window. Each test
 *  installs a fresh shim with a unique input id so the singleton
 *  midiIn's `boundInputs` set does not skip re-binding across tests.
 *  Returns the bound input so the test can call its onmidimessage. */
function installMidiShim(inputId: string) {
  const input = makeInput(inputId, "Test Input");
  const inputs = new IterableInputs([input]);
  const fakeAccess = {
    inputs,
    onstatechange: null as null | (() => void),
  };
  (window.navigator as unknown as {
    requestMIDIAccess: (opts?: { sysex?: boolean }) => Promise<unknown>;
  }).requestMIDIAccess = async () => fakeAccess;
  return input;
}

describe("midiIn - Real-Time passthrough", () => {
  beforeEach(() => {
    // Reset the per-singleton selectedInputId so the existing note
    // path's filter never gates an unrelated test. Real-Time messages
    // bypass that filter anyway, but this keeps the test shim clean.
    midiIn.selectInput(null);
  });

  it("dispatches a midiclock tick (0xF8) CustomEvent", async () => {
    const input = installMidiShim("rt-tick-1");
    const ok = await midiIn.init();
    expect(ok).toBe(true);
    expect(typeof input.onmidimessage).toBe("function");

    const seen: MidiClockDetail[] = [];
    const handler = (e: Event) =>
      seen.push((e as CustomEvent<MidiClockDetail>).detail);
    window.addEventListener("midiclock", handler);

    input.onmidimessage?.({
      data: new Uint8Array([0xf8]),
      timeStamp: 1234,
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].kind).toBe("tick");
    expect(typeof seen[0].atMs).toBe("number");

    window.removeEventListener("midiclock", handler);
  });

  it("dispatches a midiclock start (0xFA) CustomEvent", async () => {
    const input = installMidiShim("rt-start-1");
    await midiIn.init();

    const seen: MidiClockDetail[] = [];
    const handler = (e: Event) =>
      seen.push((e as CustomEvent<MidiClockDetail>).detail);
    window.addEventListener("midiclock", handler);

    input.onmidimessage?.({
      data: new Uint8Array([0xfa]),
      timeStamp: 1234,
    });

    expect(seen).toEqual([{ kind: "start", atMs: expect.any(Number) }]);

    window.removeEventListener("midiclock", handler);
  });

  it("dispatches a midiclock continue (0xFB) CustomEvent", async () => {
    const input = installMidiShim("rt-continue-1");
    await midiIn.init();

    const seen: MidiClockDetail[] = [];
    const handler = (e: Event) =>
      seen.push((e as CustomEvent<MidiClockDetail>).detail);
    window.addEventListener("midiclock", handler);

    input.onmidimessage?.({
      data: new Uint8Array([0xfb]),
      timeStamp: 1234,
    });

    expect(seen).toEqual([{ kind: "continue", atMs: expect.any(Number) }]);

    window.removeEventListener("midiclock", handler);
  });

  it("dispatches a midiclock stop (0xFC) CustomEvent", async () => {
    const input = installMidiShim("rt-stop-1");
    await midiIn.init();

    const seen: MidiClockDetail[] = [];
    const handler = (e: Event) =>
      seen.push((e as CustomEvent<MidiClockDetail>).detail);
    window.addEventListener("midiclock", handler);

    input.onmidimessage?.({
      data: new Uint8Array([0xfc]),
      timeStamp: 1234,
    });

    expect(seen).toEqual([{ kind: "stop", atMs: expect.any(Number) }]);

    window.removeEventListener("midiclock", handler);
  });

  it("does not dispatch midiclock for non-Real-Time bytes", async () => {
    const input = installMidiShim("rt-noise-1");
    await midiIn.init();

    const seen: MidiClockDetail[] = [];
    const handler = (e: Event) =>
      seen.push((e as CustomEvent<MidiClockDetail>).detail);
    window.addEventListener("midiclock", handler);

    // A Note-On (0x90, 60, 96) - should be ignored by the new RT
    // branch and routed to the existing note path (which also won't
    // dispatch "midiclock").
    input.onmidimessage?.({
      data: new Uint8Array([0x90, 60, 96]),
      timeStamp: 1234,
    });

    expect(seen).toHaveLength(0);

    window.removeEventListener("midiclock", handler);
  });

  it("dispatches multiple kinds in order across a synthetic DAW run", async () => {
    const input = installMidiShim("rt-run-1");
    await midiIn.init();

    const seen: MidiClockDetail[] = [];
    const handler = (e: Event) =>
      seen.push((e as CustomEvent<MidiClockDetail>).detail);
    window.addEventListener("midiclock", handler);

    // 0xFA start, two 0xF8 ticks, 0xFC stop - the typical minimal
    // DAW "press play, send two clocks, press stop" sequence.
    const fire = (b: number) =>
      input.onmidimessage?.({ data: new Uint8Array([b]), timeStamp: 1234 });
    fire(0xfa);
    fire(0xf8);
    fire(0xf8);
    fire(0xfc);

    expect(seen.map((d) => d.kind)).toEqual([
      "start",
      "tick",
      "tick",
      "stop",
    ]);

    window.removeEventListener("midiclock", handler);
  });
});

describe("midiIn - channel parsing", () => {
  beforeEach(() => {
    midiIn.selectInput(null);
  });

  it("parses channel 1 from a 0x90 note-on", async () => {
    const input = installMidiShim("ch-noteon-1");
    await midiIn.init();

    const seen: MidiInEvent[] = [];
    const handler = (e: Event) =>
      seen.push((e as CustomEvent<MidiInEvent>).detail);
    window.addEventListener("midin", handler);

    input.onmidimessage?.({
      data: new Uint8Array([0x90, 60, 96]),
      timeStamp: 1234,
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].channel).toBe(1);
    expect(seen[0].type).toBe("noteon");
    expect(seen[0].note).toBe(60);

    window.removeEventListener("midin", handler);
  });

  it("parses channel 2 from a 0x91 note-on", async () => {
    const input = installMidiShim("ch-noteon-2");
    await midiIn.init();

    const seen: MidiInEvent[] = [];
    const handler = (e: Event) =>
      seen.push((e as CustomEvent<MidiInEvent>).detail);
    window.addEventListener("midin", handler);

    input.onmidimessage?.({
      data: new Uint8Array([0x91, 36, 96]),
      timeStamp: 1234,
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].channel).toBe(2);
    expect(seen[0].type).toBe("noteon");
    expect(seen[0].note).toBe(36);

    window.removeEventListener("midin", handler);
  });

  it("parses channel 2 from a 0x81 note-off", async () => {
    const input = installMidiShim("ch-noteoff-2");
    await midiIn.init();

    const seen: MidiInEvent[] = [];
    const handler = (e: Event) =>
      seen.push((e as CustomEvent<MidiInEvent>).detail);
    window.addEventListener("midin", handler);

    input.onmidimessage?.({
      data: new Uint8Array([0x81, 36, 0]),
      timeStamp: 1234,
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].channel).toBe(2);
    expect(seen[0].type).toBe("noteoff");
    expect(seen[0].note).toBe(36);

    window.removeEventListener("midin", handler);
  });
});
