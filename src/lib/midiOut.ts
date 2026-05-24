export class MidiOut {
  private midiAccess: any = null;
  private selectedOutput: any = null;
  public outputs: any[] = [];
  private listeners: ((outputs: any[]) => void)[] = [];
  private activeNotes: Set<number> = new Set();

  async init() {
    const nav = window.navigator as any;
    if (nav.requestMIDIAccess) {
      try {
        this.midiAccess = await nav.requestMIDIAccess();
        this.updateOutputs();
        this.midiAccess.onstatechange = () => this.updateOutputs();
      } catch (err) {
        console.warn("MIDI Access failed or denied", err);
      }
    }
  }

  private updateOutputs() {
    if (!this.midiAccess) return;
    const outputs = Array.from(this.midiAccess.outputs.values()) as any[];
    this.outputs = outputs;
    this.listeners.forEach(l => l(outputs));
    
    // Auto-select first if none selected, or validation
    if (!this.selectedOutput && outputs.length > 0) {
      this.selectedOutput = outputs[0];
    } else if (this.selectedOutput && !outputs.some(o => o.id === this.selectedOutput.id)) {
      this.selectedOutput = null; // previously selected device was disconnected
    }
  }

  onOutputsChange(listener: (outputs: any[]) => void) {
    this.listeners.push(listener);
    listener(this.outputs);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
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
    midis.forEach(m => this.playNote(m));
  }

  stopChord(midis: number[]) {
    midis.forEach(m => this.stopNote(m));
  }

  stopAll() {
    this.activeNotes.forEach(m => this.stopNote(m));
  }
}

export const midiOut = new MidiOut();
