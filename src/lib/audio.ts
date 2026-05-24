import { midiToFreq } from './theory';

// Generate a simple synthetic impulse response for plush reverb
function createReverbImpulse(ctx: AudioContext, duration: number, decay: number) {
  const length = ctx.sampleRate * duration;
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);
  for (let i = 0; i < length; i++) {
    const reverseIndex = length - i;
    // Exponential decay curve for smooth tail
    const envelope = Math.pow(reverseIndex / length, decay);
    left[i] = (Math.random() * 2 - 1) * envelope;
    right[i] = (Math.random() * 2 - 1) * envelope;
  }
  return impulse;
}

export type InstrumentType = 'epiano' | 'sine' | 'pad' | 'pluck' | 'trumpet' | 'guitar' | 'sax';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private oscillators: Map<number, { oscs: OscillatorNode[]; gain: GainNode; filter?: BiquadFilterNode }> = new Map();
  private masterGain: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private currentInstrument: InstrumentType = 'epiano';

  setInstrument(type: InstrumentType) {
    this.currentInstrument = type;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.5; // Gain headroom
      
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -30;
      compressor.knee.value = 10;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.01;
      compressor.release.value = 0.25;

      this.reverb = this.ctx.createConvolver();
      this.reverb.buffer = createReverbImpulse(this.ctx, 3.0, 4.0); // 3 second plush reverb
      
      const reverbLevel = this.ctx.createGain();
      reverbLevel.gain.value = 0.5; // 50% wet reverb mix

      // Wire master through compressor
      this.masterGain.connect(compressor);
      
      // Dry routing
      compressor.connect(this.ctx.destination);
      
      // Wet routing
      compressor.connect(this.reverb);
      this.reverb.connect(reverbLevel);
      reverbLevel.connect(this.ctx.destination);
    }
  }

  playNote(midi: number) {
    if (!this.ctx || !this.masterGain) return;
    
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.stopNote(midi); // Stop if already playing

    const freq = midiToFreq(midi);
    const now = this.ctx.currentTime;
    
    // Voice master gain
    const gain = this.ctx.createGain();
    gain.connect(this.masterGain);
    
    // Lowpass Filter for warmth
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2; // Subtle resonance
    
    const oscs: OscillatorNode[] = [];

    if (this.currentInstrument === 'sine') {
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.5, now + 0.05); 
      gain.gain.exponentialRampToValueAtTime(0.4, now + 0.8);

      filter.frequency.setValueAtTime(freq * 3, now);
      filter.connect(gain);

      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = freq;
      osc1.connect(filter);
      oscs.push(osc1);

    } else if (this.currentInstrument === 'pad') {
      // Slower attack and release, rich harmonic content
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.3, now + 0.5); 
      gain.gain.exponentialRampToValueAtTime(0.2, now + 1.0);

      filter.frequency.setValueAtTime(freq * 2, now);
      filter.frequency.exponentialRampToValueAtTime(freq * 4, now + 1.0);
      filter.connect(gain);

      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = freq * 0.995;
      const gain1 = this.ctx.createGain();
      gain1.gain.value = 0.3;
      osc1.connect(gain1);
      gain1.connect(filter);
      oscs.push(osc1);

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.value = freq * 1.005;
      const gain2 = this.ctx.createGain();
      gain2.gain.value = 0.3;
      osc2.connect(gain2);
      gain2.connect(filter);
      oscs.push(osc2);

      const osc3 = this.ctx.createOscillator();
      osc3.type = 'triangle';
      osc3.frequency.value = freq / 2;
      const gain3 = this.ctx.createGain();
      gain3.gain.value = 0.4;
      osc3.connect(gain3);
      gain3.connect(filter);
      oscs.push(osc3);

    } else if (this.currentInstrument === 'pluck') {
      // FM Pluck / fast decay
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.5, now + 0.02); 
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      filter.frequency.setValueAtTime(freq * 8, now);
      filter.frequency.exponentialRampToValueAtTime(freq, now + 0.3);
      filter.connect(gain);

      const osc1 = this.ctx.createOscillator();
      osc1.type = 'square';
      osc1.frequency.value = freq;
      const gain1 = this.ctx.createGain();
      gain1.gain.value = 0.5;
      osc1.connect(gain1);
      gain1.connect(filter);
      oscs.push(osc1);

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.value = freq * 2;
      const gain2 = this.ctx.createGain();
      gain2.gain.value = 0.2;
      osc2.connect(gain2);
      gain2.connect(filter);
      oscs.push(osc2);

    } else if (this.currentInstrument === 'trumpet') {
      // Brass envelope: slight swell, strong upper harmonics
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.7, now + 0.05); 
      gain.gain.exponentialRampToValueAtTime(0.5, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(freq * 8, now);
      filter.frequency.exponentialRampToValueAtTime(freq * 3, now + 0.2);
      filter.connect(gain);

      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = freq;
      osc1.connect(filter);
      oscs.push(osc1);

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.value = freq * 1.002;
      const gain2 = this.ctx.createGain();
      gain2.gain.value = 0.5;
      osc2.connect(gain2);
      gain2.connect(filter);
      oscs.push(osc2);

    } else if (this.currentInstrument === 'guitar') {
      // Plucked string envelope
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.8, now + 0.02); 
      gain.gain.exponentialRampToValueAtTime(0.1, now + 0.5);
      gain.gain.linearRampToValueAtTime(0.001, now + 1.2);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(freq * 2.5, now);
      filter.Q.value = 0.8;
      filter.connect(gain);

      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = freq;
      osc1.connect(filter);
      oscs.push(osc1);

    } else if (this.currentInstrument === 'sax') {
      // Reedy envelope, slightly slower attack than trumpet
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.5, now + 0.08); 
      gain.gain.exponentialRampToValueAtTime(0.4, now + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(freq * 5, now);
      filter.frequency.exponentialRampToValueAtTime(freq * 2, now + 0.4);
      filter.Q.value = 1.5;
      filter.connect(gain);

      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = freq;
      osc1.connect(filter);
      oscs.push(osc1);

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = freq * 0.998;
      const gain2 = this.ctx.createGain();
      gain2.gain.value = 0.8;
      osc2.connect(gain2);
      gain2.connect(filter);
      oscs.push(osc2);

    } else {
      // Default: E-Piano
      // Punchier ADSR for better rhythmic feel
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.4, now + 0.05); // Faster Attack
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.8);  // slow Decay to Sustain

      // Filter Envelope (start bright, decay smoothly)
      filter.frequency.setValueAtTime(freq * 5, now);
      filter.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.6);
      filter.connect(gain);

      // Osc 1: Warm Sine for Fundamental
      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = freq;
      const gain1 = this.ctx.createGain();
      gain1.gain.value = 0.6;
      osc1.connect(gain1);
      gain1.connect(filter);
      oscs.push(osc1);

      // Osc 2: Triangle (Slightly Detuned) for shimmer & movement
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = freq * 1.003;
      const gain2 = this.ctx.createGain();
      gain2.gain.value = 0.3;
      osc2.connect(gain2);
      gain2.connect(filter);
      oscs.push(osc2);

      // Osc 3: Sub Osc for weight
      if (midi < 72) {
        const sub = this.ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.value = freq / 2;
        const subGain = this.ctx.createGain();
        subGain.gain.value = 0.4;
        sub.connect(subGain);
        subGain.connect(filter);
        oscs.push(sub);
      }
      
      // Osc 4: E-Piano Tine / Bell style (High Octave)
      const bell = this.ctx.createOscillator();
      bell.type = 'sine';
      bell.frequency.value = freq * 2.01;
      const bellGain = this.ctx.createGain();
      bellGain.gain.setValueAtTime(0.001, now);
      bellGain.gain.exponentialRampToValueAtTime(0.3, now + 0.05); // sharp attack
      bellGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5); // fast decay
      bell.connect(bellGain);
      bellGain.connect(filter);
      oscs.push(bell);
    }

    for (const osc of oscs) {
      osc.start(now);
    }

    this.oscillators.set(midi, { oscs, gain, filter });
  }

  stopNote(midi: number) {
    if (!this.ctx) return;
    
    const voices = this.oscillators.get(midi);
    if (!voices) return;

    // Immediately remove from map to prevent race conditions on quick re-triggers
    this.oscillators.delete(midi);

    const { oscs, gain, filter } = voices;
    const now = this.ctx.currentTime;
    const releaseTime = 1.2; // long ambient tail
    
    // Smoothly release volume
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0, now, releaseTime / 3);
    
    // Release filter frequency
    if (filter) {
      filter.frequency.cancelScheduledValues(now);
      filter.frequency.setTargetAtTime(100, now, releaseTime / 2);
    }

    for (const osc of oscs) {
      osc.stop(now + releaseTime);
    }

    // Cleanup resources
    setTimeout(() => {
      gain.disconnect();
      if (filter) filter.disconnect();
    }, releaseTime * 1000 + 100);
  }

  playChord(midis: number[]) {
    for (const m of midis) {
      this.playNote(m);
    }
  }

  stopChord(midis: number[]) {
    for (const m of midis) {
      this.stopNote(m);
    }
  }
  
  playMetronomeClick(high: boolean) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(high ? 800 : 400, now);
    osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.1);
    
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playDrumKick(velocity = 1) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(0.001, now + 0.5);
    
    gain.gain.setValueAtTime(0.8 * velocity, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(now);
    osc.stop(now + 0.5);
  }

  playDrumSnare(velocity = 1) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    
    const bufferSize = this.ctx.sampleRate * 0.2; 
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1000;
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.6 * velocity, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

    noise.connect(noiseFilter);
    noiseFilter.connect(gain);
    gain.connect(this.masterGain);

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    const oscGain = this.ctx.createGain();
    osc.frequency.setValueAtTime(250, now);
    oscGain.gain.setValueAtTime(0.5 * velocity, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    
    osc.connect(oscGain);
    oscGain.connect(this.masterGain);

    noise.start(now);
    osc.start(now);
  }

  playDrumRim(velocity = 1) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.05); // sharp drop
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 5;

    gain.gain.setValueAtTime(0.8 * velocity, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(now);
    osc.stop(now + 0.05);
  }

  playDrumHat(velocity = 1, open = false) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const duration = open ? 0.3 : 0.05;
    
    const bufferSize = this.ctx.sampleRate * duration; 
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3 * velocity, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
  }

  playDrumRide(velocity = 1) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const duration = 1.0;
    
    const bufferSize = this.ctx.sampleRate * duration; 
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Metallic noise synthesis using multiple banded frequencies would be better, but pure noise + bandpass is quick
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 4500;
    filter.Q.value = 1; // wider
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4 * velocity, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    // Initial "ping"
    const ping = this.ctx.createOscillator();
    ping.type = 'square';
    ping.frequency.value = 400;
    const pingGain = this.ctx.createGain();
    pingGain.gain.setValueAtTime(0.3 * velocity, now);
    pingGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    
    ping.connect(pingGain);
    pingGain.connect(this.masterGain);

    noise.start(now);
    ping.start(now);
    ping.stop(now + 0.1);
  }

  stopAll() {
    if (!this.ctx) return;
    // Safely iterate over keys since stopNote immediately mutates the map
    for (const midi of Array.from(this.oscillators.keys())) {
      this.stopNote(midi);
    }
  }
}

export const audioEngine = new AudioEngine();
