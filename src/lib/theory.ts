export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function getMidiFromNoteName(noteName: string): number {
  const noteContent = noteName.match(/([A-G]#?)(\d)/);
  if (!noteContent) return 60;
  
  const [, note, octave] = noteContent;
  const noteIndex = NOTE_NAMES.indexOf(note);
  return noteIndex + (parseInt(octave) + 1) * 12;
}

export function getNoteNameFromMidi(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const noteName = NOTE_NAMES[midi % 12];
  return `${noteName}${octave}`;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Synesthesia Color Mappings based loosely on Scriabin / Kandinsky color theory ideas
// C = Red, C# = Red/Violet, D = Yellow, D# = Steel Blue, E = Pearly White / Blue, F = Dark Red, F# = Blue, G = Orange, G# = Purple, A = Green, A# = Rose, B = Blue
export const PITCH_COLORS: Record<string, string> = {
  'C': '#E23D28', // Red
  'C#': '#9328E2', // Magenta/Violet
  'D': '#F1C40F', // Yellow
  'D#': '#6A809C', // Steel Blue
  'E': '#9BCCFF', // Light Blue/Pearly
  'F': '#8B0000', // Dark Red
  'F#': '#2980B9', // Deep Blue
  'G': '#E67E22', // Orange
  'G#': '#8E44AD', // Purple
  'A': '#27AE60', // Green
  'A#': '#FF69B4', // Rose/Hot Pink
  'B': '#1ABC9C', // Teal / Aquamarine
};

export const getColorForNote = (midi: number): string => {
  const note = NOTE_NAMES[midi % 12];
  return PITCH_COLORS[note] || '#CCC';
};

export const getShapeForNote = (midi: number): 'circle' | 'triangle' | 'square' | 'line' => {
  const pitchClass = midi % 12;
  // Map interval structures to shapes (arbitrary synesthesia mapping)
  if ([0, 7].includes(pitchClass)) return 'circle'; // stable (Roots, Fifths)
  if ([2, 4, 9].includes(pitchClass)) return 'square'; // somewhat stable (2nd, 3rds, 6ths)
  if ([1, 6, 11].includes(pitchClass)) return 'triangle'; // dissonant (m2, Tritone, M7)
  return 'line';
};

export function applyVoiceLeading(prevNotes: number[], targetNotes: number[]): number[] {
  if (prevNotes.length === 0) return targetNotes;
  
  const targetBass = Math.min(...targetNotes);
  const targetPCs = targetNotes.filter(n => n !== targetBass).map(n => n % 12);
  
  const prevBass = Math.min(...prevNotes);
  const prevUpper = prevNotes.filter(n => n !== prevBass).sort((a,b)=>a-b);
  
  if (prevUpper.length === 0) return targetNotes;
  
  let newNotes = [targetBass];
  
  let availableTargetPCs = [...targetPCs];
  
  // Greedily match each prevUpper to the closest available target PC
  for (const p of prevUpper) {
    if (availableTargetPCs.length === 0) break;
    
    let bestPCIndex = -1;
    let minDistance = Infinity;
    let bestNote = -1;
    
    for (let i = 0; i < availableTargetPCs.length; i++) {
      const pc = availableTargetPCs[i];
      // closest octave for pc to p
      const nearestOctaveNote = p - (p % 12) + pc;
      const candidates = [nearestOctaveNote - 12, nearestOctaveNote, nearestOctaveNote + 12];
      for (const cand of candidates) {
        if (cand <= targetBass) continue;
        const dist = Math.abs(cand - p);
        if (dist < minDistance) {
          minDistance = dist;
          bestPCIndex = i;
          bestNote = cand;
        }
      }
    }
    
    if (bestPCIndex !== -1) {
      newNotes.push(bestNote);
      availableTargetPCs.splice(bestPCIndex, 1);
    }
  }
  
  // If there are leftover target PCs, place them close to the average of newNotes
  const avg = newNotes.length > 1 ? newNotes.slice(1).reduce((a,b)=>a+b,0)/(newNotes.length-1) : targetBass + 12;
  for (const pc of availableTargetPCs) {
    let minDistance = Infinity;
    let bestNote = pc + 48;
    for (let oct = 2; oct <= 6; oct++) {
      const cand = pc + oct * 12;
      if (cand <= targetBass) continue;
      const dist = Math.abs(cand - avg);
      if (dist < minDistance) {
        minDistance = dist;
        bestNote = cand;
      }
    }
    newNotes.push(bestNote);
  }
  
  return Array.from(new Set(newNotes)).sort((a,b) => a - b);
}
