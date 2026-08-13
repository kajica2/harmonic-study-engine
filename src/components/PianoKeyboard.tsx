import React, { useState } from "react";
import { NOTE_NAMES, PITCH_COLORS } from "../lib/theory";

/**
 * Per-key layer. Each layer is a different stream of MIDI notes
 * shown on the piano in a distinct color. The user can toggle
 * layers on/off to compose a custom visualization.
 *
 * - chord  — static set: the current chord's notes (purple). These
 *            are the notes the piano "has available" for the moment.
 * - sound  — live: notes that are actually sounding right now
 *            (cyan). Includes what the user is playing on the
 *            piano + the synth chord + any arpeggio or backing
 *            track notes that are audible.
 * - bass   — live: backing track bass line (amber). Stub-only for
 *            now; populates when the backing engine plumbs its
 *            real-time note stream back to React.
 *
 * Notes in multiple layers stack their colors as concentric rings
 * inside the key, so a single key can read as "chord + sound"
 * vs. just "chord" at a glance.
 */
export type PianoLayerId = "chord" | "sound" | "bass";

interface LayerConfig {
  id: PianoLayerId;
  label: string;
  color: string;
  /** Short description for screen readers and tooltips. */
  hint: string;
}

const LAYER_DEFS: LayerConfig[] = [
  {
    id: "chord",
    label: "Chord",
    color: "#a78bfa", // violet-400
    hint: "Notes in the current chord (static, doesn't change while playing)",
  },
  {
    id: "sound",
    label: "Sounding",
    color: "#22d3ee", // cyan-400
    hint: "Notes currently audible (live)",
  },
  {
    id: "bass",
    label: "Bass",
    color: "#f59e0b", // amber-500
    hint: "Backing track bass line (live, requires engine plumbing)",
  },
];

interface PianoKeyboardProps {
  /** Currently audible synth notes (kept for backwards compat). */
  activeMidis: number[];
  /** Static chord-tone layer (default: current chord of the path). */
  chordMidis?: number[];
  /** Live sounding-notes layer (default: same as activeMidis). */
  soundingMidis?: number[];
  /** Live bass layer (default: empty until engine plumbs it). */
  bassMidis?: number[];
  onPlayNote?: (midi: number) => void;
  onStopNote?: (midi: number) => void;
  startMidi?: number;
  octaves?: number;
}

