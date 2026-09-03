import React, { useEffect, useRef, useState } from "react";
import abcjs from "abcjs";
import { HarmonicPath } from "../lib/paths";
import { midiToABCName, transposeMidiList } from "../lib/scoreGenerator";
import { playbackClock } from "../lib/playbackClock";
import { useTick } from "../lib/useTick";

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
    const newIndex = (index + shift + 120) % 12;
    return prefix + NOTE_WHEEL[newIndex];
  });
}

interface LiveScoreDisplayProps {
  path: HarmonicPath;
  activeStepIndex: number;
  transposeShift: number;
  tempo: number;
}

/**
 * Live score display — abcjs-rendered score for the active path.
 *
 * Three clef modes:
 *   - grand:  chord split across treble + bass (upper notes on
 *             treble, lower notes on bass; played as stacked
 *             chords). Most useful for piano reading.
 *   - treble: ALL chord notes arpeggiated across the bar in
 *             ascending order (D F A C as 4 quarter notes).
 *             What a trumpet player actually plays.
 *   - bass:   same arpeggio but in the lower octave. Useful for
 *             trombone / bass instrument reading.
 *
 * Each chord's notes are arpeggiated, not collapsed to one pitch.
 * The user can see every note in the voicing.
 */
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

  // Tick subscription — drives the live beat badge in the toolbar.
  // Shared via useTick so PlaySessionRail and this component share the
  // same state instead of each holding a duplicate copy.
  const tickDetail = useTick();

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

  // 4-bar window computation. The active bar gets 1 bar before +
  // 1 bar after for context (4 bars total). Computed at render so
  // the JSX can display "Bars X-Y of N".
  const stepsPerBar = 4;
  const activeBar = Math.floor(activeStepIndex / stepsPerBar);
  const totalBars = Math.ceil((path?.steps.length ?? 0) / stepsPerBar);
  const windowBarStart = Math.max(0, activeBar - 1);
  const windowBarEnd = Math.min(totalBars, windowBarStart + 4);
  const windowStepStart = windowBarStart * stepsPerBar;
  const windowStepEnd = Math.min(
    path?.steps.length ?? 0,
    windowBarEnd * stepsPerBar,
  );
  const windowSteps =
    path?.steps.slice(windowStepStart, windowStepEnd) ?? [];

  useEffect(() => {
    if (!svgRef.current || !path) return;

    let abc = `X:1\n`;
    abc += `T:${path.title}\n`;
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

      windowSteps.forEach((step, localIdx) => {
        const index = windowStepStart + localIdx;
        if (index > 0 && index % 4 === 0) {
          lineT += "| ";
          lineB += "| ";
        }

        const shiftedNotes = transposeMidiList(
          step.notes,
          transposeShift + visualTranspose,
        );
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

      windowSteps.forEach((step, localIdx) => {
        const index = windowStepStart + localIdx;
        if (index > 0 && index % 4 === 0) {
          lineT += "| ";
        }

        // Take ALL chord notes, transpose, and arpeggiate as a
        // quarter-note sequence (or 8ths if the chord has > 4 notes).
        const shiftedNotes = transposeMidiList(
          step.notes,
          transposeShift + visualTranspose,
        );
        const quarterNotes = shiftedNotes.slice(0, 4);
        const overflow = shiftedNotes.slice(4);

        let chordLabel = step.name
          ? step.name.replace(/m/g, "m").replace(/#/g, "#")
          : "";

        if (visualTranspose !== 0 && chordLabel) {
          chordLabel = transposeChordName(chordLabel, visualTranspose);
        }

        if (showChords && chordLabel) {
          lineT += `"${chordLabel}" `;
        }

        // Render the arpeggio. Pad with rests if the chord has
        // fewer than 4 notes so each bar still fills 4 beats.
        const slots = quarterNotes.length;
        for (let i = 0; i < slots; i++) {
          lineT += `${midiToABCName(quarterNotes[i])}4 `;
        }
        // Overflow becomes 8ths tacked onto the end of the bar.
        if (overflow.length > 0) {
          lineT += "[";
          overflow.forEach((m) => {
            lineT += `${midiToABCName(m)}8`;
          });
          lineT += "] ";
        }
      });

      abc += `[V:T] ${lineT} |]\n`;
    } else {
      abc += `V:B clef=bass\n`;
      let lineB = "";

      windowSteps.forEach((step, localIdx) => {
        const index = windowStepStart + localIdx;
        if (index > 0 && index % 4 === 0) {
          lineB += "| ";
        }

        const shiftedNotes = transposeMidiList(
          step.notes,
          transposeShift + visualTranspose,
        );
        const quarterNotes = shiftedNotes.slice(0, 4);
        const overflow = shiftedNotes.slice(4);

        let chordLabel = step.name
          ? step.name.replace(/m/g, "m").replace(/#/g, "#")
          : "";

        if (visualTranspose !== 0 && chordLabel) {
          chordLabel = transposeChordName(chordLabel, visualTranspose);
        }

        if (showChords && chordLabel) {
          lineB += `"${chordLabel}" `;
        }

        const slots = quarterNotes.length;
        for (let i = 0; i < slots; i++) {
          lineB += `${midiToABCName(quarterNotes[i])}4 `;
        }
        if (overflow.length > 0) {
          lineB += "[";
          overflow.forEach((m) => {
            lineB += `${midiToABCName(m)}8`;
          });
          lineB += "] ";
        }
      });

      abc += `[V:B] ${lineB} |]\n`;
    }

    // 4 bars × ~140px per bar at scale 1 — fits in the container
    // horizontally. The auto-scroll effect below keeps the active
    // bar centered when the user changes steps.
    abcjs.renderAbc(svgRef.current, abc, {
      add_classes: true,
      staffwidth: 600,
      scale: 1,
      paddingtop: 50,
      paddingbottom: 50,
      paddingleft: 20,
      paddingright: 20,
    });
  }, [path, transposeShift, visualTranspose, clefLayout, tempo, showChords, activeStepIndex]);

  useEffect(() => {
    if (!svgRef.current) return;

    // Map global activeStepIndex to local 4-bar-window index.
    const localStepIndex = activeStepIndex - windowStepStart;

    // Reset previous highlights.
    const coloredElements = svgRef.current.querySelectorAll('[data-highlighted="true"]');
    coloredElements.forEach((el) => {
      (el as HTMLElement).style.fill = "";
      el.removeAttribute("data-highlighted");
      el.querySelectorAll("path, text").forEach((pathEl) => {
        (pathEl as HTMLElement).style.fill = "";
      });
    });
    svgRef.current.querySelectorAll('[data-bar-highlight="true"]').forEach((el) => {
      el.parentNode?.removeChild(el);
    });

    if (localStepIndex < 0) return;

    const v0Signatures: string[] = [];
    const v1Signatures: string[] = [];

    const getSignature = (el: Element) => {
      const className = el.getAttribute("class") || "";
      const mMatch = className.match(/abcjs-m\d+/);
      const nMatch = className.match(/abcjs-n\d+/);
      if (mMatch && nMatch) return `.${mMatch[0]}.${nMatch[0]}`;
      return null;
    };

    svgRef.current.querySelectorAll(".abcjs-v0").forEach((el) => {
      const sig = getSignature(el);
      if (sig && !v0Signatures.includes(sig)) v0Signatures.push(sig);
    });
    svgRef.current.querySelectorAll(".abcjs-v1").forEach((el) => {
      const sig = getSignature(el);
      if (sig && !v1Signatures.includes(sig)) v1Signatures.push(sig);
    });

    const activeElements: Element[] = [];
    if (localStepIndex < v0Signatures.length) {
      const sig0 = v0Signatures[localStepIndex];
      svgRef.current.querySelectorAll(`.abcjs-v0${sig0}`).forEach((el) => activeElements.push(el));
    }
    if (localStepIndex < v1Signatures.length) {
      const sig1 = v1Signatures[localStepIndex];
      svgRef.current.querySelectorAll(`.abcjs-v1${sig1}`).forEach((el) => activeElements.push(el));
    }

    // Brass-fill the active chord notes.
    activeElements.forEach((el) => {
      (el as HTMLElement).style.fill = "#D4A857";
      el.setAttribute("data-highlighted", "true");
      el.querySelectorAll("path, text").forEach((pathEl) => {
        (pathEl as HTMLElement).style.fill = "#D4A857";
      });
    });

    // Highlight the entire active bar with a translucent brass band.
    if (activeElements.length > 0) {
      const barGroup = activeElements[0].closest(".abcjs-bar");
      if (barGroup instanceof Element) {
        const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        const ctm = (barGroup as SVGGraphicsElement).getCTM();
        const barRect = barGroup.getBoundingClientRect();
        if (ctm) {
          bg.setAttribute("x", String(ctm.e - 4));
          bg.setAttribute("y", "0");
          bg.setAttribute("width", String(barRect.width / zoomScale + 8));
          bg.setAttribute("height", "180");
          bg.setAttribute("fill", "rgba(212, 168, 87, 0.18)");
          bg.setAttribute("data-bar-highlight", "true");
          barGroup.insertBefore(bg, barGroup.firstChild);
        }
      }
    }
  }, [activeStepIndex, path, transposeShift, visualTranspose, clefLayout, zoomScale]);

  // Auto-scroll the score so the active bar stays centered.
  useEffect(() => {
    if (!containerRef.current || !svgRef.current) return;
    const id = window.setTimeout(() => {
      const barGroup = svgRef.current?.querySelector('[data-bar-highlight="true"]');
      if (!(barGroup instanceof Element)) return;
      const containerRect = containerRef.current!.getBoundingClientRect();
      const barRect = barGroup.getBoundingClientRect();
      const barCenter = barRect.left + barRect.width / 2 - containerRect.left;
      const target = containerRef.current!.scrollLeft + barCenter - containerRect.width / 2;
      containerRef.current!.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(id);
  }, [activeStepIndex]);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 mb-4">
      {/* Top controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          {/* Clef layout selector */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold mr-1">
              Clef
            </span>
            <div className="inline-flex bg-neutral-800 border border-neutral-700 rounded-lg p-0.5">
              {(["grand", "treble", "bass"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setClefLayout(c);
                    try {
                      localStorage.setItem("synesthesia_clefLayout", c);
                    } catch {}
                  }}
                  className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors ${
                    clefLayout === c
                      ? "bg-purple-700 text-white"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                  title={
                    c === "grand"
                      ? "Grand staff — chord split between treble and bass"
                      : c === "treble"
                        ? "Treble only — every chord note arpeggiated (trumpet view)"
                        : "Bass only — every chord note arpeggiated (bass instrument view)"
                  }
                >
                  {c === "grand" ? "Grand" : c === "treble" ? "Treble" : "Bass"}
                </button>
              ))}
            </div>
          </div>

          {/* Chord label toggle */}
          <button
            onClick={() => setShowChords(!showChords)}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono rounded-lg transition-colors ${
              showChords
                ? "bg-purple-700 text-white border border-purple-600"
                : "bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-neutral-200 hover:bg-neutral-700"
            }`}
          >
            {showChords ? "Hide Chord Names" : "Show Chord Names"}
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Tick badge — drives from the shared playbackClock */}
          {tickDetail.isRunning && (
            <div
              className="flex items-center gap-1 bg-[color:var(--color-brand)]/15 text-[color:var(--color-brand-strong)] border border-[color:var(--color-brand)]/40 rounded-lg px-2.5 py-1.5 t-mono text-xs"
              role="status"
              aria-live="off"
              aria-label={`Beat ${Math.floor(tickDetail.beat) + 1} of 4`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-brand-strong)] animate-pulse"
                aria-hidden="true"
              />
              Beat {Math.floor(tickDetail.beat) + 1} of 4
            </div>
          )}

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

      {/* Bar-range indicator — shows "Bars X-Y of N" so the user
          knows where they are in the full path. Updates whenever
          activeStepIndex crosses a window boundary. */}
      <div className="flex items-center justify-between text-[11px] t-mono text-neutral-500 mb-1 px-1">
        <span>
          Bars {windowBarStart + 1}-{windowBarEnd} of {totalBars}
        </span>
        {activeStepIndex >= 0 && (
          <span className="text-[color:var(--color-brand-strong)]">
            ▍ now at bar {Math.floor(activeStepIndex / 4) + 1}
          </span>
        )}
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