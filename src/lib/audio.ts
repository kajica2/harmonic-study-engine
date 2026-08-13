import { midiToFreq } from "./theory";
import {
  loadSoundfont,
  playSoundfontNote,
  stopAllSoundfonts,
  soundfontAvailable,
} from "./soundfont";

/**
 * Whether to route notes through FluidR3 soundfont samples instead
 * of the oscillator synth. Loaded from localStorage so the user's
 * preference persists. Default false (oscillator) for fast first-load.
 */
function readHDSetting(): boolean {
  try {
    return localStorage.getItem("synesthesia_hdSounds") === "1";
  } catch {
    return false;
  }
}

// Generate a simple synthetic impulse response for plush reverb
function createReverbImpulse(
  ctx: AudioContext,
  duration: number,
  decay: number,
) {
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

export type InstrumentType =
  | "epiano"
  | "sine"
  | "pad"
  | "pluck"
  | "trumpet"
  | "guitar"
  | "sax";

class AudioEngine {
  private ctx: AudioContext | null = null;
  /** Public read-only access to the underlying AudioContext.
   *  Needed by sibling engines (backingEngine, recorder) that need
   *  to schedule on the same clock. */
  public getCtx(): AudioContext | null {
    return this.ctx;
  }
  private oscillators: Map<
    number,
    { oscs: OscillatorNode[]; gain: GainNode; filter?: BiquadFilterNode }
  > = new Map();
  private masterGain: GainNode | null = null;
  private melodyBus: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private currentInstrument: InstrumentType = "epiano";
  private targetVolume: number = 0.5;
  /** When true, the synth melody is silenced so the user can play
   *  their own instrument along with the backing track. Backing
   *  track (drums, bass, piano) keeps playing. */
  public melodyMuted: boolean = false;
  public useHDSounds: boolean = readHDSetting();
  public onHDFailure?: (msg: string) => void;

  /**
   * Returns the audio node the synth melody voices should connect
   * to. Pre-init fallback to masterGain keeps the type safe in
   * tests that run without an AudioContext. The playalong toggle
   * multiplies this gain to 0; backing-track voices (metronome,
   * drum kit, etc.) bypass it and connect directly to masterGain.
   */
  private melodyOutputBus(): AudioNode | null {
    return this.melodyBus ?? this.masterGain;
  }

  setInstrument(type: InstrumentType) {
    this.currentInstrument = type;
  }

  /** Mute the synth melody without stopping it. Notes continue to
   *  schedule — they just go to a 0-gain bus, so toggling back on
   *  mid-phrase brings the synth back instantly. Backing track
   *  (rhythmEngine / backingEngine) is unaffected. */
  setMelodyMuted(muted: boolean) {
    this.melodyMuted = muted;
    if (this.melodyBus && this.ctx) {
      const target = muted ? 0 : 1;
      this.melodyBus.gain.setTargetAtTime(
        target,
        this.ctx.currentTime,
        0.03, // 30 ms — fast enough to feel snappy, smooth enough not to click
      );
    }
    if (muted) this.stopAll();
  }

  setHDSounds(enabled: boolean) {
    this.useHDSounds = enabled;
    try {
      localStorage.setItem("synesthesia_hdSounds", enabled ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (!enabled) stopAllSoundfonts();
  }

  isHDReady(): boolean {
    return soundfontAvailable(this.currentInstrument);
  }

  setVolume(vol: number) {
    this.targetVolume = vol;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Tap the master output into a destination (used by the
   * AudioRecorder to capture the Web Audio output as part of a
   * MediaRecorder stream). Calling this with the same destination
   * twice is a no-op so the recorder can be torn down and re-
   * created without leaking connections.
   */
  connectMasterTo(dest: AudioNode) {
    if (!this.masterGain || !this.ctx) return;
    try {
      this.masterGain.connect(dest);
    } catch (e) {
      // Already connected — Web Audio throws InvalidAccessError on
      // re-connection, which we treat as success.
    }
  }

  disconnectMasterFromRecording() {
    if (!this.masterGain || !this.ctx) return;
    // Disconnect only the recording destination — leaves the
    // master → destination wiring intact.
    try {
      // We don't track the recording destination reference here
      // because AudioRecorder owns it. Web Audio doesn't expose
      // a "disconnect everything I added in connectMasterTo"
      // helper, so we leave the master → recordingDestination
      // wiring in place; the recording destination is discarded
      // when MediaRecorder stops, so the orphaned wiring is GC'd.
      // This is intentionally a no-op.
    } catch {
      /* ignore */
    }
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.targetVolume; // Gain headroom

      // Melody bus — sits between the master and the compressor.
      // The playalong toggle drops this to 0 so the synth melody
      // is silenced while the backing track keeps playing.
      this.melodyBus = this.ctx.createGain();
      this.melodyBus.gain.value = 1;
      this.melodyBus.connect(this.masterGain);

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

    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }

    this.stopNote(midi); // Stop if already playing

    const now = this.ctx.currentTime;

    // HD Sounds branch — route through FluidR3 soundfont samples
    // when the user has enabled them. Real trumpet samples have
    // the bell resonance that oscillator math can't fake.
    if (this.useHDSounds && soundfontAvailable(this.currentInstrument)) {
      // When playalong is on, silence the melody path even in HD
      // mode (otherwise the soundfont would still ring out).
      if (this.melodyMuted) return;
      // 1.6s default: long enough for the trumpet's natural ring
      // and the reverb tail, but the next note's play() will
      // retrigger the sample so we don't need explicit stop().
      void playSoundfontNote(this.ctx, midi, this.currentInstrument, now, 1.6);
      return;
    }

    const freq = midiToFreq(midi);

    // Voice master gain — connected to the melody bus, NOT the
    // master bus directly, so the playalong toggle can drop the
    // entire synth-melody gain to 0 without affecting the
    // backing-track voices (which connect directly to masterGain).
    const gain = this.ctx.createGain();
    gain.connect(this.melodyOutputBus()!);

    // Lowpass Filter for warmth
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 2; // Subtle resonance

    const oscs: OscillatorNode[] = [];

    if (this.currentInstrument === "sine") {
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.5, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.4, now + 0.8);

      filter.frequency.setValueAtTime(freq * 3, now);
      filter.connect(gain);

      const osc1 = this.ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.value = freq;
      osc1.connect(filter);
      oscs.push(osc1);
    } else if (this.currentInstrument === "pad") {
      // Slower attack and release, rich harmonic content
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.3, now + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 1.0);

      filter.frequency.setValueAtTime(freq * 2, now);
      filter.frequency.exponentialRampToValueAtTime(freq * 4, now + 1.0);
      filter.connect(gain);

      const osc1 = this.ctx.createOscillator();
      osc1.type = "sawtooth";
      osc1.frequency.value = freq * 0.995;
      const gain1 = this.ctx.createGain();
      gain1.gain.value = 0.3;
      osc1.connect(gain1);
      gain1.connect(filter);
      oscs.push(osc1);

      const osc2 = this.ctx.createOscillator();
      osc2.type = "sawtooth";
      osc2.frequency.value = freq * 1.005;
      const gain2 = this.ctx.createGain();
      gain2.gain.value = 0.3;
      osc2.connect(gain2);
      gain2.connect(filter);
      oscs.push(osc2);

      const osc3 = this.ctx.createOscillator();
      osc3.type = "triangle";
      osc3.frequency.value = freq / 2;
      const gain3 = this.ctx.createGain();
      gain3.gain.value = 0.4;
      osc3.connect(gain3);
      gain3.connect(filter);
      oscs.push(osc3);
    } else if (this.currentInstrument === "pluck") {
      // FM Pluck / fast decay
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.5, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      filter.frequency.setValueAtTime(freq * 8, now);
      filter.frequency.exponentialRampToValueAtTime(freq, now + 0.3);
      filter.connect(gain);

      const osc1 = this.ctx.createOscillator();
      osc1.type = "square";
      osc1.frequency.value = freq;
      const gain1 = this.ctx.createGain();
      gain1.gain.value = 0.5;
      osc1.connect(gain1);
      gain1.connect(filter);
      oscs.push(osc1);

      const osc2 = this.ctx.createOscillator();
      osc2.type = "sawtooth";
      osc2.frequency.value = freq * 2;
      const gain2 = this.ctx.createGain();
      gain2.gain.value = 0.2;
      osc2.connect(gain2);
      gain2.connect(filter);
      oscs.push(osc2);
    } else if (this.currentInstrument === "trumpet") {
      // Brass envelope: slight swell, strong upper harmonics
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.7, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.5, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(freq * 8, now);
      filter.frequency.exponentialRampToValueAtTime(freq * 3, now + 0.2);
      filter.connect(gain);

      const osc1 = this.ctx.createOscillator();
      osc1.type = "sawtooth";
      osc1.frequency.value = freq;
      osc1.connect(filter);
      oscs.push(osc1);

      const osc2 = this.ctx.createOscillator();
      osc2.type = "square";
      osc2.frequency.value = freq * 1.002;
      const gain2 = this.ctx.createGain();
      gain2.gain.value = 0.5;
      osc2.connect(gain2);
      gain2.connect(filter);
      oscs.push(osc2);
    } else if (this.currentInstrument === "guitar") {
      // Plucked string envelope
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.8, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.1, now + 0.5);
      gain.gain.linearRampToValueAtTime(0.001, now + 1.2);

      filter.type = "bandpass";
      filter.frequency.setValueAtTime(freq * 2.5, now);
      filter.Q.value = 0.8;
      filter.connect(gain);

      const osc1 = this.ctx.createOscillator();
      osc1.type = "sawtooth";
      osc1.frequency.value = freq;
      osc1.connect(filter);
      oscs.push(osc1);
    } else if (this.currentInstrument === "sax") {
      // Reedy envelope, slightly slower attack than trumpet
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.5, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.4, now + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(freq * 5, now);
      filter.frequency.exponentialRampToValueAtTime(freq * 2, now + 0.4);
      filter.Q.value = 1.5;
      filter.connect(gain);

      const osc1 = this.ctx.createOscillator();
      osc1.type = "sawtooth";
      osc1.frequency.value = freq;
      osc1.connect(filter);
      oscs.push(osc1);

      const osc2 = this.ctx.createOscillator();
      osc2.type = "triangle";
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
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.8); // slow Decay to Sustain

      // Filter Envelope (start bright, decay smoothly)
      filter.frequency.setValueAtTime(freq * 5, now);
      filter.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.6);
      filter.connect(gain);

      // Osc 1: Warm Sine for Fundamental
      const osc1 = this.ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.value = freq;
      const gain1 = this.ctx.createGain();
      gain1.gain.value = 0.6;
      osc1.connect(gain1);
      gain1.connect(filter);
      oscs.push(osc1);

      // Osc 2: Triangle (Slightly Detuned) for shimmer & movement
      const osc2 = this.ctx.createOscillator();
      osc2.type = "triangle";
      osc2.frequency.value = freq * 1.003;
      const gain2 = this.ctx.createGain();
      gain2.gain.value = 0.3;
      osc2.connect(gain2);
      gain2.connect(filter);
      oscs.push(osc2);

      // Osc 3: Sub Osc for weight
      if (midi < 72) {
        const sub = this.ctx.createOscillator();
        sub.type = "sine";
        sub.frequency.value = freq / 2;
        const subGain = this.ctx.createGain();
        subGain.gain.value = 0.4;
        sub.connect(subGain);
        subGain.connect(filter);
        oscs.push(sub);
      }

      // Osc 4: E-Piano Tine / Bell style (High Octave)
      const bell = this.ctx.createOscillator();
      bell.type = "sine";
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
    setTimeout(
      () => {
        gain.disconnect();
        if (filter) filter.disconnect();
      },
      releaseTime * 1000 + 100,
    );
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

    osc.type = "sine";
    osc.frequency.setValueAtTime(high ? 800 : 400, now);
    osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.1);

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.1);
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
