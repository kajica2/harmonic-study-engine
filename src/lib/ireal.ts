import { HarmonicPath, HarmonicStep } from './paths';

export function parseChordToMidi(chordSymbol: string, baseOctave = 4): number[] | null {
  const slashSplit = chordSymbol.split('/');
  const mainSymbol = slashSplit[0];
  const bassSymbol = slashSplit[1];

  const match = mainSymbol.match(/^([A-G][b#]?)(.*)$/i);
  if (!match) return null;
  
  let rootStr = match[1];
  rootStr = rootStr.charAt(0).toUpperCase() + rootStr.slice(1).toLowerCase();
  let qualityStr = match[2] || '';

  const notesList = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const flats: Record<string, string> = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
  const rootNoteName = flats[rootStr] || rootStr;
  const baseNote = notesList.indexOf(rootNoteName) + (baseOctave * 12);
  if (baseNote < 0) return null;

  let intervals = [0, 4, 7]; // Default Major
  
  qualityStr = qualityStr.replace(/\^/g, 'maj').replace(/-/g, 'm').replace(/h/g, 'm7b5').replace(/ø/g, 'm7b5').replace(/o/g, 'dim');
  
  if (qualityStr.startsWith('m7b5')) intervals = [0, 3, 6, 10];
  else if (qualityStr.startsWith('m') || qualityStr.startsWith('min')) {
     if (qualityStr.includes('maj7')) intervals = [0, 3, 7, 11];
     else if (qualityStr.includes('7')) intervals = [0, 3, 7, 10];
     else if (qualityStr.includes('9')) intervals = [0, 3, 7, 10, 14];
     else intervals = [0, 3, 7];
  }
  else if (qualityStr.startsWith('dim')) {
      if (qualityStr.includes('7')) intervals = [0, 3, 6, 9];
      else intervals = [0, 3, 6];
  }
  else if (qualityStr.startsWith('aug') || qualityStr.startsWith('+')) intervals = [0, 4, 8];
  else if (qualityStr.startsWith('sus4')) intervals = [0, 5, 7];
  else if (qualityStr.startsWith('sus2')) intervals = [0, 2, 7];
  else if (qualityStr.includes('maj7') || qualityStr.includes('M7')) intervals = [0, 4, 7, 11];
  else if (qualityStr.includes('maj9')) intervals = [0, 4, 7, 11, 14];
  else if (qualityStr.startsWith('7')) intervals = [0, 4, 7, 10];
  else if (qualityStr.startsWith('9')) intervals = [0, 4, 7, 10, 14];
  else if (qualityStr.startsWith('13')) intervals = [0, 4, 7, 10, 14, 21];

  if (qualityStr.includes('b5')) intervals[2] = 6;
  if (qualityStr.includes('#5')) intervals[2] = 8;
  if (qualityStr.includes('b9')) intervals.push(13);
  if (qualityStr.includes('#9')) intervals.push(15);
  if (qualityStr.includes('#11')) intervals.push(18);

  let finalNotes = Array.from(new Set(intervals)).map(i => baseNote + i);

  if (bassSymbol) {
     const bMatch = bassSymbol.match(/^([A-G][b#]?)/i);
     if (bMatch) {
         let bRoot = bMatch[1];
         bRoot = bRoot.charAt(0).toUpperCase() + bRoot.slice(1).toLowerCase();
         bRoot = flats[bRoot] || bRoot;
         let bNote = notesList.indexOf(bRoot) + (baseOctave * 12);
         while (bNote >= finalNotes[0]) bNote -= 12; // ensure lower than the main root
         finalNotes.unshift(bNote);
     }
  }

  // Final dedup and sort
  return Array.from(new Set(finalNotes)).sort((a, b) => a - b);
}

export function importIReal(text: string): HarmonicPath | null {
  let rawChords = text;
  let title = "Imported Progression";
  
  const irealMatch = text.match(/ireal(?:book|pro):\/\/(.*)/);
  if (irealMatch) {
    const parts = decodeURIComponent(irealMatch[1]).split('=');
    if (parts.length > 0) title = parts[0];
    const chordPart = parts.find(p => p.includes('[') || p.includes('|')); 
    if (chordPart) rawChords = chordPart;
  }
  
  const cleaned = rawChords
    .replace(/T\d{2}/g, ' ')
    .replace(/\*[A-Z]/g, ' ')
    .replace(/N\d/g, ' ')
    .replace(/[\[\]{}|<>\(\)lxZ,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = cleaned.split(' ');
  const steps: HarmonicStep[] = [];
  
  for (const token of tokens) {
    if (!token || token.match(/^[WQYp]$/i)) continue;
    
    // Might have combined chords in rare cases, just parse directly
    const notes = parseChordToMidi(token);
    if (notes && notes.length > 0) {
      steps.push({
        name: token,
        notes,
        descriptions: 'Imported chord'
      });
    }
  }
  
  if (steps.length === 0) return null;
  
  return {
    id: `imported-${Date.now()}`,
    title,
    description: 'Imported from text/iRealBook.',
    steps
  };
}

export function exportIReal(path: HarmonicPath): string {
  const chords = path.steps.map(s => s.name.replace(/maj/g, '^').replace(/m/g, '-')).join(' |');
  const title = encodeURIComponent(path.title);
  return `irealpro://${title}=Unknown==Medium Swing=C=n=[T44 ${chords} ]`;
}
