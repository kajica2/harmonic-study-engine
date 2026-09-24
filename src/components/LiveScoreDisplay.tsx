import React, { useEffect, useRef, useState } from "react";
import abcjs from "abcjs";
import { HarmonicPath } from "../lib/paths";
import { midiToABCName, transposeMidiList } from "../lib/scoreGenerator";
import { playbackClock } from "../lib/playbackClock";
import { useTick } from "../lib/useTick";
import { transposeChordName } from "../lib/theory";
import { slicePathForRepeat, type BeatCell } from "../lib/sliceAndRepeat";
import { TimeSignature } from "../lib/rhythm";
// Sliced persona mode only (frozen helper table, blast-table #20).
import { stepsPerBar } from "../lib/loopWav";
// F3 (D110): the score window is measured in TRUE form bars.
import { barOfStep, totalFormBars } from "../../engine/practice/windows";
import type { ScoreDisplayMode } from "../lib/displayMode";


interface LiveScoreDisplayProps {
  path: HarmonicPath;
  activeStepIndex: number;
  transposeShift: number;
  tempo: number;
  /** F3 (D110): detectFormPeriod(path.steps), computed once in App.
   *  The 4-bar context window + "now at bar" readout are in form
   *  bars (1 form bar = 1 step = 1 bar of audio). */
  formLen: number;
  /** Time signature — drives the live beat badge ("Beat N of M").
   *  Kept for backward compat (the component is also used in places
   *  that don't pass a signature). */
  timeSignature?: TimeSignature;
  /** Display mode (full / zoom). When 'zoom', the score renders
   *  larger and the container gets a brand-colored ring so the
   *  "this is the focus mode" treatment is visible. Per-bar dim
   *  would require abcjs post-process — out of scope for this
   *  PR. The zoom level itself is already wired (zoomScale state). */
  displayMode?: ScoreDisplayMode;
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
  formLen,
  timeSignature = "4/4",
  displayMode = "full",
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
  //
  // F3 (D110, blast-table #10): the NON-sliced window is in TRUE
  // form bars - 1 form bar = 1 step = 1 bar of audio (bars are
  // form-relative; within the first pass the step map is the
  // identity, so bar b slices step b). The sliced persona branch
  // keeps its legacy 4-steps-per-bar motif grouping UNCHANGED
  // (already honest for the slice-and-repeat semantic - the motif
  // IS four steps). Meter-agnostic notation stays TD-038.
  const isSliced = !!(path as { sliceAndRepeat?: boolean })?.sliceAndRepeat;
  const spbLegacy = isSliced ? stepsPerBar(timeSignature) : 1;
  const activeBar = isSliced
    ? Math.floor(activeStepIndex / spbLegacy)
    : barOfStep(activeStepIndex, formLen);
  const totalBars = isSliced
    ? Math.ceil((path?.steps.length ?? 0) / spbLegacy)
    : totalFormBars(formLen);
  const windowBarStart = Math.max(0, activeBar - 1);
  const windowBarEnd = Math.min(totalBars, windowBarStart + 4);
  const windowStepStart = isSliced ? windowBarStart * spbLegacy : windowBarStart;
  const windowStepEnd = Math.min(
    path?.steps.length ?? 0,
    isSliced ? windowBarEnd * spbLegacy : windowBarEnd,
  );
  const windowSteps =
    path?.steps.slice(windowStepStart, windowStepEnd) ?? [];

  // Coltrane-style slice-and-repeat: when path.sliceAndRepeat is on,
  // render each bar as 4 individual beat-cells (one per beat) instead
  // of one chord stretched across 4 beats. The visual effect: the
  // recurring motif becomes legible — same chord four times per bar
  // when the source data repeats, or per-beat variation when it
  // doesn't. The helper pads short bars with the last step.
  // Per-beat cells for the visible window, flattened. Index = beat
  // offset within the window (0..windowCells.length-1).
  //
  // F3: the non-sliced branch routes through the SAME beat-cell
  // machinery - each window step expands into 4 identical quarter
  // cells + one barline per step (slicePathForRepeat semantics:
  // "same chord four times per bar"). Result: the score shows each
  // bar's chord held a full bar = audio truth, without touching the
  // abcjs layout code below.
  const windowCells: BeatCell[] = isSliced
    ? slicePathForRepeat(path?.steps ?? [])
        .slice(windowBarStart, windowBarEnd)
        .flat()
    : windowSteps.flatMap((s) =>
        [0, 1, 2, 3].map((beat) => ({
          beat,
          notes: [...s.notes],
          chordName: s.name ?? "",
        })),
      );

  // In both modes each cell IS one beat, so the window is
  // (windowBarEnd - windowBarStart) x 4 cells long. Sliced keeps the
  // legacy step-derived mapping (unchanged); non-sliced highlights
  // the first cell of the active form bar (the whole bar is the
  // same chord - there is no sub-bar position in step truth).
  const activeCellIndex = isSliced
    ? (activeBar - windowBarStart) * 4 +
      Math.max(0, activeStepIndex - activeBar * spbLegacy)
    : (activeBar - windowBarStart) * 4;

