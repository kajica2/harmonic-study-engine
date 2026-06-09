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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-white/10 p-6 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Music className="text-red-500" />
            Recorded Score
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-wrap gap-4 mb-6 p-4 bg-black/30 rounded-xl border border-white/5">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-mono text-neutral-400">
              Instrument Transposition
            </label>
            <div className="flex gap-2">
              {(["Concert", "Bb", "F"] as InstrumentPitch[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setInstrument(p)}
                  className={`px-3 py-1.5 rounded text-sm font-mono transition-colors ${
                    instrument === p
                      ? "bg-purple-600"
                      : "bg-black/50 hover:bg-neutral-800"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-mono text-neutral-400">Clefs</label>
            <div className="flex gap-2">
              <button
                onClick={() => setClefs("treble")}
                className={`px-3 py-1.5 rounded text-sm font-mono transition-colors ${
                  clefs === "treble"
                    ? "bg-purple-600"
                    : "bg-black/50 hover:bg-neutral-800"
                }`}
              >
                Treble
              </button>
              <button
                onClick={() => setClefs("bass")}
                className={`px-3 py-1.5 rounded text-sm font-mono transition-colors ${
                  clefs === "bass"
                    ? "bg-purple-600"
                    : "bg-black/50 hover:bg-neutral-800"
                }`}
              >
                Bass
              </button>
              <button
                onClick={() => setClefs("both")}
                className={`px-3 py-1.5 rounded text-sm font-mono transition-colors ${
                  clefs === "both"
                    ? "bg-purple-600"
                    : "bg-black/50 hover:bg-neutral-800"
                }`}
              >
                Both (Grand)
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-white rounded-xl p-4 mb-6">
          <div ref={svgRef} className="w-full text-black"></div>
          {notes.length === 0 && (
            <div className="text-neutral-500 text-center py-10">
              No notes recorded. Try playing some music before stopping!
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-white/5 pt-4">
          <button
            onClick={handleDownloadMidi}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm font-bold transition-colors"
          >
            <FileText size={16} /> Save as MIDI
          </button>
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-bold transition-colors"
          >
            <Printer size={16} /> Save as PDF
          </button>
        </div>
      </div>
    </div>
  );
};
