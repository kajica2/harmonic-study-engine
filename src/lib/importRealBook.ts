/**
 * Import a Real-Book-style chord-chart Markdown document.
 *
 * Recognised shape:
 *
 *   ## N. <Title>  *(class refs)*
 *
 *   **Key: <key>  •  Form: <form>  •  Composers: <...>**
 *
 *   ```
 *    A1  | Cmaj7 | Dm7 G7 | Cmaj7 | Cmaj7 |
 *        | Cmaj7 | Dm7 G7 | Cmaj7 | Cmaj7 |
 *    ...
 *   ```
 *
 *   ## N+1. <Next title>
 *   ...
 *
 * Each section's code block is fed to `importIRealText` (the chart
 * parser already handles `| Cmaj7 | Dm7 G7 |...` bar-line notation).
 * Title / composer / form / key metadata from the markdown are
 * preferred over whatever the chart parser might derive.
 *
 * Returns one `HarmonicPath` per tune.
 */

import { HarmonicPath, HarmonicStep } from "./paths";
import { importIRealText } from "./ireal";

export interface ParsedTune {
  title: string;
  composers?: string;
  form?: string;
  key?: string;
  classRefs?: string;
  notes?: string;
  chart: string;
}

const SECTION_RE =
  /^##\s+(\d+)\.\s+(.+?)\s*(?:\*\(([^)]+)\)\*)?\s*$/gm;

// META_RE matches a single `**Key: value**` token at a line break. We then
// split on bullet `•` separators within the captured value so that
// `**Key: F • Form: AABA • Composers: ...**` becomes three pairs.
const META_RE =
  /\*\*\s*([A-Z][A-Za-z ]+?):\s*([^*\n]+?)\s*\*\*/g;

const CODE_BLOCK_RE = /```([^\n]*)\n([\s\S]*?)```/g;

function extractMeta(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  META_RE.lastIndex = 0;
  while ((m = META_RE.exec(block)) !== null) {
    const rawKey = m[1].trim().toLowerCase();
    const rawVal = m[2].trim();
    // Split `**Key: F • Form: AABA • Composers: X**` on bullet into pairs.
    const parts = rawVal.split(/\s*[•·]\s*/);
    if (parts.length === 1) {
      if (rawKey) out[rawKey] = rawVal;
    } else {
      // Use the first segment as the value for `rawKey`, then walk
      // subsequent `<Word>: <value>` pairs into their own keys.
      // rawVal shape: "<v1> • <Word2>: <v2> • <Word3>: <v3>"
      const tail = parts.slice(1).join(" • ");
      // The remaining segments are `Word: value` pairs.
      const re = /\s*([A-Z][A-Za-z ]+?):\s*(.+)$/;
      const rest = tail.match(re);
      if (rest) {
        // rawKey gets only v1
        out[rawKey] = parts[0].trim();
        out[rest[1].trim().toLowerCase()] = rest[2].trim();
        // Any further `• Word: value` pairs after the first?
        const after = tail.slice(rest[0].length).trim();
        for (const seg of after.split(/\s*[•·]\s*/)) {
          const inner = /^\s*([A-Z][A-Za-z ]+?):\s*(.+)$/.exec(seg);
          if (inner) {
            out[inner[1].trim().toLowerCase()] = inner[2].trim();
          }
        }
      } else {
        out[rawKey] = rawVal;
      }
    }
  }
  return out;
}

function extractCodeBlocks(block: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  CODE_BLOCK_RE.lastIndex = 0;
  while ((m = CODE_BLOCK_RE.exec(block)) !== null) {
    // Strip section labels (A1, A2, B, A3, etc.) on each line so the
    // chart parser only sees bar-line notation.
    const lines = m[2]
      .split(/\r?\n/)
      .map((line) =>
        // Drop leading "A1  ", "B  ", etc. labels (1-3 alpha chars + spaces).
        line.replace(/^\s*[A-Z]{1,3}\s{1,4}/, ""),
      );
    out.push(lines.join("\n"));
  }
  return out;
}

/**
 * Parse the Markdown into a list of tunes with metadata + chart text.
 * If `mdText` doesn't look like the expected format, falls back to
 * treating the entire document as one big chart.
 */
export function parseRealBookMarkdown(mdText: string): ParsedTune[] {
  const tunes: ParsedTune[] = [];
  const text = mdText.replace(/\r\n/g, "\n");

  // Slice the document into per-tune sections by walking the regex.
  const matches: { index: number; end: number; title: string; classRefs?: string }[] = [];
  let m: RegExpExecArray | null;
  SECTION_RE.lastIndex = 0;
  while ((m = SECTION_RE.exec(text)) !== null) {
    matches.push({
      index: m.index,
      end: m.index + m[0].length,
      title: m[2].trim(),
      classRefs: m[3],
    });
  }

  if (matches.length === 0) {
    // Fallback: extract any code blocks and treat them as one chart
    const blocks = extractCodeBlocks(text);
    if (blocks.length === 0) return [];
    return [{
      title: "Real Book import",
      chart: blocks.join("\n\n"),
    }];
  }

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const sliceEnd = next ? next.index : text.length;
    const section = text.slice(cur.index, sliceEnd);

    const meta = extractMeta(section);
    const blocks = extractCodeBlocks(section);
    if (blocks.length === 0) continue;

    const chart = blocks.join("\n\n");
    const composers = meta.composers || meta.composer;
    const form = meta.form;
    const key = meta.key;
    tunes.push({
      title: cur.title,
      composers,
      form,
      key,
      classRefs: cur.classRefs,
      chart,
    });
  }

  return tunes;
}

/**
 * Convert the Markdown into a flat list of HarmonicPath objects ready
 * to drop into the paths state. Each tune becomes one path; its
 * steps come from running the chart through `importIRealText`.
 *
 * Title is overridden with the markdown's tune title; composer + form +
 * key go into the description. Steps come straight from the parser so
 * they preserve bar-line order.
 */
export function importRealBookMarkdown(mdText: string): HarmonicPath[] {
  const tunes = parseRealBookMarkdown(mdText);
  const out: HarmonicPath[] = [];
  for (let i = 0; i < tunes.length; i++) {
    const t = tunes[i];
    const chart = t.chart.trim();
    if (!chart) continue;

    // Use a slug-style id so re-importing overwrites cleanly.
    const slug = t.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "")
      .slice(0, 40) || `tune-${i}`;
    const id = `realbook-${slug}`;

    const parsed = importIRealText(chart);
    const steps: HarmonicStep[] = parsed.length > 0 ? parsed[0].steps : [];
    if (steps.length === 0) continue;

    const descParts: string[] = [];
    if (t.composers) descParts.push(t.composers);
    if (t.form) descParts.push(t.form);
    if (t.key) descParts.push(`Key ${t.key}`);
    if (t.classRefs) descParts.push(`(${t.classRefs})`);
    const description = descParts.join(" · ") || "Real Book chart";

    out.push({
      id,
      title: t.title,
      description,
      steps,
    });
  }
  return out;
}