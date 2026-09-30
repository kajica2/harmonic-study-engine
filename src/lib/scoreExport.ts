/**
 * Score exporters — MusicXML (4.0-compatible) and Score21 (markdown
 * friendly ASCII staff).
 *
 * Both take a HarmonicPath and an optional chord decomposition done by
 * `analyzeChord`. MusicXML needs durations; we render each step as a
 * 4-beat chord (whole note) inside a 4/4 measure, one bar per step.
 * Score21 formats the same content as monospaced stem/capo notation
 * plus a chord-symbol line — readable in any text editor / chat.
 *
 * No external deps; pure TypeScript.
 */

import { HarmonicPath } from "./paths";
import type { EtudeNote } from "../../engine/etude/types";
import { transposeMidiList } from "./scoreGenerator";
import { clampToPlayableRange } from "./leadSheet";
import { detectFormPeriod } from "./formPeriod";
import { totalFormBars } from "../../engine/practice/windows";

// ---------------------------------------------------------------------------
// MusicXML 4.0 export
// ---------------------------------------------------------------------------

export type VoiceStyle = "block" | "arp";

export interface MusicXmlOptions {
  /** Title for the <work> element */
  title?: string;
  /** Composer (artist) */
  composer?: string;
  /** Beats per minute (default 80) */
  tempo?: number;
  /** Transpose everything by N semitones (e.g. +2 for Bb trumpet) */
  transpose?: number;
  /** Beats per measure (default 4) */
  beatsPerMeasure?: number;
  /** Steps per measure (default 1 — one chord per bar) */
  stepsPerMeasure?: number;
  /** PRD-001 Phase 3 Slice 2 (D27): optional etude melody grid
   *  (absolute eighth-note slots, 8 per 4/4 bar). When absent the
   *  output is BYTE-IDENTICAL to the chord-only export (frozen
   *  tests/scoreExport.test.ts pins). When present, an additive
   *  second part <part id="P2"> carries the melody; P1 is untouched.
   *  Notes crossing a barline split into tied segments. */
  melody?: readonly EtudeNote[];
  /** Voice style for P1: block chord (default) or arpeggiated line.
   *  Block output stays byte-identical to the historical export.
   *  Arp uses divisions=2 with sequential quarters, eighths, rest. */
  voiceStyle?: VoiceStyle;
  /** When true, render the form once (slice steps to the detected
   *  form period) instead of the full padded step list. Default false. */
  trimToForm?: boolean;
}

/**
 * Prepare arp notes for one step with a single shift rule.
 * Steps: dedup and sort raw notes, apply transposeMidiList
 * (which sorts ascending when shift is nonzero), map clamp to
 * playable range, then re-sort ascending (clamp can reorder).
 */
export function prepareArpNotes(
  notes: readonly number[],
  transpose: number,
): number[] {
  const uniq = Array.from(new Set(notes)).sort((a, b) => a - b);
  const shifted = transposeMidiList(uniq, transpose);
  const clamped = shifted.map(clampToPlayableRange);
  clamped.sort((a, b) => a - b);
  return clamped;
}

export interface ArpAllocation {
  readonly quarters: number;
  readonly eighths: number;
  readonly restDiv: number;
  readonly totalDiv: number;
  readonly usedNotes: number;
  readonly truncated: boolean;
}

/**
 * Allocate arp durations for N notes against a quarters budget Bq.
 * Divisions are quarters*2 (divisions=2: quarter=2, eighth=1).
 * Rules for integer budgets:
 * - N <= Bq: N quarters plus rest fill.
 * - Bq < N <= 2*Bq: Q=2*Bq-N quarters plus E=2*N-2*Bq eighths.
 * - N > 2*Bq: truncate to 2*Bq notes plus console.warn.
 * Fractional Bq (from B/S splits) is floored to integer divisions;
 * the caller distributes totalDiv=B*2 across steps with floor plus
 * last-step remainder so every budget here stays integral.
 */
