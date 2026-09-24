/**
 * engine/purity.test.ts - PRD-001 Phase 0 guard (REQ-NFR-7 / R9).
 *
 * Policy-as-test, pattern-copied from tests/no-debug-logs.test.ts.
 * Scans every engine source file (*.ts, excluding *.test.ts) and
 * fails the gate on:
 *   - banned impure calls: Math.random / Date.now / new Date /
 *     performance.now / any console.* (engine is fully silent,
 *     stricter than src's warn/error allowance - errors flow through
 *     return values, e.g. MigrationOutcome). Hardened in review
 *     round 1 against demonstrated bypasses:
 *       * /\bMath\.random\b/ requires NO trailing paren, so aliasing
 *         (const f = Math.random) is caught;
 *       * /\bMath\s*\[/ and /\bDate\s*\[/ catch computed-member
 *         access such as Math["random"]() and Date["now"]();
 *       * /\brequire\s*\(/ catches CJS smuggling past the import
 *         regex (require("../src/x") etc.);
 *       * all patterns run against the FULL comment-stripped text
 *         (block comments blanked to newlines, line comments
 *         blanked), so a call split across lines cannot hide on a
 *         comment-styled continuation line; match offsets map back
 *         to original line numbers for reporting.
 *   - boundary-crossing imports: ALLOWLIST policy. Engine sources
 *     may only import RELATIVE modules. Any non-relative specifier
 *     - npm packages AND node:* builtins alike - is a violation;
 *     relative specifiers resolving into src/ stay banned.
 *     Direction rule: src -> engine is allowed; engine -> src is
 *     forbidden. (Phase 0 engine imports nothing external, so the
 *     allowlist is zero-friction today and future-proof.)
 *
 * KNOWN GAP (accepted, reviewer LOW-005): *.test.ts files are
 * excluded from BOTH the banned-call scan and the import check, so
 * test-side imports (vitest, node:fs below) are UNGUARDED. Tests
 * never ship inside the engine bundle.
 *
 * NOTE: this file lives in engine/, NOT tests/ - assets/check-links.cjs
 * counts it only in tests/*.test.ts to pin README totals; adding
 * files there would force README edits (drift gate).
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix } from "node:path";

const ENGINE = "engine";
/** Sanity floor: a broken glob must not silently pass. Phase 0 ships
 *  12 non-test engine sources; Phase 3 Slice 1 adds 7 (etude types/
 *  harmony/melody/assemble + pedagogy types/concepts/annotate) per
 *  D20; Phase 4 Slice 1 adds core/chords + compose/{types,normalize,
 *  tempo,roles,key,melody,harmony,index} per D56 (analyzeProject needs
 *  a home and cannot live in types.ts - cycle); Phase 4 Slice 3 adds
 *  compose/{patterns,voicing,bass,accompany} per D75 (29 -> 33,
 *  pre-authorized by the parent ladder); Phase 4 Slice 4 adds
 *  compose/{chordsym (D82 move-in),chordchart (D83)} per D91
 *  (33 -> 35, tree scans 36); Phase 5 adds explore/{types,seeds,
 *  substitute,reharmonize,expand,vary,voicelead,cards,modulate} per
 *  D101 (35 -> 44, tree scans 45 with the index-file slack).
 *  Raise this only alongside
 *  real files. */
const MIN_SCANNED_FILES = 44;

