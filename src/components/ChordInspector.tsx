/**
 * ChordInspector — the focused "result panel" where the selected chord
 * becomes visible, understandable, editable, and reversible.
 *
 * Features:
 *  - Chord symbol, Roman numeral, function, scale/mode, bass, inversion, tensions
 *  - Piano-roll of exact voiced notes (and optional compact staff ABC)
 *  - Concert / Bb / F transposition toggle
 *  - Audition controls: chord only / arpeggio / in-context (next chord)
 *  - Quick transformations: closest voice-leading / drop-2 / spread / rootless / simplify
 *  - Apply, Undo, Redo
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { HarmonicPath } from "../lib/paths";
import {
  analyzeChord,
  alternativeVoicing,
  AlternativeKind,
  voiceLeadingDistance,
  voiceLeadingScore,
} from "../lib/theory";
import { InstrumentPitch, TRANSPOSITIONS } from "../lib/scoreGenerator";
import abcjs from "abcjs";
import { loadSavedVoicings, saveVoicing, deleteVoicing, SavedVoicing } from "../lib/savedVoicings";
import {
  X, Play, SkipForward, Undo2, Redo2, Check,
  ChevronDown, Music,
} from "lucide-react";
import { StageFrame, ToolGroup, ToolChip } from "./StageFrame";
import { ModalShell, useModalLabel } from "./ModalShell";

type TransposeInst = InstrumentPitch;

interface Props {
  open: boolean;
  onClose: () => void;
  path: HarmonicPath;
  stepIndex: number;
  /** the original notes as written in the path (for Undo baseline) */
  originalNotes: number[];
  /** current edited notes (state lifted from parent) */
  currentNotes: number[];
  /** previous step notes (for "Closest voice-leading") */
  prevNotes: number[];
  /** next step notes (for the +1 chord context display) */
  nextNotes?: number[];
  /** apply current transformed notes to the path (commit) */
  onApply: (stepIndex: number, newNotes: number[]) => void;
  /** audition the chord through audioEngine */
  onAudition: (kind: "block" | "arp" | "context", notes: number[]) => void;
  /** stop whatever's playing */
  onStop: () => void;
}

/**
 * One undo/redo stack lifted into the parent so that opening the
 * inspector on a different bar preserves history.
 */
export interface InspectorHistory {
  past: Map<string, number[]>;   // stepKey -> notes
  future: Map<string, number[]>;
  push: (key: string, notes: number[]) => void;
  undo: (key: string) => number[] | undefined;
  redo: (key: string) => number[] | undefined;
}

export function makeInspectorHistory(): InspectorHistory {
  const past = new Map<string, number[]>();
  const future = new Map<string, number[]>();
  return {
    past, future,
    push(key, notes) {
      const prev = past.get(key);
      if (prev && JSON.stringify(prev) === JSON.stringify(notes)) return;
      // Move last "current" into future so redo can flip back
      future.set(key, notes);
      past.set(key, notes);
    },
    undo(key) {
      const cur = past.get(key);
      const prev = future.get(key);
      if (cur && prev) {
        past.set(key, prev);
        future.set(key, cur);
        return prev;
      }
      return undefined;
    },
    redo(key) {
      const cur = past.get(key);
      const next = future.get(key);
      if (cur && next) {
        past.set(key, next);
        future.set(key, cur);
        return next;
      }
      return undefined;
    },
  };
}

