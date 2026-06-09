import React, { useEffect, useRef, useState } from "react";
import abcjs from "abcjs";
import { HarmonicPath } from "../lib/paths";
import { midiToABCName } from "../lib/scoreGenerator";

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

  useEffect(() => {
    if (!svgRef.current || !path) return;

    let abc = `X:1\n`;
    abc += `T:${path.name}\n`;
    abc += `M:4/4\n`;
    abc += `L:1/4\n`;
    abc += `Q:1/4=${tempo}\n`;
    abc += `K:C\n`;

    // We will render grand staff
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
        .map((n) => n + transposeShift)
        .sort((a, b) => a - b);
      const treblePitches = shiftedNotes.filter((p) => p >= 60);
      const bassPitches = shiftedNotes.filter((p) => p < 60);

      // We append guitar chords as ABC strings over the treble clef
      let chordLabel = step.name
        ? step.name.replace(/m/g, "m").replace(/#/g, "#")
        : "";
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

    abcjs.renderAbc(svgRef.current, abc, {
      add_classes: true,
      staffwidth: Math.max(1200, path.steps.length * 80),
      scale: 1,
      paddingtop: 50,
      paddingbottom: 50,
      paddingleft: 20,
      paddingright: 20,
    });
  }, [path, transposeShift, tempo, showChords]); // Removed zoomScale from deps

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
      let className = el.getAttribute("class") || "";

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
      
      // Find the actual SVG elements inside the group if necessary
      el.querySelectorAll("path, text").forEach((pathEl) => {
        (pathEl as HTMLElement).style.fill = "#a855f7"; // purple-500
      });
      // also change the element itself if it's a path/text
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
  }, [activeStepIndex, path, zoomScale]);

  return (
    <div className="relative w-full">
      <div className="absolute top-2 left-2 z-10 flex items-center gap-3 bg-white/90 backdrop-blur-sm p-2 rounded-lg border border-neutral-200 shadow-sm">
        <button
          onClick={() => setShowChords(!showChords)}
          className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
            showChords
              ? "bg-purple-600 text-white"
              : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
          }`}
        >
          {showChords ? "Hide Chords" : "Show Chords"}
        </button>
        <div className="w-px h-4 bg-neutral-300"></div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-neutral-600">Zoom:</label>
          <input
            type="range"
            min="0.5"
            max="2.5"
            step="0.1"
            value={zoomScale}
            onChange={(e) => setZoomScale(parseFloat(e.target.value))}
            className="w-24 accent-purple-600"
          />
          <span className="text-xs text-neutral-500 font-mono w-8">
            {zoomScale.toFixed(1)}x
          </span>
        </div>
      </div>
      <div
        ref={containerRef}
        className="w-full h-[360px] overflow-x-auto overflow-y-auto bg-white/90 rounded-xl relative border border-white/10 hide-scrollbar"
      >
        <div
          ref={svgRef}
          style={{ zoom: zoomScale }}
          className="text-black/80 w-max min-w-full px-4 pt-12 transform-origin-top-left"
        ></div>
      </div>
    </div>
  );
};
