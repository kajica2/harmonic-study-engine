export class MidiOut {
  private midiAccess: any = null;
  private selectedOutput: any = null;
  public outputs: any[] = [];
  private listeners: ((outputs: any[]) => void)[] = [];
  private activeNotes: Set<number> = new Set();
  // Input side — listeners for incoming note-on / note-off from MIDI
  // devices (EWI, MIDI keyboard, etc.). The browser's MIDIAccess
  // gives us `inputs` alongside `outputs`; we fan out incoming
  // messages to every subscribed listener. Used by the practice-loop
  // guide-tone feedback to classify what the player actually played.
  private inputListeners: {
    onNoteOn: ((midi: number, velocity: number) => void)[];
    onNoteOff: ((midi: number) => void)[];
  } = { onNoteOn: [], onNoteOff: [] };
  private inputs: any[] = [];

  async init() {
    const nav = window.navigator as any;
    if (nav.requestMIDIAccess) {
      try {
        this.midiAccess = await nav.requestMIDIAccess();
        this.updateOutputs();
        this.wireInputs();
        this.midiAccess.onstatechange = () => {
          this.updateOutputs();
          this.wireInputs();
        };
      } catch (err) {
        console.warn("MIDI Access failed or denied", err);
      }
    }
  }

  private updateOutputs() {
    if (!this.midiAccess) return;
    const outputs = Array.from(this.midiAccess.outputs.values()) as any[];
    this.outputs = outputs;
    this.listeners.forEach((l) => l(outputs));

    // Auto-select first if none selected, or validation
    if (!this.selectedOutput && outputs.length > 0) {
      this.selectedOutput = outputs[0];
    } else if (
      this.selectedOutput &&
      !outputs.some((o) => o.id === this.selectedOutput.id)
    ) {
      this.selectedOutput = null; // previously selected device was disconnected
    }
  }

  /**
   * Subscribe every connected MIDI input to a single onmidimessage
   * handler that fans out to the registered input listeners. Called
   * from init() and onstatechange (so a device hot-plugged in
   * after init still feeds the feedback pipeline).
   */
  private wireInputs() {
    if (!this.midiAccess) return;
    const inputs = Array.from(this.midiAccess.inputs.values()) as any[];
    this.inputs = inputs;
    for (const input of inputs) {
      // Avoid double-binding if the same input appears twice in a
      // state-change cycle (some browsers fire onstatechange on
      // brand-new inputs).
      if ((input as any).__hse_wired) continue;
      (input as any).__hse_wired = true;
      input.onmidimessage = (event: any) => {
        const data: Uint8Array = event.data;
        const status = data[0] & 0xf0;
        const midi = data[1];
        const velocity = data[2];
        if (status === 0x90 && velocity > 0) {
          for (const cb of this.inputListeners.onNoteOn) cb(midi, velocity);
        } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
          for (const cb of this.inputListeners.onNoteOff) cb(midi);
        }
      };
    }
  }

  /**
   * Subscribe to incoming note-on events. Returns an unsubscribe
   * function. Symmetric with the existing onOutputsChange API.
   */
  onNoteOn(cb: (midi: number, velocity: number) => void): () => void {
    this.inputListeners.onNoteOn.push(cb);
    return () => {
      this.inputListeners.onNoteOn = this.inputListeners.onNoteOn.filter(
        (l) => l !== cb,
      );
    };
  }

  /**
   * Subscribe to incoming note-off events. Returns an unsubscribe
   * function.
   */
  onNoteOff(cb: (midi: number) => void): () => void {
    this.inputListeners.onNoteOff.push(cb);
    return () => {
      this.inputListeners.onNoteOff = this.inputListeners.onNoteOff.filter(
        (l) => l !== cb,
      );
    };
  }

  /** Number of MIDI inputs currently connected (for the device picker). */
  getInputCount(): number {
    return this.inputs.length;
  }

  onOutputsChange(listener: (outputs: any[]) => void) {
    this.listeners.push(listener);
    listener(this.outputs);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  selectOutput(id: string) {
    if (!this.midiAccess) return;
    this.selectedOutput = this.midiAccess.outputs.get(id) || null;
  }

  getSelectedOutputId(): string | null {
    return this.selectedOutput?.id || null;
  }

  playNote(midi: number, velocity = 80) {
    if (!this.selectedOutput) return;
    try {
      this.selectedOutput.send([0x90, midi, velocity]);
      this.activeNotes.add(midi);
    } catch (e) {
      // ignore
    }
  }

  stopNote(midi: number) {
    if (!this.selectedOutput) return;
    try {
      this.selectedOutput.send([0x80, midi, 0]);
      this.activeNotes.delete(midi);
    } catch (e) {
      // ignore
    }
  }

  playChord(midis: number[]) {
    midis.forEach((m) => this.playNote(m));
  }

  stopChord(midis: number[]) {
    midis.forEach((m) => this.stopNote(m));
  }

  stopAll() {
    this.activeNotes.forEach((m) => this.stopNote(m));
  }
}

export const midiOut = new MidiOut();