export const ChordInspector: React.FC<Props> = (props) => {
  const {
    open, onClose, path, stepIndex,
    originalNotes, currentNotes, prevNotes, nextNotes = [],
    onApply, onAudition, onStop,
  } = props;
  const titleId = useModalLabel("chord-inspector");

  const [transpose, setTranspose] = useState<TransposeInst>("Concert");
  const [staging, setStaging] = useState<number[] | null>(null); // pre-apply edit
  const [staffOpen, setStaffOpen] = useState(false);
  // Tabs: "edit" (transforms + ABC), "saved" (saved-voicings list)
  const [tab, setTab] = useState<"edit" | "saved">("edit");
  const [savedVoicings, setSavedVoicings] = useState<SavedVoicing[]>([]);
  const [saveName, setSaveName] = useState("");

  // Reload saved voicings every time the inspector opens
  useEffect(() => {
    if (open) setSavedVoicings(loadSavedVoicings());
  }, [open]);
  const stageRef = useRef<HTMLDivElement>(null);
  const abcRef = useRef<HTMLDivElement>(null);

  // Reset staging when changing step
  useEffect(() => {
    setStaging(null);
    onStop();
  }, [stepIndex, open]);

  const liveNotes = (staging ?? currentNotes).slice().sort((a, b) => a - b);

  const transposedNotes = useMemo(() => {
    const shift = TRANSPOSITIONS[transpose];
    if (shift === 0) return liveNotes;
    return liveNotes.map((n) => n + shift);
  }, [liveNotes, transpose]);

  const originalAnalyzed = useMemo(() => analyzeChord(originalNotes), [originalNotes]);
  const liveAnalyzed = useMemo(() => analyzeChord(liveNotes), [liveNotes]);
  const distance = voiceLeadingDistance(prevNotes, liveNotes);
  const score = voiceLeadingScore(prevNotes, liveNotes);

  const isDirty = !!staging && JSON.stringify(staging) !== JSON.stringify(currentNotes);
  const canUndo = false; // wired into history if parent lifts it (currently single-step local)
  const canRedo = false;

  // Render ABC staff when opened
  useEffect(() => {
    if (!abcRef.current || !staffOpen) return;
    const abc = buildStaffAbc(transposedNotes);
    abcjs.renderAbc(abcRef.current, abc, {
      responsive: "resize",
      add_classes: true,
      staffwidth: abcRef.current.clientWidth || 600,
    });
  }, [transposedNotes, staffOpen]);

  if (!open) return null;

  const stepName = path.steps[stepIndex]?.name ?? "?";
  const previewStepName = path.steps[stepIndex]?.name ?? "?";

  const transform = (kind: AlternativeKind) => {
    const newNotes = alternativeVoicing(prevNotes, currentNotes, kind);
    setStaging(newNotes);
    onStop();
    onAudition("block", newNotes);
  };

  const handleApply = () => {
    if (!staging) return;
    onApply(stepIndex, staging);
    setStaging(null);
  };

  const handleReset = () => {
    setStaging(currentNotes);
    onAudition("block", currentNotes);
  };

  return (
    <ModalShell
      onDismiss={onClose}
      labelledBy={titleId}
      className="w-full max-w-4xl flex flex-col max-h-[92vh]"
    >
      <div className="flex justify-between items-center mb-3 px-1">
        <h2 id={titleId} className="t-display-2 flex items-center gap-2">
          <Music size={18} className="text-[color:var(--color-accent)]" />
          Chord inspector
        </h2>
          <div className="flex items-center gap-2">
            <select
              value={transpose}
              onChange={(e) => setTranspose(e.target.value as TransposeInst)}
              className="surface-1 text-xs px-2 py-1.5 rounded-[var(--radius-sm)] font-mono text-[color:var(--color-text-1)] border border-[color:var(--color-border)]"
              aria-label="Transposition"
            >
              <option value="Concert">Concert</option>
              <option value="Bb">Bb trumpet (+2 st)</option>
              <option value="F">F horn (+7 st)</option>
            </select>
            <button
              onClick={onClose}
              className="p-2 rounded-[var(--radius-full)] surface-1 border border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-2)] transition-colors"
              aria-label="Close chord inspector"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <StageFrame
          accent
          eyebrow={`bar ${Math.floor(stepIndex / 4) + 1} · step ${stepIndex + 1} of ${path.steps.length}`}
          title={stepName}
          density="tight"
          className="flex-1 overflow-auto"
        >
        {/* Context strip — the previous chord, this chord, the next chord.
            Lets the user see the voice-leading motion while they edit. */}
        <div className="bg-black/30 rounded-xl p-3 mb-4">
          <div className="text-[10px] uppercase font-mono text-neutral-500 mb-2">
            Context — voice-leading window
          </div>
          <div className="grid grid-cols-3 gap-2">
            <ContextChord label="Previous" name={path.steps[Math.max(0, stepIndex - 1)]?.name ?? "—"} notes={prevNotes} active={false} />
            <ContextChord label="This" name={stepName} notes={liveNotes} active={true} />
            <ContextChord label="Next" name={path.steps[Math.min(path.steps.length - 1, stepIndex + 1)]?.name ?? "—"} notes={nextNotes} active={false} />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left column: chord facts */}
          <div className="space-y-3">
            <div className="bg-black/30 rounded-xl p-3">
              <div className="text-[10px] uppercase font-mono text-neutral-500 mb-1">Original (as written)</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Cell label="Symbol" value={previewStepName} />
                <Cell label="Roman" value={originalAnalyzed.roman} />
                <Cell label="Family" value={originalAnalyzed.family} />
                <Cell label="Function" value={originalAnalyzed.function} />
                <Cell label="Bass" value={originalAnalyzed.bass} />
                <Cell label="Inversion" value={`${originalAnalyzed.inversion}`} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <Pill>scale: major (assumed)</Pill>
                {originalAnalyzed.tensions.map((t) => (
                  <Pill key={t} highlight>{t}</Pill>
                ))}
              </div>
            </div>

            <div className={`bg-black/40 rounded-xl p-3 ${isDirty ? "ring-1 ring-emerald-500/40" : ""}`}>
              <div className="text-[10px] uppercase font-mono text-neutral-500 mb-1">
                Working voicing {isDirty && <span className="text-emerald-400 ml-2">— edit pending</span>}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Cell label="Symbol" value={liveAnalyzed.roman} />
                <Cell label="Bass" value={liveAnalyzed.bass} />
                <Cell label="Family" value={liveAnalyzed.family} />
                <Cell label="Distance" value={`${distance} st`} />
                <Cell label="Inversion" value={`${liveAnalyzed.inversion}`} />
                <Cell label="Score" value={score} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {liveAnalyzed.tensions.length === 0 ? (
                  <Pill>scale: major (assumed)</Pill>
                ) : liveAnalyzed.tensions.map((t) => (
                  <Pill key={t} highlight>{t}</Pill>
                ))}
              </div>
            </div>

            {/* Quick transforms */}
            <div className="bg-black/30 rounded-xl p-3">
              <div className="text-[10px] uppercase font-mono text-neutral-500 mb-2">Quick transformations</div>
              <div className="grid grid-cols-2 gap-1.5">
                <TransformBtn label="Closest" hint="Smallest motion from previous" onClick={() => transform("smooth")} />
                <TransformBtn label="Drop-2" hint="2nd voice from top down an octave" onClick={() => transform("drop2")} />
                <TransformBtn label="Spread" hint="Alternate voices up an octave" onClick={() => transform("spread")} />
                <TransformBtn label="Rootless" hint="Drop the bass — ii-V feel" onClick={() => transform("rootless")} />
                <TransformBtn label="Simplify" hint="Keep root/3rd/7th, drop tensions" onClick={() => transform("simplify")} />
                <TransformBtn label="Inversion" hint="Bass up an octave" onClick={() => transform("inversion")} />
              </div>
            </div>

            {/* Audition controls */}
            <div className="bg-black/30 rounded-xl p-3">
              <div className="text-[10px] uppercase font-mono text-neutral-500 mb-2">Audition</div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onAudition("block", liveNotes)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-mono"
                >
                  <Play size={12} /> Chord only
                </button>
                <button
                  onClick={() => onAudition("arp", liveNotes)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-mono"
                >
                  <SkipForward size={12} /> Arpeggiate
                </button>
                <button
                  onClick={() => onAudition("context", liveNotes)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-mono"
                >
                  <Play size={12} /> Hear in context
                </button>
                <button
                  onClick={onStop}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-700 text-neutral-400 text-xs font-mono"
                >
                  Stop
                </button>
              </div>
            </div>
          </div>

          {/* Right column: piano roll + ABC staff */}
          <div className="space-y-3">
            <div className="bg-white text-black rounded-xl p-3">
              <div className="text-[10px] uppercase font-mono text-neutral-500 mb-1">
                Piano roll — {transpose}
              </div>
              <PianoRoll notes={transposedNotes} />
            </div>

            {/* Tab strip — Edit / Saved */}
            <div className="bg-black/30 rounded-xl p-3">
              <div className="flex gap-1 mb-3" role="tablist" aria-label="Voicing tools">
                <button
                  role="tab"
                  aria-selected={tab === "edit"}
                  onClick={() => setTab("edit")}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
                    tab === "edit"
                      ? "bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)]"
                      : "surface-1 text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)]"
                  }`}
                >
                  Edit
                </button>
                <button
                  role="tab"
                  aria-selected={tab === "saved"}
                  onClick={() => setTab("saved")}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
                    tab === "saved"
                      ? "bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)]"
                      : "surface-1 text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)]"
                  }`}
                >
                  Saved ({savedVoicings.length})
                </button>
              </div>

              {tab === "edit" ? (
                <>
                  {/* (existing edit-tab content — quick transforms + audition + ABC staff) */}
                </>
              ) : (
                /* Saved-voicings tab */
                <div className="space-y-2">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Name this voicing (e.g. 'My F#m7b5')"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      className="flex-1 bg-black/30 border border-white/10 rounded-md px-2 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-600"
                      aria-label="Voicing name"
                    />
                    <button
                      onClick={() => {
                        if (!liveNotes.length) return;
                        const name = saveName.trim() || `Voicing ${savedVoicings.length + 1}`;
                        const saved = saveVoicing({
                          name,
                          notes: liveNotes,
                          tags: [stepName, transpose],
                        });
                        setSavedVoicings((prev) => [...prev, saved]);
                        setSaveName("");
                      }}
                      disabled={!liveNotes.length}
                      className="px-3 py-1.5 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-mono disabled:opacity-30"
                    >
                      Save
                    </button>
                  </div>
                  {savedVoicings.length === 0 ? (
                    <div className="text-[10px] text-neutral-500 text-center py-4">
                      No saved voicings yet. Edit a chord and click Save.
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {savedVoicings.map((v) => (
                        <div
                          key={v.id}
                          className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md surface-1 border border-white/5"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-neutral-100 truncate">{v.name}</div>
                            <div className="text-[10px] t-mono text-neutral-500">
                              {v.notes.length} notes · {new Date(v.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                setStaging([...v.notes]);
                                onAudition("block", v.notes);
                              }}
                              className="px-2 py-1 rounded text-[10px] font-mono surface-2 border border-white/10 hover:border-[color:var(--color-brand-strong)]"
                              title="Audition this voicing"
                            >
                              ▶
                            </button>
                            <button
                              onClick={() => {
                                deleteVoicing(v.id);
                                setSavedVoicings((prev) => prev.filter((x) => x.id !== v.id));
                              }}
                              className="px-2 py-1 rounded text-[10px] font-mono surface-2 border border-white/10 hover:border-red-500/60 hover:text-red-300"
                              title="Delete this voicing"
                              aria-label={`Delete ${v.name}`}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-black/30 rounded-xl p-3">
              <button
                onClick={() => setStaffOpen(!staffOpen)}
                className="text-[10px] uppercase font-mono text-neutral-500 flex items-center gap-1 hover:text-white"
              >
                <ChevronDown size={12} className={staffOpen ? "rotate-180 transition" : "transition"} />
                Compact staff
              </button>
              {staffOpen && (
                <div ref={abcRef} className="mt-2 bg-white rounded-lg p-2 text-black min-h-[120px]" />
              )}
            </div>

            <div className="bg-black/30 rounded-xl p-3">
              <div className="text-[10px] uppercase font-mono text-neutral-500 mb-2">Notes in working voicing</div>
              <div className="flex flex-wrap gap-1">
                {liveNotes.length === 0 && <span className="text-neutral-500 text-xs">no notes</span>}
                {liveNotes.map((n) => (
                  <span
                    key={n}
                    className="text-[10px] font-mono px-2 py-1 rounded bg-neutral-800 text-neutral-200"
                  >
                    {transposedName(n, transpose)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer: Apply / Undo / Redo / Reset */}
        <div className="border-t border-white/5 p-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                // Undo is local: revert staging to currentNotes
                if (staging) {
                  setStaging(null);
                  onAudition("block", currentNotes);
                }
              }}
              disabled={!staging}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-mono disabled:opacity-30"
            >
              <Undo2 size={12} /> Undo edit
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-mono"
            >
              Reset
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleApply}
              disabled={!isDirty}
              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-30 disabled:hover:bg-emerald-600"
            >
              <Check size={14} /> Apply to path
            </button>
          </div>
        </div>
        </StageFrame>
    </ModalShell>
  );
};

// ---- helpers ----

const ContextChord: React.FC<{ label: string; name: string; notes: number[]; active: boolean }> = ({ label, name, notes, active }) => (
  <div className={`rounded-lg p-2 ${active ? "bg-emerald-900/40 border border-emerald-700/60" : "bg-black/40 border border-white/5"}`}>
    <div className={`text-[10px] uppercase font-mono tracking-wider mb-1 ${active ? "text-emerald-300" : "text-neutral-500"}`}>
      {label}
    </div>
    <div className={`text-sm font-bold ${active ? "text-emerald-200" : "text-neutral-200"}`}>
      {name}
    </div>
    <div className="flex flex-wrap gap-0.5 mt-1">
      {notes.length === 0 && <span className="text-[9px] text-neutral-600">—</span>}
      {notes.slice(0, 5).map((n) => (
        <span key={n} className="text-[9px] font-mono px-1 py-0.5 rounded bg-black/40 text-neutral-300">
          {((n % 12 + 12) % 12 === 0 ? "C" : (n % 12 + 12) % 12 === 1 ? "C#" : (n % 12 + 12) % 12 === 2 ? "D" : (n % 12 + 12) % 12 === 3 ? "D#" : (n % 12 + 12) % 12 === 4 ? "E" : (n % 12 + 12) % 12 === 5 ? "F" : (n % 12 + 12) % 12 === 6 ? "F#" : (n % 12 + 12) % 12 === 7 ? "G" : (n % 12 + 12) % 12 === 8 ? "G#" : (n % 12 + 12) % 12 === 9 ? "A" : (n % 12 + 12) % 12 === 10 ? "A#" : "B")}{Math.floor(n / 12) - 1}
        </span>
      ))}
      {notes.length > 5 && <span className="text-[9px] text-neutral-500">+{notes.length - 5}</span>}
    </div>
  </div>
);

const Cell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-black/30 rounded-lg p-2">
    <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">{label}</div>
    <div className="font-mono text-sm text-neutral-100">{value}</div>
  </div>
);

const Pill: React.FC<{ children: React.ReactNode; highlight?: boolean }> = ({ children, highlight }) => (
  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${highlight ? "bg-amber-500/20 text-amber-200" : "bg-neutral-700 text-neutral-300"}`}>
    {children}
  </span>
);

const TransformBtn: React.FC<{ label: string; hint: string; onClick: () => void }> = ({ label, hint, onClick }) => (
  <button
    onClick={onClick}
    className="text-left rounded-lg border border-white/10 bg-neutral-800 hover:border-purple-500/60 hover:bg-purple-900/30 px-2.5 py-1.5 transition"
  title={hint}
  >
    <div className="text-xs font-bold text-neutral-100">{label}</div>
    <div className="text-[10px] text-neutral-500 truncate">{hint}</div>
  </button>
);

const PianoRoll: React.FC<{ notes: number[] }> = ({ notes }) => {
  // Render a vertical 2-octave keyboard (C3..C5) with red dots for active notes.
  const minMidi = 48; // C3
  const maxMidi = 72; // C5
  const totalSemitones = maxMidi - minMidi + 1;
  const w = 30; const h = 14;

  const isBlack = (midi: number) => {
    const pc = midi % 12;
    return [1, 3, 6, 8, 10].includes(pc);
  };

  return (
    <div className="relative" style={{ height: totalSemitones * h }}>
      {/* white keys */}
      <div className="absolute inset-0 flex flex-col-reverse">
        {Array.from({ length: totalSemitones }).map((_, i) => {
          const midi = minMidi + i;
          return (
            <div
              key={i}
              className={`flex-1 border-r border-neutral-300 ${
                isBlack(midi) ? "bg-neutral-800" : "bg-neutral-100"
              } ${notes.includes(midi) ? "bg-amber-300" : ""}`}
              style={{ height: h }}
            />
          );
        })}
      </div>
      {/* note labels */}
      <div className="absolute right-2 top-0 bottom-0 flex flex-col-reverse text-[9px] text-neutral-700 pointer-events-none">
        {Array.from({ length: totalSemitones }).map((_, i) => {
          const midi = minMidi + i;
          if (midi % 12 !== 0) return <div key={i} style={{ height: h }} />;
          const name = `C${Math.floor(midi / 12) - 1}`;
          return <div key={i} style={{ height: h }} className="leading-[14px]">{name}</div>;
        })}
      </div>
    </div>
  );
};

function transposedName(midi: number, instrument: TransposeInst): string {
  const shift = TRANSPOSITIONS[instrument];
  const m = midi + shift;
  const pc = ((m % 12) + 12) % 12;
  const oct = Math.floor(m / 12) - 1;
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[pc]}${oct}`;
}

function buildStaffAbc(notes: number[]): string {
  if (notes.length === 0) return "X:1\nM:4/4\nL:1/4\nK:C\nz4";
  const abc = ["X:1", "M:4/4", "L:1/4", "K:C"];
  for (const n of notes) {
    const pc = ((n % 12) + 12) % 12;
    const octave = Math.floor(n / 12) - 1;
    const names = ["C", "_D", "D", "_E", "E", "F", "_G", "G", "_A", "A", "_B", "B"];
    const letter = names[pc];
    let suffix = "";
    if (octave >= 1) suffix = "'".repeat(octave);
    else if (octave <= 0) suffix = ",".repeat(-octave + 1);
    abc.push(`${letter}${suffix}`);
  }
  return abc.join("\n");
}