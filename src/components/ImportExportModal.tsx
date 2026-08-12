import React, { useState, useRef } from "react";
import {
  X,
  Download,
  Upload,
  FileAudio,
  Link,
  ClipboardList,
  FileJson,
  BookText,
} from "lucide-react";
import { HarmonicPath } from "../lib/paths";
import {
  importIRealText,
  exportIReal,
  parseChordToMidi,
} from "../lib/ireal";
import { importRealBookMarkdown } from "../lib/importRealBook";
import { exportToMidiFile } from "../lib/midiExport";
import { ModalShell, useModalLabel } from "./ModalShell";

type Tab = "url" | "chart" | "json" | "realbook";

interface Props {
  currentPath: HarmonicPath;
  onImport: (paths: HarmonicPath[]) => void;
  onClose: () => void;
}

export const ImportExportModal: React.FC<Props> = ({
  currentPath,
  onImport,
  onClose,
}) => {
  const titleId = useModalLabel("import-export");
  const [tab, setTab] = useState<Tab>("url");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<HarmonicPath[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const compute = (text: string) => {
    setError("");
    if (!text.trim()) {
      setPreview(null);
      return;
    }
    let parsed: HarmonicPath[] = [];
    if (tab === "realbook") {
      parsed = importRealBookMarkdown(text);
    } else {
      parsed = importIRealText(text);
    }
    if (parsed.length === 0) {
      setError(
        tab === "realbook"
          ? "No chord charts found. Expected a Markdown file with ## N. Title headers and ``` fenced chord blocks."
          : "Could not parse any chords. Accepted: iRealBook URLs, plain chord text (Cmaj7 | Dm7 | ...), or JSON.",
      );
      setPreview(null);
      return;
    }
    setPreview(parsed);
  };

  const handleInputChange = (text: string) => {
    setInput(text);
    compute(text);
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    // Auto-detect the right tab from content shape
    const lower = text.trim();
    if (
      tab === "realbook" ||
      (/^##\s+\d+\.\s+/m.test(lower) && lower.includes("```"))
    ) {
      setTab("realbook");
    } else if (lower.startsWith("{") || lower.startsWith("[")) {
      setTab("json");
    } else {
      setTab("chart");
    }
    handleInputChange(text);
  };

  const handleConfirm = () => {
    if (preview && preview.length > 0) {
      onImport(preview);
      onClose();
    }
  };

  const handleExportMidi = () => {
    const uri = exportToMidiFile(currentPath);
    const link = document.createElement("a");
    link.href = uri;
    link.download = `${currentPath.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.mid`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportText = exportIReal(currentPath);

  const placeholder =
    tab === "url"
      ? "irealb://Cool%20Standards=Dietz==Swing=Bb=n=…   (also: irealbook://, irealpro://)"
      : tab === "json"
      ? '{ "title": "Tune", "composer": "X", "chords": [["Cmaj7",4],["Dm7",4]] }   or   { "name": "Std", "songs": [...] }'
      : tab === "realbook"
      ? "Drop or paste a Markdown file with ## N. Title sections and ``` fenced chord blocks. Each section becomes one playable path."
      : "| Cmaj7 | Dm7 G7 | Em7 | A7 | Dm7 | G7 | Cmaj7 |";

  return (
    <ModalShell
      onDismiss={onClose}
      labelledBy={titleId}
      className="bg-[color:var(--color-bg-1)] border border-[color:var(--color-border)] rounded-[var(--radius-xl)] w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[92vh]"
    >
      <button
        onClick={onClose}
        aria-label="Close import / export"
        className="absolute top-3 right-3 sm:top-4 sm:right-4 text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)] transition-colors p-1 z-10"
      >
        <X size={20} />
      </button>
      <div className="p-5 sm:p-6 pb-3">
        <h2 id={titleId} className="t-h1 text-[color:var(--color-text-1)]">Import &amp; export</h2>
          <p className="t-small text-[color:var(--color-text-3)] mt-1">
            Bring in iRealBook charts, plain text progressions, or JSON song
            definitions.
          </p>
        </div>

        <div className="px-5 sm:px-6 flex gap-1 border-b border-[color:var(--color-border)]">
          {(
            [
              { id: "url", label: "iReal URL", icon: Link },
              { id: "chart", label: "Chart text", icon: ClipboardList },
              { id: "json", label: "JSON", icon: FileJson },
              { id: "realbook", label: "Real Book", icon: BookText },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono transition border-b-2 ${
                  active
                    ? "border-[color:var(--color-brand)] text-[color:var(--color-text-1)]"
                    : "border-transparent text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)]"
                }`}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2 pb-2">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.json,.irealb,application/json,text/plain"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="hidden"
              aria-hidden="true"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1 px-2 py-1 text-xs surface-2 border border-[color:var(--color-border)] rounded hover:bg-[color:var(--color-bg-2)] transition-colors"
            >
              <Upload size={12} /> Load file…
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {/* Input area */}
          <div>
            <label className="t-label text-[color:var(--color-text-3)] block mb-2">
              {tab === "url" && "iRealBook / iReal Pro URL"}
              {tab === "chart" && "Plain-text chord chart"}
              {tab === "json" && "JSON — single song or playlist"}
              {tab === "realbook" && "Real Book Markdown — drop the whole file or paste"}
            </label>
            <textarea
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder={placeholder}
              spellCheck={false}
              className="w-full surface-2 border border-[color:var(--color-border)] rounded-[var(--radius-md)] py-2 px-3 t-mono text-[color:var(--color-text-1)] h-32 focus:outline-none focus:border-[color:var(--color-brand-strong)] transition-colors resize-none"
            />
            {error && (
              <div className="t-small text-[color:var(--color-err)] mt-2">{error}</div>
            )}
          </div>

          {/* Preview */}
          {preview && preview.length > 0 && (
            <div className="surface-2 border border-[color:var(--color-border)] rounded-[var(--radius-md)] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="t-label text-[color:var(--color-text-3)]">
                  Preview ({preview.length} {preview.length === 1 ? "song" : "songs"})
                </span>
                <span className="t-small text-[color:var(--color-text-3)]">
                  {preview.reduce((s, p) => s + p.steps.length, 0)} steps total
                </span>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                {preview.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 surface-1 border border-[color:var(--color-border)] rounded-[var(--radius-sm)] px-2.5 py-1.5"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[color:var(--color-text-1)] truncate">
                        {p.title}
                      </div>
                      <div className="text-[10px] text-[color:var(--color-text-3)] truncate">
                        {p.description}
                      </div>
                    </div>
                    <span className="t-mono text-[10px] text-[color:var(--color-text-2)] whitespace-nowrap">
                      {p.steps.length} ch
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleConfirm}
            disabled={!preview || preview.length === 0}
            className="w-full py-2.5 rounded-[var(--radius-md)] bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)] text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[color:var(--color-brand-strong)] transition-colors"
          >
            Import {preview && preview.length > 0
              ? `${preview.length} ${preview.length === 1 ? "song" : "songs"}`
              : "preview"}
          </button>

          <div className="h-px w-full bg-[color:var(--color-border)]" />

          {/* Export */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={handleExportMidi}
              className="flex items-center justify-center gap-2 bg-[color:var(--color-accent)]/20 text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/30 border border-[color:var(--color-accent)]/40 py-2.5 rounded-[var(--radius-md)] transition-colors font-medium text-sm"
            >
              <FileAudio size={16} /> Download MIDI
            </button>
            <button
              onClick={() => {
                const link = document.createElement("a");
                link.href =
                  "data:text/plain;charset=utf-8," +
                  encodeURIComponent(exportText);
                link.download = `${currentPath.title
                  .replace(/[^a-z0-9]/gi, "_")
                  .toLowerCase()}.irealb.txt`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="flex items-center justify-center gap-2 bg-[color:var(--color-info)]/15 text-[color:var(--color-info)] hover:bg-[color:var(--color-info)]/25 border border-[color:var(--color-info)]/40 py-2.5 rounded-[var(--radius-md)] transition-colors font-medium text-sm"
            >
              <Download size={16} /> Export iReal URL
            </button>
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-1)]">
              Show raw iReal URL
            </summary>
            <textarea
              readOnly
              value={exportText}
              className="w-full surface-2 border border-[color:var(--color-border)] rounded-[var(--radius-sm)] py-2 px-3 t-mono text-[10px] text-[color:var(--color-text-2)] h-16 mt-2 focus:outline-none resize-none custom-scrollbar"
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            />
          </details>
        </div>
    </ModalShell>
  );
};

/**
 * Helper exported for the keyboard chord input — when the user types a
 * chord symbol into a single-line input, this parses it without
 * going through the full chart parser.
 */
export function quickParseChord(text: string): number[] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return parseChordToMidi(trimmed);
}