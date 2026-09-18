/**
 * useMidiDevices — MIDI in/out device lists + selection + the engine
 * init/subscription effect. Extracted from App (rerender-split-combined-
 * hooks) so transport wiring doesn't sit in the giant session/UI tree.
 */

import { useEffect, useState } from "react";
import { audioEngine } from "../lib/audio";
import { midiIn } from "../lib/midiIn";
import { midiOut } from "../lib/midiOut";

export function useMidiDevices() {
  const [midiOutputs, setMidiOutputs] = useState<any[]>([]);
  const [selectedMidiOutId, setSelectedMidiOutId] = useState<string>("");
  // Phase 5: MIDI input state — mirrors the MIDI Out pattern.
  const [midiInputs, setMidiInputs] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [selectedMidiInId, setSelectedMidiInId] = useState<string>("");

  useEffect(() => {
    // Initialize audio engine on first interaction
    const handleFirstInteraction = () => {
      audioEngine.init();
      midiOut.init();
      midiIn.init();
      window.removeEventListener("keydown", handleFirstInteraction);
      window.removeEventListener("mousedown", handleFirstInteraction);
    };
    window.addEventListener("keydown", handleFirstInteraction);
    window.addEventListener("mousedown", handleFirstInteraction);

    // Subscribe to MIDI outputs
    const unsubscribeMidi = midiOut.onOutputsChange((outputs) => {
      setMidiOutputs(outputs);
      setSelectedMidiOutId(midiOut.getSelectedOutputId() || "");
    });

    // Subscribe to MIDI inputs (Phase 5)
    const unsubscribeMidiIn = midiIn.onInputsChange((inputs) => {
      setMidiInputs(inputs);
      setSelectedMidiInId(midiIn.getSelectedInputId() || "");
    });

    // Inbound "midin" note-event subscription lives in MidiInPicker
    // (it re-renders only itself, not the whole app, per note event).

    return () => {
      window.removeEventListener("keydown", handleFirstInteraction);
      window.removeEventListener("mousedown", handleFirstInteraction);
      unsubscribeMidi();
      unsubscribeMidiIn();
    };
  }, []);

  return {
    midiOutputs,
    selectedMidiOutId,
    setSelectedMidiOutId,
    midiInputs,
    selectedMidiInId,
    setSelectedMidiInId,
  };
}