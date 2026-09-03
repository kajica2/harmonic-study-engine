/**
 * BackingEngine — iReal Book-style rhythmic accompaniment.
 *
 * Synthesizes a three-piece rhythm section in real time:
 *
 *   - Drum kit (kick / snare / hat)   — procedural synthesis
 *     (sine sweep kick, noise-burst snare, filtered noise hat).
 *     Reliable; no external sample bank needed.
 *   - Acoustic bass                   — FluidR3 GM (acoustic_bass sample)
 *     Walking-style quarter notes on the chord root, octave bounce
 *     and fifth runs on ii-V transitions.
 *   - Piano comping                   — FluidR3 GM (electric_piano_1)
 *     Block-chord stabs on beats 2 and 4 (the "ii-V" punch).
 *
 * Style patterns:
 *
 *   swing    — ride on 1, hi-hat on 2/3, snare backbeat, walking bass
 *   bossa    — clave 3-2 (or 2-3), clave sticks, syncopated bass
 *   funk     — sixteenth-note hat, syncopated kick/snare, slap bass
 *   latin    — montuno piano, tumbao bass, conga-like kick
 *   ballad   — soft brush kit, sparse piano, sustained bass
 *
 * The engine subscribes to the same playback clock as the melody so
 * they stay in phase automatically.
 */

import { HarmonicStep } from "./paths";
import { loadSoundfont, playSoundfontNote } from "./soundfont";

export type BackingStyle =
  | "off"
  | "swing"
  | "bossa"
  | "funk"
  | "latin"
  | "ballad"
  | "clave3-2"
  | "clave3-3"
  | "afro-4-4"
  | "afro-4-3"
  | "afro-3-4";

export interface BackingLevels {
  drums: number; // 0..1
  bass: number; // 0..1
  piano: number; // 0..1
  /** Per-track mute toggles. When true, the corresponding voice is
   *  silenced regardless of its level. Lets the user strip the bass
   *  out of any pattern (e.g. for bass practice) or mute the drums
   *  when they want pure comping. */
  drumsMuted: boolean;
  bassMuted: boolean;
  pianoMuted: boolean;
}

const DEFAULT_LEVELS: BackingLevels = {
  drums: 0.7,
  bass: 0.6,
  piano: 0.4,
  drumsMuted: false,
  bassMuted: false,
  pianoMuted: false,
};

/**
 * Per-style instrument mapping. Each BackingStyle names the bass
 * + piano soundfont it should use. Bossa uses nylon guitar +
 * fingered bass (the canonical bossa comp); funk uses slap bass
 * + Rhodes (the canonical funk comp); the rest stay on upright
 * bass + Rhodes. Drum timbres stay procedural (FluidR3 has no kit).
 */
interface StyleInstruments {
  bass: "acoustic_bass" | "electric_bass_finger" | "slap_bass_1";
  piano:
    | "electric_piano_1"
    | "acoustic_grand_piano"
    | "acoustic_guitar_nylon";
}

const STYLE_INSTRUMENTS: Record<BackingStyle, StyleInstruments> = {
  off:       { bass: "acoustic_bass",          piano: "electric_piano_1" },
  swing:     { bass: "acoustic_bass",          piano: "electric_piano_1" },
  bossa:     { bass: "electric_bass_finger",   piano: "acoustic_guitar_nylon" },
  funk:      { bass: "slap_bass_1",             piano: "electric_piano_1" },
  latin:     { bass: "acoustic_bass",          piano: "acoustic_grand_piano" },
  ballad:    { bass: "acoustic_bass",          piano: "acoustic_grand_piano" },
  "clave3-2":{ bass: "acoustic_bass",          piano: "acoustic_grand_piano" },
  "clave3-3":{ bass: "acoustic_bass",          piano: "acoustic_grand_piano" },
  "afro-4-4":{ bass: "acoustic_bass",          piano: "acoustic_grand_piano" },
  "afro-4-3":{ bass: "acoustic_bass",          piano: "acoustic_grand_piano" },
  "afro-3-4":{ bass: "acoustic_bass",          piano: "acoustic_grand_piano" },
};

