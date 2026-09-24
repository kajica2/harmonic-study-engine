/**
 * src/components/ChartPastePanel.tsx - PRD-001 Phase 4 Slice 4
 * (REQ-IO-14, D84).
 *
 * The chord-chart PASTE surface: a textarea, a live-parse footer
 * ("N bars, key Bb, warnings: 2"), the warnings list, and the
 * EDITABLE preview grid - bar chips whose cells are inline text
 * inputs, re-parsed through THE SAME grammar as the popover (D61
 * reject ring: red on anything the grid cannot hold). Edits mutate
 * the PARSED CHART LOCALLY (component state) BEFORE commit -
 * "editable before generating" is literal (REQ-IO-14).
 *
 * [Use chart] commits the FINAL ChordChart (parsed + edited) - the
 * slash interpretation (RK-S4-4) is visible here BEFORE anything
 * ships, which is the user-facing safety valve for the whole-token-
 * first rule.
 *
 * Fully controlled (store-free): the surface owns buildChartSession +
 * the store write. Zero network (REQ-IO-71), zero audio.
 */

import React, { useMemo, useState } from "react";
import { parseChordChart, type ChordChart } from "../../engine/compose/chordchart";
import { buildCellFromSymbol, parseChordSymbol } from "../../engine/compose/chordsym";
import { restCell, type ChordCell, type ChordGrid, type KeyCandidate } from "../../engine/compose/types";

export interface ChartPastePanelProps {
  /** Pre-existing chart text when RE-editing a loaded chart (D84
  *  [Edit chart] round trip). */
  initialText?: string;
  onCommit: (chartText: string, chart: ChordChart) => void;
  onCancel: () => void;
}

function cellText(cell: ChordCell): string {
  return cell.isRest ? "" : cell.name;
}

/** One cell's round-trip identity: rest-ness + the sounding tuple
 *  (the gridFingerprint discipline - what the generator hears). */
function commitCellSig(cell: ChordCell): string {
  return cell.isRest
    ? "rest"
    : `${cell.rootPc}.${cell.qualitySymbol}.${cell.bassPc ?? "x"}`;
}

/**
 * MED-002 (S4 fix round): the commit-regeneration drift detector
 * (PURE, node-pinned through the panel tests below via the UI).
 *
 * handleCommit REGENERATES text from the final grid ("/"-joined
 * 2-cell bars), but the "/" grammar is ambiguous on re-parse: a 2-cell
 * [C, G] regenerates "C/G" which whole-parses to ONE cell (G is C's
 * 5th); [C, Em7/G] regenerates "C/Em7/G" (3 sides -> rest + warning);
 * [C, rest] regenerates "C/-" (split: C lands + warning, 1 cell).
 * Returns the 0-based indices of bars whose re-parsed sounding cells
 * differ from the approved grid - those bars WILL merge on reload
 * (the D84 auto-heal re-parses the text). A re-parse FAILURE drifts
 * every bar (the text cannot round-trip at all).
 */
export function detectCommitDrift(finalGrid: ChordGrid, regeneratedText: string): number[] {
  const reparsed = parseChordChart(regeneratedText);
  if (!reparsed.ok) return finalGrid.bars.map((region) => region.bar);
  const reBars = reparsed.value.grid.bars;
  const drifted: number[] = [];
  for (const region of finalGrid.bars) {
    const approved = region.slots.map(commitCellSig);
    const back = region.bar < reBars.length ? reBars[region.bar].slots.map(commitCellSig) : [];
    if (approved.length !== back.length || approved.some((s, i) => s !== back[i])) {
      drifted.push(region.bar);
    }
  }
  return drifted;
}

/** The final chart + regenerated text for the current edits
 *  (MED-002: shared by the drift check and the commit so the warning
 *  and the payload can never disagree). */
