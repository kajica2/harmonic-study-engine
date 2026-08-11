import React, { useEffect, useState, useRef } from "react";
import { HarmonicPath } from "../lib/paths";
import { Persona } from "../lib/personas";
import { InspectPanel } from "./InspectPanel";
import {
  Music,
  Play,
  Pause,
  Square,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  FileDown,
  Check,
  Circle,
} from "lucide-react";

type Stage = "choose" | "perform" | "commit";

interface RailProps {
  paths: HarmonicPath[];
  activePath: HarmonicPath;
  activePathIndex: number;
  setActivePathIndex: (i: number) => void;
  // performance controls (lifted from App)
  isPlayingAuto: boolean;
  setIsPlayingAuto: (v: boolean) => void;
  isLooping: boolean;
  setIsLooping: (v: boolean) => void;
  tempo: number;
  setTempo: (v: number) => void;
  meter: string; // "4/4" | "3/4" | ...
  beat: string;  // "metronome" | "jazz" | ...
  setMeter: (v: string) => void;
  setBeat: (v: string) => void;
  transposeShift: number;
  setTransposeShift: (v: number) => void;
  selectedPersonaId: string;
  setSelectedPersonaId: (id: string) => void;
  personas: Persona[];
  // active step
  activeStepIndex: number;
  setActiveStepIndex: (v: number) => void;
  // commit/export
  onCommit: () => void;
  onExportMidi: () => void;
  onOpenLeadSheet: () => void;
  // progress (optional external override; default derived from current state)
  loopBarFrom?: number;
  loopBarTo?: number;
  setLoopBar?: (from: number, to: number) => void;
  // inspect / voicing control
  optimizedStepsNotes: number[][];
  onPlayChord: (notes: number[]) => void;
  onStopChord: (notes: number[]) => void;
  onCommitVoicing: (stepIndex: number, notes: number[]) => void;
}

const STAGE_LABELS: Record<Stage, { title: string; subtitle: string }> = {
  choose:  { title: "Choose Path",     subtitle: "Pick a curated 16-bar harmonic preset" },
  perform: { title: "Perform",         subtitle: "Audition / practice / revise" },
  commit:  { title: "Commit & Export", subtitle: "Save the take — MIDI, lead sheet, session" },
};

const STAGE_ORDER: Stage[] = ["choose", "perform", "commit"];