const BANNED: readonly RegExp[] = [
  /\bMath\.random\b/, // no paren: calls AND aliasing
  /\bMath\s*\[/, // computed-member bypass: Math["..."]
  /\bDate\s*\[/, // computed-member bypass: Date["..."]
  /\bDate\.now\s*\(/,
  /\bnew\s+Date\s*\(/,
  /\bperformance\.now\s*\(/,
  /\brequire\s*\(/, // CJS bypass of the import allowlist
  /\bconsole\./,
];
const BANNED_GLOBAL: readonly RegExp[] = BANNED.map(
  (re) => new RegExp(re.source, "g"),
);

const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

interface Violation {
  file: string;
  line: number;
  match: string;
}

/**
 * Blank comments while preserving line structure exactly: each block
 * comment collapses to its own newlines, each line comment to
 * nothing. Every offset in the result still maps to the ORIGINAL
 * line number, and banned tokens can neither hide inside comments
 * (false positives) nor be skipped line-wise (false negatives).
 */
function stripComments(src: string): string {
  return src
    .replace(
      /\/\*[\s\S]*?\*\//g,
      (block) => "\n".repeat(block.split("\n").length - 1),
    )
    .replace(/\/\/[^\n]*/g, "");
}

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * The whole detector as a pure function of (display path, content):
 * scan() feeds it real files; the self-tests below feed it synthetic
 * strings to pin each hardened bypass class without planting
 * violations in real sources.
 */
function findViolations(file: string, content: string): Violation[] {
  const violations: Violation[] = [];
  const text = stripComments(content);

  for (const re of BANNED_GLOBAL) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      violations.push({ file, line: lineAt(text, m.index), match: m[0] });
    }
  }

  IMPORT_RE.lastIndex = 0;
  let im: RegExpExecArray | null;
  while ((im = IMPORT_RE.exec(text)) !== null) {
    const spec = im[1];
    const line = lineAt(text, im.index);
    if (spec.startsWith(".")) {
      const resolved = posix.normalize(posix.join(dirname(file), spec));
      if (resolved === "src" || resolved.startsWith("src/")) {
        violations.push({
          file,
          line,
          match: `import '${spec}' crosses into src/`,
        });
      }
    } else {
      violations.push({
        file,
        line,
        match:
          `import '${spec}' is not relative: engine sources may only ` +
          `import relative modules (allowlist; covers packages and node:*)`,
      });
    }
  }
  return violations;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      walk(p, acc);
    } else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) {
      acc.push(p);
    }
  }
  return acc;
}

function scan(): { violations: Violation[]; scanned: string[] } {
  const violations: Violation[] = [];
  const files = walk(ENGINE);
  for (const file of files) {
    violations.push(...findViolations(file, readFileSync(file, "utf8")));
  }
  return { violations, scanned: files };
}

describe("engine purity guard", () => {
  it("scans a sane number of engine source files", () => {
    const { scanned } = scan();
    expect(scanned.length).toBeGreaterThanOrEqual(MIN_SCANNED_FILES);
  });

  it("has zero impure calls and zero boundary-crossing imports", () => {
    const { violations } = scan();
    if (violations.length > 0) {
      const msg = violations
        .map((v) => `  ${v.file}:${v.line}  ${v.match}`)
        .join("\n");
      throw new Error(
        `Engine purity violation(s) found in engine/:\n${msg}\n` +
          `Engine code must stay pure: inject seeds and clocks from ` +
          `callers, return errors instead of logging, and import only ` +
          `relative modules (src -> engine is the only allowed ` +
          `direction; packages and node:* are off the allowlist).`,
      );
    }
    expect(violations).toEqual([]);
  });
});

describe("purity detector self-tests (review round 1 bypasses)", () => {
  const F = "engine/synthetic/probe.ts";
  const hits = (content: string): Violation[] => findViolations(F, content);

  it("catches computed-member calls: Math[\"random\"]()", () => {
    expect(hits('const r = Math["random"]();').length).toBeGreaterThan(0);
  });

  it("catches aliasing without a call paren: const f = Math.random", () => {
    const v = hits("const f = Math.random;\nconst r = f();");
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].line).toBe(1);
  });

  it("catches continuation hides: banned call on a line the old skip dropped", () => {
    // "binary continuation": line 2 starts with "*" (multiplication),
    // which the old doc-comment skip treated as documentation.
    const v = hits("const r = 1\n* 2 + Math.random();");
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].line).toBe(2); // line mapping survives comment strip
  });

  it("catches require() smuggling past the import regex", () => {
    expect(hits('const x = require("../src/lib/audio");').length).toBeGreaterThan(0);
  });

  it("import allowlist: packages and node:* are violations in sources", () => {
    expect(hits('import z from "zustand";').length).toBeGreaterThan(0);
    expect(hits('import _ from "lodash";').length).toBeGreaterThan(0);
    expect(hits('import fs from "node:fs";').length).toBeGreaterThan(0);
  });

  it("relative specifiers crossing into src/ stay banned", () => {
    expect(hits('import { audio } from "../../src/lib/audio";').length).toBeGreaterThan(0);
  });

  it("no false positives on clean relative sources or comment text", () => {
    const clean = [
      "/** Docs may mention Math.random(), Date.now(), console.log",
      " * and require() here - comment text is stripped before scanning. */",
      'import type { Seed } from "../core/rng";',
      "export const nine = 3\n* 3; // multiplication continuation is fine",
    ].join("\n");
    expect(hits(clean)).toEqual([]);
  });
});
