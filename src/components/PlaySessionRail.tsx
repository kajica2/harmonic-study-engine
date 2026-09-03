import React, { useEffect, useState, useRef } from "react";
import { HarmonicPath } from "../lib/paths";
import { MASTERCLASS_TUNES, MasterclassEntry, availableTunes, tuneById } from "../data/masterclass";
import { Persona } from "../lib/personas";
import { NOTE_NAMES } from "../lib/theory";
import { RenderMode } from "../lib/loopWav";
import { playbackClock } from "../lib/playbackClock";
import { useTick } from "../lib/useTick";
import { InspectPanel } from "./InspectPanel";
import { InlineErrorPill } from "./InlineStatus";
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

type Stage = "choose" | "perform" | "commit" | "masterclass";

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
  onExportWav: () => void;
  isExportingWav: boolean;
  wavExportError: string | null;
  wavExportStatus: string | null;
  onDismissWavExportError: () => void;
  wavMode: RenderMode;
  setWavMode: (m: RenderMode) => void;
  onOpenLeadSheet: () => void;
  // loop range (sub-path). When loopStartBar is set and isLooping,
  // the auto-advance wraps between loopStartBar and loopEndBar
  // instead of the full path. Set via shift+click in the bar strip.
  loopStartBar?: number | null;
  loopEndBar?: number | null;
  setLoopBar?: (from: number | null, to: number | null) => void;
  onOpenInspector: () => void;
  // inspect / voicing control
  optimizedStepsNotes: number[][];
  onPlayChord: (notes: number[]) => void;
  onStopChord: (notes: number[]) => void;
  onCommitVoicing: (stepIndex: number, notes: number[]) => void;
}

const STAGE_LABELS: Record<Stage, { title: string; subtitle: string }> = {
  choose:       { title: "Choose Path",     subtitle: "Pick a curated 16-bar harmonic preset" },
  perform:      { title: "Perform",         subtitle: "Audition / practice / revise" },
  commit:       { title: "Record & Export", subtitle: "Capture your take — MIDI, lead sheet, performance" },
  masterclass:  { title: "Masterclass",     subtitle: "33 working tunes from the WCJA curriculum (MC 1–40 + PJ 1–4)" },
};

const STAGE_ORDER: Stage[] = ["choose", "perform", "commit", "masterclass"];

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
    <div className="surface-2 border border-[color:var(--color-border)] rounded-[var(--radius-xl)] p-3 sm:p-4 mb-3 overflow-hidden">
      {/* Stage progress (section headers — not literal step numbers) */}
      <div className="flex items-center gap-2 sm:gap-3 mb-3">
        {STAGE_ORDER.map((s, i) => {
          const status = currentStage(i);
          return (
            <div key={s} className="flex-1 flex items-center gap-2">
              <button
                onClick={() => setStage(s)}
                className={`flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap transition ${
                  status === "active"
                    ? "bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)] shadow-[0_0_15px_rgba(212,168,87,0.35)]"
                    : status === "done"
                    ? "bg-[color:var(--color-ok)]/20 text-[color:var(--color-ok)] hover:bg-[color:var(--color-ok)]/30"
                    : "surface-1 text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)]"
                }`}
              >
                {status === "done" ? (
                  <Check size={12} />
                ) : status === "active" ? (
                  <Circle size={12} className="animate-pulse" />
                ) : (
                  <Circle size={12} />
                )}
                {STAGE_LABELS[s].title}
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
          loopStartBar={p.loopStartBar}
          loopEndBar={p.loopEndBar}
          setLoopBar={p.setLoopBar}
          tempo={p.tempo}
          setTempo={p.setTempo}
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
          onExportWav={p.onExportWav}
          isExportingWav={p.isExportingWav}
          onOpenLeadSheet={p.onOpenLeadSheet}
          onOpenInspector={p.onOpenInspector}
          tempo={p.tempo}
          wavMode={p.wavMode}
          setWavMode={p.setWavMode}
        />
      )}
      {stage === "masterclass" && (
        <MasterclassStage
          activePathId={p.activePath?.id}
          onPickInApp={(id) => {
            const i = p.paths.findIndex((x) => x.id === id);
            if (i >= 0) p.setActivePathIndex(i);
            setStage("perform");
          }}
        />
      )}
    </div>
  );
};