export function allocateArpDurations(
  N: number,
  budgetQuarters: number,
): ArpAllocation {
  const safeN = Number.isFinite(N) ? Math.max(0, Math.floor(N)) : 0;
  const safeBudget = Number.isFinite(budgetQuarters)
    ? Math.max(0, budgetQuarters)
    : 0;
  const totalDiv = Math.floor(safeBudget * 2 + 1e-9);
  if (safeN === 0) {
    return {
      quarters: 0,
      eighths: 0,
      restDiv: totalDiv,
      totalDiv,
      usedNotes: 0,
      truncated: false,
    };
  }
  const maxNotes = totalDiv;
  if (safeN > maxNotes) {
    console.warn(
      `scoreExport arp overflow: N=${safeN} exceeds budget ${maxNotes}, truncating`,
    );
    return {
      quarters: 0,
      eighths: maxNotes,
      restDiv: 0,
      totalDiv,
      usedNotes: maxNotes,
      truncated: true,
    };
  }
  if (safeN * 2 <= totalDiv) {
    return {
      quarters: safeN,
      eighths: 0,
      restDiv: totalDiv - safeN * 2,
      totalDiv,
      usedNotes: safeN,
      truncated: false,
    };
  }
  const quarters = totalDiv - safeN;
  const eighths = 2 * safeN - totalDiv;
  return {
    quarters,
    eighths,
    restDiv: 0,
    totalDiv,
    usedNotes: safeN,
    truncated: false,
  };
}

/** Encode a numeric MIDI to a musicXML pitch string e.g. 60 → C4, 61 → D♭4 */
function midiToXmlPitch(midi: number, transpose: number = 0): string {
  const m = midi + transpose;
  const pc = ((m % 12) + 12) % 12;
  const octave = Math.floor(m / 12) - 1;
  const STEPS = [
    { letter: "C", alter: 0 },
    { letter: "D", alter: -1 },
    { letter: "D", alter: 0 },
    { letter: "E", alter: -1 },
    { letter: "E", alter: 0 },
    { letter: "F", alter: 0 },
    { letter: "G", alter: -1 },
    { letter: "G", alter: 0 },
    { letter: "A", alter: -1 },
    { letter: "A", alter: 0 },
    { letter: "B", alter: -1 },
    { letter: "B", alter: 0 },
  ];
  const s = STEPS[pc];
  return `${s.letter}${s.alter !== 0 ? (s.alter < 0 ? "f" : "s") : ""}${octave}`;
}

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Split a melody grid into per-bar note segments (D27). A note whose
 * durationSlots crosses the barline yields consecutive segments: the
 * first carries tie "start", middle segments carry stop+start, the
 * last carries stop. Rests are NOT generated here - the measure
 * builder fills gaps.
 */
interface MelodySegment {
  readonly slot: number; // absolute start slot of this segment
  readonly len: number; // divisions (1 division = one eighth)
  readonly midi: number;
  readonly tieStart: boolean;
  readonly tieStop: boolean;
}

function splitMelodySegments(melody: readonly EtudeNote[]): MelodySegment[] {
  const sorted = [...melody].sort((a, b) => a.slot - b.slot);
  const segs: MelodySegment[] = [];
  for (const n of sorted) {
    let cur = n.slot;
    let remaining = Math.max(1, n.durationSlots);
    let first = true;
    while (remaining > 0) {
      const barEnd = (Math.floor(cur / 8) + 1) * 8;
      const len = Math.min(remaining, barEnd - cur);
      segs.push({
        slot: cur,
        len,
        midi: n.midi,
        tieStop: !first,
        tieStart: remaining - len > 0,
      });
      cur += len;
      remaining -= len;
      first = false;
    }
  }
  return segs;
}

/** Build the additive <part id="P2"> melody part (D27). divisions=2
 *  => one eighth = 1 division; every measure sums to exactly 8
 *  divisions (gaps filled with rests). */
