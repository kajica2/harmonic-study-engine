import React, { useEffect, useRef, useState } from "react";
import { HarmonicPath } from "../lib/paths";
import { InstrumentPitch } from "../lib/scoreGenerator";
import { renderLeadSheet } from "../lib/leadSheet";
import { Download, FileText } from "lucide-react";

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
    <div className="bg-white rounded-2xl p-4 text-black">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="text-purple-600" size={16} />
        <span className="font-bold text-sm">Lead Sheet — {path.title}</span>
        <div className="ml-auto flex gap-1">
          {(["Concert", "Bb", "F"] as InstrumentPitch[]).map((p) => (
            <button
              key={p}
              onClick={() => setInstrument(p)}
              className={`px-2 py-1 rounded text-xs font-mono ${
                instrument === p ? "bg-purple-600 text-white" : "bg-neutral-200 hover:bg-neutral-300"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <button
          onClick={downloadAbc}
          className="flex items-center gap-1 px-2 py-1 rounded bg-purple-600 text-white text-xs font-mono hover:bg-purple-500"
        >
          <Download size={12} /> ABC
        </button>
      </div>
      <div ref={svgRef} className="text-black" />
    </div>
  );
};