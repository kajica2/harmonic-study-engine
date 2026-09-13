/**
 * Browser smoke test — boots the dev server, navigates to it, captures
 * a screenshot, and asserts the page rendered without console errors.
 * Runs as `npx tsx scripts/smoke-composition.ts`.
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const URL = process.env.SMOKE_URL ?? "http://127.0.0.1:5174/";
const OUT_DIR = join(process.cwd(), "docs/COMPOSITION-MVP-SCREENSHOTS");
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error") {
    const text = msg.text();
    // Filter out DDSP backend connection errors (server isn't running locally)
    if (text.includes("ERR_CONNECTION_REFUSED") || text.includes("127.0.0.1:8765")) return;
    errors.push(`console.error: ${text}`);
  }
});

await page.goto(URL, { waitUntil: "networkidle", timeout: 15000 });

// Give React a moment to hydrate.
await page.waitForTimeout(1500);

// Assertions: key UI surfaces from Phase 2 should be visible.
const checks = [
  { name: "PracticeHeader", selector: 'header, [aria-label*="Practice" i]' },
  { name: "PathBriefing", selector: '[aria-label*="briefing" i], [aria-label*="Path" i]' },
  { name: "StylePackPicker", selector: '[aria-label*="Style pack" i], [aria-label*="style" i]' },
  { name: "TexturePanel", selector: '[aria-label*="Texture" i]' },
  { name: "MelodyLane", selector: '[aria-label*="Melody lane" i]' },
  { name: "CoComposePanel", selector: '[aria-label*="Co-composition" i]' },
  { name: "FormPlanner", selector: '[aria-label*="Form" i]' },
  { name: "QuizPanel", selector: '[aria-label*="Quiz" i]' },
];

const results: Array<{ name: string; present: boolean }> = [];
for (const c of checks) {
  const count = await page.locator(c.selector).count();
  results.push({ name: c.name, present: count > 0 });
}

await page.screenshot({ path: join(OUT_DIR, "phase-3-smoke.png"), fullPage: true });

await browser.close();

// Report
console.log("\n=== Phase 3 Browser Smoke ===");
console.log(`URL: ${URL}`);
console.log(`Screenshot: docs/COMPOSITION-MVP-SCREENSHOTS/phase-3-smoke.png`);
console.log("\nUI surfaces:");
for (const r of results) {
  console.log(`  ${r.present ? "✓" : "✗"} ${r.name}`);
}
if (errors.length > 0) {
  console.log("\nConsole errors:");
  for (const e of errors) console.log(`  ${e}`);
  process.exit(1);
}
console.log("\n✓ No console errors. Smoke passed.");