function buildMelodyPartXml(
  melody: readonly EtudeNote[],
  transpose: number,
  beatsPerMeasure: number,
  tempo: number,
): string {
  const segs = splitMelodySegments(melody);
  const lastSlot = segs.reduce((mx, s) => Math.max(mx, s.slot + s.len), 0);
  const bars = Math.max(1, Math.ceil(lastSlot / 8));

  const measures: string[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const barStart = bar * 8;
    const barEnd = barStart + 8;
    const barSegs = segs.filter((s) => s.slot >= barStart && s.slot < barEnd);
    let cursor = barStart;
    const noteXml = barSegs
      .map((s) => {
        let xml = "";
        if (s.slot > cursor) {
          xml += `
        <note>
          <rest/>
          <duration>${s.slot - cursor}</duration>
          <voice>1</voice>
        </note>`;
        }
        cursor = s.slot + s.len;
        const ties =
          (s.tieStart ? `
        <tie type="start"/>` : "") +
          (s.tieStop ? `
        <tie type="stop"/>` : "");
        const notations =
          s.tieStart || s.tieStop
            ? `
        <notations>${s.tieStop ? `<tied type="stop"/>` : ""}${s.tieStart ? `<tied type="start"/>` : ""}</notations>`
            : "";
        xml += `
        <note>
          <pitch>${midiToXmlPitch(s.midi, transpose)}</pitch>
          <duration>${s.len}</duration>${ties}
        <voice>1</voice>${notations}
        </note>`;
        return xml;
      })
      .join("");
    // Gap after the last segment (or a fully empty bar): one trailing
    // rest closes the measure at exactly 8 divisions.
    const trailing =
      cursor < barEnd
        ? `
        <note>
          <rest/>
          <duration>${barEnd - cursor}</duration>
          <voice>1</voice>
        </note>`
        : "";
    measures.push(`
    <measure number="${bar + 1}">${noteXml}${trailing}
    </measure>`);
  }

  return `
  <part id="P2">
    <measure number="0">
      <attributes>
        <divisions>2</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>${beatsPerMeasure}</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempo}</per-minute></metronome></direction-type></direction>
    </measure>${measures.join("")}
  </part>`;
}

