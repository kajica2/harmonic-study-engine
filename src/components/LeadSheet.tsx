import React, { useEffect, useRef, useState } from "react";
import { HarmonicPath } from "../lib/paths";
import { InstrumentPitch } from "../lib/scoreGenerator";
import { renderLeadSheet } from "../lib/leadSheet";
import { Download, FileText } from "lucide-react";
import { StageFrame, ToolChip } from "./StageFrame";

interface LeadSheetProps {
  path: HarmonicPath;
}

export const LeadSheet: React.FC<LeadSheetProps> = ({ path }) => {
  const [instrument, setInstrument] = useState<InstrumentPitch>("Concert");
  const svgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    renderLeadSheet(svgRef.current, path, instrument);
  }, [instrument, path]);

  const handleDownload = (filename: string, mime: string, content: string | Blob) => {
    const blob = typeof content === "string" ? new Blob([content], { type: mime }) : content;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadAbc = () => {
    const abc = (svgRef.current?.querySelector("textarea") as HTMLTextAreaElement | null)?.value
      ?? "";
    handleDownload(`${path.id}_${instrument}.abc`, "text/plain", abc || "ABC source unavailable");
  };

  return (
    <StageFrame
      accent
      eyebrow="Lead Sheet"
      title={path.title}
      meta={`${path.steps.length} chords`}
      actions={
        <button
          onClick={downloadAbc}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)] t-mono text-xs hover:bg-[color:var(--color-brand-strong)]"
        >
          <Download size={12} /> ABC
        </button>
      }
    >
      {/* Pitch selector — the only place the user picks concert vs Bb */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="t-label text-[color:var(--color-text-3)] flex items-center gap-1.5">
          <FileText size={12} />
          Transposed for
        </span>
        <div className="inline-flex surface-1 border border-[color:var(--color-border)] rounded-[var(--radius-md)] p-0.5">
          {(["Concert", "Bb", "F"] as InstrumentPitch[]).map((p) => (
            <ToolChip
              key={p}
              active={instrument === p}
              onClick={() => setInstrument(p)}
              title={
                p === "Concert"
                  ? "Concert pitch — original key"
                  : `${p} trumpet transposition`
              }
            >
              {p}
            </ToolChip>
          ))}
        </div>
      </div>

      {/* Score renders onto the abcjs container — it paints light-on-dark SVGs */}
      <div
        ref={svgRef}
        className="bg-white text-black rounded-[var(--radius-md)] p-3 overflow-auto max-h-[60vh]"
      />
    </StageFrame>
  );
};