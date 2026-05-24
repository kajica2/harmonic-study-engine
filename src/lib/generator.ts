import { HarmonicPath, HarmonicStep } from './paths';

const BASIC_CHORDS = [
  { name: 'Cmaj', notes: [48, 52, 55, 60], desc: 'Stable major triad.' },
  { name: 'Dm', notes: [50, 53, 57, 62], desc: 'Minor supertonic.' },
  { name: 'Em', notes: [52, 55, 59, 64], desc: 'Minor mediant.' },
  { name: 'Fmaj', notes: [53, 57, 60, 65], desc: 'Bright subdominant.' },
  { name: 'Gmaj', notes: [55, 59, 62, 67], desc: 'Dominant triad.' },
  { name: 'Am', notes: [45, 52, 57, 60], desc: 'Relative minor.' },
  { name: 'G7', notes: [43, 53, 59, 62], desc: 'Dominant 7th tension.' },
  { name: 'Cmaj7', notes: [48, 52, 59, 64], desc: 'Major 7th resolution.' }
];

const INTERMEDIATE_CHORDS = [
  { name: 'Dm9', notes: [50, 53, 57, 60, 64], desc: 'Lush minor 9th.' },
  { name: 'G13', notes: [43, 53, 59, 64, 69], desc: 'Dominant 13th.' },
  { name: 'Ebmaj9', notes: [51, 55, 58, 63, 65], desc: 'Modal interchange flat III.' },
  { name: 'A7(b9)', notes: [45, 55, 61, 64, 66], desc: 'Secondary dominant with tension.' },
  { name: 'Bbmaj7', notes: [46, 53, 57, 62], desc: 'Modal interchange flat VII.' },
  { name: 'Fm7', notes: [53, 56, 60, 63], desc: 'Minor subdominant.' },
  { name: 'E7#9', notes: [52, 56, 62, 67], desc: 'Altered dominant.' }
];

const ADVANCED_CHORDS = [
  { name: 'Db13(#11)', notes: [49, 59, 63, 67, 70], desc: 'Lydian dominant tritone sub.' },
  { name: 'Cmaj7(#5)', notes: [48, 52, 56, 59], desc: 'Augmented major.' },
  { name: 'Gbmaj9(#11)', notes: [54, 61, 65, 70, 72], desc: 'Bright lydian color.' },
  { name: 'B7(b9 b13)', notes: [47, 57, 63, 66, 71], desc: 'Fully altered dominant.' },
  { name: 'Ebm11', notes: [51, 54, 61, 63, 68], desc: 'Dark floating minor.' },
  { name: 'Ab13(b9)', notes: [44, 54, 60, 65, 69], desc: 'Tense chromatic dominant.' },
  { name: 'F#m7(b5)', notes: [54, 57, 60, 64], desc: 'Half-diminished tension.' }
];

export function generateHarmonicPath(lengthLevel: number, complexityLevel: number): HarmonicPath {
  const lengths = [4, 8, 12];
  const length = lengths[lengthLevel - 1] || 4;

  let chordPool = [...BASIC_CHORDS];
  if (complexityLevel >= 2) chordPool = [...chordPool, ...INTERMEDIATE_CHORDS];
  if (complexityLevel >= 3) chordPool = [...chordPool, ...ADVANCED_CHORDS];

  const steps: HarmonicStep[] = [];
  
  // Always start with something grounded if possible, or just random
  const startChord = complexityLevel === 1 
    ? BASIC_CHORDS[0] 
    : chordPool[Math.floor(Math.random() * chordPool.length)];
  
  steps.push({
    name: startChord.name,
    notes: startChord.notes,
    descriptions: `Generated: ${startChord.desc}`
  });

  for (let i = 1; i < length - 1; i++) {
    const nextChord = chordPool[Math.floor(Math.random() * chordPool.length)];
    steps.push({
      name: nextChord.name,
      notes: nextChord.notes,
      descriptions: `Generated progression step. ${nextChord.desc}`
    });
  }

  // End on a resolution or something from the basic pool to feel like home
  const endChord = complexityLevel === 3 ? INTERMEDIATE_CHORDS[0] : BASIC_CHORDS[BASIC_CHORDS.length - 1];
  steps.push({
    name: endChord.name,
    notes: endChord.notes,
    descriptions: 'Generated resolution.'
  });

  return {
    id: `generated-${Date.now()}`,
    title: `Generated Path (Len: ${lengthLevel}, Cpx: ${complexityLevel})`,
    description: `An algorithmically generated progression based on length level ${lengthLevel} and complexity level ${complexityLevel}.`,
    steps
  };
}
