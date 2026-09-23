/**
 * src/components/AnalysisCard.tsx - PRD-001 Phase 4 Slice 2 (D63,
 * REQ-COMP-20..22, REQ-PED-4/5 Compose portion).
 *
 * Renders ONLY derived truth handed down by the surface:
 * `merged` (mergeAnalysis over the meter-adjusted effective analysis)
 * + `blend` (blendKeyEvidence over the raw effective analysis). No
 * raw analysis field is ever displayed directly and the single write
 * path is `onPatch` (-> patchComposeOverrides, one undo entry per
 * commit - D59).
 *
 * Honesty rules rendered here (D58):
 *  - H1: the key field never shows the auto tier unless the blend
 *    agreement is agree or inferred-only (the engine constants already
 *    guarantee it; the clamp below is the belt-and-braces UI side).
 *  - H2: a declared-vs-inferred conflict ALWAYS shows the banner with
 *    the 2-way radio (default = declared) + "Other..." escape, at any
 *    tier.
 *
 * Field semantics (D63): tempo is RECORD-ONLY (S4 consumes; tooltip
 * says so); meter re-runs the analysis on a patched project copy in
 * the surface and CLEARS chord cells in the SAME patch (one undo
 * entry); melody-track override drives real re-extraction upstream -
 * the roll below shows genuine notes, not a label.
 */

import React, { useRef, useState } from "react";
import { ConceptDrawer } from "./ConceptDrawer";
import { ChordCellPopover } from "./ChordCellPopover";
import { ComposePianoRoll } from "./ComposePianoRoll";
import { parseKey, spellTonic } from "../../engine/core/spelling";
import { reinferBar } from "../../engine/compose/harmony";
import { ticksToSeconds } from "../../engine/compose/tempo";
import { confidenceTier } from "../../engine/compose/types";
import type { KeyBlend } from "../../engine/compose/key";
import type {
  AnalysisOverrides,
  ChordCell,
  ComposeAnalysis,
  ConfidenceTier,
  KeyCandidate,
  NormalizedProject,
} from "../../engine/compose/types";