// =====================================================================
// Sub-stages
// =====================================================================

const MasterclassStage: React.FC<{
  activePathId?: string;
  onPickInApp: (id: string) => void;
}> = ({ activePathId, onPickInApp }) => {
  // Group by class family so the user can scan MC 1-10, MC 11-20, etc.
  const groups: { label: string; entries: MasterclassEntry[] }[] = [];
  for (let lo = 1; lo <= 40; lo += 10) {
    const hi = lo + 9;
    const entries = MASTERCLASS_TUNES.filter((t) =>
      t.classes.some((c) => {
        const m = c.match(/MC (\d+)/);
        if (!m) return false;
        const n = parseInt(m[1], 10);
        return n >= lo && n <= hi;
      }),
    );
    if (entries.length > 0) groups.push({ label: `MC ${lo}–${hi}`, entries });
  }
  return (
    <div>
      <div className="text-[10px] t-mono text-neutral-500 mb-2">
        {availableTunes().length} of {MASTERCLASS_TUNES.length} tunes are wired into the app right now;
        the rest are listed as <em>coming soon</em> — picking one from the app set opens the path immediately.
      </div>
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono mb-1.5 sticky top-0 surface-2 py-1">
              {g.label}
            </div>
            <div className="space-y-1.5">
              {g.entries.map((t) => {
                const isActive = t.inApp && t.id === activePathId;
                return (
                  <button
                    key={t.id}
                    onClick={() => t.inApp && onPickInApp(t.id)}
                    disabled={!t.inApp}
                    title={t.inApp ? `Open ${t.title}` : `${t.title} — coming soon`}
                    className={`w-full text-left rounded-lg border p-2.5 transition ${
                      isActive
                        ? "border-[color:var(--color-brand-strong)] bg-[color:var(--color-brand-muted)]"
                        : t.inApp
                          ? "border-white/10 surface-2 hover:border-[color:var(--color-brand-muted)] cursor-pointer"
                          : "border-white/5 surface-1 opacity-50 cursor-not-allowed"
                    }`}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className={`font-bold text-xs ${isActive ? "text-white" : t.inApp ? "text-neutral-100" : "text-neutral-500"}`}>
                        {t.title}
                      </span>
                      <span className="text-[9px] t-mono text-neutral-500">
                        {t.classes.join(" · ")}
                      </span>
                      {isActive && (
                        <span className="ml-auto text-[9px] t-mono text-emerald-400 border border-emerald-700/40 px-1 py-0.5 rounded">
                          ● now
                        </span>
                      )}
                    </div>
                    <div className={`text-[10px] mt-1 ${t.inApp ? "text-neutral-400" : "text-neutral-600"}`}>
                      {t.description}
                    </div>
                    <div className="text-[10px] mt-1.5 text-neutral-300 italic">
                      <span className="text-[9px] text-neutral-500 not-italic font-mono mr-1">→</span>
                      {t.mainExercise}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const FilterChip: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
  title?: string;
}> = ({ active, onClick, label, title }) => (
  <button
    onClick={onClick}
    title={title ?? label}
    aria-pressed={active}
    className={
      "px-2 py-0.5 text-[10px] font-mono rounded transition-colors border " +
      (active
        ? "bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)] border-[color:var(--color-brand-strong)]"
        : "bg-white/5 text-neutral-400 border-transparent hover:bg-white/10 hover:text-neutral-200")
    }
  >
    {label}
  </button>
);

const ChooseStage: React.FC<{
  paths: HarmonicPath[];
  activePathId?: string;
  onSelectById: (id: string) => void;
  personas: Persona[];
  selectedPersonaId: string;
  onPersona: (id: string) => void;
}> = ({ paths, activePathId, onSelectById, personas, selectedPersonaId, onPersona }) => {
  const [showAll, setShowAll] = useState(false);
  const [composerFilter, setComposerFilter] = useState<string | null>(null);
  const [keyFilter, setKeyFilter] = useState<string | null>(null);
  const curated = paths.filter((x) => x.mvpReady);
  const others = paths.filter((x) => !x.mvpReady);

  // Build filter facets from whatever is currently shown. Capped at
  // 8 composers / 8 keys to avoid runaway rows on a heavily-curated
  // set; a "More" affordance could be added later if needed.
  const composerFacets = Array.from(
    new Set(
      paths
        .map((p) => p.composer)
        .filter((c): c is string => Boolean(c)),
    ),
  ).sort();
  const keyFacets = Array.from(
    new Set(
      paths.map((p) => p.key).filter((k): k is string => Boolean(k)),
    ),
  ).sort();

  // Apply filters to the path set.
  const filteredByMeta = paths.filter((p) => {
    if (composerFilter && p.composer !== composerFilter) return false;
    if (keyFilter && p.key !== keyFilter) return false;
    return true;
  });
  const baseVisible = showAll ? filteredByMeta : curated.filter((p) => filteredByMeta.includes(p));
  const visible = baseVisible;
  return (
    <div>
      {/* Filter chips — Composer + Key. Hidden if no facets present
          (e.g. when only MVP paths are loaded and none have metadata). */}
      {(composerFacets.length > 0 || keyFacets.length > 0) && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3">
          {composerFacets.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono mr-1">Composer</span>
              <FilterChip
                active={composerFilter === null}
                onClick={() => setComposerFilter(null)}
                label="All"
              />
              {composerFacets.slice(0, 8).map((c) => (
                <FilterChip
                  key={c}
                  active={composerFilter === c}
                  onClick={() => setComposerFilter(c)}
                  label={c}
                />
              ))}
            </div>
          )}
          {keyFacets.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono mr-1">Key</span>
              <FilterChip
                active={keyFilter === null}
                onClick={() => setKeyFilter(null)}
                label="All"
              />
              {keyFacets.slice(0, 8).map((k) => (
                <FilterChip
                  key={k}
                  active={keyFilter === k}
                  onClick={() => setKeyFilter(k)}
                  label={k}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:gap-2 sm:overflow-x-auto sm:pb-2 mb-3 gap-2">
        {visible.map((path) => {
          const isActive = path.id === activePathId;
          return (
            <button
              key={path.id}
              onClick={() => onSelectById(path.id)}
              className={`w-full sm:min-w-[14rem] sm:w-auto text-left rounded-xl p-3 border transition ${
                isActive
                  ? "border-[color:var(--color-brand-strong)] bg-[color:var(--color-brand-muted)]"
                  : "border-[color:var(--color-border)] surface-2 hover:border-[color:var(--color-brand-muted)]"
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
  loopStartBar?: number | null;
  loopEndBar?: number | null;
  setLoopBar?: (from: number | null, to: number | null) => void;
  tempo: number;
  setTempo: (v: number) => void;
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
  loopStartBar = null, loopEndBar = null, setLoopBar,
  tempo, setTempo,
  transposeShift, setTransposeShift,
  persona, personas, selectedPersonaId, onPersona,
  activeStepIndex, setActiveStepIndex,
  optimizedStepsNotes, onPlayChord, onStopChord, onCommitVoicing,
}) => {
  const totalBars = Math.ceil(path.steps.length / 4);
  const currentBar = Math.floor(activeStepIndex / 4) + 1;
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Subscribe to the playback tick so the bar strip shows a moving
  // playhead between chord changes. Smooth 60fps; one rAF source
  // shared across the whole app via the shared useTick hook.
  const tickDetail = useTick();

  const transposeLabel = () => {
    if (transposeShift === 0) return "Global transpose (path-level)";
    return `Global transpose ${transposeShift > 0 ? "+" : ""}${transposeShift} st`;
  };

  return (
    <div>
      {/* Transport (the only always-visible row) */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <button
          onClick={() => setIsPlayingAuto(!isPlayingAuto)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold"
          title="Audition the whole path in tempo"
        >
          {isPlayingAuto ? <Pause size={16} /> : <Play size={16} className="translate-x-[1px]" />}
          {isPlayingAuto ? "Pause" : "Play path"}
        </button>
        <button
          onClick={() => {
            setIsPlayingAuto(false);
            setActiveStepIndex(0);
          }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-mono"
          title="Stop playback and rewind to step 1"
        >
          <Square size={14} /> Stop
        </button>
        <button
          onClick={() => setIsLooping(!isLooping)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono ${
            isLooping ? "bg-emerald-700/40 text-emerald-200" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
          }`}
          title="Loop the current selection"
        >
          <RefreshCw size={14} /> Loop
        </button>
        <button
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="px-2.5 py-2 rounded-xl text-xs font-mono text-neutral-500 hover:text-white"
        >
          {advancedOpen ? "Hide" : "Show"} tempo
        </button>
      </div>

      {/* Advanced controls — collapsed by default, lives inline with transport */}
      {advancedOpen && (
        <div className="grid grid-cols-1 gap-3 mb-3 p-3 rounded-xl bg-black/30 border border-white/5">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">Tempo</label>
            <div className="flex items-center gap-2 text-xs font-mono text-neutral-300">
              <input
                type="range"
                min={50}
                max={240}
                value={tempo}
                onChange={(e) => setTempo(Number(e.target.value))}
                className="flex-1 accent-purple-500"
              />
              <span className="w-12 text-right">{tempo} BPM</span>
            </div>
          </div>
        </div>
      )}

      {/* Position / step indicator */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-mono text-neutral-400">Position</span>
        <span className="text-xs font-mono text-neutral-200">
          Bar {currentBar} / {totalBars} — Step {activeStepIndex + 1} / {path.steps.length}
        </span>
        {/* Progress bar */}
        <div
          className="flex-1 h-1.5 rounded-full bg-neutral-800 overflow-hidden ml-2"
          role="progressbar"
          aria-label="Path playback position"
          aria-valuemin={0}
          aria-valuemax={path.steps.length}
          aria-valuenow={activeStepIndex + 1}
        >
          <div
            className="h-full bg-purple-500/70 transition-all duration-150"
            style={{ width: `${((activeStepIndex + 1) / path.steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Transpose controls — single, labeled */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-mono text-neutral-400">{transposeLabel()}</span>
        <span className="ml-auto" />
        <button
          onClick={() => setTransposeShift(transposeShift - 1)}
          className="px-2 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs"
          title="Lower all chords by a semitone"
        >
          −
        </button>
        <button
          onClick={() => setTransposeShift(transposeShift + 1)}
          className="px-2 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs"
          title="Raise all chords by a semitone"
        >
          +
        </button>
      </div>

      {/* Bar strip — visual progress + voicing preview (Fix #4 inline voicing) */}
      <div className="flex items-stretch gap-1 overflow-x-auto pb-2">
        {Array.from({ length: totalBars }).map((_, barIdx) => {
          const stepIdx = barIdx * 4;
          const chordName = path.steps[stepIdx]?.name ?? "";
          const isActiveBar = currentBar === barIdx + 1;
          // Build a one-line voicing preview for the active bar from the
          // currently-optimized notes. This is the "where am I" home that
          // Fix #4 was asking for — the eye no longer has to ping-pong
          // between the chord card up top and the inspect panel.
          const previewVoicing = isActiveBar
            ? (optimizedStepsNotes[stepIdx] ?? [])
            : [];
          return (
            <button
              key={barIdx}
              onClick={(e) => {
                // Shift-click: set loop range. Plain click: step + audition.
                if (e.shiftKey && setLoopBar) {
                  if (loopStartBar === null || (loopStartBar !== null && loopEndBar !== null)) {
                    setLoopBar(barIdx, null);
                  } else if (barIdx >= loopStartBar) {
                    setLoopBar(loopStartBar, barIdx);
                  } else {
                    setLoopBar(barIdx, loopStartBar);
                  }
                  // also set the cursor so the user sees the range
                  setActiveStepIndex(stepIdx);
                  return;
                }
                // Step Chord is now musical: advance the cursor AND audition.
                setActiveStepIndex(stepIdx);
                const stepNotes = path.steps[stepIdx]?.notes ?? [];
                if (stepNotes.length) onPlayChord(stepNotes);
              }}
              title={
                loopStartBar !== null &&
                barIdx >= Math.min(loopStartBar, loopEndBar ?? loopStartBar) &&
                barIdx <= Math.max(loopEndBar ?? loopStartBar, loopStartBar)
                  ? `Bar ${barIdx + 1} — in loop range. Shift+click another bar to resize, shift+click the same bar to clear.`
                  : `Bar ${barIdx + 1} — click to jump here, shift+click to set loop range.`
              }
              className={`relative flex-1 min-w-[60px] rounded-lg border px-2 py-1.5 text-left text-xs transition overflow-hidden ${
                isActiveBar
                  ? "border-purple-500 bg-purple-700/30 text-white shadow-[0_0_15px_rgba(147,51,234,0.35)]"
                  : "border-white/10 bg-white/5 text-neutral-300 hover:border-purple-500/40"
              }`}
            >
              {/* Loop-range background band — translucent brass when
                  this bar is in the active loop range. */}
              {loopStartBar !== null &&
                barIdx >= Math.min(loopStartBar, loopEndBar ?? loopStartBar) &&
                barIdx <= Math.max(loopEndBar ?? loopStartBar, loopStartBar) && (
                  <div
                    className="absolute inset-0 rounded-lg pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(212,168,87,0.22), rgba(212,168,87,0.10))",
                      boxShadow: "inset 0 0 0 1px rgba(212,168,87,0.45)",
                    }}
                    aria-hidden="true"
                  />
                )}
              {/* Content wrapper — relative so it sits above the loop
                  band overlay. */}
              <div className="relative">
              <div className="text-[10px] font-mono text-neutral-500 flex items-center gap-1">
                <span>Bar {barIdx + 1}</span>
                <span className="flex-1" />
                {isActiveBar && <span className="text-purple-300">· here</span>}
              </div>
              <div className="font-bold truncate">{chordName}</div>
              {isActiveBar && previewVoicing.length > 0 && (
                <div
                  className="text-[10px] font-mono text-neutral-300 mt-0.5 truncate"
                  title={previewVoicing.map((n) => NOTE_NAMES[(n % 12 + 12) % 12] + (Math.floor(n / 12) - 1)).join(" · ")}
                >
                  {previewVoicing
                    .map((n) => NOTE_NAMES[(n % 12 + 12) % 12] + (Math.floor(n / 12) - 1))
                    .join(" ")}
                </div>
              )}
              {/* Tick playhead — 4 cells per bar (one per beat in 4/4).
                  Only the active bar shows the moving highlight; other
                  bars are dim placeholder ticks. */}
              <div className="mt-1 grid grid-cols-4 gap-0.5 h-1" aria-hidden="true">
                {[0, 1, 2, 3].map((b) => {
                  const isCurrentBeat = isActiveBar && tickDetail.isRunning && Math.floor(tickDetail.beat) === b;
                  return (
                    <div
                      key={b}
                      className={`h-full rounded-sm transition-colors duration-100 ${
                        isCurrentBeat
                          ? "bg-[color:var(--color-brand-strong)]"
                          : isActiveBar
                            ? "bg-[color:var(--color-brand)]/30"
                            : "bg-white/5"
                      }`}
                    />
                  );
                })}
              </div>
              </div>
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
  onExportWav: () => void;
  isExportingWav: boolean;
  onOpenLeadSheet: () => void;
  onOpenInspector: () => void;
  tempo: number;
  wavMode: RenderMode;
  setWavMode: (m: RenderMode) => void;
  wavExportError?: string | null;
  wavExportStatus?: string | null;
  onDismissWavExportError?: () => void;
}> = ({
  path,
  onCommit, onExportMidi, onExportWav, isExportingWav,
  onOpenLeadSheet, onOpenInspector,
  tempo, wavMode, setWavMode,
  wavExportError, wavExportStatus, onDismissWavExportError,
}) => {
  // Compute expected duration so the user can verify the WAV will match
  // the live loop length before exporting.
  const expectedSec = Math.round(path.steps.length * (60 / tempo) * 4 * 10) / 10;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
      <button
        onClick={onExportMidi}
        className="flex flex-col items-start gap-2 p-4 rounded-xl border border-white/10 bg-black/30 hover:border-purple-500/60 transition text-left"
      >
        <FileDown size={20} className="text-purple-400" />
        <div className="font-bold text-sm">Export MIDI</div>
        <div className="text-xs text-neutral-400">Download a .mid file of the current path.</div>
      </button>
      <div className="flex flex-col gap-2 p-4 rounded-xl border border-white/10 bg-black/30 hover:border-cyan-500/60 transition">
        <div className="flex items-start justify-between w-full">
          <div className="flex flex-col items-start gap-2">
            <FileDown size={20} className="text-cyan-400" />
            <div className="font-bold text-sm">{isExportingWav ? "Rendering WAV…" : "Export WAV"}</div>
            <div className="text-xs text-neutral-400">
              Loop at {tempo} BPM · ~{expectedSec}s · browser-side render
            </div>
          </div>
          <select
            value={wavMode}
            onChange={(e) => setWavMode(e.target.value as RenderMode)}
            disabled={isExportingWav}
            className="bg-neutral-900 border border-neutral-700 text-[11px] font-mono text-neutral-200 rounded px-2 py-1 outline-none"
            title="Choose how the loop is rendered"
            aria-label="WAV render mode"
          >
            <option value="block">Full chords</option>
            <option value="arp">Arpeggio</option>
            <option value="block_then_arp">Block + Arp</option>
          </select>
        </div>
        <button
          onClick={onExportWav}
          disabled={isExportingWav}
          className="w-full py-2 bg-cyan-900/30 hover:bg-cyan-900/50 disabled:opacity-50 disabled:cursor-wait text-cyan-200 text-xs rounded border border-cyan-800/50 transition-colors font-mono"
        >
          {isExportingWav
            ? "Rendering…"
            : `↓ Download ${wavMode === "block" ? "chord" : wavMode === "arp" ? "arpeggio" : "block+arp"} WAV`}
        </button>

        {/* Inline status — replaces old alert() popups. Sits inside the
            tile so the error is anchored to the action that caused it. */}
        {wavExportError && (
          <div className="mt-1">
            <InlineErrorPill onDismiss={() => onDismissWavExportError?.()}>
              WAV render failed: {wavExportError}
            </InlineErrorPill>
          </div>
        )}
        {wavExportStatus && !wavExportError && (
          <div
            className="mt-1 t-small text-[color:var(--color-info)] font-mono"
            role="status"
            aria-live="polite"
          >
            {wavExportStatus}
          </div>
        )}
      </div>
      <button
        onClick={onOpenLeadSheet}
        className="flex flex-col items-start gap-2 p-4 rounded-xl border border-white/10 bg-black/30 hover:border-emerald-500/60 transition text-left"
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
        className="flex flex-col items-start gap-2 p-4 rounded-xl border border-white/10 bg-black/30 hover:border-rose-500/60 transition text-left"
      >
        <FileDown size={20} className="text-rose-400" />
        <div className="font-bold text-sm">Record Take</div>
        <div className="text-xs text-neutral-400">Capture performance as MIDI + pitch into the recorder.</div>
      </button>
    </div>
  );
};