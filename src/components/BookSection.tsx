/**
 * src/components/BookSection.tsx - print-ready book generator surface.
 *
 * Lets the user pick masterclass exercises (default: the 12 hand-curated
 * objectives), then compiles them into ONE print-ready PDF: cover, TOC,
 * per-exercise score + chord chart + practice notes, and a double-sided
 * memory-card section (front grid + back grid with cut lines).
 *
 * All content derivation is pure (src/lib/bookGenerator.ts, node-tested);
 * this component only wires selection -> export. The email button is a
 * best-effort POST to the SWR email endpoint; the core deliverable is the
 * PDF download.
 */

import React, { useMemo, useState } from "react";
import {
  deriveBookExercises,
  buildMemoryCards,
} from "../lib/bookGenerator";
import {
  MASTERCLASS_TUNES,
  availableTunes,
  type MasterclassEntry,
} from "../data/masterclass";
import { findPathById, type HarmonicPath } from "../lib/paths";
import { renderPathToWav } from "../lib/loopWav";
import { exportToMidiFile } from "../lib/midiExport";
import { deriveSlug, midiDataUriToBlob } from "../lib/marketplace";
import type { ArpStyle } from "../lib/arpNotation";
import { zipSync } from "fflate";

const EMAIL_BOOK_ENDPOINT =
  "https://sainted-word-records.vercel.app/api/email-book";

const checkboxClass =
  "flex items-start gap-2 rounded border border-[color:var(--color-border)] " +
  "px-3 py-2 text-left transition-colors " +
  "hover:border-[color:var(--color-brand-strong)] " +
  "focus-within:ring-1 focus-within:ring-[color:var(--color-brand)] " +
  "has-checked:border-[color:var(--color-brand-strong)] " +
  "has-checked:bg-[color:var(--color-brand-muted)]";

const buttonClass =
  "px-3 py-1.5 rounded border border-[color:var(--color-border)] " +
  "text-xs font-semibold text-neutral-300 hover:text-white " +
  "disabled:opacity-60 disabled:cursor-not-allowed " +
  "focus-visible:outline-none focus-visible:ring-1 " +
  "focus-visible:ring-[color:var(--color-brand)]";

