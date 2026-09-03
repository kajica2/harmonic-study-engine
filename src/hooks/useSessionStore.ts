/**
 * Session store — persistent transport + playback-config state for
 * the practice session.
 *
 * Owns every piece of session state that survives a reload
 * (via localStorage hydration) and defines the practice session
 * itself: which path, what tempo, what backing style, what voicing,
 * what loop range, etc. UI-ephemeral state (modal visibility,
 * busy flags, recorder runtime) stays in App.tsx — that's
 * session 2 (`usePlaybackSync`) and session 3 (`useTransport`).
 *
 * Setters are stable across renders (they wrap useState's stable
 * setters), so this hook is safe to use as a source of truth for
 * effect dependency arrays in the rest of App.tsx.
 */

import { Dispatch, SetStateAction, useState } from "react";
import { HarmonicPath, ALL_PATHS } from "../lib/paths";
import { InstrumentType } from "../lib/audio";
import { BackingStyle } from "../lib/backingEngine";
import { TimeSignature } from "../lib/rhythm";
import { RenderMode } from "../lib/loopWav";
import { useHistory } from "../lib/useHistory";

// ---------- setter type aliases ------------------------------------------
//
// useState's setter has the form Dispatch<SetStateAction<T>>, which is
// `(value: T | ((prev: T) => T)) => void`. Consumers in App.tsx call
// setters with both forms (`setTempo(80)` and `setTempo(t => t + 5)`),
// so the hook's exposed type needs to match. Re-exporting the React
// types keeps the signature honest without re-declaring it.

export type Setter<T> = Dispatch<SetStateAction<T>>;

// ---------- safe hydration helpers ---------------------------------------
//
// localStorage reads can fail in private-mode browsers or when the
// stored value is corrupt JSON. The pattern below is repeated for
// every persisted field: try the parse, fall back to the default.
// Keeping the helpers private to this module so the rest of the app
// doesn't have to know about localStorage edge cases.

function loadString(key: string, fallback: string): string {
  try {
    const saved = localStorage.getItem(key);
    return saved ?? fallback;
  } catch {
    return fallback;
  }
}

