/**
 * Build a 100-case counterpoint fixture corpus deterministically.
 *
 * 25 each of:
 *   - parallel-5th: motion in similar direction between two P5 intervals
 *   - parallel-8ve: motion in similar direction between two P8 intervals
 *   - contrary-to-perfect: contrary motion INTO a perfect consonance
 *   - oblique-to-perfect: oblique motion INTO a perfect consonance
 *
 * Run: `npx tsx scripts/build-counterpoint-corpus.ts`
 * Output: `src/lib/__fixtures__/counterpointCases.json`
 *
 * IMPORTANT: the rule check fires only on transitions between
 * perfect consonances (P5/P8). The corpus must produce real P5 or
 * P8 intervals at BOTH bars of each pair for the violation to be
 * detectable.
 */
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Case {
  id: string;
  category: "parallel_fifth" | "parallel_octave" | "contrary_ok" | "oblique_ok";
  melody: number[];
  counterline: number[];
  expectViolation: boolean;
  description: string;
}

/**
 * Build a 2-bar pair that starts on a P5 and ends on a P5 with both
 * voices moving in the same direction by `step` semitones.
 */
function parallelFifth(root: number, step: number, idSeed: number): Case {
  const top0 = root + 4; // top voice starts on the 3rd
  const top1 = top0 + step;
  const bot0 = top0 + 7; // bottom voice starts a P5 below top (i.e. P5 above root)
  const bot1 = bot0 + step;
  return {
    id: `parallel_fifth_${idSeed}`,
    category: "parallel_fifth",
    melody: [top0, top1],
    counterline: [bot0, bot1],
    expectViolation: true,
    description: `parallel P5 with motion ${step}: top ${top0}→${top1}, bottom ${bot0}→${bot1}`,
  };
}

/**
 * Build a 2-bar pair that starts on a P8 and ends on a P8 with both
 * voices moving in the same direction by `step` semitones.
 */
function parallelOctave(root: number, step: number, idSeed: number): Case {
  const top0 = root + 12; // top voice starts an octave above root
  const top1 = top0 + step;
  const bot0 = root;       // bottom voice starts on the root
  const bot1 = bot0 + step;
  return {
    id: `parallel_octave_${idSeed}`,
    category: "parallel_octave",
    melody: [top0, top1],
    counterline: [bot0, bot1],
    expectViolation: true,
    description: `parallel P8 with motion ${step}: top ${top0}→${top1}, bottom ${bot0}→${bot1}`,
  };
}

/**
 * Contrary motion into a P5: top goes up, bottom goes down, both
 * land on a P5 interval at bar 2.
 */
function contraryOk(root: number, step: number, idSeed: number): Case {
  const top0 = root + 4;
  const top1 = top0 + step;
  const bot0 = top0 + 7; // P5 above top0 (so bot0 is the lower voice at a P5 interval)
  // Land on a P5 at bar 2 by going BELOW top1.
  const bot1 = top1 - 7;
  return {
    id: `contrary_ok_${idSeed}`,
    category: "contrary_ok",
    melody: [top0, top1],
    counterline: [bot0, bot1],
    expectViolation: false,
    description: `contrary motion into P5: top ${top0}→${top1} up, bottom ${bot0}→${bot1} down`,
  };
}

/**
 * Oblique motion into a P5: top holds, bottom moves up to land on P5.
 */
function obliqueOk(root: number, idSeed: number): Case {
  const top0 = root + 4;
  const bot0 = root - 8; // bot starts outside any perfect interval
  // After motion: bot = top - 5? We need a P5; let's just start on a P5 then move by oblique.
  // top stays at top0. Bottom moves up by step such that bot lands on top0 - 7 (P5 below).
  const bot1 = top0 - 7;
  return {
    id: `oblique_ok_${idSeed}`,
    category: "oblique_ok",
    melody: [top0, top0],
    counterline: [bot0, bot1],
    expectViolation: false,
    description: `oblique motion into P5: top holds, bottom ${bot0}→${bot1}`,
  };
}

const cases: Case[] = [];
const ROOTS = [60, 62, 64, 65, 67, 69, 71]; // C, D, Eb, F, G, A, B areas
const STEPS = [1, 2, 3, 4]; // motion sizes

// 25 parallel-fifth cases: 7 roots × 4 steps = 28, take 25
let p5Count = 0;
for (const root of ROOTS) {
  for (const step of STEPS) {
    if (p5Count >= 25) break;
    cases.push(parallelFifth(root, step, p5Count));
    p5Count++;
  }
}

// 25 parallel-octave cases
let p8Count = 0;
for (const root of ROOTS) {
  for (const step of STEPS) {
    if (p8Count >= 25) break;
    cases.push(parallelOctave(root, step, p8Count));
    p8Count++;
  }
}

// 25 contrary-ok cases
let contrCount = 0;
for (const root of ROOTS) {
  for (const step of STEPS) {
    if (contrCount >= 25) break;
    cases.push(contraryOk(root, step, contrCount));
    contrCount++;
  }
}

// 25 oblique-ok cases — obliqueOk doesn't take a step arg, so we
// generate 4 variants per root (different starting bot pitch) by
// offsetting the root before passing.
let oblCount = 0;
for (let pass = 0; pass < 4; pass++) {
  for (const root of ROOTS) {
    if (oblCount >= 25) break;
    cases.push(obliqueOk(root + pass, oblCount));
    oblCount++;
  }
}

const outDir = join(__dirname, "..", "src", "lib", "__fixtures__");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "counterpointCases.json");
writeFileSync(outPath, JSON.stringify(cases, null, 2));
console.log(`wrote ${cases.length} cases to ${outPath}`);