export interface AnalysisCardProps {
  /** MED-001: the surface's EFFECTIVE project (meter-patched when a
   *  timeSignature override is active) - the roll's barlines and
   *  reinferBar below therefore agree with merged.grid by construction. */
  project: NormalizedProject;
  merged: ComposeAnalysis;
  blend: KeyBlend;
  /** Raw inferred top candidate (evidence for the H2 radio; null when
   *  the analysis produced no candidates). */
  inferredCandidate: KeyCandidate | null;
  overrides: AnalysisOverrides;
  onPatch: (next: AnalysisOverrides) => void;
  analyzeFull: boolean;
  onAnalyzeFull: (b: boolean) => void;
  onStartOver: () => void;
  recentSymbols: readonly string[];
  onSymbolApplied: (symbol: string) => void;
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function keyLabel(cand: KeyCandidate): string {
  return `${spellTonic(cand.tonicPc, cand.mode, "")} ${cand.mode}`;
}

function sameKey(a: KeyCandidate, b: KeyCandidate): boolean {
  return a.tonicPc === b.tonicPc && a.mode === b.mode;
}

function cellTier(cell: ChordCell): ConfidenceTier {
  return cell.isRest ? "manual" : confidenceTier(cell.confidence);
}

const TIER_CLASS: Record<ConfidenceTier, string> = {
  auto: "border-[color:var(--color-border)]",
  highlight: "border-amber-400 ring-1 ring-amber-400/60",
  radio: "border-[color:var(--color-border)]",
  manual: "border-dashed border-[color:var(--color-text-3)]",
};

const TIER_TOOLTIP: Record<ConfidenceTier, string> = {
  auto: "detected",
  highlight: "confirm",
  radio: "pick a candidate",
  manual: "enter manually",
};

/** Controlled-until-commit text field: commits on Enter/blur (never
 *  per keystroke - D59), reverts when the parent rejects the value. */
function CommitField(props: {
  initial: string;
  ariaLabel: string;
  title?: string;
  testId: string;
  widthClass?: string;
  onCommit: (raw: string) => boolean;
  /** Fired when a commit is a NO-OP (text === initial): nothing was
   *  patched, but a field that can close itself may (key editor). */
  onNoop?: () => void;
}): React.ReactElement {
  const { initial, ariaLabel, title, testId, widthClass = "w-20", onCommit, onNoop } = props;
  const [text, setText] = useState(initial);
  const [synced, setSynced] = useState(initial);
  if (initial !== synced) {
    // Render-time sync on external change (undo, re-analysis) - the
    // React-documented alternative to an effect round-trip.
    setSynced(initial);
    setText(initial);
  }
  const commit = (): boolean => {
    // MED-003 (reviewer): a no-op commit must NEVER reach onCommit.
    // Pre-fix, focus-then-blur (and the key field's "Change"-then-
    // blur-without-edit) minted a phantom undo entry AND flipped the
    // detected key into a manual override - a provenance lie. A
    // no-op is a SUCCESS that patches nothing.
    if (text === initial) {
      onNoop?.();
      return true;
    }
    const ok = onCommit(text);
    if (!ok) setText(initial);
    return ok;
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      title={title}
      aria-label={ariaLabel}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      className={`rounded border border-[color:var(--color-border)] bg-black/20 px-2 py-0.5 text-sm text-[color:var(--color-text-1)] ${widthClass}`}
      data-testid={testId}
    />
  );
}

export function AnalysisCard(props: AnalysisCardProps): React.ReactElement {
  const {
    project,
    merged,
    blend,
    inferredCandidate,
    overrides,
    onPatch,
    analyzeFull,
    onAnalyzeFull,
    onStartOver,
    recentSymbols,
    onSymbolApplied,
  } = props;

  const [openCell, setOpenCell] = useState<{ bar: number; slot: number } | null>(null);
  const [drawerConceptId, setDrawerConceptId] = useState<string | null>(null);
  const [highlightRange, setHighlightRange] = useState<{ fromBar: number; toBar: number } | null>(
    null,
  );
  const [keyEditing, setKeyEditing] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  const keyForSpelling: KeyCandidate = overrides.key ?? blend.selected;

  const closePopover = (): void => {
    setOpenCell(null);
    triggerRef.current?.focus(); // focus return (D61, RK-S2-4)
  };

  const applyCell = (bar: number, slot: number, cell: ChordCell): void => {
    onPatch({
      ...overrides,
      chordCells: { ...overrides.chordCells, [`${bar}:${slot}`]: cell },
    });
    if (!cell.isRest && cell.name !== "") onSymbolApplied(cell.name);
    closePopover();
  };

  const deleteCell = (bar: number, slot: number): void => {
    // null override -> restCell via the merge (REQ-COMP-23 delete).
    onPatch({
      ...overrides,
      chordCells: { ...overrides.chordCells, [`${bar}:${slot}`]: null },
    });
    closePopover();
  };

  const splitBar = (bar: number): void => {
    // reinferBar on the MERGED grid + MERGED key; BOTH cells written
    // in ONE patch = ONE undo entry (D59/D61; mergeGrid appends the
    // out-of-range slot - D60).
    const cells = reinferBar(project, merged.grid, bar, keyForSpelling, 2);
    if (cells.length < 2) {
      closePopover();
      return;
    }
    onPatch({
      ...overrides,
      chordCells: {
        ...overrides.chordCells,
        [`${bar}:0`]: cells[0],
        [`${bar}:1`]: cells[1],
      },
    });
    closePopover();
  };

  // --- key field (D58 UI) ------------------------------------------------
  const manualKey = overrides.key !== null;
  const shownKey = manualKey && overrides.key !== null ? overrides.key : blend.selected;
  const rawTier = confidenceTier(blend.blended);
  // H1 (UI side, belt-and-braces over the engine constants): the key
  // field NEVER renders the auto tier unless the agreement is agree
  // or inferred-only - a demoted auto shows as highlight (confirm).
  const h1Allowed = blend.agreement === "agree" || blend.agreement === "inferred-only";
  let keyTier: ConfidenceTier;
  if (manualKey) {
    keyTier = "manual";
  } else if (rawTier === "auto" && !h1Allowed) {
    keyTier = "highlight";
  } else {
    keyTier = rawTier;
  }
  const inferredChecked =
    overrides.key !== null &&
    inferredCandidate !== null &&
    sameKey(overrides.key, inferredCandidate);

  const commitKeyText = (raw: string): boolean => {
    const trimmed = raw.trim();
    if (trimmed === "") {
      onPatch({ ...overrides, key: null });
      setKeyEditing(false);
      return true;
    }
    const parsed = parseKeyToken(trimmed);
    if (parsed === null) return false;
    onPatch({ ...overrides, key: parsed });
    setKeyEditing(false);
    return true;
  };

  const commitTempo = (raw: string): boolean => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || n > 999) return false;
    onPatch({ ...overrides, tempoBpm: n });
    return true;
  };

  const commitMeter = (raw: string): boolean => {
    const parts = raw.split("/");
    if (parts.length !== 2) return false;
    const num = Number(parts[0].trim());
    const den = Number(parts[1].trim());
    if (!Number.isInteger(num) || num < 1 || num > 32) return false;
    if (![1, 2, 4, 8, 16, 32].includes(den)) return false;
    // D63: meter change CLEARS chord cells (bar alignment makes them
    // unsafe) in the SAME patch - one undo restores cells + meter.
    onPatch({ ...overrides, timeSignature: [num, den], chordCells: {} });
    return true;
  };

  const tempoValue = overrides.tempoBpm ?? project.tempos[0]?.bpm ?? 120;
  const meterValue =
    overrides.timeSignature !== null
      ? `${overrides.timeSignature[0]}/${overrides.timeSignature[1]}`
      : `${project.timeSignatures[0]?.numerator ?? 4}/${project.timeSignatures[0]?.denominator ?? 4}`;
  const bendTracks = project.tracks.filter((t) => t.usesPitchBend).length;
  const melodyValue =
    overrides.melodyTrackIndex !== null
      ? String(overrides.melodyTrackIndex)
      : merged.melody.sourceTrackIndex === null
        ? "auto"
        : String(merged.melody.sourceTrackIndex);

  return (
    <div className="flex flex-col gap-4 text-left" data-testid="analysis-card">
      {/* Banner stack (D62) - one surface per signal. */}
      {merged.percussionOnly && (
        <div role="alert" className="rounded border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-200" data-testid="banner-percussion">
          This file has only percussion - enter chords manually.
        </div>
      )}
      {merged.key.chromaticFallback && (
        <div role="alert" className="rounded border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-200" data-testid="banner-atonal">
          No clear key detected - enter the key and chords manually.
        </div>
      )}
      {merged.truncated && !analyzeFull && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded border border-sky-500/50 bg-sky-500/10 px-3 py-2 text-sm text-sky-200" data-testid="banner-truncated">
          <p>{`Showing the first ${formatDuration(
            ticksToSeconds(project, Math.min(merged.window.toTick, project.endTick)),
          )} of ${formatDuration(project.durationSec)}.`}</p>
          <button
            type="button"
            onClick={() => onAnalyzeFull(true)}
            className="rounded border border-sky-400/60 px-2 py-0.5 text-xs font-semibold"
            data-testid="analyze-full-button"
          >
            Analyze full file
          </button>
        </div>
      )}
      {bendTracks > 0 && (
        <div role="alert" className="rounded border border-violet-500/50 bg-violet-500/10 px-3 py-2 text-sm text-violet-200" data-testid="banner-pitchbend">
          {`${bendTracks} track(s) use pitch bends - analyzed at 12-TET (notated) pitches.`}
        </div>
      )}

      {/* Header: every detected value overridable (REQ-COMP-20/21). */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="analysis-header">
        <span className="t-h2 text-[color:var(--color-text-1)]" data-testid="analysis-file-name">
          {project.fileName}
        </span>
        <span className="t-mono text-[color:var(--color-text-3)]">
          {formatDuration(project.durationSec)}
        </span>
        <label className="flex items-center gap-1 text-sm text-[color:var(--color-text-2)]">
          Tempo
          <CommitField
            initial={String(tempoValue)}
            ariaLabel="Tempo override"
            title="affects playback and export"
            testId="tempo-input"
            onCommit={commitTempo}
          />
        </label>
        <label className="flex items-center gap-1 text-sm text-[color:var(--color-text-2)]">
          Meter
          <CommitField
            initial={meterValue}
            ariaLabel="Meter override"
            title="re-runs the analysis; clears chord edits (bar alignment changes)"
            testId="meter-input"
            onCommit={commitMeter}
          />
        </label>
        <label className="flex items-center gap-1 text-sm text-[color:var(--color-text-2)]">
          Melody track
          <select
            aria-label="Melody track"
            value={melodyValue}
            onChange={(e) => {
              const v = e.target.value;
              onPatch({
                ...overrides,
                melodyTrackIndex: v === "auto" ? null : Number(v),
              });
            }}
            className="rounded border border-[color:var(--color-border)] bg-black/20 px-1 py-0.5 text-sm text-[color:var(--color-text-1)]"
            data-testid="melody-select"
          >
            <option value="auto">Auto (top line)</option>
            {project.tracks
              .filter((t) => !t.isPercussion)
              .map((t) => (
                <option key={t.index} value={t.index}>
                  {t.name === "" ? `Track ${t.index + 1}` : t.name}
                </option>
              ))}
          </select>
        </label>
      </div>

      {/* Key field + H2 conflict banner (D58). */}
      <div className="flex flex-col gap-2">
        {blend.agreement === "conflict" && (
          <div
            role="alert"
            className="rounded border border-amber-500/60 bg-amber-500/10 px-3 py-2"
            data-testid="key-conflict-banner"
          >
            <p className="text-sm text-amber-200">{blend.reason}</p>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-[color:var(--color-text-2)]">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="key-conflict-choice"
                  checked={!inferredChecked}
                  onChange={() => onPatch({ ...overrides, key: null })}
                  data-testid="conflict-radio-declared"
                />
                {`Declared: ${keyLabel(blend.selected)}`}
              </label>
              {inferredCandidate !== null && (
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="key-conflict-choice"
                    checked={inferredChecked}
                    onChange={() => onPatch({ ...overrides, key: inferredCandidate })}
                    data-testid="conflict-radio-inferred"
                  />
                  {`Inferred: ${keyLabel(inferredCandidate)}`}
                </label>
              )}
              <button
                type="button"
                onClick={() => setKeyEditing(true)}
                className="underline"
                data-testid="conflict-other"
              >
                Other...
              </button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-label text-[color:var(--color-text-3)]">Key</span>
          {!keyEditing && (
            <span
              className={`rounded border px-2 py-0.5 text-sm ${TIER_CLASS[keyTier]}`}
              title={`${TIER_TOOLTIP[keyTier]}: ${blend.reason}`}
              data-testid="key-value"
              data-tier={keyTier}
            >
              {keyLabel(shownKey)}
              {manualKey && <span className="ml-1 text-xs text-[color:var(--color-text-3)]">(your choice)</span>}
              {blend.agreement === "declared-only" && (
                <span className="ml-1 text-xs text-[color:var(--color-text-3)]" data-testid="key-declared-badge">
                  (from the file's key signature)
                </span>
              )}
            </span>
          )}
          {keyEditing && (
            <CommitField
              initial={keyLabel(shownKey)}
              ariaLabel="Key override"
              title="e.g. F minor; empty resets to the detected key"
              testId="key-input"
              widthClass="w-32"
              onCommit={commitKeyText}
              // MED-003: close the editor on a no-op commit - without
              // this the blur that used to (lie and) close would now
              // leave the field stuck open.
              onNoop={() => setKeyEditing(false)}
            />
          )}
          {keyTier === "radio" && !manualKey && !keyEditing && (
            <span className="flex items-center gap-1" data-testid="key-radio">
              {merged.key.candidates.slice(0, 3).map((c) => (
                <button
                  key={`${c.tonicPc}-${c.mode}`}
                  type="button"
                  onClick={() => onPatch({ ...overrides, key: c })}
                  className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-xs text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)]"
                >
                  {keyLabel(c)}
                </button>
              ))}
            </span>
          )}
          {!keyEditing && (
            <button
              type="button"
              onClick={() => setKeyEditing(true)}
              className="text-xs underline text-[color:var(--color-text-3)]"
              data-testid="key-change"
            >
              Change
            </button>
          )}
          {manualKey && !keyEditing && (
            <button
              type="button"
              onClick={() => onPatch({ ...overrides, key: null })}
              className="text-xs underline text-[color:var(--color-text-3)]"
              data-testid="key-reset"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {project.warnings.length > 0 && (
        <details className="text-sm text-[color:var(--color-text-2)]" data-testid="parse-notes">
          <summary className="cursor-pointer select-none">{`Parse notes (${project.warnings.length})`}</summary>
          <ul className="mt-1 list-disc pl-5">
            {project.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      {/* Chord chart (REQ-COMP-12/22/23). */}
      <div className="flex flex-col gap-1" data-testid="chord-chart">
        {merged.grid.bars.map((region) => {
          const inRange =
            highlightRange !== null &&
            region.bar >= highlightRange.fromBar &&
            region.bar <= highlightRange.toBar;
          return (
            <div
              key={region.bar}
              className={`flex items-start gap-1 rounded p-0.5 ${
                inRange ? "bg-[color:var(--color-brand)]/15 ring-1 ring-[color:var(--color-brand)]" : ""
              }`}
              data-testid={`chord-row-${region.bar}`}
            >
              <span className="w-8 shrink-0 pt-1.5 text-right text-xs text-[color:var(--color-text-3)]">
                {region.bar + 1}
              </span>
              {region.slots.map((cell, slot) => {
                const tier = cellTier(cell);
                const open = openCell !== null && openCell.bar === region.bar && openCell.slot === slot;
                return (
                  <span key={slot} className="relative inline-flex flex-col items-start gap-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        triggerRef.current = e.currentTarget;
                        setOpenCell({ bar: region.bar, slot });
                      }}
                      aria-label={`Chord bar ${region.bar + 1}${
                        region.slots.length > 1 ? ` slot ${slot + 1}` : ""
                      }: ${cell.isRest || cell.name === "" ? "rest" : cell.name}`}
                      title={`${TIER_TOOLTIP[tier]}${cell.isRest ? "" : `: ${cell.name} (r=${cell.confidence.toFixed(2)})`}`}
                      className={`min-w-16 rounded border px-2 py-1 text-sm text-[color:var(--color-text-1)] ${TIER_CLASS[tier]}`}
                      data-testid={`chord-cell-${region.bar}-${slot}`}
                      data-tier={tier}
                    >
                      {cell.isRest || cell.name === "" ? "\u00b7" : cell.name}
                    </button>
                    {tier === "radio" && !cell.isRest && cell.alternatives.length > 0 && (
                      <button
                        type="button"
                        onClick={() => applyCell(region.bar, slot, cell.alternatives[0])}
                        className="rounded-full border border-[color:var(--color-border)] px-1.5 text-[10px] text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-1)]"
                        data-testid={`chord-alt-${region.bar}-${slot}`}
                      >
                        {cell.alternatives[0].name}
                      </button>
                    )}
                    {open && (
                      <ChordCellPopover
                        cell={cell}
                        keyCandidate={keyForSpelling}
                        recentSymbols={recentSymbols}
                        onApply={(c) => applyCell(region.bar, slot, c)}
                        onDelete={() => deleteCell(region.bar, slot)}
                        onSplit={() => splitBar(region.bar)}
                        onClose={closePopover}
                      />
                    )}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Annotations (REQ-PED-4 Compose + PED-5, EtudeViews host
         pattern: chips -> local drawerConceptId -> key-prop drawer). */}
      <div className="flex flex-wrap gap-1.5" aria-label="Analysis annotations" data-testid="annotation-chips">
        {merged.annotations.map((a) => {
          const cls =
            "rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[11px] t-mono text-[color:var(--color-text-2)]";
          if (a.conceptId === null) {
            return (
              <span key={a.id} className={cls} title={a.text} data-testid={`annotation-static-${a.id}`}>
                {a.label}
              </span>
            );
          }
          return (
            <button
              key={a.id}
              type="button"
              className={`${cls} hover:text-[color:var(--color-text-1)]`}
              title={a.text}
              onClick={() => {
                if (a.target.kind === "progression") {
                  setHighlightRange({ fromBar: a.target.fromBar, toBar: a.target.toBar });
                }
                setDrawerConceptId(a.conceptId);
              }}
              data-testid={`annotation-chip-${a.id}`}
            >
              {a.label}
            </button>
          );
        })}
      </div>
      {drawerConceptId !== null && (
        <ConceptDrawer key={drawerConceptId} conceptId={drawerConceptId} onClose={() => setDrawerConceptId(null)} />
      )}

      {/* MED-001: `project` is the meter-patched effective project,
         so barBoundaries inside the roll draws the SAME meter the
         chart rows above were re-analyzed with. */}
      <ComposePianoRoll
        project={project}
        melody={merged.melody}
        window={merged.window}
        truncated={merged.truncated}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs italic text-[color:var(--color-text-3)]" data-testid="privacy-line">
          Analyzed locally in your browser - this file never leaves this tab.
        </p>
        <button
          type="button"
          onClick={onStartOver}
          className="rounded border border-[color:var(--color-border)] px-3 py-1 text-sm text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)]"
          data-testid="start-over"
        >
          Start over
        </button>
      </div>
    </div>
  );
}

/** Key token parser: tonic + major/minor only (a KeyCandidate cannot
 *  carry modes; modal tails from the engine parseKey are rejected so
 *  the field never silently mislabels a mode). */
function parseKeyToken(raw: string): KeyCandidate | null {
  const parsed = parseKey(raw);
  if (parsed === null) return null;
  if (parsed.mode !== "major" && parsed.mode !== "minor") return null;
  return { tonicPc: parsed.tonicPc, mode: parsed.mode, correlation: 1 };
}
