import React, { useEffect, useRef, useState } from "react";
import abcjs from "abcjs";
import { HarmonicPath } from "../lib/paths";
import { midiToABCName } from "../lib/scoreGenerator";

const NOTE_WHEEL = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

function transposeChordName(name: string, shift: number): string {
  if (shift % 12 === 0) return name;
  return name.replace(/(^|[\s/(-])([A-G][b#]?)/g, (match, prefix, note) => {
    let index = NOTE_WHEEL.indexOf(note);
    if (index === -1) {
      const enharmonics: Record<string, string> = {
        "C#": "Db",
        "D#": "Eb",
        "F#": "Gb",
        "G#": "Ab",
        "A#": "Bb",
      };
      index = enharmonics[note] ? NOTE_WHEEL.indexOf(enharmonics[note]) : -1;
    }
    if (index === -1) return match;
    const newIndex = (index + shift + 120) % 12; // +120 ensures positive before modulo
    return prefix + NOTE_WHEEL[newIndex];
  });
}

interface LiveScoreDisplayProps {
  path: HarmonicPath;
  activeStepIndex: number;
  transposeShift: number;
  tempo: number;
}

export const LiveScoreDisplay: React.FC<LiveScoreDisplayProps> = ({
  path,
  activeStepIndex,
  transposeShift,
  tempo,
}) => {
  const svgRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [showChords, setShowChords] = useState(true);
  const [zoomScale, setZoomScale] = useState(1);
  
  const [clefLayout, setClefLayout] = useState<"grand" | "treble" | "bass">(() => {
    try {
      const saved = localStorage.getItem("synesthesia_clefLayout");
      return (saved ? saved : "grand") as any;
    } catch {
      return "grand";
    }
  });

  const [visualTranspose, setVisualTranspose] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("synesthesia_visualTranspose");
      return saved !== null ? Number(saved) : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    if (!svgRef.current || !path) return;

    let abc = `X:1\n`;
    abc += `T:${path.name}\n`;
    abc += `M:4/4\n`;
    abc += `L:1/4\n`;
    abc += `Q:1/4=${tempo}\n`;
    abc += `K:C\n`;

    if (clefLayout === "grand") {
      abc += `%%score { (T B) }\n`;
      abc += `V:T clef=treble\n`;
      abc += `V:B clef=bass\n`;

      let lineT = "";
      let lineB = "";

      path.steps.forEach((step, index) => {
        // Bar lines every 4 beats
        if (index > 0 && index % 4 === 0) {
          lineT += "| ";
          lineB += "| ";
        }

        const shiftedNotes = step.notes
          .map((n) => n + transposeShift + visualTranspose)
          .sort((a, b) => a - b);
        const treblePitches = shiftedNotes.filter((p) => p >= 60);
        const bassPitches = shiftedNotes.filter((p) => p < 60);

        let chordLabel = step.name
          ? step.name.replace(/m/g, "m").replace(/#/g, "#")
          : "";

        if (visualTranspose !== 0 && chordLabel) {
          chordLabel = transposeChordName(chordLabel, visualTranspose);
        }

        if (showChords && chordLabel) {
          lineT += `"${chordLabel}" `;
        }

        if (treblePitches.length > 0) {
          lineT += `[${treblePitches.map(midiToABCName).join("")}] `;
        } else {
          lineT += `z `;
        }

        if (bassPitches.length > 0) {
          lineB += `[${bassPitches.map(midiToABCName).join("")}] `;
        } else {
          lineB += `z `;
        }
      });

      abc += `[V:T] ${lineT} |]\n`;
      abc += `[V:B] ${lineB} |]\n`;
    } else if (clefLayout === "treble") {
      abc += `V:T clef=treble\n`;

      let lineT = "";

      path.steps.forEach((step, index) => {
        if (index > 0 && index % 4 === 0) {
          lineT += "| ";
        }

        const shiftedNotes = step.notes
          .map((n) => n + transposeShift + visualTranspose)
          .sort((a, b) => a - b);
        
        // Single note at the time for solo melody instrument/trumpet!
        const melodyPitch = shiftedNotes[shiftedNotes.length - 1];

        let chordLabel = step.name
          ? step.name.replace(/m/g, "m").replace(/#/g, "#")
          : "";

        if (visualTranspose !== 0 && chordLabel) {
          chordLabel = transposeChordName(chordLabel, visualTranspose);
        }

        if (showChords && chordLabel) {
          lineT += `"${chordLabel}" `;
        }

        if (melodyPitch !== undefined) {
          lineT += `${midiToABCName(melodyPitch)} `;
        } else {
          lineT += `z `;
        }
      });

      abc += `[V:T] ${lineT} |]\n`;
    } else {
      abc += `V:B clef=bass\n`;

      let lineB = "";

      path.steps.forEach((step, index) => {
        if (index > 0 && index % 4 === 0) {
          lineB += "| ";
        }

        const shiftedNotes = step.notes
          .map((n) => n + transposeShift + visualTranspose)
          .sort((a, b) => a - b);
        
        // Single note at the time for solo bass clef instrument!
        const bassPitch = shiftedNotes[0];

        let chordLabel = step.name
          ? step.name.replace(/m/g, "m").replace(/#/g, "#")
          : "";

        if (visualTranspose !== 0 && chordLabel) {
          chordLabel = transposeChordName(chordLabel, visualTranspose);
        }

        if (showChords && chordLabel) {
          lineB += `"${chordLabel}" `;
        }

        if (bassPitch !== undefined) {
          lineB += `${midiToABCName(bassPitch)} `;
        } else {
          lineB += `z `;
        }
      });

      abc += `[V:B] ${lineB} |]\n`;
    }

    abcjs.renderAbc(svgRef.current, abc, {
      add_classes: true,
      staffwidth: Math.max(1200, path.steps.length * 80),
      scale: 1,
      paddingtop: 50,
      paddingbottom: 50,
      paddingleft: 20,
      paddingright: 20,
    });
  }, [path, transposeShift, visualTranspose, clefLayout, tempo, showChords]);

  useEffect(() => {
    if (!svgRef.current) return;

    // Reset colors of all previously colored elements
    const coloredElements = svgRef.current.querySelectorAll('[data-highlighted="true"]');
    coloredElements.forEach((el) => {
      (el as HTMLElement).style.fill = "";
      el.removeAttribute("data-highlighted");
      
      // Also reset child paths
      el.querySelectorAll("path, text").forEach((pathEl) => {
        (pathEl as HTMLElement).style.fill = "";
      });
    });

    const v0Signatures: string[] = [];
    const v1Signatures: string[] = [];

    const getSignature = (el: Element) => {
      const className = el.getAttribute("class") || "";

      const mMatch = className.match(/abcjs-m\d+/);
      const nMatch = className.match(/abcjs-n\d+/);
      if (mMatch && nMatch) {
        return `.${mMatch[0]}.${nMatch[0]}`;
      }
      return null;
    };

    svgRef.current.querySelectorAll(".abcjs-v0").forEach((el) => {
      const sig = getSignature(el);
      if (sig && !v0Signatures.includes(sig)) {
        v0Signatures.push(sig);
      }
    });

    svgRef.current.querySelectorAll(".abcjs-v1").forEach((el) => {
      const sig = getSignature(el);
      if (sig && !v1Signatures.includes(sig)) {
        v1Signatures.push(sig);
      }
    });

    const activeElements: Element[] = [];

    if (activeStepIndex < v0Signatures.length) {
      const sig0 = v0Signatures[activeStepIndex];
      if (sig0) {
        svgRef.current
          .querySelectorAll(`.abcjs-v0${sig0}`)
          .forEach((el) => activeElements.push(el));
      }
    }

    if (activeStepIndex < v1Signatures.length) {
      const sig1 = v1Signatures[activeStepIndex];
      if (sig1) {
        svgRef.current
          .querySelectorAll(`.abcjs-v1${sig1}`)
          .forEach((el) => activeElements.push(el));
      }
    }

    let leftmostPos = -1;

    activeElements.forEach((el) => {
      el.setAttribute("data-highlighted", "true");
      
      el.querySelectorAll("path, text").forEach((pathEl) => {
        (pathEl as HTMLElement).style.fill = "#a855f7"; // purple-500
      });
      if (
        el.tagName.toLowerCase() === "path" ||
        el.tagName.toLowerCase() === "text"
      ) {
        (el as HTMLElement).style.fill = "#a855f7";
      }

      const bbox = (el as SVGGraphicsElement).getBBox?.();
      if (bbox && (leftmostPos === -1 || bbox.x < leftmostPos)) {
        leftmostPos = bbox.x;
      }
    });

    // Handle scroll
    if (containerRef.current && leftmostPos !== -1) {
      containerRef.current.scrollTo({
        left: leftmostPos * zoomScale - containerRef.current.clientWidth / 2,
        behavior: "smooth",
      });
    }
  }, [activeStepIndex, path, zoomScale, clefLayout, visualTranspose]);

  return (
    <div className="relative w-full flex flex-col gap-3">
      {/* Premium Score Settings Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-neutral-900/60 backdrop-blur-md rounded-2xl border border-white/5 shadow-lg">
        <div className="flex flex-wrap items-center gap-4">
          {/* Clef / Layout choice */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold ml-1">Staff Layout / Clef</span>
            <select
              value={clefLayout}
              onChange={(e) => {
                const val = e.target.value as any;
                setClefLayout(val);
                localStorage.setItem("synesthesia_clefLayout", val);
              }}
              className="bg-neutral-800 border border-neutral-700 text-xs text-neutral-200 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer hover:bg-neutral-700 font-medium transition-colors"
            >
              <option value="grand">🎹 Piano / Grand Staff (Double Staff)</option>
              <option value="treble">🎺 Trumpet & Solo Treble Clef (Monophonic)</option>
              <option value="bass">🎻 Solo Bass Clef (Monophonic Bassline)</option>
            </select>
          </div>

          {/* Transposition select */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold ml-1">Visual Transposition</span>
            <select
              value={visualTranspose}
              onChange={(e) => {
                const val = Number(e.target.value);
                setVisualTranspose(val);
                localStorage.setItem("synesthesia_visualTranspose", String(val));
              }}
              className="bg-neutral-800 border border-neutral-700 text-xs text-neutral-200 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer hover:bg-neutral-700 font-medium transition-colors"
            >
              <option value="0">Concert Pitch (C)</option>
              <option value="2">Bb Instrument (+2 semitones: Trumpet, Clarinet, Tenor Sax)</option>
              <option value="9">Eb Instrument (+9 semitones: Alto Sax, Bari Sax)</option>
              <option value="5">F Instrument (+5 semitones: French Horn)</option>
              <option value="12">Octave Up (+12 semitones)</option>
              <option value="-12">Octave Down (-12 semitones)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Chord labels toggle */}
          <div className="flex flex-col gap-1 items-end">
            <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold mr-1">Chords</span>
            <button
              onClick={() => setShowChords(!showChords)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${
                showChords
                  ? "bg-purple-600/30 text-purple-200 border border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.15)] hover:bg-purple-600/50"
                  : "bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-neutral-200 hover:bg-neutral-700"
              }`}
            >
              {showChords ? "Hide Chord Names" : "Show Chord Names"}
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex flex-col gap-1 items-end">
            <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold mr-1">Scale</span>
            <div className="flex items-center gap-2 bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5">
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={zoomScale}
                onChange={(e) => setZoomScale(parseFloat(e.target.value))}
                className="w-20 accent-purple-500 cursor-pointer text-purple-500 bg-neutral-700"
              />
              <span className="text-xs text-neutral-300 font-mono w-8 text-right">
                {zoomScale.toFixed(1)}x
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SVG Container in high contrast white */}
      <div
        ref={containerRef}
        className="w-full h-[360px] overflow-x-auto overflow-y-auto bg-white rounded-2xl relative border border-white/5 shadow-inner hide-scrollbar"
      >
        <div
          ref={svgRef}
          style={{ zoom: zoomScale }}
          className="text-black w-max min-w-full px-6 pt-10 pb-6 transform-origin-top-left"
        ></div>
      </div>
    </div>
  );
};