function loadNumber(key: string, fallback: number): number {
  try {
    const saved = localStorage.getItem(key);
    return saved !== null ? Number(saved) : fallback;
  } catch {
    return fallback;
  }
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const saved = localStorage.getItem(key);
    return saved !== null ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

// ---------- store type ---------------------------------------------------

export type VoicingType = "closed" | "open";
export type ArpType =
  | "none"
  | "up"
  | "down"
  | "upDown"
  | "downUp"
  | "random"
  | "converge"
  | "diverge";

export interface KeyboardRange {
  from: number;
  to: number;
}

export interface SessionStore {
  // paths + cursor
  paths: HarmonicPath[];
  setPaths: Setter<HarmonicPath[]>;
  activePathIndex: number;
  setActivePathIndex: Setter<number>;
  activeStepIndex: number;
  setActiveStepIndex: Setter<number>;

  // transport
  tempo: number;
  /**
   * Tempo setter. Typed as useHistory's full signature (not Setter<number>)
   * because the underlying hook accepts `(prev: T) => T` updates — used by
   * the +/-5 hotkeys. If we move tempo off useHistory later, switch this
   * back to Setter<number>.
   */
  setTempo: (next: number | ((prev: number) => number)) => void;
  /** Undo/redo over tempo specifically — used by the +/- 5 hotkeys. */
  tempoHistory: ReturnType<typeof useHistory<number>>[2];

  timeSignature: TimeSignature;
  setTimeSignature: Setter<TimeSignature>;
  beatType: BackingStyle;
  setBeatType: Setter<BackingStyle>;
  transposeShift: number;
  setTransposeShift: Setter<number>;
  volume: number;
  setVolume: Setter<number>;

  // voicing + voicing optimization
  voicingType: VoicingType;
  setVoicingType: Setter<VoicingType>;
  optimizeVoiceLeading: boolean;
  setOptimizeVoiceLeading: Setter<boolean>;

  // instrument + per-track mutes
  instrument: InstrumentType;
  setInstrument: Setter<InstrumentType>;
  drumsMuted: boolean;
  setDrumsMuted: Setter<boolean>;
  bassMuted: boolean;
  setBassMuted: Setter<boolean>;
  pianoMuted: boolean;
  setPianoMuted: Setter<boolean>;

  // arpeggiator
  arpType: ArpType;
  setArpType: Setter<ArpType>;
  arpRate: number;
  setArpRate: Setter<number>;
  arpGate: number;
  setArpGate: Setter<number>;
  arpOctaves: number;
  setArpOctaves: Setter<number>;

  // persona + UI prefs
  selectedPersonaId: string;
  setSelectedPersonaId: Setter<string>;
  showTheoryLabels: boolean;
  setShowTheoryLabels: Setter<boolean>;
  kbRange: KeyboardRange;
  setKbRange: Setter<KeyboardRange>;

  // loop range + transport mode
  isLooping: boolean;
  setIsLooping: Setter<boolean>;
  loopStartBar: number | null;
  setLoopStartBar: Setter<number | null>;
  loopEndBar: number | null;
  setLoopEndBar: Setter<number | null>;

  // metronome click (rhythmEngine-driven, independent of the
  // backing-style drum patterns)
  metronomeOn: boolean;
  setMetronomeOn: Setter<boolean>;

  // WAV export mode (block / arpeggio / block-then-arp)
  wavMode: RenderMode;
  setWavMode: Setter<RenderMode>;
}

// ---------- the hook itself ----------------------------------------------

/**
 * Hydrate and expose the persistent session state. Call once at the
 * top of App; pass the returned object (or destructure pieces of it)
 * down to children. Children that need session state should consume
 * the hook directly when they become standalone refactors.
 */
export function useSessionStore(): SessionStore {
  // paths + cursor — paths hydration needs to know about ALL_PATHS,
  // so we inline it here rather than going through the helpers.
  // (Cyclic import risk if we pull ALL_PATHS into a helper module.)
  const [paths, setPaths] = useState<HarmonicPath[]>(() => {
    try {
      const saved = localStorage.getItem("synesthesia_paths");
      const parsed = saved ? JSON.parse(saved) : ALL_PATHS;
      // Bump: when v2 (study materials + new PATHS shape) ships and the
      // user has stale localStorage from before, merge in any missing
      // built-in paths so study materials appear without a manual reset.
      if (saved) {
        const ids = new Set((parsed as HarmonicPath[]).map((p) => p.id));
        const missing = ALL_PATHS.filter((p) => !ids.has(p.id));
        if (missing.length) return [...(parsed as HarmonicPath[]), ...missing];
      }
      return parsed as HarmonicPath[];
    } catch {
      return ALL_PATHS;
    }
  });

  const [activePathIndex, setActivePathIndex] = useState(() => {
    try {
      const saved = localStorage.getItem("synesthesia_activePathIndex");
      if (saved !== null) {
        const val = Number(saved);
        const savedPaths = localStorage.getItem("synesthesia_paths");
        const currentPaths = savedPaths ? JSON.parse(savedPaths) : null;
        if (val >= 0 && currentPaths && val < currentPaths.length) return val;
      }
    } catch {}
    return 0;
  });

  const [activeStepIndex, setActiveStepIndex] = useState(() => {
    try {
      const saved = localStorage.getItem("synesthesia_activeStepIndex");
      if (saved !== null) {
        const val = Number(saved);
        const savedPaths = localStorage.getItem("synesthesia_paths");
        const currentPaths = savedPaths ? JSON.parse(savedPaths) : null;
        const activePathIdxSaved = localStorage.getItem(
          "synesthesia_activePathIndex",
        );
        const activePathIdx = activePathIdxSaved
          ? Number(activePathIdxSaved)
          : 0;
        const currentPath = currentPaths?.[activePathIdx] ?? currentPaths?.[0];
        if (currentPath && val >= 0 && val < currentPath.steps.length)
          return val;
      }
    } catch {}
    return 0;
  });

  // transport
  const [tempo, setTempo, tempoHistory] = useHistory<number>(
    () => loadNumber("synesthesia_tempo", 60),
  );
  const [timeSignature, setTimeSignature] = useState<TimeSignature>(() =>
    loadJSON<TimeSignature>("synesthesia_timeSignature", "4/4"),
  );
  const [beatType, setBeatType] = useState<BackingStyle>(() => {
    try {
      const saved = localStorage.getItem("synesthesia_beatType");
      if (saved) {
        // Migrate old beat-type strings to the new BackingStyle names.
        // Modern BackingStyle values (swing / bossa / funk / latin /
        // ballad / clave3-2 / clave3-3 / afro-4-4 / afro-4-3 /
        // afro-3-4 / off) pass through unchanged — the migration
        // map only handles the 5 legacy strings the old UI emitted.
        const legacy = JSON.parse(saved) as string;
        const map: Record<string, BackingStyle> = {
          none: "off",
          metronome: "off",
          jazz: "swing",
          bossa: "bossa",
          techno: "funk",
        };
        if (legacy in map) return map[legacy];
        // Unknown / modern value — fall through to identity if it's
        // already a valid BackingStyle string, else default to "off".
        return (legacy as BackingStyle) ?? "off";
      }
      return "off";
    } catch {
      return "off";
    }
  });
  const [transposeShift, setTransposeShift] = useState(() =>
    loadNumber("synesthesia_transposeShift", 0),
  );
  const [volume, setVolume] = useState(() =>
    loadNumber("synesthesia_volume", 50),
  );

  // voicing
  const [voicingType, setVoicingType] = useState<VoicingType>(() => {
    const saved = loadString("synesthesia_voicingType", "closed");
    return saved === "open" ? "open" : "closed";
  });
  const [optimizeVoiceLeading, setOptimizeVoiceLeading] = useState(() =>
    loadBool("synesthesia_optimizeVoiceLeading", false),
  );

  // instrument + per-track mutes
  const [instrument, setInstrument] = useState<InstrumentType>(() =>
    loadJSON<InstrumentType>("synesthesia_instrument", "epiano"),
  );
  const [drumsMuted, setDrumsMuted] = useState(() =>
    loadString("synesthesia_drumsMuted", "") === "1",
  );
  const [bassMuted, setBassMuted] = useState(() =>
    loadString("synesthesia_bassMuted", "") === "1",
  );
  const [pianoMuted, setPianoMuted] = useState(() =>
    loadString("synesthesia_pianoMuted", "") === "1",
  );

  // arpeggiator
  const [arpType, setArpType] = useState<ArpType>(() =>
    loadJSON<ArpType>("synesthesia_arpType", "none"),
  );
  const [arpRate, setArpRate] = useState(() =>
    loadNumber("synesthesia_arpRate", 4),
  );
  const [arpGate, setArpGate] = useState(() =>
    loadNumber("synesthesia_arpGate", 80),
  );
  const [arpOctaves, setArpOctaves] = useState(() =>
    loadNumber("synesthesia_arpOctaves", 1),
  );

  // persona + UI prefs
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>(() =>
    loadString("synesthesia_selectedPersonaId", ""),
  );
  const [showTheoryLabels, setShowTheoryLabels] = useState(() =>
    loadBool("synesthesia_showTheoryLabels", false),
  );
  const [kbRange, setKbRange] = useState<KeyboardRange>(() =>
    loadJSON<KeyboardRange>("synesthesia_kbRange", { from: 36, to: 72 }),
  );

  // loop range + transport mode
  const [isLooping, setIsLooping] = useState(() =>
    loadBool("synesthesia_isLooping", true),
  );
  const [loopStartBar, setLoopStartBar] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem("synesthesia_loopStartBar");
      return saved !== null ? Number(saved) : null;
    } catch {
      return null;
    }
  });
  const [loopEndBar, setLoopEndBar] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem("synesthesia_loopEndBar");
      return saved !== null ? Number(saved) : null;
    } catch {
      return null;
    }
  });

  // metronome click — user-toggleable, default ON (matches the
  // historical "always click while playing" behavior). Persisted so
  // the preference survives reloads.
  const [metronomeOn, setMetronomeOn] = useState(() =>
    loadBool("synesthesia_metronomeOn", true),
  );

  // WAV export mode
  const [wavMode, setWavMode] = useState<RenderMode>(() =>
    loadJSON<RenderMode>("synesthesia_wavMode", "block"),
  );

  return {
    paths,
    setPaths,
    activePathIndex,
    setActivePathIndex,
    activeStepIndex,
    setActiveStepIndex,
    tempo,
    setTempo,
    tempoHistory,
    timeSignature,
    setTimeSignature,
    beatType,
    setBeatType,
    transposeShift,
    setTransposeShift,
    volume,
    setVolume,
    voicingType,
    setVoicingType,
    optimizeVoiceLeading,
    setOptimizeVoiceLeading,
    instrument,
    setInstrument,
    drumsMuted,
    setDrumsMuted,
    bassMuted,
    setBassMuted,
    pianoMuted,
    setPianoMuted,
    arpType,
    setArpType,
    arpRate,
    setArpRate,
    arpGate,
    setArpGate,
    arpOctaves,
    setArpOctaves,
    selectedPersonaId,
    setSelectedPersonaId,
    showTheoryLabels,
    setShowTheoryLabels,
    kbRange,
    setKbRange,
    isLooping,
    setIsLooping,
    loopStartBar,
    setLoopStartBar,
    loopEndBar,
    setLoopEndBar,
    metronomeOn,
    setMetronomeOn,
    wavMode,
    setWavMode,
  };
}