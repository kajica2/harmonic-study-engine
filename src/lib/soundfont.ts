/**
 * Soundfont-based synthesizer — replaces the oscillator synth in
 * audio.ts with real instrument samples from the FluidR3_GM bank.
 *
 * Uses `soundfont-player` to load SF2-style soundfonts from the
 * `gleitz/midi-js-soundfonts` collection on jsDelivr. Real trumpet
 * samples have the bell resonances and breath noise that oscillator
 * math can't fake.
 *
 * The soundfont is loaded ONCE on first use and cached. If the load
 * fails (offline, CORS, blocked) we fall back to the legacy
 * oscillator synth so the app still makes sound.
 */

import Soundfont, { Player, InstrumentName } from "soundfont-player";
import { InstrumentType } from "./audio";

// FluidR3_GM program names — soundfont-player takes underscores, not dashes
const INSTRUMENT_TO_SOUNDFONT: Record<InstrumentType, InstrumentName> = {
  trumpet: "trumpet",
  epiano: "electric_piano_1",
  sine: "violin", // clean "pure" timbre
  pad: "pad_2_warm",
  pluck: "orchestral_harp",
  guitar: "acoustic_guitar_steel",
  sax: "tenor_sax",
};

const SOUNDFONT_BASE =
  "https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@master/FluidR3_GM";

let _cache: Map<string, Player> = new Map();
let _loading: Map<string, Promise<Player | null>> = new Map();

/**
 * Load (or return cached) soundfont Player for the given instrument.
 * Returns null on load failure so callers can fall back to the
 * oscillator synth.
 */
export async function loadSoundfont(
  ctx: AudioContext,
  instrument: InstrumentType,
): Promise<Player | null>;
export async function loadSoundfont(
  ctx: AudioContext,
  instrument: InstrumentName,
): Promise<Player | null>;
export async function loadSoundfont(
  ctx: AudioContext,
  instrument: any,
): Promise<Player | null> {
  const cached = _cache.get(instrument);
  if (cached) return cached;
  const inflight = _loading.get(instrument);
  if (inflight) return inflight;

  const name: InstrumentName = INSTRUMENT_TO_SOUNDFONT[instrument as InstrumentType] ?? (instrument as InstrumentName);
  const promise = (async () => {
    try {
      const player = await Soundfont.instrument(ctx, name, {
        soundfont: SOUNDFONT_BASE,
        format: "mp3",
        gain: 0.85,
      });
      _cache.set(instrument, player);
      _cache.set(name, player); // also keyed by canonical name
      return player;
    } catch (e) {
      console.warn(`[soundfont] failed to load "${name}":`, e);
      return null;
    }
  })();

  _loading.set(instrument, promise);
  const out = await promise;
  _loading.delete(instrument);
  return out;
}

/**
 * Play a single MIDI note on the soundfont for the given instrument.
 * Returns true on success, false if the soundfont couldn't load
 * (the caller should fall back to oscillator synthesis).
 */
export async function playSoundfontNote(
  ctx: AudioContext,
  midi: number,
  instrument: InstrumentType,
  when: number = ctx.currentTime,
  durationSec: number = 1.2,
): Promise<boolean> {
  let player = _cache.get(instrument);
  if (!player) {
    const loaded = await loadSoundfont(ctx, instrument);
    if (!loaded) return false;
    player = loaded;
  }
  try {
    const noteName = midiToNoteName(midi);
    player.play(noteName, when, {
      duration: durationSec,
      gain: 0.7,
    });
    return true;
  } catch (e) {
    console.warn("[soundfont] play failed:", e);
    return false;
  }
}

/**
 * Stop all currently-playing notes on the cached soundfonts.
 */
export function stopAllSoundfonts() {
  _cache.forEach((p) => {
    try {
      p.stop();
    } catch {
      /* ignore */
    }
  });
}

/**
 * True if soundfont samples are available for the given instrument.
 * Use this to decide whether to enable the "HD Sounds" toggle in the UI.
 */
export function soundfontAvailable(instrument: InstrumentType): boolean {
  return Boolean(INSTRUMENT_TO_SOUNDFONT[instrument]);
}

/**
 * Convert MIDI number to scientific pitch notation (e.g. 60 -> "C4").
 * soundfont-player's `play()` expects this format.
 */
export function midiToNoteName(midi: number): string {
  const names = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];
  const octave = Math.floor(midi / 12) - 1;
  const n = names[((midi % 12) + 12) % 12];
  return `${n}${octave}`;
}