export function buildCommitPayload(
  chart: ChordChart,
  edits: Readonly<Record<string, string>>,
  spellingKey: KeyCandidate,
): { finalChart: ChordChart; text: string } {
  // Rebuild the grid from the EDITED cells (local state wins),
  // keeping the parse's timing + directives (D84).
  const bars = chart.grid.bars.map((region) => {
    const slots = region.slots.map((cell, slot) => {
      const raw = edits[`${region.bar}:${slot}`];
      if (raw === undefined) return cell;
      const trimmed = raw.trim();
      if (trimmed === "") return restCell();
      const sym = parseChordSymbol(trimmed);
      return sym === null ? cell : buildCellFromSymbol(sym, spellingKey);
    });
    return { ...region, slots };
  });
  const anySplit = bars.some((b) => b.slots.length === 2);
  const finalChart: ChordChart = {
    ...chart,
    grid: { slotsPerBar: anySplit ? 2 : 1, bars },
  };
  // The committed TEXT is REGENERATED from the final grid so the
  // persisted/URL chartText ALWAYS re-parses to what the user
  // approved in the preview (an edit that only lived in the grid
  // would silently vanish on reload - honesty + D84 auto-heal).
  // Documented edge: a slash-bass cell INSIDE a 2-cell bar joins to
  // "C/E/Am" which re-parses best-effort (the "/"-split grammar is
  // inherently ambiguous there - RK-S4-4's one-function retune).
  const d = chart.directives;
  const head: string[] = [];
  if (d.key !== null) head.push(`{key: ${keyName(d.key.tonicPc)} ${d.key.mode}}`);
  if (d.tempoBpm !== null) head.push(`{tempo: ${d.tempoBpm}}`);
  if (d.timeSignature !== null) head.push(`{time: ${d.timeSignature[0]}/${d.timeSignature[1]}}`);
  if (d.styleId !== null) head.push(`{style: ${d.styleId}}`);
  const body = bars
    .map((region) => region.slots.map((c) => (c.isRest ? "-" : c.name)).join("/"))
    .join(" ");
  return { finalChart, text: [...head, body].join("\n") };
}

