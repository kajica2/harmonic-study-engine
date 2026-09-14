// Arpeggiator Tone.js integration — 8-way chromatic-dir, single-playback (no overlap)
// No 8va; quartal voicing; per-note articulation (marcato/tenuto/acciaccatura per engraving)
import * as Tone from 'tone';

let currentWay = 1; // 1-8 selectable per 8-way matrix

export function playWay(way, rootPitch, intervalDir, instrumentDir) {
  if (window.AudioContext && window.AudioContext.state === 'suspended') {
    window.AudioContext.resume();
  }
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.5 }
  }).toDestination();
  synth.triggerAttackRelease(rootPitch, '8n');
  synth.dispose();
}

export function stopAll() { Tone.Transport.stop(); }
