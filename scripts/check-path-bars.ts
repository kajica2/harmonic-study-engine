import { PATHS, STUDIES_PATHS, MIN_PATH_BARS, MAX_PATH_BARS, STEPS_PER_BAR } from "../src/lib/paths";

console.log("STEPS_PER_BAR =", STEPS_PER_BAR);
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
    console.log(`  ${String(Math.round(bars * 10) / 10).padStart(6)} bars  ${flag.padEnd(5)}  ${p.id}  (${p.steps.length} steps)`);
  });
  console.log(`  Total: ${list.length} | OK: ${ok} | SHORT: ${short} | LONG: ${long}\n`);
};
check(PATHS, "PATHS");
check(STUDIES_PATHS, "STUDIES_PATHS");