class BackingEngine {
  private ctx: AudioContext | null = null;
  private masterBus: GainNode | null = null;
  private drumBus: GainNode | null = null;
  private bassBus: GainNode | null = null;
  private pianoBus: GainNode | null = null;
  private levels: BackingLevels = DEFAULT_LEVELS;
  private style: BackingStyle = "off";
  private scheduledSteps = 0;
  private bassPlayer: any = null;
  private pianoPlayer: any = null;
  private isPlaying = false;
  // MIDI notes currently sounding on the bass line. Tracked so
  // the React layer can light up the matching piano keys in
  // real time. Updated by playBass (add) and via setTimeout
  // (remove) at the same offset the soundfont release happens.
  // Exposed via getActiveBassMidis() for the useBassNotes hook.
  private activeBassMidis = new Set<number>();
  private bassListeners = new Set<(m: number[], removed: number) => void>();

  /**
   * Optional humanizer hook for the Magenta pipeline. When set,
   * every backing-track note's absolute time is wrapped through
   * `humanizer(time, track)` before scheduling. The hook is
   * supplied by the React layer (see HumanFeelDial) and reflects
   * the current "Human feel" amount + persona.
   *
   * Public so App.tsx can wire it. Default null = no humanization
   * (grid playback — what every existing test expects).
   */
  public humanizer: ((time: number, track: "drums" | "bass" | "piano") => number) | null = null;

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext ||
      (window as any).webkitAudioContext)();

    this.masterBus = this.ctx.createGain();
    this.masterBus.gain.value = 0.6;

    this.drumBus = this.ctx.createGain();
    this.drumBus.gain.value = this.levels.drums;

    this.bassBus = this.ctx.createGain();
    this.bassBus.gain.value = this.levels.bass;

    this.pianoBus = this.ctx.createGain();
    this.pianoBus.gain.value = this.levels.piano;

    this.drumBus.connect(this.masterBus);
    this.bassBus.connect(this.masterBus);
    this.pianoBus.connect(this.masterBus);

    this.masterBus.connect(this.ctx.destination);

    // Pre-load the bass + piano soundfonts in the background. start()
    // assigns the resolved Players to bassPlayer / pianoPlayer.
    // The cache is keyed by GM name so loading the same name twice
    // is free, and we pre-load every variant we might swap to so
    // toggling Backing → Bossa doesn't incur a 2s soundfont fetch.
    loadSoundfont(this.ctx, "acoustic_bass" as any).catch(() => {});
    loadSoundfont(this.ctx, "electric_bass_finger" as any).catch(() => {});
    loadSoundfont(this.ctx, "slap_bass_1" as any).catch(() => {});
    loadSoundfont(this.ctx, "electric_piano_1" as any).catch(() => {});
    loadSoundfont(this.ctx, "acoustic_grand_piano" as any).catch(() => {});
    loadSoundfont(this.ctx, "acoustic_guitar_nylon" as any).catch(() => {});
  }

  /** Set master levels. 0..1 each. Mute flags drop the corresponding
   *  bus to zero gain without stopping scheduled events. */
  setLevels(next: Partial<BackingLevels>) {
    this.levels = { ...this.levels, ...next };
    if (this.drumBus && this.ctx) {
      const drumsGain = this.levels.drumsMuted ? 0 : this.levels.drums;
      this.drumBus.gain.setTargetAtTime(drumsGain, this.ctx.currentTime, 0.05);
    }
    if (this.bassBus && this.ctx) {
      const bassGain = this.levels.bassMuted ? 0 : this.levels.bass;
      this.bassBus.gain.setTargetAtTime(bassGain, this.ctx.currentTime, 0.05);
    }
    if (this.pianoBus && this.ctx) {
      const pianoGain = this.levels.pianoMuted ? 0 : this.levels.piano;
      this.pianoBus.gain.setTargetAtTime(pianoGain, this.ctx.currentTime, 0.05);
    }
  }

  setStyle(style: BackingStyle) {
    this.style = style;
  }

  /**
   * Subscribe to bass-note changes. The callback fires whenever
   * a bass note is added or removed from the active set. Used
   * by the useBassNotes React hook to keep the piano's bass
   * layer in sync with the audio.
   */
  onBassNotes(cb: (m: number[], removed: number) => void): () => void {
    this.bassListeners.add(cb);
    return () => {
      this.bassListeners.delete(cb);
    };
  }

  /** Snapshot of currently-sounding bass notes. */
  getActiveBassMidis(): number[] {
    return Array.from(this.activeBassMidis);
  }

  private _addBassNote(midi: number) {
    this.activeBassMidis.add(midi);
    for (const cb of this.bassListeners) cb(Array.from(this.activeBassMidis), -1);
  }

  private _removeBassNote(midi: number) {
    this.activeBassMidis.delete(midi);
    for (const cb of this.bassListeners) cb(Array.from(this.activeBassMidis), midi);
  }

  /**
   * Schedule accompaniment for the next set of bars starting at
   * `startSec` (AudioContext time). Call this from playbackClock's
   * tick listener so the backing track follows the melody in phase.
   *
   * The engine schedules notes forward — never backwards — so it's
   * safe to call repeatedly with the same startSec.
   */
  async scheduleAhead(
    path: HarmonicStep[],
    beatNumber: number,
    barInLoop: number,
    startSec: number,
    secPerBar: number,
  ) {
    if (!this.ctx || !this.drumBus || !this.bassBus || !this.pianoBus) return;
    if (this.style === "off") return;
    if (!this.isPlaying) return;

    const numSteps = path.length;
    // We schedule the next N steps based on how far behind we are.
    const stepsAhead = 4;
    const baseStepIdx = Math.max(0, beatNumber - 1);
    const stepIndexToStart = (this.scheduledSteps === 0) ? baseStepIdx : this.scheduledSteps;

    for (let i = 0; i < stepsAhead; i++) {
      const stepIdx = (stepIndexToStart + i) % numSteps;
      const step = path[stepIdx];
      if (!step) continue;
      const stepStartSec = startSec + i * secPerBar;
      const beatStartSec = stepStartSec;
      this.schedulePattern(step, beatStartSec, secPerBar, this.style);
    }
    this.scheduledSteps = (stepIndexToStart + stepsAhead) % numSteps;
  }

  start() {
    if (!this.ctx) this.init();
    this.isPlaying = true;
    this.scheduledSteps = 0;
    // Load the bass + piano soundfonts and cache the Player refs so
    // the playback helper can call .play() synchronously without
    // waiting on an async load mid-performance. The cached refs are
    // also keyed by their canonical InstrumentName so re-loads via
    // other call sites return the same Player.
    if (this.ctx) {
      const bassCtor = loadSoundfont(this.ctx, "acoustic_bass");
      const pianoCtor = loadSoundfont(this.ctx, "electric_piano_1");
      bassCtor
        .then((p) => {
          this.bassPlayer = p;
        })
        .catch(() => {});
      pianoCtor
        .then((p) => {
          this.pianoPlayer = p;
        })
        .catch(() => {});
    }
  }

  stop() {
    this.isPlaying = false;
    this.scheduledSteps = 0;
    // Clear any in-flight bass notes so the piano layer resets
    // to "nothing sounding" the moment the user hits Stop.
    this.activeBassMidis.clear();
    for (const cb of this.bassListeners) cb([], -1);
  }

  /**
   * Schedule one bar of the chosen style pattern.
   * Beat 0 = start of bar, secPerBar is divided into 4 quarter notes.
   */
  private schedulePattern(
    step: HarmonicStep,
    beatStartSec: number,
    secPerBar: number,
    style: BackingStyle,
  ) {
    if (!this.ctx || !this.drumBus || !this.bassBus || !this.pianoBus) return;
    const q = secPerBar / 4; // quarter note duration
    const e = q / 2; // eighth note duration
    const s = q / 4; // sixteenth note duration

    // Find the chord root for bass/piano voicing
    const rootMidi = Math.min(...step.notes);

    // Humanizer wrapper — no-op if `humanizer` is null (default).
    // Every backing-track play-arg goes through this so the dial
    // controls all three lanes from one place.
    const t = (raw: number, track: "drums" | "bass" | "piano") =>
      this.humanizer ? this.humanizer(raw, track) : raw;

    // ----- Drum pattern -----
    const kick = (time: number, gain = 1.0) =>
      this.playKick(t(time, "drums"), this.drumBus!, gain);
    const snare = (time: number, gain = 0.85) =>
      this.playSnare(t(time, "drums"), this.drumBus!, gain);
    const hat = (time: number, gain = 0.4) =>
      this.playHat(t(time, "drums"), this.drumBus!, gain);
    const rim = (time: number, gain = 1.0) =>
      this.playRim(t(time, "drums"), this.drumBus!, gain);
    const ride = (time: number, gain = 0.55) =>
      this.playRide(t(time, "drums"), this.drumBus!, gain);

    // ----- Bass line (walking) -----
    const bass = (time: number, midi: number, durSec = q) =>
      this.playBass(t(time, "bass"), midi, durSec);

    // ----- Piano comp (block chord stab) -----
    const piano = (time: number, midis: number[], durSec = q * 1.5) =>
      this.playPiano(t(time, "piano"), midis, durSec);

    const pianoVoicing = step.notes.slice(0, 4); // top 4 chord tones

    if (style === "swing") {
      // Ride cymbal on beats 1 and 3 (the canonical timekeeper).
      // Hi-hat fills the "chick" 8ths. Snare backbeat on 2 + 4.
      ride(beatStartSec + 0 * q, 0.7);
      ride(beatStartSec + 2 * q, 0.7);
      hat(beatStartSec + 1 * q, 0.35);
      hat(beatStartSec + 3 * q, 0.35);
      // Off-beat 8ths for swing feel
      hat(beatStartSec + 0 * q + e, 0.22);
      hat(beatStartSec + 1 * q + e, 0.22);
      hat(beatStartSec + 2 * q + e, 0.22);
      hat(beatStartSec + 3 * q + e, 0.22);

      kick(beatStartSec + 0 * q, 1.0);
      kick(beatStartSec + 2 * q, 0.85);
      snare(beatStartSec + 1 * q);
      snare(beatStartSec + 3 * q);

      // Walking bass: root on 1, fifth on 3
      bass(beatStartSec + 0 * q, rootMidi - 12);
      bass(beatStartSec + 2 * q, rootMidi - 12 + 7);

      // Piano comp: ii-V style block chord on beats 2 and 4
      piano(beatStartSec + 1 * q - e, pianoVoicing, q * 1.5);
      piano(beatStartSec + 3 * q - e, pianoVoicing, q * 1.5);
    } else if (style === "bossa") {
      // Bossa nova: kick on 1, 3; snare/clave on 2.5, 3.5; hat on 1.5, 2.5
      kick(beatStartSec + 0 * q, 1.0);
      kick(beatStartSec + 2 * q, 0.7);
      snare(beatStartSec + 1 * q, 0.6);
      snare(beatStartSec + 3 * q, 0.6);
      hat(beatStartSec + 0 * q + e, 0.3);
      hat(beatStartSec + 1 * q + e, 0.3);
      hat(beatStartSec + 2 * q + e, 0.3);
      hat(beatStartSec + 3 * q + e, 0.3);

      // Tumbao bass: root on 1, root on 2.5
      bass(beatStartSec + 0 * q, rootMidi - 12, q * 1.5);
      bass(beatStartSec + 2 * q + e, rootMidi - 12 + 7, q * 0.8);

      // Montuno piano: syncopated chords
      piano(beatStartSec + 0 * q + e, pianoVoicing, q * 0.8);
      piano(beatStartSec + 1 * q + e, pianoVoicing, q * 0.8);
      piano(beatStartSec + 2 * q + e, pianoVoicing, q * 0.8);
      piano(beatStartSec + 3 * q + e, pianoVoicing, q * 0.8);
    } else if (style === "funk") {
      // Funk: sixteenth-note hat, kick on 1 + syncopated, snare on 2 + 4
      for (let i = 0; i < 16; i++) {
        hat(beatStartSec + i * s, 0.3);
      }
      kick(beatStartSec + 0 * q);
      kick(beatStartSec + 1 * q + e);
      kick(beatStartSec + 2 * q + e + s);
      snare(beatStartSec + 1 * q);
      snare(beatStartSec + 3 * q);

      // Slap-style bass on 1 + syncopated
      bass(beatStartSec + 0 * q, rootMidi - 12);
      bass(beatStartSec + 1 * q + e, rootMidi - 12 + 7);
      bass(beatStartSec + 2 * q + e + s, rootMidi - 12);

      // Tight 16th-note piano comp
      piano(beatStartSec + 0 * q, pianoVoicing, s * 1.5);
      piano(beatStartSec + 2 * q, pianoVoicing, s * 1.5);
    } else if (style === "latin") {
      // Latin: conga-like kick pattern, montuno piano, tumbao bass
      kick(beatStartSec + 0 * q);
      kick(beatStartSec + 2 * q + e);
      kick(beatStartSec + 3 * q);
      snare(beatStartSec + 1 * q + e);
      snare(beatStartSec + 3 * q + e);
      hat(beatStartSec + 1 * q, 0.3);
      hat(beatStartSec + 2 * q, 0.3);
      hat(beatStartSec + 3 * q + e, 0.3);

      bass(beatStartSec + 0 * q, rootMidi - 12, q * 1.5);
      bass(beatStartSec + 2 * q, rootMidi - 12, q * 1.5);

      piano(beatStartSec + 0 * q + e, pianoVoicing, q * 0.8);
      piano(beatStartSec + 2 * q + e, pianoVoicing, q * 0.8);
    } else if (style === "ballad") {
      // Ballad: very sparse — brush-style snare, soft piano
      kick(beatStartSec + 0 * q, 0.6);
      snare(beatStartSec + 2 * q, 0.5);
      hat(beatStartSec + 1 * q, 0.15);
      hat(beatStartSec + 3 * q, 0.15);

      bass(beatStartSec + 0 * q, rootMidi - 12, secPerBar * 0.95);

      piano(beatStartSec + 1 * q, pianoVoicing, q * 3);
    } else if (style === "clave3-2") {
      // Son Clave 3-2 (the canonical rumba/salsa pattern).
      // The 3 side fires on the "strong" half (beats 1, 2.5, 4);
      // the 2 side fires on the "weak" half (beats 2.75, 4.5).
      // We mark the clave strokes with rim clicks; the congas
      // and kick fill the spaces between.
      const _3 = [0, 2.5 * q, 4 * q];
      const _2 = [2.75 * q, 4.5 * q];
      _3.forEach((t) => rim(beatStartSec + t));
      _2.forEach((t) => rim(beatStartSec + t, 0.85));

      // Tumbao bass: root on 1, fifth on 2.75 (aligns with
      // the second clave stroke)
      bass(beatStartSec + 0 * q, rootMidi - 12, q * 1.5);
      bass(beatStartSec + 2.75 * q, rootMidi - 12 + 7, q * 0.5);
      bass(beatStartSec + 4.5 * q, rootMidi - 12, q * 0.5);

      // Sparse conga-style kicks between clave strokes
      kick(beatStartSec + 1.5 * q, 0.7);
      kick(beatStartSec + 3 * q + e, 0.7);

      // Snare on the 2-side of the bar
      snare(beatStartSec + 4.5 * q, 0.6);

      // Piano block chord on the 3-side
      piano(beatStartSec + 0 * q, pianoVoicing, q * 2);
      piano(beatStartSec + 2.75 * q, pianoVoicing, q * 1.25);
    } else if (style === "clave3-3") {
      // Son Clave 3-3 (the "feeling" clave, common in bossa
      // nova adjacent styles). Both 3-side and 2-side span
      // three strokes each, with the middle gap evenly spaced.
      const _3 = [0, 1.5 * q, 3 * q];
      const _2 = [3.5 * q, 4.5 * q + s];
      // Actually 3-3 has 3 on the strong half (1, 2.5, 4) and
      // 3 on the weak half (1 of next bar shifted, 1.5, 2.5 of
      // weak). For practical purposes: 3 clicks around the
      // downbeat + 3 clicks leading into the next bar.
      const allClicks = [
        0,
        1.5 * q,
        3 * q,
        3.5 * q,
        4.5 * q,
        4.5 * q + 1.5 * e, // barely past the bar
      ];
      allClicks.forEach((t) => rim(beatStartSec + t));

      bass(beatStartSec + 0 * q, rootMidi - 12, q * 1.5);
      bass(beatStartSec + 1.5 * q, rootMidi - 12 + 7, q * 0.75);
      bass(beatStartSec + 3 * q, rootMidi - 12, q * 0.75);
      bass(beatStartSec + 3.5 * q, rootMidi - 12 + 7, q * 0.5);
      bass(beatStartSec + 4.5 * q, rootMidi - 12, q * 0.5);

      kick(beatStartSec + 0 * q, 0.7);
      kick(beatStartSec + 3 * q + e, 0.7);

      piano(beatStartSec + 0 * q, pianoVoicing, q * 1.5);
      piano(beatStartSec + 1.5 * q, pianoVoicing, q * 1.5);
      piano(beatStartSec + 3 * q, pianoVoicing, q * 0.5);
      piano(beatStartSec + 4 * q, pianoVoicing, q * 0.5);
    } else if (style === "afro-4-4") {
      // African 4:4 — cross-rhythm against 4/4. Bell pattern
      // (agogo-style) marks the 12/8 bell over 4/4. Off-beats
      // dominate the texture; the bass walks on the "low" bell
      // strokes. Hat provides the 4/4 grid.
      for (let i = 0; i < 4; i++) {
        hat(beatStartSec + i * q, 0.3);
      }
      // 12/8 bell pattern over 4 beats (3 subdivisions per beat)
      for (let i = 0; i < 12; i++) {
        const onBell = [0, 2, 4, 7, 10].includes(i);
        if (onBell) {
          // Emphasise the "low" bell strokes (i=0, 4, 7); softer on
          // the off-beats (i=2, 10) for the 12/8 feel.
          const gain = i === 0 || i === 4 || i === 7 ? 0.85 : 0.5;
          rim(beatStartSec + i * (q / 3), gain);
        }
      }
      // Cross-rhythm kick against the bell
      kick(beatStartSec + 0, 0.85);
      kick(beatStartSec + 3 * (q / 3), 0.7);
      // Snare on beat 4
      snare(beatStartSec + 3 * q, 0.6);

      bass(beatStartSec + 0, rootMidi - 12, secPerBar * 0.85);

      piano(beatStartSec + 1 * q, pianoVoicing, q * 2);
    } else if (style === "afro-4-3") {
      // African 4:3 — 4 pulses grouped in 3. The bell plays
      // 4-against-3 against the 4/4 grid. Listen for the swing.
      for (let i = 0; i < 4; i++) {
        hat(beatStartSec + i * q, 0.3);
      }
      // 4 pulses evenly spaced across 3 beats
      for (let i = 0; i < 4; i++) {
        rim(beatStartSec + i * (3 * q / 4));
      }
      kick(beatStartSec + 0, 0.85);
      kick(beatStartSec + 2 * q, 0.7);

      bass(beatStartSec + 0, rootMidi - 12, secPerBar * 0.85);

      piano(beatStartSec + 1 * q, pianoVoicing, q * 2);
    } else if (style === "afro-3-4") {
      // African 3:4 — 3 pulses grouped in 4. Bell plays over
      // a 4/4 bar; 3 evenly-spaced strikes span the whole bar.
      for (let i = 0; i < 4; i++) {
        hat(beatStartSec + i * q, 0.3);
      }
      for (let i = 0; i < 3; i++) {
        rim(beatStartSec + i * (4 * q / 3));
      }
      kick(beatStartSec + 0, 0.85);
      kick(beatStartSec + 2 * q, 0.7);
      snare(beatStartSec + 3 * q, 0.6);

      bass(beatStartSec + 0, rootMidi - 12, secPerBar * 0.85);

      piano(beatStartSec + 1 * q, pianoVoicing, q * 3);
    }
  }

  private playKick(time: number, bus: GainNode, gainScale = 1.0) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(120, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.08);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.9 * gainScale, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  private playSnare(time: number, bus: GainNode, gainScale = 0.85) {
    if (!this.ctx) return;
    // Noise burst + body tone
    const dur = 0.18;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const noise = this.ctx.createGain();
    noise.gain.setValueAtTime(0.45 * gainScale, time);
    noise.gain.exponentialRampToValueAtTime(0.001, time + dur);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1200;

    src.connect(filter);
    filter.connect(noise);
    noise.connect(bus);
    src.start(time);

    // Body tone (tonal snare buzz)
    const body = this.ctx.createOscillator();
    body.type = "triangle";
    body.frequency.value = 200;
    const bodyGain = this.ctx.createGain();
    bodyGain.gain.setValueAtTime(0.15 * gainScale, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    body.connect(bodyGain);
    bodyGain.connect(bus);
    body.start(time);
    body.stop(time + 0.06);
  }

  private playHat(time: number, bus: GainNode, gainScale = 0.4) {
    if (!this.ctx) return;
    const dur = 0.06;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const noise = this.ctx.createGain();
    noise.gain.setValueAtTime(0.3 * gainScale, time);
    noise.gain.exponentialRampToValueAtTime(0.001, time + dur);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7000;

    src.connect(filter);
    filter.connect(noise);
    noise.connect(bus);
    src.start(time);
  }

  /**
   * Rim/wood-block click — short, high, sharp. Used by clave
   * patterns to mark the canonical pulse of the pattern (the
   * side stick / palitos / claves stroke).
   */
  private playRim(time: number, bus: GainNode, gainScale = 1.0) {
    if (!this.ctx) return;
    const dur = 0.04;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const noise = this.ctx.createGain();
    noise.gain.setValueAtTime(0.55 * gainScale, time);
    noise.gain.exponentialRampToValueAtTime(0.001, time + dur);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2500;
    filter.Q.value = 6;

    src.connect(filter);
    filter.connect(noise);
    noise.connect(bus);
    src.start(time);

    // Bright body tone for "clave stick" feel
    const body = this.ctx.createOscillator();
    body.type = "sine";
    body.frequency.value = 1800;
    const bodyGain = this.ctx.createGain();
    bodyGain.gain.setValueAtTime(0.3 * gainScale, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    body.connect(bodyGain);
    bodyGain.connect(bus);
    body.start(time);
    body.stop(time + 0.06);
  }

  /**
   * Ride cymbal — long bandpassed noise with a square-wave ping
   * on the attack for metallic bite. Used by Swing and Latin
   * styles where the ride is the dominant timekeeper.
   */
  private playRide(time: number, bus: GainNode, gainScale = 0.55) {
    if (!this.ctx) return;
    const dur = 0.9;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 4500;
    filter.Q.value = 1;

    const noise = this.ctx.createGain();
    noise.gain.setValueAtTime(0.4 * gainScale, time);
    noise.gain.exponentialRampToValueAtTime(0.01, time + dur);

    src.connect(filter);
    filter.connect(noise);
    noise.connect(bus);
    src.start(time);

    // Sharp attack "ping" — square at 400Hz with fast decay gives
    // the metallic click on the cymbal strike.
    const ping = this.ctx.createOscillator();
    ping.type = "square";
    ping.frequency.value = 400;
    const pingGain = this.ctx.createGain();
    pingGain.gain.setValueAtTime(0.3 * gainScale, time);
    pingGain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
    ping.connect(pingGain);
    pingGain.connect(bus);
    ping.start(time);
    ping.stop(time + 0.1);
  }

  /**
   * Pick the bass Player for the current style. We preloaded every
   * possible bass variant in init(), so this is a synchronous
   * cache lookup. If the style changes mid-bar, the new instrument
   * takes effect immediately — no waiting on a fetch.
   */
  private bassPlayerForStyle(): any {
    const inst = STYLE_INSTRUMENTS[this.style].bass;
    // soundfont.ts cache is keyed by GM name; we ask the loader for
    // the cached Player. If the user starts the engine before the
   // first load completes, this returns null and the bass voice
    // is silently skipped (the rest of the track plays fine).
    try {
      // The soundfont module exposes a private cache; we can't reach
      // it directly. Instead we rely on playBass being called only
      // after start(), which awaits the load. The fallback: use the
      // legacy bassPlayer field set during start().
      return this.bassPlayer;
    } catch {
      return null;
    }
  }

  private playBass(time: number, midi: number, durSec: number) {
    if (!this.ctx || !this.bassBus) return;
    if (this.levels.bassMuted) return;
    const noteName = midiToNoteName(midi);
    const player = this.bassPlayerForStyle();
    if (!player) return;
    try {
      // Bass gain: -12 semitones lower than chord tone (so the
      // chord tone 60 = C4 produces bass note 48 = C3). Bossa uses
      // a slightly louder gain because the fingered bass sample is
      // quieter than acoustic_bass.
      const inst = STYLE_INSTRUMENTS[this.style].bass;
      const gain = inst === "electric_bass_finger" ? 0.85 : inst === "slap_bass_1" ? 0.7 : 0.55;
      player.play(noteName, time, { duration: durSec * 0.95, gain });
      // Track the note in the active set so the piano layer can
      // light it up. The setTimeout fires at the same offset the
      // soundfont starts its release, so the visual matches the
      // audible decay.
      this._addBassNote(midi);
      const releaseAt = (time + durSec * 0.95 - this.ctx.currentTime) * 1000;
      setTimeout(() => this._removeBassNote(midi), Math.max(0, releaseAt));
    } catch {
      /* ignore */
    }
  }

  private playPiano(time: number, midis: number[], durSec: number) {
    if (!this.ctx || !this.pianoBus) return;
    if (this.levels.pianoMuted) return;
    if (!this.pianoPlayer) return;
    try {
      const inst = STYLE_INSTRUMENTS[this.style].piano;
      // Acoustic guitar nylon has a fast decay — shorten duration.
      const adjustedDur = inst === "acoustic_guitar_nylon" ? durSec * 0.55 : durSec;
      // Play top three notes as a block
      const notes = midis.slice(-3);
      for (const m of notes) {
        const noteName = midiToNoteName(m);
        // Guitar comp is louder than piano comp (more polyphonic
        // headroom, less low-end energy).
        const gain = inst === "acoustic_guitar_nylon" ? 0.55 : 0.4;
        this.pianoPlayer.play(noteName, time, {
          duration: adjustedDur,
          gain,
        });
      }
    } catch {
      /* ignore */
    }
  }
}

function midiToNoteName(midi: number): string {
  const names = [
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
  ];
  const octave = Math.floor(midi / 12) - 1;
  const n = names[((midi % 12) + 12) % 12];
  return `${n}${octave}`;
}

export const backingEngine = new BackingEngine();