export const PianoKeyboard: React.FC<PianoKeyboardProps> = ({
  activeMidis,
  chordMidis = [],
  soundingMidis,
  bassMidis = [],
  onPlayNote,
  onStopNote,
  startMidi = 48,
  octaves = 2,
}) => {
  // Default the "sound" layer to the legacy `activeMidis` prop so
  // existing call sites (which only pass activeMidis) keep working.
  const liveSound = soundingMidis ?? activeMidis;

  // Each layer is toggleable. The user can show any combination.
  // Default: chord + sound ON, bass OFF (stub).
  const [enabled, setEnabled] = useState<Record<PianoLayerId, boolean>>({
    chord: true,
    sound: true,
    bass: false,
  });

  const toggle = (id: PianoLayerId) =>
    setEnabled((prev) => ({ ...prev, [id]: !prev[id] }));

  const numKeys = octaves * 12;
  const whiteKeys: Array<{
    midi: number;
    index: number;
    noteClass: number;
    isBlack: false;
    isChord: boolean;
    isSound: boolean;
    isBass: boolean;
    color: string;
  }> = [];
  const blackKeys: Array<{
    midi: number;
    left: number;
    isBlack: true;
    isChord: boolean;
    isSound: boolean;
    isBass: boolean;
    color: string;
  }> = [];

  let whiteKeyIndex = 0;
  for (let i = 0; i < numKeys; i++) {
    const midi = startMidi + i;
    const noteClass = midi % 12;
    const isBlack = [1, 3, 6, 8, 10].includes(noteClass);
    const isChord = enabled.chord && chordMidis.includes(midi);
    const isSound = enabled.sound && liveSound.includes(midi);
    const isBass = enabled.bass && bassMidis.includes(midi);
    const noteName = NOTE_NAMES[noteClass];
    const color = PITCH_COLORS[noteName];
    if (isBlack) {
      blackKeys.push({
        midi,
        left: whiteKeyIndex - 0.5,
        isBlack: true,
        isChord,
        isSound,
        isBass,
        color,
      });
    } else {
      whiteKeys.push({
        midi,
        index: whiteKeyIndex,
        noteClass,
        isBlack: false,
        isChord,
        isSound,
        isBass,
        color,
      });
      whiteKeyIndex++;
    }
  }

  const whiteKeyWidth = 100 / whiteKeys.length;

  return (
    <div>
      {/* Layer toggle row — a compact chip group above the piano
          that lets the user pick which layers are visible. Each
          chip is also a button so it's keyboard-accessible. */}
      <div
        className="flex items-center gap-1.5 mb-2 flex-wrap"
        role="group"
        aria-label="Piano display layers"
      >
        {LAYER_DEFS.map((layer) => {
          const active = enabled[layer.id];
          return (
            <button
              key={layer.id}
              onClick={() => toggle(layer.id)}
              title={layer.hint}
              aria-pressed={active}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider border transition-colors ${
                active
                  ? "surface-2 border-white/10 text-neutral-200"
                  : "surface-1 border-transparent text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full border"
                style={{
                  backgroundColor: active ? layer.color : "transparent",
                  borderColor: active ? layer.color : "currentColor",
                  opacity: active ? 1 : 0.4,
                }}
                aria-hidden="true"
              />
              {layer.label}
            </button>
          );
        })}
        <span className="text-[10px] t-mono text-neutral-500 ml-auto">
          Click a key to play
        </span>
      </div>

      <div className="relative w-full h-48 sm:h-64 select-none touch-none shadow-2xl rounded-b-xl overflow-hidden bg-gray-900 border-t-8 border-gray-950">
        {/* White Keys */}
        <div className="absolute inset-0 flex">
          {whiteKeys.map((key) => {
            // Stack the layer colors from outermost (chord) to
            // innermost (bass) as inset box-shadows. Empty when
            // no layer is active on this key.
            const layerShadows: string[] = [];
            if (key.isChord)
              layerShadows.push(
                "inset 0 0 0 2px rgba(167,139,250,0.95)",
                "inset 0 0 12px rgba(167,139,250,0.6)",
              );
            if (key.isSound)
              layerShadows.push(
                "inset 0 0 0 4px rgba(34,211,238,0.95)",
                "inset 0 0 18px rgba(34,211,238,0.5)",
              );
            if (key.isBass)
              layerShadows.push(
                "inset 0 0 0 6px rgba(245,158,11,0.95)",
                "inset 0 0 22px rgba(245,158,11,0.45)",
              );
            // Pick the strongest live layer as the key fill. The
            // bass ring sits on top so when the user is sounding
            // a note that IS the bass, the key glows amber, not
            // cyan. (Stacking the shadows above already enforces
            // the visual ordering for the ring outlines.)
            const fillColor = key.isBass
              ? "#f59e0b"
              : key.isSound
                ? "#22d3ee"
                : key.isChord
                  ? "#a78bfa"
                  : undefined;
            const labelColor = key.isChord || key.isSound || key.isBass
              ? "text-white drop-shadow"
              : "text-gray-400 opacity-60";
            return (
              <div
                key={key.midi}
                className={`h-full border-r border-gray-300 rounded-b-md transition-colors duration-200
                  ${fillColor ? "" : "bg-white hover:bg-gray-100"}
                  active:bg-gray-200 cursor-pointer`}
                style={{
                  width: `${whiteKeyWidth}%`,
                  backgroundColor: fillColor,
                  boxShadow:
                    layerShadows.length > 0
                      ? layerShadows.join(", ")
                      : "inset 0 -4px 6px rgba(0,0,0,0.1)",
                }}
                onMouseDown={() => onPlayNote?.(key.midi)}
                onMouseUp={() => onStopNote?.(key.midi)}
                onMouseLeave={() => onStopNote?.(key.midi)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  onPlayNote?.(key.midi);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  onStopNote?.(key.midi);
                }}
              >
                {/* Note name label — always visible (Fix #6).
                    Color flips to white when any layer is active. */}
                <div
                  className={`absolute bottom-4 w-full text-center text-xs font-mono font-bold ${labelColor}`}
                  aria-hidden="true"
                >
                  {NOTE_NAMES[key.midi % 12]}
                  <span className="text-[10px] block leading-none opacity-80">
                    {Math.floor(key.midi / 12) - 1}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Black Keys */}
        <div className="absolute top-0 w-full h-2/3 pointer-events-none">
          {blackKeys.map((key) => {
            const layerShadows: string[] = [];
            if (key.isChord)
              layerShadows.push(
                "inset 0 0 0 2px rgba(167,139,250,0.95)",
                "0 0 10px rgba(167,139,250,0.6)",
              );
            if (key.isSound)
              layerShadows.push(
                "inset 0 0 0 4px rgba(34,211,238,0.95)",
                "0 0 16px rgba(34,211,238,0.5)",
              );
            if (key.isBass)
              layerShadows.push(
                "inset 0 0 0 6px rgba(245,158,11,0.95)",
                "0 0 20px rgba(245,158,11,0.45)",
              );
            const fillColor = key.isBass
              ? "#f59e0b"
              : key.isSound
                ? "#22d3ee"
                : key.isChord
                  ? "#a78bfa"
                  : "#1a202c";
            const labelColor = key.isChord || key.isSound || key.isBass
              ? "text-white drop-shadow"
              : "text-gray-400 opacity-60";
            return (
              <div
                key={key.midi}
                className={`absolute h-full rounded-b border-x border-b border-black transition-colors duration-200 cursor-pointer pointer-events-auto z-10`}
                style={{
                  left: `${key.left * whiteKeyWidth + whiteKeyWidth * 0.25}%`,
                  width: `${whiteKeyWidth * 0.5}%`,
                  backgroundColor: fillColor,
                  boxShadow:
                    layerShadows.length > 0
                      ? layerShadows.join(", ")
                      : "inset -2px -4px 6px rgba(255,255,255,0.1)",
                }}
                onMouseDown={() => onPlayNote?.(key.midi)}
                onMouseUp={() => onStopNote?.(key.midi)}
                onMouseLeave={() => onStopNote?.(key.midi)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  onPlayNote?.(key.midi);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  onStopNote?.(key.midi);
                }}
              >
                <div
                  className={`absolute bottom-1 w-full text-center font-mono text-[10px] font-bold ${labelColor}`}
                  aria-hidden="true"
                >
                  {NOTE_NAMES[key.midi % 12]}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};