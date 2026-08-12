/**
 * InspectPanel — "make Step Chord musical" panel.
 *
 * Renders the active chord + the previous chord, with:
 *  - voice-leading distance & score
 *  - one contextual alternative voicing (inversion / drop2 / smooth)
 *  - A/B toggle so the user can choose the active voicing
 *
 * Step Chord click should also fire `onPlayChord(notes)` so audioEngine
 * auditions the chosen voicing.
 */

import React, { useMemo, useState } from "react";
import { HarmonicPath } from "../lib/paths";
import {
  voiceLeadingDistance,
  voiceLeadingScore,
  alternativeVoicing,
  AlternativeKind,
} from "../lib/theory";
import { Play, Square, GitCompareArrows, Star } from "lucide-react";

const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];
function midiToName(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

interface Props {
  path: HarmonicPath;
  activeStepIndex: number;
  optimizedNotes: number[][];
  onPlayChord: (notes: number[]) => void;
  onStopChord: (notes: number[]) => void;
  onCommitVoicing: (stepIndex: number, notes: number[]) => void;
}

export const InspectPanel: React.FC<Props> = ({
  path, activeStepIndex, optimizedNotes,
  onPlayChord, onStopChord, onCommitVoicing,
}) => {
  const step = path.steps[activeStepIndex];
  const prevStep = path.steps[Math.max(0, activeStepIndex - 1)];
  const currNotes = optimizedNotes[activeStepIndex] ?? [];
  const prevNotes = optimizedNotes[Math.max(0, activeStepIndex - 1)] ?? [];
  const origNotes = step?.notes ?? [];

  // Three candidate voicings for the active chord
  const candidates = useMemo(() => {
    const out: { kind: AlternativeKind | "original"; notes: number[]; label: string; desc: string }[] = [];
    out.push({ kind: "original", notes: origNotes, label: "Original", desc: "as written in the path" });
    out.push({
      kind: "smooth",
      notes: alternativeVoicing(prevNotes, origNotes, "smooth"),
      label: "Smoothest next voicing",
      desc: "applied voice-leading from previous chord",
    });
    out.push({
      kind: "inversion",
      notes: alternativeVoicing(prevNotes, origNotes, "inversion"),
      label: "Inverted (bass → up an octave)",
      desc: "raise the bass by an octave",
    });
    out.push({
      kind: "drop2",
      notes: alternativeVoicing(prevNotes, origNotes, "drop2"),
      label: "Drop-2",
      desc: "second voice from top drops an octave (jazz voicing)",
    });
    return out;
  }, [origNotes, prevNotes]);

  const [activeKind, setActiveKind] = useState<AlternativeKind | "original">("original");
  const [compare, setCompare] = useState(false);

  const activeNotes = (candidates.find((c) => c.kind === activeKind) ?? candidates[0]).notes;

  const distance = voiceLeadingDistance(prevNotes, activeNotes);
  const score = voiceLeadingScore(prevNotes, activeNotes);

  // Play the active voicing (and stop the previous)
  const audition = () => {
    if (prevNotes.length) onStopChord(prevNotes);
    onPlayChord(activeNotes);
  };

  if (!step) return null;

  return (
    <div className="bg-[color:var(--color-bg-1)] border border-[color:var(--color-border)] rounded-[var(--radius-lg)] p-3 mt-3">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <GitCompareArrows size={14} className="text-purple-400" />
        <span className="text-xs uppercase tracking-widest text-neutral-400 font-bold">
          Inspect · bar {Math.floor(activeStepIndex / 4) + 1} · step {activeStepIndex + 1}
        </span>
        <span className="ml-auto text-[10px] font-mono text-neutral-500">
          {prevStep?.name ?? "—"} → {step.name}
        </span>
      </div>

      {/* Score */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-black/30 rounded-lg p-2">
          <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-mono">
            Voice-leading distance
          </div>
          <div className="font-mono text-sm text-purple-300">{distance} st</div>
        </div>
        <div className="bg-black/30 rounded-lg p-2">
          <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-mono">
            Score
          </div>
          <div className="font-mono text-sm text-emerald-300">{score}</div>
        </div>
      </div>

      {/* A/B candidates — each card auditions its own voicing on click */}
      <div className="flex flex-col gap-1.5 mb-2">
        {candidates.map((c) => {
          const isActive = c.kind === activeKind;
          const showCompare = compare && c.kind !== activeKind;
          return (
            <button
              key={c.kind}
              onClick={() => {
                setActiveKind(c.kind);
                onStopChord(prevNotes);
                onPlayChord(c.notes);
              }}
              className={`text-left rounded-lg p-2 border transition flex items-start gap-2 ${
                isActive
                  ? "border-purple-500 bg-purple-700/30"
                  : showCompare
                  ? "border-emerald-500/40 bg-emerald-700/10"
                  : "border-white/10 bg-white/5 hover:border-purple-500/40"
              }`}
              title={`Preview the ${c.label.toLowerCase()} voicing in isolation`}
            >
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${isActive ? "text-purple-200" : "text-neutral-200"}`}>
                    {c.label}
                  </span>
                  {c.kind === "original" && (
                    <Star size={10} className="text-amber-300" />
                  )}
                  {showCompare && (
                    <span className="text-[10px] font-mono text-emerald-300">
                      (B)
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-neutral-500 italic">{c.desc}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {c.notes.map((n, i) => (
                    <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 bg-black/40 rounded text-neutral-300">
                      {midiToName(n)}
                    </span>
                  ))}
                </div>
              </div>
              {/* Per-voicing play icon — visually says "tap to hear only this voicing" */}
              <span
                aria-label={`Play ${c.label} voicing`}
                className="self-center px-2 py-1 rounded bg-purple-700/40 text-purple-200 hover:bg-purple-700/60"
              >
                <Play size={12} />
              </span>
              {isActive && (
                <span className="text-[10px] font-mono text-purple-400 self-center">active</span>
              )}
            </button>
          );
        })}
      </div>

      {/* A/B Compare bar */}
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => setCompare(!compare)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono ${
            compare ? "bg-emerald-700/40 text-emerald-200" : "bg-neutral-800 text-neutral-400 hover:text-white"
          }`}
        >
          <GitCompareArrows size={12} /> A/B compare
        </button>
        <button
          onClick={audition}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono bg-purple-600 hover:bg-purple-500 text-white"
          title="Replay the currently selected voicing in isolation"
        >
          <Play size={12} /> Preview voicing
        </button>
        <button
          onClick={() => onStopChord(activeNotes)}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
          title="Stop preview playback"
        >
          <Square size={12} /> Stop
        </button>
        <button
          onClick={() => onCommitVoicing(activeStepIndex, activeNotes)}
          disabled={activeKind === "original"}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40 disabled:hover:bg-emerald-700"
          title="Write this voicing back into the path (use Undo in the inspector to revert)"
        >
          Commit voicing
        </button>
      </div>

      <div className="text-[10px] font-mono text-neutral-600 mt-1">
        Step Chord now moves a timeline cursor and plays the chosen voicing. Pick "Smoothest" for the
        smallest motion, "Drop-2" for a jazz feel, or commit your choice back into the path.
      </div>
    </div>
  );
};