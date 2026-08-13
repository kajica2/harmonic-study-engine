import React, { useEffect, useRef, useState } from "react";
import { HarmonicPath } from "../lib/paths";
import { InstrumentPitch } from "../lib/scoreGenerator";
import { renderLeadSheet } from "../lib/leadSheet";
import { toMusicXml } from "../lib/scoreExport";
import { loadOSMD, renderOSMD } from "../lib/osmd";
import { Download, FileText, Music } from "lucide-react";
import { StageFrame, ToolChip, ToolGroup } from "./StageFrame";

interface LeadSheetProps {
  path: HarmonicPath;
}

type Engine = "abcjs" | "osmd";

/**
 * Lead Sheet modal — renders the active path in either:
 *   - abcjs (default, simple, fast)
 *   - OSMD 2.x (loaded from CDN; high-fidelity engraving)
 *
 * The user picks the engine from a ToolGroup above the score.
 * OSMD is lazy-loaded on first use; if the CDN fails to load, we
 * fall back to abcjs and surface an inline error message.
 */
export const LeadSheet: React.FC<LeadSheetProps> = ({ path }) => {
  const [instrument, setInstrument] = useState<InstrumentPitch>("Concert");
  const [engine, setEngine] = useState<Engine>("abcjs");
  const [osmdReady, setOsmdReady] = useState(false);
  const [osmdError, setOsmdError] = useState<string | null>(null);
  const abcRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<HTMLDivElement>(null);

  // Render abcjs into its host on path/instrument changes.
  useEffect(() => {
    if (!abcRef.current) return;
    renderLeadSheet(abcRef.current, path, instrument);
  }, [instrument, path, engine]);

  // Render OSMD on engine toggle + path/instrument change.
  useEffect(() => {
    if (engine !== "osmd") return;
    if (!osmdRef.current) return;
    let cancelled = false;
    setOsmdError(null);
    (async () => {
      // First verify the CDN is reachable
      const ctor = await loadOSMD();
      if (cancelled) return;
      if (!ctor) {
        setOsmdError(
          "Couldn't load the OSMD engraving library (CDN unreachable). Falling back to abcjs.",
        );
        setEngine("abcjs");
        return;
      }
      const xml = toMusicXml(path, {
        transpose: instrument === "Concert" ? 0 : instrument === "Bb" ? 2 : 5,
      });
      const ok = await renderOSMD(osmdRef.current, xml);
      if (cancelled) return;
      if (ok) setOsmdReady(true);
      else {
        setOsmdError("OSMD couldn't render this score. Falling back to abcjs.");
        setEngine("abcjs");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engine, path, instrument]);

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
    const abc = (abcRef.current?.querySelector("textarea") as HTMLTextAreaElement | null)?.value ?? "";
    handleDownload(`${path.id}_${instrument}.abc`, "text/plain", abc || "ABC source unavailable");
  };

  const downloadXml = () => {
    const xml = toMusicXml(path, {
      transpose: instrument === "Concert" ? 0 : instrument === "Bb" ? 2 : 5,
    });
    handleDownload(`${path.id}_${instrument}.musicxml`, "application/vnd.recordare.musicxml+xml", xml);
  };

  return (
    <StageFrame
      accent
      eyebrow="Lead Sheet"
      title={path.title}
      meta={`${path.steps.length} chords · ${engine === "osmd" ? "OSMD" : "abcjs"} engine`}
      actions={
        <div className="flex items-center gap-1">
          <button
            onClick={downloadAbc}
            title="Download ABC source"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-sm)] surface-1 border border-[color:var(--color-border)] t-mono text-xs hover:border-[color:var(--color-text-1)]"
          >
            <FileText size={12} /> ABC
          </button>
          <button
            onClick={downloadXml}
            title="Download MusicXML (works with MuseScore / Finale)"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)] t-mono text-xs hover:bg-[color:var(--color-brand-strong)]"
          >
            <Download size={12} /> MusicXML
          </button>
        </div>
      }
    >
      {/* Controls row: transposition + engine choice */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <ToolGroup label="Transposed for">
          <ToolChip
            active={instrument === "Concert"}
            onClick={() => setInstrument("Concert")}
            title="Concert pitch — original key"
          >
            Concert
          </ToolChip>
          <ToolChip
            active={instrument === "Bb"}
            onClick={() => setInstrument("Bb")}
            title="Bb trumpet transposition"
          >
            Bb
          </ToolChip>
          <ToolChip
            active={instrument === "F"}
            onClick={() => setInstrument("F")}
            title="F horn transposition"
          >
            F
          </ToolChip>
        </ToolGroup>

        <ToolGroup label="Engraving engine">
          <ToolChip
            active={engine === "abcjs"}
            onClick={() => setEngine("abcjs")}
            title="abcjs — fast, lightweight"
          >
            abcjs
          </ToolChip>
          <ToolChip
            active={engine === "osmd"}
            onClick={() => setEngine("osmd")}
            title="OSMD 2.x — high-fidelity engraving (CDN-loaded on first use)"
          >
            OSMD
          </ToolChip>
        </ToolGroup>
      </div>

      {osmdError && (
        <div
          role="alert"
          className="text-[11px] t-mono text-[color:var(--color-warn)] mb-2 px-1"
        >
          {osmdError}
        </div>
      )}

      {/* Two score hosts — only one is visible at a time. */}
      <div
        className={`bg-white text-black rounded-[var(--radius-md)] p-3 overflow-auto max-h-[60vh] ${engine === "abcjs" ? "" : "hidden"}`}
      >
        <div ref={abcRef} />
      </div>
      <div
        ref={osmdRef}
        className={`bg-white text-black rounded-[var(--radius-md)] p-3 overflow-auto max-h-[60vh] min-h-[300px] ${engine === "osmd" ? "" : "hidden"}`}
      >
        {engine === "osmd" && !osmdReady && !osmdError && (
          <div className="flex items-center justify-center h-32 text-neutral-500 t-mono text-xs">
            <Music className="animate-pulse mr-2" size={14} />
            Loading engraving library…
          </div>
        )}
      </div>
    </StageFrame>
  );
};