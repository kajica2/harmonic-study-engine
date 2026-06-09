import { RecordedNote } from "./recorder";
import MidiWriter from "midi-writer-js";

// Transpositions (in semitones)
export const TRANSPOSITIONS = {
  Concert: 0,
  Bb: 2, // Bb instrument reads 2 semitones higher than concert pitch
  F: 7, // F instrument reads 7 semitones higher
};

export type InstrumentPitch = keyof typeof TRANSPOSITIONS;
export type ClefPrefs = "treble" | "bass" | "both";

function midiToABCName(midiPitch: number): string {
  // ABC notes: C, D, E, F, G, A, B
  const noteNames = [
    "C",
    "^C",
    "D",
    "^D",
    "E",
    "F",
    "^F",
    "G",
    "^G",
    "A",
    "^A",
    "B",
  ];
  const name = noteNames[midiPitch % 12];
  const octave = Math.floor(midiPitch / 12) - 1; // midi 60 = C4

  // In ABC: C, = C2, C = C3, c = C4, c' = C5
  let abcStr = name;
  if (octave === 2) abcStr = name + ",";
  else if (octave === 3) abcStr = name;
  else if (octave === 4) abcStr = name.toLowerCase();
  else if (octave >= 5) abcStr = name.toLowerCase() + "'".repeat(octave - 4);
  else if (octave <= 1) abcStr = name + ",".repeat(3 - octave);

  return abcStr;
}

export function generateABCString(
  notes: RecordedNote[],
  tempo: number,
  instrument: InstrumentPitch,
  clefs: ClefPrefs,
): string {
  // Group notes into chords by rough start time
  // sort by start time
  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);

  const groups: { startTime: number; pitches: number[] }[] = [];

  for (const n of sorted) {
    // find if there's a group within 0.1s
    const group = groups.find((g) => Math.abs(g.startTime - n.startTime) < 0.1);
    const transposedPitch = n.pitch + TRANSPOSITIONS[instrument];

    if (group) {
      if (!group.pitches.includes(transposedPitch)) {
        group.pitches.push(transposedPitch);
      }
    } else {
      groups.push({ startTime: n.startTime, pitches: [transposedPitch] });
    }
  }

  // Generate ABC
  let abc = `X:1\n`;
  abc += `T:Synesthesia Recording\n`;
  abc += `M:4/4\n`;
  abc += `L:1/4\n`;
  abc += `Q:1/4=${tempo}\n`;
  abc += `K:C\n`;

  if (clefs === "both") {
    abc += `%%score { (T B) }\n`;
    abc += `V:T clef=treble\n`;
    abc += `V:B clef=bass\n`;
  } else if (clefs === "bass") {
    abc += `V:1 clef=bass\n`;
  } else {
    abc += `V:1 clef=treble\n`;
  }

  let lineT = "";
  let lineB = "";
  let line1 = "";

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    // Sort pitches
    g.pitches.sort((a, b) => a - b);

    if (clefs === "both") {
      const treblePitches = g.pitches.filter((p) => p >= 60);
      const bassPitches = g.pitches.filter((p) => p < 60);

      lineT +=
        treblePitches.length > 0
          ? `[${treblePitches.map(midiToABCName).join("")}] `
          : `z `;
      lineB +=
        bassPitches.length > 0
          ? `[${bassPitches.map(midiToABCName).join("")}] `
          : `z `;
    } else {
      line1 += `[${g.pitches.map(midiToABCName).join("")}] `;
    }
  }

  if (clefs === "both") {
    abc += `[V:T] ${lineT}\n`;
    abc += `[V:B] ${lineB}\n`;
  } else {
    abc += `[V:1] ${line1}\n`;
  }

  return abc;
}

export function generateMidiDataUri(
  notes: RecordedNote[],
  tempo: number,
): string {
  const track = new MidiWriter.Track();
  track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: 1 }));
  track.setTempo(tempo);

  // Group notes into chords by rough start time
  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);
  const groups: { startTime: number; pitches: number[] }[] = [];

  for (const n of sorted) {
    const group = groups.find((g) => Math.abs(g.startTime - n.startTime) < 0.1);
    if (group) {
      if (!group.pitches.includes(n.pitch)) group.pitches.push(n.pitch);
    } else {
      groups.push({ startTime: n.startTime, pitches: [n.pitch] });
    }
  }

  for (const g of groups) {
    track.addEvent(
      new MidiWriter.NoteEvent({ pitch: g.pitches, duration: "4" }),
    );
  }

  const write = new MidiWriter.Writer(track);
  return write.dataUri();
}
