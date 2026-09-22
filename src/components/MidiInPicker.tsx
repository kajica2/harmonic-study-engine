/**
 * src/components/MidiInPicker.tsx — the "IN" device chip + screen-reader
 * live region that sit in the top toolbar.
 *
 * Owns its transient note-status state so inbound MIDI note events never
 * re-render the whole App tree. Previously the chip text lived in App
 * state and was updated by a window "midin" listener on *every* note
 * on/off (dozens of setStates per second during a session). Now the
 * subscription lives here and only this component re-renders.
 */

import React, { useEffect, useRef, useState } from "react";

// NOTE_NAMES is constant — hoisted out of the hot "midin" handler.
const NOTE_NAMES = [
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

interface MidiInPickerProps {
  /** Available input devices (id + name). */
  inputs: { id: string; name: string }[];
  /** Currently selected device id ("" = none selected). */
  selectedId: string;
  /** Called when the user picks a device from the dropdown. */
  onSelect: (id: string) => void;
}

export const MidiInPicker: React.FC<MidiInPickerProps> = ({
  inputs,
  selectedId,
  onSelect,
}) => {
  const [status, setStatus] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onMidinEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        type: string;
        note: number;
        velocity: number;
        channel: number;
      };
      const name = NOTE_NAMES[detail.note % 12];
      const octave = Math.floor(detail.note / 12) - 1;
      setStatus(
        `${detail.type === "noteon" ? "♪" : "·"} ${name}${octave}` +
          ` v${detail.velocity} - ch${detail.channel}`,
      );
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setStatus(""), 1500);
    };
    window.addEventListener("midin", onMidinEvent);
    return () => {
      window.removeEventListener("midin", onMidinEvent);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <>
      {/* Phase 5: MIDI IN picker. Mirrors the OUT chip — same visual
          language, different color story (cyan vs purple). Lists
          available input devices; "no devices" or "unsupported" for
          browsers without Web MIDI (Firefox without extension). When
          an event arrives, the chip briefly shows the note (e.g.
          "♪ A4 v96") and an aria-live region announces it. */}
      <div
        className="flex items-center gap-2 bg-neutral-900/50 px-2 py-1.5 rounded border border-neutral-800"
        title="MIDI input from a connected controller or instrument. Listens for note on/off and dispatches 'midin' events on window."
        aria-label="MIDI input device"
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{
            backgroundColor:
              inputs.length === 0
                ? "#6b7280" // gray — no inputs
                : selectedId
                  ? "#22c55e" // green — listening
                  : "#06b6d4", // cyan — devices available, none selected
          }}
          aria-hidden="true"
        />
        <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
          IN
        </span>
        {status ? (
          <span className="text-xs text-emerald-300 t-mono" aria-hidden="true">
            {status}
          </span>
        ) : inputs.length === 0 ? (
          <span className="text-xs text-neutral-400 italic">no inputs</span>
        ) : (
          <select
            value={selectedId}
            onChange={(e) => onSelect(e.target.value)}
            className="bg-transparent text-neutral-300 outline-none cursor-pointer text-xs"
            aria-label="Select MIDI input device"
          >
            <option value="">none</option>
            {inputs.map((inp) => (
              <option key={inp.id} value={inp.id}>
                {inp.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {/* Screen-reader announcement of inbound MIDI note events. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {status
          ? `MIDI input: ${status.replace(/^[♪·]\s*/, "")}`
          : inputs.length === 0
            ? "MIDI input: no devices connected"
            : selectedId
              ? `MIDI input: listening on ${
                  inputs.find((x) => x.id === selectedId)?.name ?? ""
                }`
              : "MIDI input: devices available, none selected"}
      </div>
    </>
  );
};

export default MidiInPicker;