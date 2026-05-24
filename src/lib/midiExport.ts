import { HarmonicPath } from './paths';
import MidiWriter from 'midi-writer-js';

export function exportToMidiFile(path: HarmonicPath): string {
  const track = new MidiWriter.Track();
  
  track.addEvent(new MidiWriter.ProgramChangeEvent({instrument: 1}));
  track.setTempo(120);

  for (const step of path.steps) {
    // Treat each step as a whole note for simplicity, or half note
    const notes = step.notes;
    // pitches can be converted to midi pitches, midi-writer-js takes strings like 'C4' or numbers
    track.addEvent(new MidiWriter.NoteEvent({pitch: notes, duration: '2'}));
  }

  const write = new MidiWriter.Writer(track);
  return write.dataUri();
}
