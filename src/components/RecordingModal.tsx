import React, { useState, useEffect, useRef } from "react";
import { X, Download, FileText, Music, Printer } from "lucide-react";
import abcjs from "abcjs";
import { RecordedNote } from "../lib/recorder";
import {
  generateABCString,
  generateMidiDataUri,
  InstrumentPitch,
  ClefPrefs,
} from "../lib/scoreGenerator";
import jsPDF from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import { StageFrame, ToolGroup, ToolChip } from "./StageFrame";
import { ModalShell, useModalLabel } from "./ModalShell";

interface RecordingModalProps {
  notes: RecordedNote[];
  tempo: number;
  onClose: () => void;
}

export const RecordingModal: React.FC<RecordingModalProps> = ({
  notes,
  tempo,
  onClose,
}) => {
  const titleId = useModalLabel("recording");
  const [instrument, setInstrument] = useState<InstrumentPitch>("Concert");
  const [clefs, setClefs] = useState<ClefPrefs>("both");
  const svgRef = useRef<HTMLDivElement>(null);

  const abcString = generateABCString(notes, tempo, instrument, clefs);

  useEffect(() => {
    if (svgRef.current && abcString) {
      abcjs.renderAbc(svgRef.current, abcString, {
        responsive: "resize",
        add_classes: true,
        paddingtop: 20,
        paddingbottom: 20,
      });
    }
  }, [abcString]);

  const handleDownloadMidi = () => {
    const dataUri = generateMidiDataUri(notes, tempo);
    const a = document.createElement("a");
    a.href = dataUri;
    a.download = "synesthesia_recording.mid";
    a.click();
  };

  const handleDownloadPDF = async () => {
    if (!svgRef.current) return;
    const svgElem = svgRef.current.querySelector("svg");
    if (!svgElem) return;

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "a4",
    });

    await svg2pdf(svgElem, doc, {
      x: 0,
      y: 0,
      width: 842,
      height: 595,
    });

    doc.save("synesthesia_score.pdf");
  };

  return (
    <ModalShell
      onDismiss={onClose}
      labelledBy={titleId}
      className="w-full max-w-4xl flex flex-col max-h-[92vh]"
    >
      <div className="flex justify-between items-center mb-3 px-1">
        <h2 id={titleId} className="t-display-2 flex items-center gap-2">
          <Music className="text-[color:var(--color-err)]" size={18} />
          Recorded take
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            aria-label="Close recording"
            className="p-2 rounded-full surface-1 border border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-2)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

        <StageFrame
          accent
          eyebrow="Performance capture"
          title="Score preview"
          meta={`${notes.length} notes · ${tempo} BPM`}
          actions={
            <div className="flex gap-2">
              <button
                onClick={handleDownloadMidi}
                className="flex items-center gap-1.5 px-2.5 py-1.5 surface-1 border border-[color:var(--color-border)] rounded-[var(--radius-sm)] text-[color:var(--color-text-1)] hover:border-[color:var(--color-brand-strong)] hover:text-[color:var(--color-brand-strong)] text-xs t-mono transition-colors"
              >
                <FileText size={12} /> MIDI
              </button>
              <button
                onClick={handleDownloadPDF}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)] rounded-[var(--radius-sm)] text-xs t-mono font-bold hover:bg-[color:var(--color-brand-strong)] transition-colors"
              >
                <Printer size={12} /> PDF
              </button>
            </div>
          }
        >
          <div className="flex flex-wrap gap-3 mb-4">
            <ToolGroup label="Transposed for">
              {(["Concert", "Bb", "F"] as InstrumentPitch[]).map((p) => (
                <ToolChip
                  key={p}
                  active={instrument === p}
                  onClick={() => setInstrument(p)}
                >
                  {p}
                </ToolChip>
              ))}
            </ToolGroup>

            <ToolGroup label="Clefs">
              <ToolChip
                active={clefs === "treble"}
                onClick={() => setClefs("treble")}
              >
                Treble
              </ToolChip>
              <ToolChip
                active={clefs === "bass"}
                onClick={() => setClefs("bass")}
              >
                Bass
              </ToolChip>
              <ToolChip
                active={clefs === "both"}
                onClick={() => setClefs("both")}
              >
                Grand
              </ToolChip>
            </ToolGroup>
          </div>

          <div className="bg-white rounded-[var(--radius-md)] p-3 mb-0 overflow-auto max-h-[55vh]">
            <div ref={svgRef} className="w-full text-black" />
            {notes.length === 0 && (
              <div className="text-neutral-500 text-center py-10">
                No notes recorded. Try playing some music before stopping!
              </div>
            )}
          </div>
        </StageFrame>
    </ModalShell>
  );
};