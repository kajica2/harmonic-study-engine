import React from "react";
import { NOTE_NAMES, PITCH_COLORS } from "../lib/theory";

interface PianoKeyboardProps {
  activeMidis: number[];
  onPlayNote?: (midi: number) => void;
  onStopNote?: (midi: number) => void;
  startMidi?: number; // default 48 (C3)
  octaves?: number; // default 2
}

export const PianoKeyboard: React.FC<PianoKeyboardProps> = ({
  activeMidis,
  onPlayNote,
  onStopNote,
  startMidi = 48,
  octaves = 2,
}) => {
  const numKeys = octaves * 12;

  const whiteKeys = [];
  const blackKeys = [];

  let whiteKeyIndex = 0;

  for (let i = 0; i < numKeys; i++) {
    const midi = startMidi + i;
    const noteClass = midi % 12;
    const isBlack = [1, 3, 6, 8, 10].includes(noteClass);
    const isActive = activeMidis.includes(midi);
    const noteName = NOTE_NAMES[noteClass];
    const color = PITCH_COLORS[noteName];

    if (isBlack) {
      blackKeys.push({
        midi,
        left: whiteKeyIndex - 0.5,
        isActive,
        color,
      });
    } else {
      whiteKeys.push({
        midi,
        index: whiteKeyIndex,
        isActive,
        color,
      });
      whiteKeyIndex++;
    }
  }

  const whiteKeyWidth = 100 / whiteKeys.length;

  return (
    <div className="relative w-full h-48 sm:h-64 select-none touch-none shadow-2xl rounded-b-xl overflow-hidden bg-gray-900 border-t-8 border-gray-950">
      {/* White Keys */}
      <div className="absolute inset-0 flex">
        {whiteKeys.map((key) => (
          <div
            key={key.midi}
            className={`h-full border-r border-gray-300 rounded-b-md transition-colors duration-200 
              ${key.isActive ? "" : "bg-white hover:bg-gray-100"} 
              active:bg-gray-200 cursor-pointer`}
            style={{
              width: `${whiteKeyWidth}%`,
              backgroundColor: key.isActive ? key.color : undefined,
              boxShadow: key.isActive
                ? `inset 0 0 20px rgba(0,0,0,0.4)`
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
            <div className="absolute bottom-4 w-full text-center text-xs font-mono text-gray-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
              {NOTE_NAMES[key.midi % 12]}
            </div>
          </div>
        ))}
      </div>

      {/* Black Keys */}
      <div className="absolute top-0 w-full h-2/3 pointer-events-none">
        {blackKeys.map((key) => (
          <div
            key={key.midi}
            className={`absolute h-full rounded-b border-x border-b border-black transition-colors duration-200 cursor-pointer pointer-events-auto z-10`}
            style={{
              left: `${key.left * whiteKeyWidth + whiteKeyWidth * 0.25}%`,
              width: `${whiteKeyWidth * 0.5}%`,
              backgroundColor: key.isActive ? key.color : "#1a202c",
              boxShadow: key.isActive
                ? `0 0 15px ${key.color}`
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
          />
        ))}
      </div>
    </div>
  );
};