  useEffect(() => {
    if (!svgRef.current || !path) return;

    let abc = `X:1\n`;
    abc += `T:${path.title}\n`;
    abc += `M:4/4\n`;
    abc += `L:1/4\n`;
    abc += `Q:1/4=${tempo}\n`;
    abc += `K:C\n`;

    // F3: BOTH modes iterate the beat cells (4 per bar) - the
    // non-sliced branch's windowCells are the quarter-expansion of
    // each step (same chord four times per bar = audio truth). Same
    // field shape (`notes` + `name`) so the rest of the rendering
    // logic is identical.
    const events: Array<{ notes: number[]; name: string; index: number }> =
      windowCells.map((c, i) => ({
        notes: c.notes,
        name: c.chordName,
        index: windowBarStart * 4 + i, // global beat index for the | separator
      }));

    if (clefLayout === "grand") {
      abc += `%%score { (T B) }\n`;
      abc += `V:T clef=treble\n`;
      abc += `V:B clef=bass\n`;

      let lineT = "";
      let lineB = "";

      events.forEach((evt) => {
        if (evt.index > 0 && evt.index % 4 === 0) {
          lineT += "| ";
          lineB += "| ";
        }

        const shiftedNotes = transposeMidiList(
          evt.notes,
          transposeShift + visualTranspose,
        );
        const treblePitches = shiftedNotes.filter((p) => p >= 60);
        const bassPitches = shiftedNotes.filter((p) => p < 60);

        let chordLabel = evt.name
          ? evt.name.replace(/m/g, "m").replace(/#/g, "#")
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

      events.forEach((evt) => {
        if (evt.index > 0 && evt.index % 4 === 0) {
          lineT += "| ";
        }

        // Take ALL chord notes, transpose, and arpeggiate as a
        // quarter-note sequence (or 8ths if the chord has > 4 notes).
        const shiftedNotes = transposeMidiList(
          evt.notes,
          transposeShift + visualTranspose,
        );
        const quarterNotes = shiftedNotes.slice(0, 4);
        const overflow = shiftedNotes.slice(4);

        let chordLabel = evt.name
          ? evt.name.replace(/m/g, "m").replace(/#/g, "#")
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

      events.forEach((evt) => {
        if (evt.index > 0 && evt.index % 4 === 0) {
          lineB += "| ";
        }

        const shiftedNotes = transposeMidiList(
          evt.notes,
          transposeShift + visualTranspose,
        );
        const quarterNotes = shiftedNotes.slice(0, 4);
        const overflow = shiftedNotes.slice(4);

        let chordLabel = evt.name
          ? evt.name.replace(/m/g, "m").replace(/#/g, "#")
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
  }, [path, transposeShift, visualTranspose, clefLayout, tempo, showChords, activeStepIndex, isSliced, windowCells.length]);

  useEffect(() => {
    if (!svgRef.current) return;

    // F3: both modes are cell-based now - the local index is the
    // active cell's offset within the window (sliced: step-derived
    // legacy mapping; non-sliced: first cell of the active form bar).
    const localStepIndex = activeCellIndex;

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
                  aria-pressed={clefLayout === c}
                  className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors active:scale-95 ${
                    clefLayout === c
                      ? "bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)]"
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
            aria-pressed={showChords}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono rounded-lg transition-colors active:scale-95 ${
              showChords
                ? "bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)] border border-[color:var(--color-brand-strong)]"
                : "bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-neutral-200 hover:bg-neutral-700"
            }`}
          >
            {showChords ? "Hide Chord Names" : "Show Chord Names"}
          </button>

          {/* Slice & repeat badge — surfaces the Coltrane-style subdivision
              visually so the user knows the score is rendering per-beat
              cells instead of one chord per beat. */}
          {isSliced && (
            <span
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono rounded-lg bg-amber-900/30 text-amber-200 border border-amber-700/50"
              title="Path has sliceAndRepeat=true — each bar rendered as 4 single-beat cells (Coltrane-style)"
              aria-label="Slice and repeat active"
              data-testid="slice-repeat-badge"
            >
              ◷ Slice & Repeat
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Tick badge — drives from the shared playbackClock */}
          {tickDetail.isRunning && (
            <div
              className="flex items-center gap-1 bg-[color:var(--color-brand)]/15 text-[color:var(--color-brand-strong)] border border-[color:var(--color-brand)]/40 rounded-lg px-2.5 py-1.5 t-mono text-xs"
              aria-hidden="true"
            >
              <span
                className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-brand-strong)] animate-pulse"
                aria-hidden="true"
              />
              Beat {Math.floor(tickDetail.beat) + 1} of{" "}
              {timeSignature.split("/")[0]}
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
                aria-label="Score zoom scale"
                onChange={(e) => setZoomScale(parseFloat(e.target.value))}
                className="w-20 accent-[color:var(--color-brand)] cursor-pointer text-[color:var(--color-brand-strong)] bg-neutral-700"
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
            ▍ now at bar {activeBar + 1}
          </span>
        )}
      </div>

      {/* SVG Container in high contrast white */}
      <div
        ref={containerRef}
        className={`w-full h-[360px] overflow-x-auto overflow-y-auto bg-white rounded-2xl relative border shadow-inner hide-scrollbar transition-all ${
          displayMode === "zoom"
            ? "border-[color:var(--color-brand-strong)] ring-2 ring-[color:var(--color-brand)]/40 ring-offset-2 ring-offset-[color:var(--color-bg)]"
            : "border-white/5"
        }`}
        data-display-mode={displayMode}
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