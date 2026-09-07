/**
 * no-debug-logs — pin the "no console.log/info/debug in src/" policy
 * so accidental debug-printing fails the gate instead of shipping
 * to production DevTools.
 *
 * Allowed:
 *   console.warn(...)   — error-path reporting (intentional)
 *   console.error(...)  — error-path reporting (intentional)
 *
 * Banned:
 *   console.log(...)
 *   console.info(...)
 *   console.debug(...)
 *
 * The 14 `console.warn/error` calls already in src/ are real signal
 * (Magenta RNN fallback, soundfont load failure, MIDI access denied,
 * playbackClock listener error, etc.) — ops needs them during
 * debugging. Banning debug-printing keeps the door closed on the
 * common "leftover console.log" regression without touching them.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = "src";
const BANNED = [
  /\bconsole\.log\s*\(/,
  /\bconsole\.info\s*\(/,
  /\bconsole\.debug\s*\(/,
];

interface Offender {
  file: string;
  line: number;
  match: string;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      walk(p, acc);
    } else if (p.endsWith(".ts") || p.endsWith(".tsx")) {
      acc.push(p);
    }
  }
  return acc;
}

function scan(): Offender[] {
  const offenders: Offender[] = [];
  for (const file of walk(SRC)) {
    const lines = readFileSync(file, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      // skip lines that are clearly documentation (start with * or //)
      const trimmed = lines[i].trim();
      if (trimmed.startsWith("*") || trimmed.startsWith("//")) continue;
      for (const re of BANNED) {
        const m = lines[i].match(re);
        if (m) offenders.push({ file, line: i + 1, match: m[0] });
      }
    }
  }
  return offenders;
}

describe("no debug-printing in src/", () => {
  it("has zero console.log/info/debug calls", () => {
    const offenders = scan();
    if (offenders.length > 0) {
      const msg = offenders
        .map((o) => `  ${o.file}:${o.line}  ${o.match}`)
        .join("\n");
      throw new Error(
        `Banned debug-printing call(s) found in src/:\n${msg}\n` +
          `Use console.warn or console.error for error-path reporting; ` +
          `remove leftover console.log/info/debug before committing.`,
      );
    }
    expect(offenders).toEqual([]);
  });
});
