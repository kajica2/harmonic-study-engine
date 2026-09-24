// F3 (D111): this gate is a STEP-COUNT policy check (96..256 steps),
// NOT bar truth - bars are 1:1 with steps (docs/PHASE-7-PRACTICE.md
// D110). The math and constants below stay byte-identical on purpose
// (36/36 OK must not move); only the printed labels changed: "steps"
// is the primary unit, "bars" is the legacy policy unit.
import { PATHS, STUDIES_PATHS, MIN_PATH_BARS, MAX_PATH_BARS, STEPS_PER_BAR } from "../src/lib/paths";

console.log("STEPS_PER_BAR =", STEPS_PER_BAR, "(legacy step-count policy unit, NOT bar truth - F3/D111)");
console.log("MIN_PATH_BARS =", MIN_PATH_BARS, "(min steps =", MIN_PATH_BARS * STEPS_PER_BAR + ")");
console.log("MAX_PATH_BARS =", MAX_PATH_BARS, "(max steps =", MAX_PATH_BARS * STEPS_PER_BAR + ")");
console.log();

const check = (list: typeof PATHS, label: string) => {
  let short = 0, long = 0, ok = 0;
  console.log(`=== ${label} ===`);
  list.forEach(p => {
    const bars = p.steps.length / STEPS_PER_BAR;
    const flag = bars < MIN_PATH_BARS ? "SHORT" : bars > MAX_PATH_BARS ? "LONG" : "OK";
    if (flag === "SHORT") short++;
    else if (flag === "LONG") long++;
    else ok++;
    console.log(`  ${String(p.steps.length).padStart(6)} steps  ${flag.padEnd(5)}  ${p.id}  (policy bars = ${String(Math.round(bars * 10) / 10)})`);
  });
  console.log(`  Total: ${list.length} | OK: ${ok} | SHORT: ${short} | LONG: ${long}\n`);
};
check(PATHS, "PATHS");
check(STUDIES_PATHS, "STUDIES_PATHS");