function harmonyXmlForStep(step: { name: string }): string {
  const rootStep = escapeXml((step.name.replace(/[^A-G#b]/g, "").charAt(0) || "C"));
  const rootAlter = /Db|Eb|Gb|Ab|Bb|[#]/.test(step.name) ? "1" : "0";
  return `
      <harmony>
        <root><root-step>${rootStep}</root-step><root-alter>${rootAlter}</root-alter></root>
        <kind text="${escapeXml(step.name)}">major</kind>
      </harmony>`;
}

/**
 * Render a HarmonicPath to a MusicXML 4.0 string.
 *
 * Layout: chord-per-bar in 4/4 at the given tempo. Each bar's pitches
 * are written as a <chord/> (no <note/> durations; the audience just
 * sees the chord per measure). Chords include step.name as a harmony
 * element so Finale/Sibelius/MuseScore will display a chord symbol.
 *
 * When `opts.melody` is present (D27) an ADDITIVE second part P2 is
 * appended; without it the output is byte-identical to the historical
 * single-part export.
 *
 * voiceStyle block (default) keeps the historical chord-per-bar
 * rendering with divisions=1 and no <type> elements. voiceStyle arp
 * renders sequential arpeggiated notes with divisions=2, quarters
 * then eighths then rest, with <type> on pitched notes only.
 * trimToForm slices steps to the detected form before the loop.
 */
export function toMusicXml(
  path: HarmonicPath,
  opts: MusicXmlOptions = {},
): string {
  const {
    title = path.title,
    composer = "harmonic-study-engine",
    tempo = 80,
    transpose = 0,
    beatsPerMeasure = 4,
    stepsPerMeasure = 1,
    melody,
    voiceStyle = "block",
    trimToForm = false,
  } = opts;
  if (path.steps.length === 0) throw new Error("Cannot export empty path");

  let effectiveSteps = path.steps;
  if (trimToForm) {
    const period = detectFormPeriod(path.steps);
    const formLen = totalFormBars(period);
    effectiveSteps = path.steps.slice(0, formLen);
  }
  const stepCount = effectiveSteps.length;
  if (stepCount === 0) throw new Error("Cannot export empty path");

  const isArp = voiceStyle === "arp";
  const divisions = isArp ? 2 : 1;

  const measures: string[] = [];
  let measureNumber = 1;
  if (!isArp) {
    for (let i = 0; i < stepCount; i += stepsPerMeasure) {
      const stepSlice = effectiveSteps.slice(i, i + stepsPerMeasure);
      const noteElements = stepSlice.flatMap((step) => {
        const uniqueNotes = Array.from(new Set(step.notes)).sort((a, b) => a - b);
        const rootStep = escapeXml((step.name.replace(/[^A-G#b]/g, "").charAt(0) || "C"));
        const rootAlter = /Db|Eb|Gb|Ab|Bb|[#]/.test(step.name) ? "1" : "0";
        const inner = uniqueNotes
          .map(
            (n) => `
        <note>
          <pitch>${midiToXmlPitch(n, transpose)}</pitch>
          <duration>${4 / stepSlice.length}</duration>
          <voice>1</voice>
        </note>`,
          )
          .join("");
        return `
      <harmony>
        <root><root-step>${rootStep}</root-step><root-alter>${rootAlter}</root-alter></root>
        <kind text="${escapeXml(step.name)}">major</kind>
      </harmony>${inner}`;
      }).join("");

      // compute bar duration using the formula 4 quarters per measure
      const measureXml = `
    <measure number="${measureNumber}">
      ${noteElements}
    </measure>`;
      measures.push(measureXml);
      measureNumber++;
    }
  } else {
    const totalDivPerMeasure = beatsPerMeasure * 2;
    for (let i = 0; i < stepCount; i += stepsPerMeasure) {
      const stepSlice = effectiveSteps.slice(i, i + stepsPerMeasure);
      const sliceLen = stepSlice.length;
      const base = Math.floor(totalDivPerMeasure / sliceLen);
      const remainder = totalDivPerMeasure - base * sliceLen;
      let measureSum = 0;
      const noteElements = stepSlice
        .map((step, stepIdx) => {
          const budgetDiv =
            stepIdx === sliceLen - 1 ? base + remainder : base;
          const budgetQuarters = budgetDiv / 2;
          const arpNotes = prepareArpNotes(step.notes, transpose);
          const alloc = allocateArpDurations(
            arpNotes.length,
            budgetQuarters,
          );
          const used = arpNotes.slice(0, alloc.usedNotes);
          const quarterNotes = used.slice(0, alloc.quarters);
          const eighthNotes = used.slice(
            alloc.quarters,
            alloc.quarters + alloc.eighths,
          );
          const quarterXml = quarterNotes
            .map(
              (m) => `
        <note>
          <pitch>${midiToXmlPitch(m, 0)}</pitch>
          <duration>2</duration>
          <voice>1</voice>
          <type>quarter</type>
        </note>`,
            )
            .join("");
          const eighthXml = eighthNotes
            .map(
              (m) => `
        <note>
          <pitch>${midiToXmlPitch(m, 0)}</pitch>
          <duration>1</duration>
          <voice>1</voice>
          <type>eighth</type>
        </note>`,
            )
            .join("");
          const restXml =
            alloc.restDiv > 0
              ? `
        <note>
          <rest/>
          <duration>${alloc.restDiv}</duration>
          <voice>1</voice>
        </note>`
              : "";
          measureSum +=
            alloc.quarters * 2 + alloc.eighths * 1 + alloc.restDiv;
          return `${harmonyXmlForStep(step)}${quarterXml}${eighthXml}${restXml}`;
        })
        .join("");
      if (measureSum !== totalDivPerMeasure) {
        throw new Error(
          `arp measure sum ${measureSum} != budget ${totalDivPerMeasure}`,
        );
      }

      const measureXml = `
    <measure number="${measureNumber}">
      ${noteElements}
    </measure>`;
      measures.push(measureXml);
      measureNumber++;
    }
  }

  // D27: strictly additive. With no melody (undefined OR empty grid)
  // both fragments are empty strings and the template below renders
  // byte-identically to the historical export (pinned by
  // tests/scoreExport.test.ts + the T4 golden).
  const melodyNotes: readonly EtudeNote[] | undefined =
    melody !== undefined && melody.length > 0 ? melody : undefined;
  const p2ScorePart = melodyNotes
    ? `\n    <score-part id="P2"><part-name>Melody</part-name></score-part>`
    : "";
  const p2Part = melodyNotes
    ? buildMelodyPartXml(melodyNotes, transpose, beatsPerMeasure, tempo)
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>${escapeXml(title)}</work-title>
  </work>
  <identification>
    <creator type="composer">${escapeXml(composer)}</creator>
  </identification>
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>${p2ScorePart}
  </part-list>
  <part id="P1">
    <measure number="0">
      <attributes>
        <divisions>${divisions}</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>${beatsPerMeasure}</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempo}</per-minute></metronome></direction-type></direction>
    </measure>${measures.join("")}
  </part>${p2Part}
</score-partwise>`;
}

// ---------------------------------------------------------------------------
// Score21 — a markdown-friendly ASCII staff
//
// Reference: https://score21.app — scorable monospaced chord notation
// with stems-up/stems-down pitch representations.
//
// We emit:
//   • a header line with title / key / tempo
//   • chord symbols above each measure
//   • an ASCII pitch line per chord using a piano-roll style
// ---------------------------------------------------------------------------

/** Render a HarmonicPath to a Score21 (markdown) string. */
export function toScore21(
  path: HarmonicPath,
  opts: { title?: string; transpose?: number } = {},
): string {
  const { transpose = 0 } = opts;
  const title = opts.title ?? path.title;

  // Build a 13-string "piano" with one column per pitch class.
  const PITCH_LABELS = ["C", "D", "E", "F", "G", "A", "B"]; // white keys first
  const BAR_W = 16; // characters per bar
  const lines: string[] = [];

  // Header
  lines.push(`# ${title}`);
  const composer = path.composer || "harmonic-study-engine";
  lines.push(`> composer=${composer}  length=${path.steps.length} bars  format=score21`);

  // Chord-symbol row (one label per step, padded to BAR_W)
  let chordRow = "";
  for (const step of path.steps) {
    // replace spaces inside the chord name with "_" so layout stays aligned;
    // keeps "blues over A" readable as "blues_over_A"
    const sym = step.name.replace(/\s+/g, "_");
    chordRow += "| " + sym.padEnd(BAR_W - 2).slice(0, BAR_W - 2) + " ";
  }
  lines.push("\n## chords");
  lines.push(chordRow + "|");

  // Pitch-class cells row (X = a hit)
  // Render across two octaves (rows = octave 5..2), columns = pitch class
  lines.push("\n## pitches (concert)");
  for (let oct = 5; oct >= 2; oct--) {
    let row = `|${oct} |`;
    for (const step of path.steps) {
      let cell = "";
      for (const c of PITCH_LABELS) {
        const targetPc = pitchLetterToTpc(c, oct) % 12;
        // A note "matches" this (letter, octave) iff its PC==targetPc AND its
        // rounded-to-nearest-octave equals oct.
        const hit = step.notes.some((n) => {
          const m = n + transpose;
          if (((m % 12) + 12) % 12 !== targetPc) return false;
          const noteOct = Math.floor(m / 12) - 1;
          return noteOct === oct;
        });
        cell += hit ? "X " : ". ";
      }
      row += "|" + cell.padEnd(BAR_W - 1) + "|";
    }
    lines.push(row + "|");
  }

  // Voice-leading summary
  lines.push("\n## voice-leading");
  let last: number[] = [];
  for (let i = 0; i < path.steps.length; i++) {
    const notes = path.steps[i].notes;
    const top = Math.max(...notes);
    const prevTop = last.length ? Math.max(...last) : top;
    const motion = last.length ? top - prevTop : 0;
    lines.push(
      `b${i + 1}: ${path.steps[i].name.padEnd(8)} top=${midiName(top)} motion=${motion >= 0 ? "+" : ""}${motion}st`,
    );
    last = notes;
  }

  return lines.join("\n");
}

function midiName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"][pc] + oct;
}
function pcOf(midi: number): number {
  return ((midi % 12) + 12) % 12;
}
function pitchLetterToTpc(letter: string, octave: number): number {
  // Map C/D/E/F/G/A/B + octave to tpc (0..11)
  const m: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return m[letter] + 12 * (octave + 1);
}
