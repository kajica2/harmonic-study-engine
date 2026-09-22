/**
 * MidiIn — Web MIDI input listener.
 *
 * Singleton. Calls `navigator.requestMIDIAccess({ sysex: false })` and
 * subscribes to NOTE ON / NOTE OFF events on every connected input.
 * Each event dispatches a window CustomEvent "midin" with detail:
 *   {
 *     note: number,       // MIDI note number 0-127
 *     velocity: number,   // 1-127
 *     type: "noteon" | "noteoff",
 *     channel: number,    // MIDI channel 1-16 (human convention)
 *     inputId: string,    // source device id (e.g. for the indicator)
 *     inputName: string,  // source device name
 *     timestamp: number,  // DOMHighResTimeStamp
 *   }
 *
 * Listeners can subscribe via `onMidin(cb)` or via
 * `window.addEventListener("midin", e => ...)`.
 *
 * Auto-selects the first connected input by default. Use
 * `selectInput(id)` to target a specific device.
 *
 * Designed to be SAFE in environments without Web MIDI (Firefox without
 * the extension, older browsers, Safari < 17): init() resolves to
 * `false` and the indicator can show "no input".
 */

export type MidiInEventType = "noteon" | "noteoff";

export interface MidiInEvent {
  note: number;
  velocity: number;
  type: MidiInEventType;
  channel: number;
  inputId: string;
  inputName: string;
  timestamp: number;
}

type Listener = (e: MidiInEvent) => void;

export class MidiIn {
  private midiAccess: any = null;
  private boundInputs: Set<string> = new Set();
  public inputs: { id: string; name: string }[] = [];
  private selectedInputId: string | null = null;
  private listeners: Listener[] = [];
  private onChangeListeners: ((inputs: { id: string; name: string }[]) => void)[] = [];

  async init(): Promise<boolean> {
    const nav = window.navigator as any;
    if (!nav.requestMIDIAccess) return false;
    try {
      this.midiAccess = await nav.requestMIDIAccess({ sysex: false });
      this.bindAllInputs();
      this.midiAccess.onstatechange = () => {
        this.bindAllInputs();
        this.refreshInputs();
      };
      this.refreshInputs();
      return true;
    } catch (err) {
      console.warn("MIDI input access failed or denied", err);
      return false;
    }
  }

  private bindAllInputs() {
    if (!this.midiAccess) return;
    const inputs = this.midiAccess.inputs.values();
    for (const input of inputs) {
      if (this.boundInputs.has(input.id)) continue;
      input.onmidimessage = (msg: any) => this.handleMessage(msg, input);
      this.boundInputs.add(input.id);
    }
  }

  private refreshInputs() {
    if (!this.midiAccess) return;
    const list: { id: string; name: string }[] = [];
    const inputs = this.midiAccess.inputs.values();
    for (const input of inputs) {
      list.push({ id: input.id, name: input.name ?? input.id });
    }
    this.inputs = list;
    if (!this.selectedInputId && list.length > 0) {
      this.selectedInputId = list[0].id;
    } else if (
      this.selectedInputId &&
      !list.some((i) => i.id === this.selectedInputId)
    ) {
      this.selectedInputId = list.length > 0 ? list[0].id : null;
    }
    for (const cb of this.onChangeListeners) cb(list);
  }

  private handleMessage(msg: any, input: any) {
    if (!msg.data || msg.data.length < 1) return;

    // MIDI Real-Time passthrough (1-byte system messages). Run this
    // BEFORE the existing note-on/note-off logic so single-byte RT
    // messages (which would fail the length < 2 guard below) are
    // still seen. Real-Time messages ignore the selected-input
    // filter so a clock-bearing device the user hasn't pinned in
    // the IN picker still drives the tempo follower. Detail shape:
    //   { kind: "tick" | "start" | "continue" | "stop", atMs: number }
    // Guarded with typeof window so node-side consumers (and tests
    // loading this module) do not require a DOM.
    if (typeof window !== "undefined" && msg.data.length >= 1) {
      const raw = msg.data[0];
      if (
        raw === 0xf8 ||
        raw === 0xfa ||
        raw === 0xfb ||
        raw === 0xfc
      ) {
        const kind =
          raw === 0xf8
            ? "tick"
            : raw === 0xfa
              ? "start"
              : raw === 0xfb
                ? "continue"
                : "stop";
        try {
          window.dispatchEvent(
            new CustomEvent("midiclock", {
              detail: { kind, atMs: performance.now() },
            }),
          );
        } catch {
          // CustomEvent unavailable in some test environments.
        }
        return;
      }
    }

    if (msg.data.length < 2) return;
    const status = msg.data[0] & 0xf0;
    const channel = (msg.data[0] & 0x0f) + 1;
    const note = msg.data[1];
    const velocity = msg.data[2] ?? 0;
    // Filter to the selected input when one is set.
    if (this.selectedInputId && input.id !== this.selectedInputId) return;
    let type: MidiInEventType | null = null;
    if (status === 0x90 && velocity > 0) type = "noteon";
    else if (status === 0x80 || (status === 0x90 && velocity === 0)) type = "noteoff";
    if (!type) return;
    const event: MidiInEvent = {
      note,
      velocity,
      type,
      channel,
      inputId: input.id,
      inputName: input.name ?? input.id,
      timestamp: msg.timeStamp ?? performance.now(),
    };
    for (const cb of this.listeners) {
      try {
        cb(event);
      } catch (e) {
        console.error("midiIn listener failed:", e);
      }
    }
    // Also dispatch as a window CustomEvent for cross-cutting listeners.
    try {
      window.dispatchEvent(new CustomEvent("midin", { detail: event }));
    } catch {
      // CustomEvent unavailable in some test environments — listener path
      // still works.
    }
  }

  selectInput(id: string | null) {
    this.selectedInputId = id;
  }

  getSelectedInputId(): string | null {
    return this.selectedInputId;
  }

  onMidin(cb: Listener): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  onInputsChange(cb: (inputs: { id: string; name: string }[]) => void): () => void {
    this.onChangeListeners.push(cb);
    cb(this.inputs);
    return () => {
      this.onChangeListeners = this.onChangeListeners.filter((l) => l !== cb);
    };
  }
}

export const midiIn = new MidiIn();