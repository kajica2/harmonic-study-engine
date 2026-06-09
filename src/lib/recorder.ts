import { audioEngine } from "./audio";
import { rhythmEngine } from "./rhythm";

export interface RecordedNote {
  pitch: number;
  startTime: number; // in seconds or beats
  duration: number; // in seconds or beats
}

class MidiRecorder {
  private isRecording = false;
  private startTime = 0;
  private activeNotes: Map<number, number> = new Map();
  public notes: RecordedNote[] = [];

  start() {
    this.isRecording = true;
    this.startTime = Date.now();
    this.notes = [];
    this.activeNotes.clear();
  }

  stop() {
    this.isRecording = false;
    // Close any open notes
    const now = Date.now();
    for (const [pitch, start] of this.activeNotes.entries()) {
      this.notes.push({
        pitch,
        startTime: (start - this.startTime) / 1000,
        duration: (now - start) / 1000,
      });
    }
    this.activeNotes.clear();
  }

  get isRunning() {
    return this.isRecording;
  }

  recordNoteOn(pitch: number) {
    if (!this.isRecording) return;
    this.activeNotes.set(pitch, Date.now());
  }

  recordNoteOff(pitch: number) {
    if (!this.isRecording) return;
    const start = this.activeNotes.get(pitch);
    if (start !== undefined) {
      this.notes.push({
        pitch,
        startTime: (start - this.startTime) / 1000,
        duration: (Date.now() - start) / 1000,
      });
      this.activeNotes.delete(pitch);
    }
  }

  // To make simple chords
  recordChord(pitches: number[], durationSecs: number) {
    if (!this.isRecording) return;
    const now = Date.now();
    for (const pitch of pitches) {
      this.notes.push({
        pitch,
        startTime: (now - this.startTime) / 1000,
        duration: durationSecs,
      });
    }
  }
}

export const recorder = new MidiRecorder();