export const BookSection: React.FC = () => {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => {
    // Default selection: the 12 hand-curated objectives.
    return new Set(
      MASTERCLASS_TUNES.filter((t) => t.objective).map((t) => t.id),
    );
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEmailing, setIsEmailing] = useState(false);
  const [isCollecting, setIsCollecting] = useState(false);
  const [engraver, setEngraver] = useState<"abcjs" | "verovio">("verovio");
  const [arpStyle, setArpStyle] = useState<ArpStyle>("triplets");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const catalog = useMemo(
    () =>
      availableTunes()
        .map((entry) => ({ entry, path: findPathById(entry.id) }))
        .filter(
          (x): x is { entry: MasterclassEntry; path: HarmonicPath } =>
            x.path !== undefined,
        ),
    [],
  );

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const buildBook = async (): Promise<{ blob: Blob }> => {
    const selected = catalog.filter((c) => selectedIds.has(c.entry.id));
    const paths = selected.map((c) => c.path);
    const masterclassMap = new Map(MASTERCLASS_TUNES.map((t) => [t.id, t]));
    const exercises = deriveBookExercises(paths, masterclassMap);
    const cards = buildMemoryCards(exercises);
    const { exportBookPdf } = await import("../lib/bookPdf");
    const blob = await exportBookPdf({
      exercises,
      paths,
      cards,
      title: "Harmonic Study Book",
      author: "Harmonic Study Engine",
      engraver,
      arpStyle,
    });
    return { blob };
  };

  const handleGenerate = async () => {
    if (selectedIds.size === 0 || isGenerating) return;
    setIsGenerating(true);
    setError("");
    setStatus("");
    try {
      const { blob } = await buildBook();
      const { downloadBookPDF } = await import("../lib/bookPdf");
      const filename = downloadBookPDF(blob, "harmonic-study-book");
      setStatus(`Downloaded ${filename}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEmail = async () => {
    if (selectedIds.size === 0 || isEmailing) return;
    const target = email.trim();
    if (!target) {
      setError("Enter an email address first.");
      return;
    }
    setIsEmailing(true);
    setError("");
    setStatus("");
    try {
      const { blob } = await buildBook();
      const formData = new FormData();
      formData.append("file", blob, "harmonic-study-book.pdf");
      const res = await fetch(
        `${EMAIL_BOOK_ENDPOINT}?to=${encodeURIComponent(target)}`,
        { method: "POST", body: formData },
      );
      if (!res.ok) {
        throw new Error(`Email service responded ${res.status}`);
      }
      setStatus(`Book emailed to ${target}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsEmailing(false);
    }
  };

  const handleGenerateCollection = async () => {
    if (selectedIds.size === 0 || isCollecting) return;
    const selected = catalog.filter((c) => selectedIds.has(c.entry.id));
    setIsCollecting(true);
    setError("");
    setStatus("");
    try {
      const members: Record<string, Uint8Array> = {};
      for (const { path } of selected) {
        const slug = deriveSlug(path.title ?? path.name ?? "untitled");
        const [wavBlob, midiBlob] = await Promise.all([
          renderPathToWav(path, { mode: "arp" }),
          Promise.resolve(midiDataUriToBlob(exportToMidiFile(path))),
        ]);
        members[`${slug}.wav`] = new Uint8Array(await wavBlob.arrayBuffer());
        members[`${slug}.mid`] = new Uint8Array(await midiBlob.arrayBuffer());
      }
      const zipBytes = zipSync(members);
      const { downloadBlob } = await import("../lib/composeExport");
      downloadBlob(
        new Blob([zipBytes as unknown as BlobPart], { type: "application/zip" }),
        "harmonic-study-collection.zip",
      );
      setStatus(`Downloaded collection (${selected.length} exercises)`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsCollecting(false);
    }
  };

  return (
    <section
      aria-label="Print-ready book"
      className="surface-1 border border-[color:var(--color-border)] rounded-[var(--radius-lg)] p-4 flex flex-col gap-3"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-[color:var(--color-text-1)]">
          Print-Ready Book
        </h3>
        <span className="t-label text-[color:var(--color-text-3)]">
          Level: Advanced
        </span>
      </div>
      <p className="t-small text-[color:var(--color-text-2)]">
        Compile selected exercises into one PDF: cover, table of contents,
        Real Book tune pages, Aebersold-style exercise pages, a Scale
        Syllabus appendix, and double-sided memory cards. Scores are
        engraved with Verovio by default (abcjs available as an option),
        or download a ZIP of per-exercise WAV + MIDI backing tracks.
      </p>
      <p className="t-small text-[color:var(--color-text-3)]">
        {selectedIds.size} selected
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {catalog.map(({ entry }) => (
          <label key={entry.id} className={checkboxClass}>
            <input
              type="checkbox"
              checked={selectedIds.has(entry.id)}
              onChange={() => toggle(entry.id)}
              className="mt-0.5 accent-[color:var(--color-brand)]"
            />
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-[color:var(--color-text-1)] truncate">
                {entry.title}
              </span>
              <span className="block t-small text-[color:var(--color-text-3)] truncate">
                {entry.classes.join(", ")}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="Generate book PDF"
          onClick={handleGenerate}
          disabled={isGenerating || selectedIds.size === 0}
          className={buttonClass}
        >
          {isGenerating ? "Generating..." : "Generate book PDF"}
        </button>
        <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-text-2)]">
          <input
            type="checkbox"
            checked={engraver === "verovio"}
            onChange={(e) => setEngraver(e.target.checked ? "verovio" : "abcjs")}
            className="accent-[color:var(--color-brand)]"
          />
          Verovio engraving
        </label>
        <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-text-2)]">
          Arpeggiation
          <select
            value={arpStyle}
            onChange={(e) => setArpStyle(e.target.value as ArpStyle)}
            aria-label="Arpeggiation style for the book score pages"
            className="px-2 py-1 rounded border border-[color:var(--color-border)] bg-transparent text-xs text-[color:var(--color-text-1)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-brand)]"
          >
            <option value="quarters">Quarters</option>
            <option value="eighths">Eighths</option>
            <option value="triplets">Triplets</option>
          </select>
        </label>
        <button
          type="button"
          aria-label="Generate audio collection ZIP"
          onClick={handleGenerateCollection}
          disabled={isCollecting || selectedIds.size === 0}
          className={buttonClass}
        >
          {isCollecting ? "Rendering..." : "Generate collection ZIP"}
        </button>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email address for the book"
          className="px-3 py-1.5 rounded border border-[color:var(--color-border)] bg-transparent text-xs text-[color:var(--color-text-1)] placeholder:text-[color:var(--color-text-3)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-brand)]"
        />
        <button
          type="button"
          aria-label="Email book"
          onClick={handleEmail}
          disabled={isEmailing || selectedIds.size === 0}
          className={buttonClass}
        >
          {isEmailing ? "Emailing..." : "Email book"}
        </button>
      </div>

      {status.length > 0 && (
        <p role="status" className="t-small text-[color:var(--color-text-2)]">
          {status}
        </p>
      )}
      {error.length > 0 && (
        <p role="alert" className="t-small text-[color:var(--color-warn)]">
          {error}
        </p>
      )}
    </section>
  );
};