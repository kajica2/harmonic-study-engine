/**
 * src/components/AccompanimentPanel.tsx - PRD-001 Phase 4 Slice 3
 * (D71/D72/D74, REQ-COMP-30..36 UI).
 *
 * The accompaniment control panel, hosted by ComposeSurface's LOADED
 * state below AnalysisCard (the S2 seam). Reads NOTHING from the
 * store (AnalysisCard pattern): the surface wires request/result/
 * actions. Generate is a pure call in the SURFACE (< 50ms trivial);
 * busy reflects the preview RENDER (generation is sync).
 *
 * Honesty surfaces:
 *  - the preview button says "(accompaniment)" - the full mix lives
 *    in the S4 mixer below;
 *  - the tooltip states the EFFECTIVE tempo is used (D79 closed
 *    TD-043: overrides now bite at the effectiveProject choke point)
 *    + the 90s cap label on longer grids;
 *  - the staleness chip compares meta.gridFingerprint to the CURRENT
 *    merged grid - zero auto-regenerate (user presses Generate);
 *  - seed semantics tooltip: grid edits shift the stream by design.
 *
 * DEVIATION (documented): the D71 sketch prop `key` is renamed
 * `keyCandidate` - React reserves the `key` attribute.
 */

import React, { useState } from "react";
import { ConceptDrawer } from "./ConceptDrawer";
import { gridFingerprint } from "../../engine/compose/accompany";
import { shippedStyleIds, getStyleProfile } from "../../engine/styles";
import type { StyleId } from "../../engine/styles/types";
import type {
  AccompRole,
  AccompanimentRequest,
  AccompanimentResult,
  ChordGrid,
  KeyCandidate,
} from "../../engine/compose/types";
import type { PreviewState } from "../lib/composePreview";

const ALL_ROLES: readonly AccompRole[] = ["bass", "chords", "pad"];

export interface AccompanimentPanelProps {
  grid: ChordGrid;
  ppq: number;
  /** Sketch name was `key`; React reserves that prop name. */
  keyCandidate: KeyCandidate | null;
  request: AccompanimentRequest;
  result: AccompanimentResult | null;
  /** Generation is sync; busy = preview render in flight. */
  busy: boolean;
  previewState: PreviewState;
  /** True when the 90s render cap bites (surface computes it - the
   *  tempo map lives with the PROJECT, not the panel). */
  previewCapped: boolean;
  onPatchRequest: (req: AccompanimentRequest) => void;
  onGenerate: () => void;
  onPreview: () => void;
}

function densityLabel(d: number): string {
  return d <= 1 ? "sparse" : d <= 3 ? "medium" : "full";
}

