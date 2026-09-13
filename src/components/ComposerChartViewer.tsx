import React from "react";
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
 * Defaults to BarChart renderer if no chart is found (renders nothing
 * meaningful — just a fallback header).
 *
 * v1: visual-only. No audio playback, no MIDI, no interactivity
 * beyond hover titles. Future work: play through the chart.
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
  if (!chart) return null;

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
        <span className="text-[10px] font-mono text-neutral-500 italic">
          {chart.kind === "bar" ? "Bar-by-bar" : chart.kind}
        </span>
      </header>
      {body}
    </section>
  );
};

/** Default export for convenience — same as the named export. */
export default ComposerChartViewer;
