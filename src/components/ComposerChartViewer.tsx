import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import type {
  ComposerChart,
  BarChart,
  BitonalBlock,
  RowMatrix,
  AxisSystem,
  DurationStructure,
  LayerStack,
  GenericSectionChart,
  ComposerId,
} from "../lib/composerCatalog";
import { getComposerChart } from "../lib/composerCatalog";
import { chartChordSequence } from "../lib/composerChartAudio";
import { audioEngine } from "../lib/audio";
import { downloadText } from "../lib/download";
import type { HarmonicPath } from "../lib/paths";

// Lazy: pulls abcjs into the bundle only when the user opens the
// Notation toggle. App.tsx already imports this viewer eagerly
// (App.tsx:141), so the abcjs dependency must stay code-split via
// this dynamic import.
const ComposerChartNotation = lazy(
  () => import("./ComposerChartNotation"),
);

/**
 * ComposerChartViewer — renders any chart from the composer-harmonic-
 * innovations catalog as a small, dense inline panel.
 *
 * Per-kind renderers:
 *   - BarChart → a tiny chord-strip table (bar / chord / Roman).
 *   - BitonalBlock → two roots displayed with their tritone interval.
 *   - RowMatrix → P0/I0/R0/RI0 as four rows of pitch names.
 *   - AxisSystem → three axes as 4-element lists.
 *   - DurationStructure → movement list with seconds.
 *   - LayerStack → numbered layer list.
 *   - GenericSectionChart → raw lines as bullet list.
 *
 * Controls (right-aligned, `text-[10px]` matching the existing
 * palette):
 *   - Play / Stop — schedules chartChordSequence(chart) at one
 *     chord per 900ms via audioEngine.playChord. No-op when the
 *     sequence is empty (duration/layer/section kinds).
 *   - Notation — toggles a <Suspense>-wrapped abcjs render below
 *     the visual panel. Lazy-loads abcjs.
 *   - ABC — downloads buildComposerChartAbc(chart) as .abc.
 *   - MIDI — downloads a one-track SMF built from the chord
 *     sequence (NOT from COMPOSER_PATHS — those are seeded 96-step
 *     padded paths, not the catalog shape).
 *
 * Defaults to BarChart renderer if no chart is found (renders nothing
 * meaningful — just a fallback header).
 */

interface ComposerChartViewerProps {
  /** Composer to render — looked up via getComposerChart(). */
  composerId: ComposerId;
  /** Optional title override (defaults to the composer's name). */
  title?: string;
}

const noteName = (pc: number): string => {
  const names = [
    "C", "C#", "D", "Eb", "E", "F",
    "F#", "G", "Ab", "A", "Bb", "B",
  ];
  return names[((pc % 12) + 12) % 12];
};

