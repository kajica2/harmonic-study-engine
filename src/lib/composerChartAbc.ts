/**
 * src/lib/composerChartAbc.ts — turn a ComposerChart into a tiny ABC
 * source string. Used by the ComposerChartViewer's "Download ABC"
 * button (and the lazily-loaded ComposerChartNotation renderer).
 *
 * Per-kind body shape:
 *   - "bar": one ABC bar per ChartBar — `"^${bar.chord}"` plus a
 *     stacked whole-note chord parsed from `bar.chord` (falls back
 *     to `z1` rest when parseChordToMidi returns null). Four bars
 *     per source line.
 *   - "bitonal" / "axis": one stacked whole-note triad per pair /
 *     tonicAxis entry.
 *   - "row": P0 as 12 quarter notes (4 per bar), then R0 as 12
 *     quarter notes. I0 and RI0 are surfaced as `%%text` lines.
 *   - "duration" / "layer" / "section": a single rest bar plus
 *     `%%text` lines for the chart description and each raw line.
 *
 * Atonal charts use `K:C` plus explicit accidentals from midiToABC
 * (same approach as the etude staff view). Headers set the
 * composer name + kind label so the file is identifiable when
 * opened in any ABC renderer.
 *
 * Pure: no React, no DOM. Output is a string the caller either
 * passes to abcjs.renderAbc (ComposerChartNotation) or downloads.
 */

import type { ComposerChart } from "./composerCatalog";
import { parseChordToMidi } from "./ireal";
import { midiToABC } from "./leadSheet";

const NOTE_NAMES_SHARP = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

function pitchClassName(pc: number): string {
  return NOTE_NAMES_SHARP[((pc % 12) + 12) % 12];
}

function kindLabel(kind: ComposerChart["kind"]): string {
  switch (kind) {
    case "bar":
      return "Harmonic chart";
    case "bitonal":
      return "Bitonal block";
    case "row":
      return "Twelve-tone row";
    case "axis":
      return "Axis system";
    case "duration":
      return "Duration structure";
    case "layer":
      return "Layer stack";
    case "section":
      return "Section chart";
  }
}

function stackedWholeNotes(midis: number[]): string {
  const body = midis.map((m) => midiToABC(m)).join("");
  return `[${body}]1`;
}

/**
 * Build the ABC source for a ComposerChart. Always begins with `X:1`
 * (single-tune identifier) and the standard header block.
 */
export function buildComposerChartAbc(chart: ComposerChart): string {
  const lines: string[] = [];
  lines.push("X:1");
  lines.push(`T:${chart.composerName} — ${kindLabel(chart.kind)}`);
  lines.push("M:4/4");
  lines.push("L:1/4");
  lines.push(`K:C`);

  switch (chart.kind) {
    case "bar": {
      const buf: string[] = [];
      chart.bars.forEach((bar, i) => {
        const notes = parseChordToMidi(bar.chord);
        const chordToken = `^${bar.chord}`;
        const body = notes && notes.length > 0 ? stackedWholeNotes(notes) : "z1";
        buf.push(`| "${chordToken}" ${body} |`);
        if (buf.length === 4 || i === chart.bars.length - 1) {
          lines.push(buf.join(" "));
          buf.length = 0;
        }
      });
      break;
    }
    case "bitonal": {
      // chartChordSequence returns 4 chords per pair (t1,t2,t1,t2);
      // render each chord as its own bar of stacked whole notes.
      const buf: string[] = [];
      chart.pairs.forEach((pair) => {
        const t1 = [60 + pair.root1, 64 + pair.root1, 67 + pair.root1];
        const t2 = [60 + pair.root2, 64 + pair.root2, 67 + pair.root2];
        for (const triad of [t1, t2, t1, t2]) {
          buf.push(`| ${stackedWholeNotes(triad)} |`);
        }
      });
      // Lay out 4 bars per source line.
      for (let i = 0; i < buf.length; i += 4) {
        lines.push(buf.slice(i, i + 4).join(" "));
      }
      break;
    }
    case "axis": {
      const buf: string[] = [];
      chart.tonicAxis.forEach((pc, i) => {
        const triad = [60 + pc, 64 + pc, 67 + pc];
        buf.push(`| ${stackedWholeNotes(triad)} |`);
        if (buf.length === 4 || i === chart.tonicAxis.length - 1) {
          lines.push(buf.join(" "));
          buf.length = 0;
        }
      });
      break;
    }
    case "row": {
      const p0 = chart.forms.P0.map((pc) => `${midiToABC(60 + pc)}4`).join(" ");
      const r0 = chart.forms.R0.map((pc) => `${midiToABC(60 + pc)}4`).join(" ");
      lines.push(`| ${p0} |`);
      lines.push(`| ${r0} |`);
      lines.push(
        `%%text I0: ${chart.forms.I0.map(pitchClassName).join(" ")}`,
      );
      lines.push(
        `%%text RI0: ${chart.forms.RI0.map(pitchClassName).join(" ")}`,
      );
      break;
    }
    case "duration":
    case "layer":
    case "section": {
      lines.push("| z1 | z1 |");
      lines.push(`%%text ${chart.description}`);
      for (const rawLine of chart.raw) {
        lines.push(`%%text ${rawLine}`);
      }
      break;
    }
  }

  return lines.join("\n");
}