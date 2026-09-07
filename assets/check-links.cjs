#!/usr/bin/env node
/**
 * check-links.js — drift gate for the Harmonic Study Engine.
 *
 * Asserts that every count referenced in README.md, the magenta
 * sub-README, and a handful of source files matches its source of
 * truth. When a count drifts, fail with file:line + expected vs
 * actual so the violation is unambiguous.
 *
 * Pure Node, no deps. Reads SPEC.md for the authoritative values;
 * see the "Counts that get cited in many places" section there.
 *
 * Exit 0 on success, 1 on any violation. The CI workflow
 * (.github/workflows/test.yml) runs this on every push.
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SPEC = path.join(ROOT, "SPEC.md");

const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;
const BOLD = (s) => `\x1b[1m${s}\x1b[0m`;

// ---------- helpers ---------------------------------------------------------

function fail(msg) {
  console.error(RED(`✗ ${msg}`));
  violations++;
}

let violations = 0;

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), "utf8");
}

function linesOf(p) {
  return read(p).split("\n");
}

/** Find every line in `file` that contains `needle`, return 1-based lineNo. */
function findLine(file, needle) {
  const lines = linesOf(file);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) return i + 1;
  }
  return -1;
}

// ---------- 1. Personas — 17 -----------------------------------------------

function checkPersonas() {
  const json = JSON.parse(read("src/data/personas.json"));
  const expected = Array.isArray(json) ? json.length : null;
  if (expected !== 17) {
    fail(`src/data/personas.json length = ${expected}, SPEC says 17`);
    return;
  }
  // README.md feature list
  const readme = read("README.md");
  const m = readme.match(/(\d+)\s+masterclass\s+persona/);
  if (!m) {
    fail(`README.md: cannot find "N masterclass persona(s)" pattern`);
  } else if (parseInt(m[1], 10) !== expected) {
    const ln = findLine("README.md", `${m[1]} masterclass persona`);
    fail(`README.md:${ln} — "masterclass persona" count = ${m[1]}, expected ${expected}`);
  }
  // personaProfiles.ts header comment
  const pp = read("src/magenta/personaProfiles.ts");
  const pm = pp.match(/currently\s+(\d+)/);
  if (pm && parseInt(pm[1], 10) !== expected) {
    const ln = findLine("src/magenta/personaProfiles.ts", `currently ${pm[1]}`);
    fail(`src/magenta/personaProfiles.ts:${ln} — "currently N" = ${pm[1]}, expected ${expected}`);
  }
}

// ---------- 2. Masterclass tunes — 38 --------------------------------------

function checkTunes() {
  const txt = read("src/data/masterclass.ts");
  const matches = txt.match(/\binApp:\s*(true|false)/g) || [];
  const expected = matches.length;
  if (expected !== 38) {
    fail(`src/data/masterclass.ts inApp: count = ${expected}, SPEC says 38`);
    return;
  }
  const readme = read("README.md");
  // Two sites: "38-tune working catalog" and "38-tune catalog"
  for (const pat of [/(\d+)-tune\s+working\s+catalog/, /(\d+)-tune\s+catalog/]) {
    const re = new RegExp(pat.source, "g");
    let m;
    while ((m = re.exec(readme)) !== null) {
      const got = parseInt(m[1], 10);
      if (got !== expected) {
        const ln = findLine("README.md", `${m[1]}-tune catalog`);
        fail(`README.md:${ln} — "${m[0]}" = ${got}, expected ${expected}`);
      }
    }
  }
}

// ---------- 3. Tests — 149 frontend + 29 backend ---------------------------

