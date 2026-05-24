import { HarmonicPath, HarmonicStep } from './paths';

export type EtudeAlgorithm = 'fibonacci' | 'sacred_geometry' | 'coltrane_fractal';

function getNoteName(midi: number): string {
  const notes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  return notes[midi % 12];
}

export function generateEtude(algorithm: EtudeAlgorithm, length: number, rootMidi: number = 60): HarmonicPath {
  const steps: HarmonicStep[] = [];
  
  if (algorithm === 'fibonacci') {
    // Generate intervals based on Fibonacci sequence (1, 1, 2, 3, 5, 8, 13...)
    let a = 1;
    let b = 1;
    let currentMidi = rootMidi;
    
    for (let i = 0; i < length; i++) {
        // Build a chord based on fibonacci intervals
        const note1 = currentMidi;
        const note2 = currentMidi + a;
        const note3 = currentMidi + b;
        const note4 = currentMidi + a + b;
        
        const notes = Array.from(new Set([note1, note2, note3, note4])).sort((x, y) => x - y);
        
        steps.push({
            name: `Fib ${a}-${b}`,
            notes,
            descriptions: `Fibonacci interval shift: ${a}, ${b}`
        });

        const next = a + b;
        a = b;
        b = next;

        // Keep it somewhat musical - constrain expanding fibonacci
        if (b > 13) {
            a = 1;
            b = 2;
            currentMidi = (currentMidi + 7); // Go up a fifth
            if (currentMidi > 72) currentMidi -= 12;
        }
    }
  } else if (algorithm === 'sacred_geometry') {
    // Golden ratio / Hexatonic / Symmetrical structures
    // E.g., alternating minor 3rds and half steps (1:3 or 1:4 etc representing geometries)
    let current = rootMidi;
    const intervals = [3, 4]; // Triangle/Square related
    for (let i = 0; i < length; i++) {
        const root = current;
        // Maj7#5 type symmetry
        const chord = [root, root + 4, root + 8, root + 11]; 
        steps.push({
            name: `${getNoteName(root)}maj7#5`,
            notes: chord,
            descriptions: 'Golden Ratio / Symmetrical Expansion'
        });
        current += intervals[i % intervals.length];
        if (current > 80) current -= 12;
    }
  } else if (algorithm === 'coltrane_fractal') {
    // Major thirds geometry
    let current = rootMidi;
    for (let i = 0; i < length; i++) {
        // typical dominant to major down a major third
        const isDom = i % 2 !== 0;
        const root = current;
        if (isDom) {
            steps.push({
                name: `${getNoteName(root)}7`,
                notes: [root, root + 4, root + 7, root + 10],
                descriptions: 'V7 fractal shift'
            });
            current = current + 5; // up a fourth to resolve
        } else {
            steps.push({
                name: `${getNoteName(root)}maj7`,
                notes: [root, root + 4, root + 7, root + 11],
                descriptions: 'Imaj7 fractal anchor'
            });
            current = current - 4; // down a major third
        }
        while (current > 72) current -= 12;
        while (current < 48) current += 12;
    }
  }

  return {
    id: `etude-${algorithm}-${Date.now()}`,
    title: `Etude: ${algorithm.replace('_', ' ').toUpperCase()}`,
    description: `Algorithmic etude generated using ${algorithm} logic.`,
    steps
  };
}
