/**
 * src/components/UploadDropZone.tsx - PRD-001 Phase 4 Slice 2
 * (REQ-COMP-1, D63).
 *
 * The .mid drop target + keyboard-accessible browse fallback. Owns
 * ONLY the drag bookkeeping (enter/leave counter so crossing child
 * nodes never flickers the highlight) and the extension gate; parsing
 * + analysis live in the surface's async pipeline (the file bytes are
 * read ONCE there - this component never touches the content).
 *
 * The hidden input is the Playwright setInputFiles seam (D65).
 */

import React, { useRef, useState } from "react";

export interface UploadDropZoneProps {
  /** Called with a .mid/.midi File (extension-gated upstream here). */
  onFile: (file: File) => void;
  /** True while the surface's async pipeline runs: input + browse
   *  disabled, drop ignored. */
  busy: boolean;
}

function isMidiName(name: string): boolean {
  return /\.(mid|midi)$/i.test(name);
}

export function UploadDropZone({ onFile, busy }: UploadDropZoneProps): React.ReactElement {
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  // Drag-enter/leave fire for every descendant too - the counter
  // keeps the highlight stable (no flicker) without a document sniff.
  const dragDepth = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const take = (files: FileList | null): void => {
    if (busy) return;
    const file = files && files.length > 0 ? files[0] : null;
    if (file === null) return;
    if (!isMidiName(file.name)) {
      setRejected(`"${file.name}" is not a .mid or .midi file`);
      return;
    }
    setRejected(null);
    onFile(file);
  };

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        if (!busy) setOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = busy ? "none" : "copy";
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current = 0;
        setOver(false);
        take(e.dataTransfer.files);
      }}
      className={`flex flex-col items-center gap-3 rounded-[var(--radius-md)] border-2 border-dashed px-6 py-8 text-center transition-colors ${
        over
          ? "border-[color:var(--color-brand)] bg-[color:var(--color-brand)]/10"
          : "border-[color:var(--color-border)]"
      }`}
      data-testid="upload-drop-zone"
      data-over={over ? "true" : "false"}
    >
      <p className="text-sm text-[color:var(--color-text-2)]">
        Drag a .mid file here, or
        {" "}
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="font-semibold text-[color:var(--color-brand-strong)] underline disabled:opacity-50"
          data-testid="upload-browse"
        >
          browse for one
        </button>
        .
      </p>
      <p className="t-label text-[color:var(--color-text-3)]">
        Standard MIDI File (.mid / .midi), up to 30 MB.
      </p>
      {rejected !== null && (
        <p role="alert" className="text-xs text-red-400" data-testid="upload-rejected">
          {rejected}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".mid,.midi"
        disabled={busy}
        aria-label="MIDI file input"
        className="hidden"
        data-testid="midi-file-input"
        onChange={(e) => {
          take(e.target.files);
          // Reset so re-selecting the SAME file still fires change.
          e.target.value = "";
        }}
      />
    </div>
  );
}