function checkTests() {
  // Frontend: count it( in tests/*.test.ts
  const testsDir = path.join(ROOT, "tests");
  let frontend = 0;
  for (const f of fs.readdirSync(testsDir).sort()) {
    if (!f.endsWith(".test.ts")) continue;
    if (f === "loopWav-mock.ts") continue; // helper, not a test file
    const t = fs.readFileSync(path.join(testsDir, f), "utf8");
    frontend += (t.match(/\bit\s*\(/g) || []).length;
  }

  // Backend: count def test_ in server/tests/test_*.py
  const pyDir = path.join(ROOT, "server/tests");
  let backend = 0;
  for (const f of fs.readdirSync(pyDir).sort()) {
    if (!f.startsWith("test_") || !f.endsWith(".py")) continue;
    const t = fs.readFileSync(path.join(pyDir, f), "utf8");
    backend += (t.match(/\bdef\s+test_/g) || []).length;
  }

  const total = frontend + backend;

  // README.md claim
  const readme = read("README.md");
  const rm = readme.match(/(\d+)\s+tests?\s+passing\s+as\s+of\s+this\s+commit/);
  if (!rm) {
    fail(`README.md: cannot find "N tests passing as of this commit" pattern`);
  } else {
    const claimed = parseInt(rm[1], 10);
    if (claimed !== total) {
      const ln = findLine("README.md", `${claimed} tests passing as of this commit`);
      fail(`README.md:${ln} — total tests = ${claimed}, actual = ${total} (${frontend} frontend + ${backend} backend)`);
    }
    // Split format: "(N frontend it() + M backend def test_)"
    const split = readme.match(/\((\d+)\s+frontend\s+it\(\)\s*\+\s*(\d+)\s+backend\s+def\s+test_\)/);
    if (split) {
      const cf = parseInt(split[1], 10);
      const cb = parseInt(split[2], 10);
      if (cf !== frontend) {
        const ln = findLine("README.md", `${cf} frontend it()`);
        fail(`README.md:${ln} — frontend = ${cf}, actual = ${frontend}`);
      }
      if (cb !== backend) {
        const ln = findLine("README.md", `${cb} backend def test_`);
        fail(`README.md:${ln} — backend = ${cb}, actual = ${backend}`);
      }
    }
  }

  // src/magenta/README.md claim
  const mag = read("src/magenta/README.md");
  const mm = mag.match(/Total:\s+(\d+)\s+tests?\s+passing\s+across\s+the\s+repo/);
  if (!mm) {
    fail(`src/magenta/README.md: cannot find "Total: N tests passing across the repo" pattern`);
  } else {
    const claimed = parseInt(mm[1], 10);
    if (claimed !== total) {
      const ln = findLine("src/magenta/README.md", `Total: ${claimed} tests passing`);
      fail(`src/magenta/README.md:${ln} — total = ${claimed}, actual = ${total}`);
    }
  }

  console.log(DIM(`  test counts: ${frontend} frontend + ${backend} backend = ${total}`));
}

// ---------- 4. Backing styles — 11 -----------------------------------------

function checkStyles() {
  const txt = read("src/lib/backingEngine.ts");
  // The BackingStyle union members — find lines like  | "swing"
  // (only in the union declaration, not in the StyleInstruments Record
  // below where "bass" / "piano" appear as keys of nested objects).
  // The union ends with the line `"afro-3-4";` — only that line ends
  // in `;` within the union body.
  const lines = txt.split("\n");
  const styles = [];
  for (const line of lines) {
    const m = line.match(/^\s*\|\s*"([a-z0-9-]+)"\s*;?\s*$/);
    if (m) {
      styles.push(m[1]);
      if (/;\s*$/.test(line)) break;
    }
  }
  const expected = styles.length;
  if (expected !== 11) {
    fail(`src/lib/backingEngine.ts BackingStyle union = ${expected} members, SPEC says 11 (${styles.join(", ")})`);
    return;
  }
  const readme = read("README.md");
  const matches = readme.match(/(\d+)\s+backing\s+styles?/g) || [];
  if (matches.length === 0) {
    fail(`README.md: cannot find "N backing styles" pattern`);
    return;
  }
  for (const m of matches) {
    const got = parseInt(m.match(/(\d+)/)[1], 10);
    if (got !== expected) {
      const ln = findLine("README.md", `${got} backing styles`);
      fail(`README.md:${ln} — "backing styles" = ${got}, expected ${expected}`);
    }
  }
}

// ---------- 5. Package name — harmonic-study-engine ------------------------

function checkPackageName() {
  const pkg = JSON.parse(read("package.json"));
  const expected = "harmonic-study-engine";
  if (pkg.name !== expected) {
    fail(`package.json "name" = "${pkg.name}", expected "${expected}"`);
    return;
  }
  // metadata.json MUST stay deleted (boilerplate was stripped in 6f36ddc)
  const meta = path.join(ROOT, "metadata.json");
  if (fs.existsSync(meta)) {
    fail(`metadata.json exists — was deleted as AI Studio boilerplate in 6f36ddc; restore the deletion`);
  }
  // render.yaml service name should match
  const render = read("render.yaml");
  const rm = render.match(/name:\s*(\S+)/);
  if (rm && rm[1] !== "harmonic-study-engine-api") {
    const ln = findLine("render.yaml", `name: ${rm[1]}`);
    fail(`render.yaml:${ln} — service "name" = "${rm[1]}", expected "harmonic-study-engine-api"`);
  }
}

// ---------- main -----------------------------------------------------------

function main() {
  console.log(BOLD("check-links — drift gate for harmonic-study-engine"));
  console.log(DIM(`SPEC: ${path.relative(ROOT, SPEC)}`));
  console.log("");

  checkPersonas();
  checkTunes();
  checkTests();
  checkStyles();
  checkPackageName();

  console.log("");
  if (violations === 0) {
    console.log(`${"\x1b[32m"}✓ all counts match SPEC.md${"\x1b[0m"}`);
    process.exit(0);
  } else {
    console.error(RED(`✗ ${violations} violation(s)`));
    process.exit(1);
  }
}

main();