export function ChartPastePanel({
  initialText = "",
  onCommit,
  onCancel,
}: ChartPastePanelProps): React.ReactElement {
  const [text, setText] = useState(initialText);
  // "bar:slot" -> edited raw symbol (component-local until commit).
  const [edits, setEdits] = useState<Record<string, string>>({});

  const parsed = useMemo(() => parseChordChart(text), [text]);

  const spellingKey: KeyCandidate =
    parsed.ok && parsed.value.directives.key !== null
      ? parsed.value.directives.key
      : { tonicPc: 0, mode: "major", correlation: 1 };

  /** The cell as currently DISPLAYED (edit wins over parse). */
  const displayed = (bar: number, slot: number, cell: ChordCell): string =>
    edits[`${bar}:${slot}`] ?? cellText(cell);

  const rejectState = (raw: string): boolean => {
    if (raw.trim() === "") return false; // blank = rest, legal
    return parseChordSymbol(raw) === null;
  };

  // MED-002 (S4 fix round): the commit payload + its drift check share
  // ONE builder (they can never disagree). driftBars is live - the
  // warning shows BEFORE commit; the ack is keyed by the payload text
  // so any edit un-acks. The preview grid remains the truth-teller:
  // drift only warns, never rewrites. (Above the !ok early return -
  // hooks are unconditional.)
  const commitPayload = useMemo(
    () => (parsed.ok ? buildCommitPayload(parsed.value, edits, spellingKey) : null),
    [parsed, edits, spellingKey],
  );
  const driftBars = useMemo(
    () =>
      commitPayload === null
        ? []
        : detectCommitDrift(commitPayload.finalChart.grid, commitPayload.text),
    [commitPayload],
  );
  const [ackText, setAckText] = useState<string | null>(null);
  const driftAcked = commitPayload !== null && ackText === commitPayload.text;
  const needsAck = driftBars.length > 0 && !driftAcked;

  const handleCommit = (): void => {
    if (commitPayload === null) return; // unreachable: commit is disabled off-parse
    if (needsAck) {
      // First click CONFIRMS ("approve anyway?") - the commit is HELD
      // until the second click.
      setAckText(commitPayload.text);
      return;
    }
    onCommit(commitPayload.text, commitPayload.finalChart);
  };

  if (!parsed.ok) {
    const empty = text.trim() === "";
    return (
      <div className="w-full max-w-md flex flex-col gap-3" data-testid="chart-paste-panel">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-testid="chart-textarea"
          rows={8}
          aria-label="Chord chart text"
          placeholder={"Paste a chord chart, e.g.\n{key: Bb}\n{tempo: 132}\nBbmaj7 Gm7 Ebmaj7 Ab7"}
          className="w-full rounded border border-[color:var(--color-border)] bg-black/30 p-3 t-mono text-sm text-[color:var(--color-text-1)]"
        />
        <p className="text-sm text-[color:var(--color-text-3)]" data-testid="chart-parse-summary">
          {empty ? "Paste a chart to preview it." : parsed.error.message}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-[color:var(--color-border)] px-3 py-1 text-sm text-[color:var(--color-text-2)]"
            data-testid="chart-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled
            className="rounded bg-[color:var(--color-brand)] px-3 py-1 text-sm font-semibold text-[color:var(--color-text-inverse)] opacity-40"
            data-testid="chart-use"
          >
            Use chart
          </button>
        </div>
      </div>
    );
  }

  const chart = parsed.value;
  const anyRejected = Object.entries(edits).some(([, raw]) => rejectState(raw));
  const commitDisabled = anyRejected;

  const keySeg = chart.directives.key === null ? "" : `, key ${keyLabel(chart)}`;

  return (
    <div className="w-full max-w-2xl flex flex-col gap-3" data-testid="chart-paste-panel">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setEdits({}); // edits belong to THIS parse (honest reset)
        }}
        data-testid="chart-textarea"
        rows={8}
        aria-label="Chord chart text"
        placeholder={"Paste a chord chart, e.g.\n{key: Bb}\n{tempo: 132}\nBbmaj7 Gm7 Ebmaj7 Ab7"}
        className="w-full rounded border border-[color:var(--color-border)] bg-black/30 p-3 t-mono text-sm text-[color:var(--color-text-1)]"
      />
      <p className="t-small text-[color:var(--color-text-2)]" data-testid="chart-parse-summary">
        {`${chart.bars} bars${keySeg}, warnings: ${chart.warnings.length}`}
        {chart.directives.tempoBpm !== null ? `, tempo ${chart.directives.tempoBpm}` : ""}
        {chart.directives.timeSignature !== null
          ? `, time ${chart.directives.timeSignature[0]}/${chart.directives.timeSignature[1]}`
          : ""}
      </p>
      {chart.warnings.length > 0 && (
        <ul className="text-xs text-amber-300 flex flex-col gap-0.5" data-testid="chart-warnings">
          {chart.warnings.map((w, i) => (
            <li key={`${w}-${i}`}>{w}</li>
          ))}
        </ul>
      )}
      <div
        className="flex flex-wrap gap-2"
        aria-label="Editable chart preview"
        data-testid="chart-preview-grid"
      >
        {chart.grid.bars.map((region) => (
          <div
            key={region.bar}
            className="rounded border border-[color:var(--color-border)] bg-black/20 p-1.5 flex items-center gap-1"
            data-testid={`chart-bar-${region.bar}`}
          >
            <span className="t-label text-[color:var(--color-text-3)]">{region.bar + 1}</span>
            {region.slots.map((cell, slot) => {
              const raw = displayed(region.bar, slot, cell);
              const reject = rejectState(raw);
              return (
                <input
                  key={slot}
                  type="text"
                  value={raw}
                  aria-label={`Bar ${region.bar + 1} chord ${slot + 1}`}
                  data-reject={reject ? "true" : "false"}
                  data-testid={`chart-cell-${region.bar}-${slot}`}
                  className={`w-20 rounded border px-1 py-0.5 t-mono text-xs bg-transparent ${
                    reject
                      ? "border-red-500/70 text-red-300"
                      : "border-[color:var(--color-border)] text-[color:var(--color-text-1)]"
                  }`}
                  onChange={(e) =>
                    setEdits((prev) => ({ ...prev, [`${region.bar}:${slot}`]: e.target.value }))
                  }
                />
              );
            })}
          </div>
        ))}
      </div>
      {driftBars.length > 0 && (
        <p
          className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-xs text-amber-300"
          data-testid="chart-drift-warning"
        >
          {`Some bars cannot be saved unambiguously and will merge on reload - approve anyway? (bar${driftBars.length === 1 ? "" : "s"} ${driftBars.map((b) => b + 1).join(", ")})`}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-[color:var(--color-border)] px-3 py-1 text-sm text-[color:var(--color-text-2)]"
          data-testid="chart-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={commitDisabled}
          onClick={handleCommit}
          className="rounded bg-[color:var(--color-brand)] px-3 py-1 text-sm font-semibold text-[color:var(--color-text-inverse)] disabled:opacity-40"
          data-testid="chart-use"
          data-drift-ack={needsAck ? "pending" : driftBars.length > 0 ? "approved" : "none"}
          title={anyRejected ? "Fix the rejected cells first" : needsAck ? "Approve the drift warning first" : "Use this chart"}
        >
          {needsAck ? "Review warning" : driftBars.length > 0 ? "Use chart anyway" : "Use chart"}
        </button>
      </div>
    </div>
  );
}

/** Flat-spelling tonic for the footer (display only - the engine
 *  spellTonic drives the EXPORT filename). */
function keyLabel(chart: ChordChart): string {
  const k = chart.directives.key;
  if (k === null) return "";
  return keyName(k.tonicPc);
}

const NAMES: readonly string[] = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function keyName(pc: number): string {
  return NAMES[((pc % 12) + 12) % 12];
}