export const PlaySessionRail: React.FC<RailProps> = (p) => {
  // Stage is derived from user actions; user can still navigate explicitly.
  const [stage, setStage] = useState<Stage>("choose");
  const [advOpen, setAdvOpen] = useState(false);

  // Derive active step → bar (4 chords per bar)
  const totalBars = Math.ceil(p.activePath.steps.length / 4);

  const advance = () => {
    const idx = STAGE_ORDER.indexOf(stage);
    if (idx < STAGE_ORDER.length - 1) setStage(STAGE_ORDER[idx + 1]);
  };
  const back = () => {
    const idx = STAGE_ORDER.indexOf(stage);
    if (idx > 0) setStage(STAGE_ORDER[idx - 1]);
  };

  // Auto-advance heuristics
  useEffect(() => {
    if (stage === "choose" && p.activePath) advance();
  }, [p.activePathIndex]);
  useEffect(() => {
    if (stage === "perform" && p.isPlayingAuto) {
      // already on perform; nothing to do
    }
  }, [p.isPlayingAuto, stage]);

  const currentStage = (n: number) =>
    n < STAGE_ORDER.indexOf(stage)
      ? "done"
      : n === STAGE_ORDER.indexOf(stage) ? "active" : "pending";

  const persona = p.personas.find((x) => x.id === p.selectedPersonaId) ?? p.personas[0];

  return (
    <div className="bg-black/40 border border-white/10 rounded-2xl p-4 mb-3 shadow-xl">
      {/* Stage progress */}
      <div className="flex items-center gap-3 mb-3">
        {STAGE_ORDER.map((s, i) => {
          const status = currentStage(i);
          return (
            <div key={s} className="flex-1 flex items-center gap-2">
              <button
                onClick={() => setStage(s)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap transition ${
                  status === "active"
                    ? "bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]"
                    : status === "done"
                    ? "bg-emerald-700/40 text-emerald-200 hover:bg-emerald-700/60"
                    : "bg-neutral-800 text-neutral-500 hover:text-white"
                }`}
              >
                {status === "done" ? (
                  <Check size={12} />
                ) : status === "active" ? (
                  <Circle size={12} className="animate-pulse" />
                ) : (
                  <Circle size={12} />
                )}
                {i + 1}. {STAGE_LABELS[s].title}
              </button>
              {i < STAGE_ORDER.length - 1 && (
                <div className={`flex-1 h-px ${status === "done" ? "bg-emerald-700/60" : "bg-neutral-700"}`} />
              )}
            </div>
          );
        })}
      </div>

      <div className="text-xs text-neutral-400 font-mono mb-2">
        {STAGE_LABELS[stage].subtitle}
      </div>

      {/* Stage content */}
      {stage === "choose" && (
        <ChooseStage
          paths={p.paths}
          activePathId={p.activePath?.id}
          onSelectById={(id) => {
            const i = p.paths.findIndex((x) => x.id === id);
            if (i >= 0) p.setActivePathIndex(i);
            setStage("perform");
          }}
          personas={p.personas}
          selectedPersonaId={p.selectedPersonaId}
          onPersona={p.setSelectedPersonaId}
        />
      )}
      {stage === "perform" && (
        <PerformStage
          path={p.activePath}
          isPlayingAuto={p.isPlayingAuto}
          setIsPlayingAuto={p.setIsPlayingAuto}
          isLooping={p.isLooping}
          setIsLooping={p.setIsLooping}
          tempo={p.tempo}
          setTempo={p.setTempo}
          meter={p.meter}
          beat={p.beat}
          setMeter={p.setMeter}
          setBeat={p.setBeat}
          transposeShift={p.transposeShift}
          setTransposeShift={p.setTransposeShift}
          persona={persona}
          personas={p.personas}
          selectedPersonaId={p.selectedPersonaId}
          onPersona={p.setSelectedPersonaId}
          activeStepIndex={p.activeStepIndex}
          setActiveStepIndex={p.setActiveStepIndex}
          optimizedStepsNotes={p.optimizedStepsNotes}
          onPlayChord={p.onPlayChord}
          onStopChord={p.onStopChord}
          onCommitVoicing={p.onCommitVoicing}
        />
      )}
      {stage === "commit" && (
        <CommitStage
          path={p.activePath}
          onCommit={p.onCommit}
          onExportMidi={p.onExportMidi}
          onOpenLeadSheet={p.onOpenLeadSheet}
        />
      )}

      <div className="flex items-center justify-between mt-3">
        <button
          onClick={back}
          disabled={STAGE_ORDER.indexOf(stage) === 0}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-mono text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400"
        >
          <ChevronLeft size={12} /> Back
        </button>
        <button
          onClick={() => setAdvOpen(!advOpen)}
          className="px-3 py-1.5 rounded text-xs font-mono text-neutral-500 hover:text-white"
        >
          {advOpen ? "Hide" : "Show"} advanced controls
        </button>
        <button
          onClick={advance}
          disabled={STAGE_ORDER.indexOf(stage) === STAGE_ORDER.length - 1}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-mono text-neutral-300 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-300"
        >
          Next <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
};

// =====================================================================
// Sub-stages
// =====================================================================

const ChooseStage: React.FC<{
  paths: HarmonicPath[];
  activePathId?: string;
  onSelectById: (id: string) => void;
  personas: Persona[];
  selectedPersonaId: string;
  onPersona: (id: string) => void;
}> = ({ paths, activePathId, onSelectById, personas, selectedPersonaId, onPersona }) => {
  const [showAll, setShowAll] = useState(false);
  const curated = paths.filter((x) => x.mvpReady);
  const others = paths.filter((x) => !x.mvpReady);
  const visible = showAll ? paths : curated;
  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
        {visible.map((path) => {
          const isActive = path.id === activePathId;
          return (
            <button
              key={path.id}
              onClick={() => onSelectById(path.id)}
              className={`min-w-[14rem] text-left rounded-xl p-3 border transition ${
                isActive
                  ? "border-purple-500 bg-purple-700/20"
                  : "border-white/10 bg-black/30 hover:border-purple-500/50"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Music size={14} className="text-purple-400" />
                <span className="font-bold text-xs">{path.title.replace(/^Path [IVXL]+:\s*/, "")}</span>
                {path.mvpReady && (
                  <span className="ml-auto text-[10px] font-mono text-emerald-400 border border-emerald-700/40 px-1.5 py-0.5 rounded">
                    MVP
                  </span>
                )}
              </div>
              <div className="text-[11px] text-neutral-400 mb-2">{path.description}</div>
              <div className="flex gap-1 flex-wrap">
                {path.steps.slice(0, 4).map((s, i) => (
                  <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 bg-white/5 rounded text-neutral-300">
                    {s.name}
                  </span>
                ))}
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-white/5 rounded text-neutral-500">
                  +{path.steps.length - 4}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {!showAll && others.length > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="text-xs text-neutral-400 hover:text-white font-mono mb-3"
        >
          Show all {others.length + curated.length} paths
        </button>
      )}
      {showAll && (
        <button
          onClick={() => setShowAll(false)}
          className="text-xs text-neutral-400 hover:text-white font-mono mb-3"
        >
          Hide non-MVP paths
        </button>
      )}

      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-neutral-400 font-mono">Persona</span>
        <div className="flex gap-1 overflow-x-auto">
          {personas.map((pp) => (
            <button
              key={pp.id}
              onClick={() => onPersona(pp.id)}
              className={`px-2 py-1 rounded text-xs font-mono whitespace-nowrap ${
                pp.id === selectedPersonaId
                  ? "bg-purple-600 text-white"
                  : "bg-white/5 text-neutral-300 hover:bg-white/10"
              }`}
              title={pp.quote ?? pp.name}
            >
              {pp.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const PerformStage: React.FC<{
  path: HarmonicPath;
  isPlayingAuto: boolean;
  setIsPlayingAuto: (v: boolean) => void;
  isLooping: boolean;
  setIsLooping: (v: boolean) => void;
  tempo: number;
  setTempo: (v: number) => void;
  meter: string;
  beat: string;
  setMeter: (v: string) => void;
  setBeat: (v: string) => void;
  transposeShift: number;
  setTransposeShift: (v: number) => void;
  persona: Persona;
  personas: Persona[];
  selectedPersonaId: string;
  onPersona: (id: string) => void;
  activeStepIndex: number;
  setActiveStepIndex: (v: number) => void;
  optimizedStepsNotes: number[][];
  onPlayChord: (notes: number[]) => void;
  onStopChord: (notes: number[]) => void;
  onCommitVoicing: (stepIndex: number, notes: number[]) => void;
}> = ({
  path,
  isPlayingAuto, setIsPlayingAuto,
  isLooping, setIsLooping,
  tempo, setTempo,
  meter, beat, setMeter, setBeat,
  transposeShift, setTransposeShift,
  persona, personas, selectedPersonaId, onPersona,
  activeStepIndex, setActiveStepIndex,
  optimizedStepsNotes, onPlayChord, onStopChord, onCommitVoicing,
}) => {
  const totalBars = Math.ceil(path.steps.length / 4);
  const currentBar = Math.floor(activeStepIndex / 4) + 1;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <button
          onClick={() => setIsPlayingAuto(!isPlayingAuto)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold"
        >
          {isPlayingAuto ? <Pause size={16} /> : <Play size={16} className="translate-x-[1px]" />}
          {isPlayingAuto ? "Pause" : "Audition"}
        </button>
        <button
          onClick={() => {
            setIsPlayingAuto(false);
            setActiveStepIndex(0);
          }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-mono"
        >
          <Square size={14} /> Stop
        </button>
        <button
          onClick={() => setIsLooping(!isLooping)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono ${
            isLooping ? "bg-emerald-700/40 text-emerald-200" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
          }`}
        >
          <RefreshCw size={14} /> Loop
        </button>

        <div className="flex items-center gap-2 text-xs font-mono text-neutral-300">
          <span>Tempo</span>
          <input
            type="range"
            min={50}
            max={240}
            value={tempo}
            onChange={(e) => setTempo(Number(e.target.value))}
            className="w-28 accent-purple-500"
          />
          <span className="w-12 text-right">{tempo} BPM</span>
        </div>

        <select
          value={meter}
          onChange={(e) => setMeter(e.target.value)}
          className="bg-neutral-800 text-xs text-neutral-300 rounded-lg px-2 py-1.5 outline-none"
        >
          <option value="4/4">4/4</option>
          <option value="3/4">3/4</option>
          <option value="6/8">6/8</option>
        </select>
        <select
          value={beat}
          onChange={(e) => setBeat(e.target.value)}
          className="bg-neutral-800 text-xs text-neutral-300 rounded-lg px-2 py-1.5 outline-none"
        >
          <option value="none">No beat</option>
          <option value="metronome">Metronome</option>
          <option value="jazz">Jazz Ride</option>
          <option value="bossa">Bossa</option>
          <option value="techno">Techno</option>
        </select>
      </div>

      {/* Bar / loop */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-mono text-neutral-400">Position</span>
        <span className="text-xs font-mono text-neutral-200">
          Bar {currentBar} / {totalBars} — Step {activeStepIndex + 1} / {path.steps.length}
        </span>
        <span className="ml-auto text-xs font-mono text-neutral-400">
          Transpose {transposeShift > 0 ? "+" : ""}
          {transposeShift} st
        </span>
        <button
          onClick={() => setTransposeShift(transposeShift - 1)}
          className="px-2 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs"
        >
          −
        </button>
        <button
          onClick={() => setTransposeShift(transposeShift + 1)}
          className="px-2 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs"
        >
          +
        </button>
      </div>

      {/* Strip of bars for direct seek + loop region */}
      <div className="flex items-stretch gap-1 overflow-x-auto pb-2">
        {Array.from({ length: totalBars }).map((_, barIdx) => {
          const stepIdx = barIdx * 4;
          const chordName = path.steps[stepIdx]?.name ?? "";
          const isActiveBar = currentBar === barIdx + 1;
          return (
            <button
              key={barIdx}
              onClick={() => {
                // Step Chord is now musical:
                // advance timeline cursor + audition the chord immediately.
                setActiveStepIndex(stepIdx);
                const stepNotes = path.steps[stepIdx]?.notes ?? [];
                if (stepNotes.length) onPlayChord(stepNotes);
              }}
              className={`flex-1 min-w-[60px] rounded-lg border px-2 py-1.5 text-left text-xs transition ${
                isActiveBar
                  ? "border-purple-500 bg-purple-700/30 text-white"
                  : "border-white/10 bg-white/5 text-neutral-300 hover:border-purple-500/40"
              }`}
            >
              <div className="text-[10px] font-mono text-neutral-500">Bar {barIdx + 1}</div>
              <div className="font-bold truncate">{chordName}</div>
            </button>
          );
        })}
      </div>

      {/* Persona display (read-only here; choose stage sets it) */}
      <div className="flex items-center gap-2 mt-3">
        <span className="text-xs font-mono text-neutral-400">Persona</span>
        <span className="text-xs font-mono text-purple-300">{persona?.name ?? "none"}</span>
        {persona?.tagline && <span className="text-[10px] text-neutral-500 italic truncate">{persona.tagline}</span>}
      </div>

      <InspectPanel
        path={path}
        activeStepIndex={activeStepIndex}
        optimizedNotes={optimizedStepsNotes}
        onPlayChord={onPlayChord}
        onStopChord={onStopChord}
        onCommitVoicing={onCommitVoicing}
      />
    </div>
  );
};

const CommitStage: React.FC<{
  path: HarmonicPath;
  onCommit: () => void;
  onExportMidi: () => void;
  onOpenLeadSheet: () => void;
  onOpenInspector: () => void;
}> = ({ path, onCommit, onExportMidi, onOpenLeadSheet, onOpenInspector }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <button
        onClick={onExportMidi}
        className="flex flex-col items-start gap-2 p-4 rounded-xl border border-white/10 bg-black/30 hover:border-purple-500/60 transition text-left"
      >
        <FileDown size={20} className="text-purple-400" />
        <div className="font-bold text-sm">Export MIDI</div>
        <div className="text-xs text-neutral-400">Download a .mid file of the current path.</div>
      </button>
      <button
        onClick={onOpenLeadSheet}
        className="flex flex-col items-start gap-2 p-4 rounded-xl border border-white/10 bg-black/30 hover:border-purple-500/60 transition text-left"
      >
        <FileDown size={20} className="text-emerald-400" />
        <div className="font-bold text-sm">Lead Sheet</div>
        <div className="text-xs text-neutral-400">Open concert / Bb trumpet notation view.</div>
      </button>
      <button
        onClick={onOpenInspector}
        className="flex flex-col items-start gap-2 p-4 rounded-xl border border-white/10 bg-black/30 hover:border-amber-500/60 transition text-left"
      >
        <Music size={20} className="text-amber-300" />
        <div className="font-bold text-sm">Chord Inspector</div>
        <div className="text-xs text-neutral-400">Edit & commit a single voicing before exporting.</div>
      </button>
      <button
        onClick={onCommit}
        className="flex flex-col items-start gap-2 p-4 rounded-xl border border-white/10 bg-black/30 hover:border-emerald-500/60 transition text-left"
      >
        <FileDown size={20} className="text-rose-400" />
        <div className="font-bold text-sm">Record Take</div>
        <div className="text-xs text-neutral-400">Capture performance as MIDI + pitch into the recorder.</div>
      </button>
    </div>
  );
};