function BarChartView({ chart }: { chart: BarChart }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] text-neutral-500 italic">
        {chart.workContext}
      </div>
      <div className="grid grid-cols-[auto_1fr_1fr] gap-x-2 gap-y-0.5 text-[10px] font-mono">
        <span className="text-neutral-500">Bar</span>
        <span className="text-neutral-500">Chord</span>
        <span className="text-neutral-500">Roman</span>
        {chart.bars.map((bar, idx) => (
          <React.Fragment key={idx}>
            <span className="text-neutral-400">{bar.label}</span>
            <span className="text-neutral-200">{bar.chord}</span>
            <span className="text-neutral-300 italic">{bar.roman}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function BitonalBlockView({ chart }: { chart: BitonalBlock }) {
  return (
    <div className="flex flex-col gap-1 text-[10px] font-mono">
      {chart.pairs.map((p, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-neutral-200">{noteName(p.root1)}</span>
          <span className="text-neutral-500">+</span>
          <span className="text-neutral-200">{noteName(p.root2)}</span>
          <span className="text-neutral-500 italic ml-2">
            (tritone, 6 semitones)
          </span>
        </div>
      ))}
      <ul className="mt-1 list-disc list-inside text-neutral-400">
        {chart.raw.slice(0, 4).map((line, idx) => (
          <li key={idx}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function RowMatrixView({ chart }: { chart: RowMatrix }) {
  const formNames: (keyof RowMatrix["forms"])[] = ["P0", "I0", "R0", "RI0"];
  return (
    <div className="flex flex-col gap-1 text-[10px] font-mono">
      {formNames.map((name) => (
        <div key={name} className="flex items-baseline gap-2">
          <span className="text-neutral-500 w-8">{name}</span>
          <span className="text-neutral-200 break-all">
            {chart.forms[name].map(noteName).join(" – ")}
          </span>
        </div>
      ))}
      <div className="mt-1 text-neutral-400 italic">
        Hexachord 1: {chart.hexachords.first.map(noteName).join(" – ")}
      </div>
      <div className="text-neutral-400 italic">
        Hexachord 2: {chart.hexachords.second.map(noteName).join(" – ")}
      </div>
    </div>
  );
}

function AxisSystemView({ chart }: { chart: AxisSystem }) {
  const axes: { label: string; pcs: number[]; color: string }[] = [
    { label: "Tonic", pcs: chart.tonicAxis, color: "text-emerald-300" },
    { label: "Dominant", pcs: chart.dominantAxis, color: "text-amber-300" },
    { label: "Subdominant", pcs: chart.subdominantAxis, color: "text-sky-300" },
  ];
  return (
    <div className="flex flex-col gap-1 text-[10px] font-mono">
      {axes.map((axis) => (
        <div key={axis.label} className="flex items-baseline gap-2">
          <span className="text-neutral-500 w-20">{axis.label} axis</span>
          <span className={axis.color}>
            {axis.pcs.map(noteName).join(" – ")}
          </span>
        </div>
      ))}
      <div className="mt-1 text-neutral-500 italic">
        Keys relate by tritone and minor third rather than by fifth.
      </div>
    </div>
  );
}

function DurationStructureView({ chart }: { chart: DurationStructure }) {
  return (
    <div className="flex flex-col gap-1 text-[10px] font-mono">
      {chart.movements.map((m, idx) => {
        const mm = Math.floor(m.seconds / 60);
        const ss = m.seconds % 60;
        return (
          <div key={idx} className="flex items-baseline gap-2">
            <span className="text-neutral-500 w-16">Movement {m.label}</span>
            <span className="text-neutral-200">{m.description}</span>
            <span className="text-neutral-400 italic ml-auto">
              {mm > 0 ? `${mm}m ` : ""}
              {ss}s
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LayerStackView({ chart }: { chart: LayerStack }) {
  return (
    <div className="flex flex-col gap-1 text-[10px] font-mono">
      {chart.layers.map((layer) => (
        <div key={layer.index} className="flex items-baseline gap-2">
          <span className="text-neutral-500 w-12">Layer {layer.index}</span>
          <span className="text-neutral-200">{layer.description}</span>
        </div>
      ))}
    </div>
  );
}

function GenericSectionView({ chart }: { chart: GenericSectionChart }) {
  return (
    <ul className="list-disc list-inside text-[10px] font-mono text-neutral-300">
      {chart.raw.map((line, idx) => (
        <li key={idx}>{line}</li>
      ))}
    </ul>
  );
}

export const ComposerChartViewer: React.FC<ComposerChartViewerProps> = ({
  composerId,
  title,
}) => {
  const chart = getComposerChart(composerId);
  const [playing, setPlaying] = useState(false);
  const [showNotation, setShowNotation] = useState(false);
  const timersRef = useRef<number[]>([]);

  // Cleanup any in-flight play timers on unmount or chart change so
  // the AudioContext doesn't keep firing after the panel closes.
  useEffect(() => {
    return () => {
      for (const t of timersRef.current) {
        window.clearTimeout(t);
      }
      timersRef.current = [];
      audioEngine.stopAll();
    };
  }, [chart]);

  if (!chart) return null;

  const seq = chartChordSequence(chart);
  const hasPitchContent = seq.length > 0;

  const stopPlayback = () => {
    for (const t of timersRef.current) {
      window.clearTimeout(t);
    }
    timersRef.current = [];
    audioEngine.stopAll();
    setPlaying(false);
  };

  const startPlayback = () => {
    if (!hasPitchContent) return;
    setPlaying(true);
    const STEP_MS = 900;
    seq.forEach((notes, i) => {
      timersRef.current.push(
        window.setTimeout(() => {
          audioEngine.playChord(notes);
        }, i * STEP_MS),
      );
    });
    timersRef.current.push(
      window.setTimeout(() => {
        stopPlayback();
      }, seq.length * STEP_MS),
    );
  };

  const handleDownloadAbc = () => {
    // Lazy-import keeps the .abc builder + abcjs out of the eager
    // module graph until the user asks for one.
    void import("../lib/composerChartAbc").then((mod) => {
      const abc = mod.buildComposerChartAbc(chart);
      downloadText(`${composerId}_chart.abc`, abc, "text/plain");
    });
  };

  const handleDownloadMidi = () => {
    if (!hasPitchContent) return;
    void import("../lib/midiExport").then((mod) => {
      const stub: HarmonicPath = {
        id: composerId,
        title: chart.composerName,
        description: kindLabel(chart.kind),
        steps: seq.map((notes, i) => ({
          name: String(i + 1),
          notes,
          descriptions: "",
        })),
      };
      const dataUri = mod.exportMidiWithVariation(stub, { kind: "asWritten" });
      const a = document.createElement("a");
      a.href = dataUri;
      a.download = `${composerId}_chart.mid`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  };

  // Per-kind body renderer
  let body: React.ReactNode;
  switch (chart.kind) {
    case "bar":
      body = <BarChartView chart={chart} />;
      break;
    case "bitonal":
      body = <BitonalBlockView chart={chart} />;
      break;
    case "row":
      body = <RowMatrixView chart={chart} />;
      break;
    case "axis":
      body = <AxisSystemView chart={chart} />;
      break;
    case "duration":
      body = <DurationStructureView chart={chart} />;
      break;
    case "layer":
      body = <LayerStackView chart={chart} />;
      break;
    case "section":
      body = <GenericSectionView chart={chart} />;
      break;
  }

  return (
    <section
      data-testid={`composer-chart-${composerId}`}
      aria-label={`${chart.composerName} harmonic chart`}
      className="rounded-md border border-neutral-800 bg-neutral-900/30 p-2.5 flex flex-col gap-1.5"
    >
      <header className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
          {title ?? chart.composerName}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-neutral-500 italic">
            {chart.kind === "bar" ? "Bar-by-bar" : chart.kind}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={playing ? stopPlayback : startPlayback}
              disabled={!hasPitchContent}
              title={
                hasPitchContent
                  ? playing
                    ? "Stop playback"
                    : "Play chart"
                  : "No pitch content for this chart kind"
              }
              aria-label={playing ? "Stop chart playback" : "Play chart"}
              className="text-[10px] t-mono px-1.5 py-0.5 rounded-[var(--radius-sm)] surface-1 border border-[color:var(--color-border)] text-neutral-300 hover:text-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {playing ? "Stop" : "Play"}
            </button>
            <button
              type="button"
              onClick={() => setShowNotation((s) => !s)}
              title="Toggle abcjs notation"
              aria-label="Toggle notation"
              className={`text-[10px] t-mono px-1.5 py-0.5 rounded-[var(--radius-sm)] border transition-colors ${
                showNotation
                  ? "bg-[color:var(--color-brand)]/15 border-[color:var(--color-brand)]/40 text-neutral-100"
                  : "surface-1 border-[color:var(--color-border)] text-neutral-300 hover:text-neutral-100"
              }`}
            >
              Notation
            </button>
            <button
              type="button"
              onClick={handleDownloadAbc}
              title="Download ABC source"
              aria-label="Download ABC"
              className="text-[10px] t-mono px-1.5 py-0.5 rounded-[var(--radius-sm)] surface-1 border border-[color:var(--color-border)] text-neutral-300 hover:text-neutral-100 transition-colors"
            >
              ABC
            </button>
            <button
              type="button"
              onClick={handleDownloadMidi}
              disabled={!hasPitchContent}
              title={
                hasPitchContent
                  ? "Download MIDI"
                  : "No pitch content for this chart kind"
              }
              aria-label="Download MIDI"
              className="text-[10px] t-mono px-1.5 py-0.5 rounded-[var(--radius-sm)] surface-1 border border-[color:var(--color-border)] text-neutral-300 hover:text-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              MIDI
            </button>
          </div>
        </div>
      </header>
      {body}
      {showNotation && (
        <Suspense
          fallback={
            <div className="text-[10px] text-neutral-500">
              Loading notation…
            </div>
          }
        >
          <ComposerChartNotation chart={chart} />
        </Suspense>
      )}
    </section>
  );
};

/** Local helper: same kind-label vocabulary as buildComposerChartAbc. */
function kindLabel(kind: ComposerChart["kind"]): string {
  switch (kind) {
    case "bar":
      return "Harmonic chart";
    case "bitonal":
      return "Bitonal block";
    case "row":
      return "Twelve-tone row";
    case "axis":
      return "Axis system";
    case "duration":
      return "Duration structure";
    case "layer":
      return "Layer stack";
    case "section":
      return "Section chart";
  }
}

/** Default export for convenience — same as the named export. */
export default ComposerChartViewer;