export function AccompanimentPanel({
  grid,
  ppq,
  keyCandidate,
  request,
  result,
  busy,
  previewState,
  previewCapped,
  onPatchRequest,
  onGenerate,
  onPreview,
}: AccompanimentPanelProps): React.ReactElement {
  void ppq; // geometry rides through the surface's generate call;
  // the panel displays it nowhere (meta line carries the facts).
  const [drawerConceptId, setDrawerConceptId] = useState<string | null>(null);
  const stale =
    result !== null && result.meta.gridFingerprint !== gridFingerprint(grid);
  const capped = result !== null && previewCapped;

  const patch = (over: Partial<AccompanimentRequest>): void => {
    onPatchRequest({ ...request, ...over });
  };

  const toggleRole = (role: AccompRole): void => {
    const has = request.roles.includes(role);
    const roles = has ? request.roles.filter((r) => r !== role) : [...request.roles, role];
    patch({ roles });
  };

  const changeStyle = (styleId: StyleId): void => {
    // Density follows the new profile's center (REQ-COMP-35 P1).
    patch({ styleId, density: getStyleProfile(styleId).rhythm.densityDefault });
  };

  const setOffset = (role: AccompRole, semis: number): void => {
    const next = { ...request.registerOffsets };
    if (semis === 0) delete next[role];
    else next[role] = semis;
    patch({ registerOffsets: next });
  };

  const metaLine = result === null
    ? null
    : `${result.meta.styleId} - ${result.meta.voicingStyle} - ` +
      `${result.meta.patternIds.bass} + ${result.meta.patternIds.chords} - ` +
      `${result.meta.noteCounts.bass}+${result.meta.noteCounts.chords}` +
      `${result.meta.noteCounts.pad > 0 ? `+${result.meta.noteCounts.pad}` : ""} notes - ` +
      `seed ${result.meta.seed}`;

  return (
    <div
      className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-black/20 p-4 flex flex-col gap-3"
      data-testid="accompaniment-panel"
      data-key={keyCandidate === null ? "none" : "present"}
    >
      <p className="t-small text-[color:var(--color-text-3)]" data-testid="accomp-key-line">
        {keyCandidate === null
          ? "No clear key - approach notes stay chromatic (deterministic without a key)."
          : `Key context: ${keyCandidate.mode === "major" ? "major" : "minor"} (pc ${keyCandidate.tonicPc}) - diatonic approaches enabled.`}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="t-label" htmlFor="accomp-style">
          Style
        </label>
        <select
          id="accomp-style"
          data-testid="accomp-style"
          className="rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-sm text-[color:var(--color-text-1)]"
          value={request.styleId}
          onChange={(e) => changeStyle(e.target.value as StyleId)}
        >
          {shippedStyleIds().map((id) => (
            <option key={id} value={id}>
              {getStyleProfile(id).name}
            </option>
          ))}
        </select>

        <span className="t-label" aria-hidden="true">
          Roles
        </span>
        {ALL_ROLES.map((role) => (
          <label
            key={role}
            className="flex items-center gap-1 text-sm text-[color:var(--color-text-2)]"
            data-testid={`accomp-role-${role}`}
          >
            <input
              type="checkbox"
              checked={request.roles.includes(role)}
              onChange={() => toggleRole(role)}
              aria-label={`Role ${role}`}
            />
            {role}
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="t-label" htmlFor="accomp-density">
          Density
        </label>
        <input
          id="accomp-density"
          type="range"
          min={0}
          max={5}
          step={1}
          value={request.density}
          aria-valuetext={`density ${request.density} (${densityLabel(request.density)})`}
          data-testid="accomp-density"
          className="w-32"
          onChange={(e) => patch({ density: Number(e.target.value) })}
        />
        <span className="text-sm text-[color:var(--color-text-2)]" data-testid="accomp-density-value">
          {request.density}
        </span>

        {ALL_ROLES.map((role) => (
          <label key={role} className="flex items-center gap-1 text-sm text-[color:var(--color-text-2)]">
            <span className="t-label">{role} register</span>
            <select
              data-testid={`accomp-offset-${role}`}
              className="rounded border border-[color:var(--color-border)] bg-transparent px-1 py-0.5 text-sm text-[color:var(--color-text-1)]"
              value={String(request.registerOffsets?.[role] ?? 0)}
              onChange={(e) => setOffset(role, Number(e.target.value))}
            >
              <option value="-12">low</option>
              <option value="0">standard</option>
              <option value="12">high</option>
            </select>
          </label>
        ))}

        <label className="flex items-center gap-1 text-sm text-[color:var(--color-text-2)]">
          <span className="t-label">Transpose</span>
          <select
            data-testid="accomp-transpose"
            className="rounded border border-[color:var(--color-border)] bg-transparent px-1 py-0.5 text-sm text-[color:var(--color-text-1)]"
            value={String(request.transposeAccompaniment ?? 0)}
            onChange={(e) => patch({ transposeAccompaniment: Number(e.target.value) })}
          >
            {Array.from({ length: 25 }, (_, i) => i - 12).map((s) => (
              <option key={s} value={s}>
                {s > 0 ? `+${s}` : String(s)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="t-label" htmlFor="accomp-seed">
          Seed
        </label>
        <input
          id="accomp-seed"
          type="number"
          min={0}
          max={4294967295}
          step={1}
          value={request.seed}
          data-testid="accomp-seed"
          className="w-32 rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-sm text-[color:var(--color-text-1)]"
          onChange={(e) => {
            const n = Math.floor(Number(e.target.value));
            if (Number.isFinite(n) && n >= 0 && n <= 4294967295) patch({ seed: n });
          }}
          title="Same seed + same chart = the same notes. Grid edits shift the generated stream by design (seed semantics)."
        />
        <button
          type="button"
          data-testid="accomp-randomize"
          className="rounded border border-[color:var(--color-border)] px-2 py-1 text-sm text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)]"
          onClick={() => patch({ seed: Math.floor(Math.random() * 4294967296) })}
        >
          Randomize
        </button>
        <button
          type="button"
          data-testid="accomp-generate"
          disabled={request.roles.length === 0 || busy}
          className="rounded bg-[color:var(--color-brand)] px-3 py-1 text-sm font-semibold text-[color:var(--color-text-inverse)] disabled:opacity-40"
          onClick={onGenerate}
        >
          Generate
        </button>
        <button
          type="button"
          data-testid="accomp-preview"
          data-preview={previewState}
          disabled={result === null || previewState === "rendering"}
          className="rounded border border-[color:var(--color-border)] px-3 py-1 text-sm text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)] disabled:opacity-40"
          title={
            "Accompaniment only - use the mixer below to play the full mix. " +
            "Uses the effective tempo (overrides applied). " +
            (capped ? "Long chart: preview renders the first 1:30." : "")
          }
          onClick={onPreview}
        >
          {previewState === "playing" ? "Stop" : "Preview (accompaniment)"}
          {capped && previewState !== "playing" ? " - first 1:30" : ""}
        </button>
      </div>

      {stale && (
        <p
          className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-xs text-amber-300 self-start"
          data-testid="accomp-stale"
        >
          chart changed since generation - regenerate
        </p>
      )}

      {metaLine !== null && (
        <p className="text-xs t-mono text-[color:var(--color-text-3)]" data-testid="accomp-meta">
          {metaLine}
        </p>
      )}

      {result !== null && result.annotations.length > 0 && (
        <div
          className="flex flex-wrap gap-1.5"
          aria-label="Accompaniment annotations"
          data-testid="accomp-annotations"
        >
          {result.annotations.map((a) => {
            const cls =
              "rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[11px] t-mono text-[color:var(--color-text-2)]";
            if (a.conceptId === null) {
              return (
                <span key={a.id} className={cls} title={a.text} data-testid={`accomp-ann-static-${a.id}`}>
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
                onClick={() => setDrawerConceptId(a.conceptId)}
                data-testid={`accomp-ann-chip-${a.id}`}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      )}
      {drawerConceptId !== null && (
        <ConceptDrawer
          key={drawerConceptId}
          conceptId={drawerConceptId}
          onClose={() => setDrawerConceptId(null)}
        />
      )}
    </div>
  );
}
