/**
 * End-to-end test for the Harmonic Study Engine.
 *
 * Boots a static server pointing at the built `dist/` (the same
 * bundle Vercel serves in production). Loads it in Chromium,
 * asserts the persona grid renders, clicks Scriabin, verifies the
 * path + voicing changed, and asserts the MIDI chips are present.
 *
 * Run via `npx playwright test e2e/app.spec.ts` (after `npm run build`).
 * The test boots its own server on a random port — no need to have
 * vite running locally.
 */
import { test, expect, chromium } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

const DIST = resolve(process.cwd(), "dist/index.html");

test.beforeAll(async () => {
  if (!existsSync(DIST)) {
    throw new Error(
      `dist/index.html missing — run \`npm run build\` before this test.`,
    );
  }
  // The test runner already provides a webServer config via playwright.config
  // when present; we don't need to spawn one here.
});

test("app loads, persona grid renders, clicking Scriabin changes path + voicing", async ({ page }) => {
  await page.goto("/");

  // Wait for the persona grid to render. The personas are buttons
  // inside a div with the "Personas" eyebrow. Wait for the heading.
  await expect(page.getByText("Choose a mastermind")).toBeVisible({ timeout: 10_000 });

  // The grid should contain at least 17 persona cards. Scriabin's
  // card has the text "Alexander Scriabin" + "✓ syn" badge for
  // documented synesthesia.
  const scriabin = page.getByRole("button", { name: /Alexander Scriabin/ });
  await expect(scriabin).toBeVisible({ timeout: 5_000 });
  await expect(scriabin).toContainText("syn");

  // Capture the current path title before clicking.
  const pathHeadingBefore = await page
    .locator("h3")
    .filter({ hasText: /Path/ })
    .first()
    .innerText()
    .catch(() => "");

  // Click Scriabin.
  await scriabin.click();

  // After clicking, the active path heading should now include
  // "Path XXXIII" (The Mystic Chord) — Scriabin's default path.
  await expect(
    page.locator("h3").filter({ hasText: /Path XXXIII.*Mystic Chord/ }).first(),
  ).toBeVisible({ timeout: 5_000 });

  // The voicing picker should now show "Quartal" as the selected
  // option (Scriabin's defaultVoicing).
  const voicingSelect = page.locator('select[aria-label="Voicing style"]');
  await expect(voicingSelect).toHaveValue("quartal", { timeout: 5_000 });

  // The MIDI chips should be present.
  await expect(page.getByText(/^MIDI$/)).toBeVisible();
  await expect(page.getByText(/^IN$/)).toBeVisible();
});

test("Path Catalog tab is reachable", async ({ page }) => {
  await page.goto("/");
  // Wait for the app shell to render. The heading "Choose a mastermind"
  // appears on the home screen — wait for any h2/h3 with "mastermind".
  await page.getByRole("heading", { name: /Choose a mastermind/ }).waitFor({ timeout: 10_000 });
  // Find the Catalog tab. The label may be styled; try by visible text.
  const catalogTab = page.getByRole("button", { name: /Catalog/i }).first();
  await expect(catalogTab).toBeVisible({ timeout: 5_000 });
  await catalogTab.click();
  // Catalog should expose a composer filter input.
  await expect(
    page.locator('input[placeholder*="omposer" i], input[placeholder*="ilter" i], input[placeholder*="search" i]').first(),
  ).toBeVisible({ timeout: 5_000 });
});

test("Coltrane persona activates slice-and-repeat badge in live score", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("heading", { name: /Choose a mastermind/ }).waitFor({ timeout: 10_000 });

  // Open the Catalog tab.
  const catalogTab = page.getByRole("button", { name: /Catalog/i }).first();
  await catalogTab.click();

  // Open the coltrane_changes_demo path (has sliceAndRepeat=true).
  // The path entry has a data-testid `catalog-open-<pathId>` button.
  const openBtn = page.locator('[data-testid="catalog-open-coltrane_changes_demo"]');
  await expect(openBtn).toBeVisible({ timeout: 5_000 });
  await openBtn.click();

  // The slice-and-repeat badge in LiveScoreDisplay should now appear.
  const badge = page.getByTestId("slice-repeat-badge");
  await expect(badge).toBeVisible({ timeout: 8_000 });
  await expect(badge).toContainText("Slice & Repeat");
});

test("practice transport starts and pauses the loop", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("heading", { name: /Choose a mastermind/ }).waitFor({ timeout: 10_000 });

  // The header's dominant action toggles between Start/Pause. Clicking
  // Start also loads the deferred audio chunk, so this doubles as a
  // smoke check that tone.js code-splits in cleanly at runtime.
  const start = page.getByRole("button", { name: "Start practice" });
  await expect(start).toBeVisible({ timeout: 5_000 });
  await start.click();

  const pause = page.getByRole("button", { name: "Pause practice" });
  await expect(pause).toBeVisible({ timeout: 10_000 });
  await pause.click();
  await expect(page.getByRole("button", { name: "Start practice" })).toBeVisible({ timeout: 5_000 });
});

test("keyboard shortcuts cheatsheet opens and dismisses", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("heading", { name: /Choose a mastermind/ }).waitFor({ timeout: 10_000 });

  const trigger = page.getByRole("button", { name: "Show keyboard shortcuts" });
  await expect(trigger).toBeVisible({ timeout: 5_000 });
  await trigger.click();

  const dialog = page.locator('[aria-modal="true"]');
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("heading", { name: /Keyboard Shortcuts/i })).toBeVisible();

  // ModalShell wires Esc to dismiss — press it and confirm the modal
  // leaves the a11y tree entirely (not just visually hidden).
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("Import/Export modal code-splits in and opens", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("heading", { name: /Choose a mastermind/ }).waitFor({ timeout: 10_000 });

  // The Import/Export modal is React.lazy'd — opening it fetches the
  // chunk on demand, so this verifies the code-split path (not just
  // that the UI exists).
  const openBtn = page.getByRole("button", { name: /Import \/ Export/ }).first();
  await expect(openBtn).toBeVisible({ timeout: 5_000 });
  await openBtn.click();

  const dialog = page.locator('[aria-modal="true"]');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  // The publishing stack lives in this lazy chunk too.
  await expect(page.getByRole("heading", { name: /Import & export/i })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: "Real Book" })).toBeVisible({ timeout: 5_000 });
});

test("recent takes panel renders seeded takes and persists a self-rating", async ({ page }) => {
  // Seed one take through the app's own log key, exactly as the
  // practice rail's Record Take flow writes it.
  await page.addInitScript(() => {
    // Only seed on the first navigation — addInitScript runs on every
    // page load, so guard so a reload doesn't clobber the persisted
    // self-rating the test is about to add.
    if (localStorage.getItem("hse.performance.log.v1")) return;
    const seed = [
      {
        id: "seed-take",
        recordedAt: new Date().toISOString(),
        pathId: "autumn-leaves",
        pathTitle: "Autumn Leaves",
        tempo: 120,
        meter: "4/4",
        instrument: "Bright",
        personaId: "scriabin",
        durationSec: 12.5,
        // Guide-tone tally written by the classifier at record end
        transitionsHit: 3,
        transitionsMissed: 2,
      },
    ];
    localStorage.setItem("hse.performance.log.v1", JSON.stringify(seed));
  });

  await page.goto("/");
  await page.getByRole("heading", { name: /Choose a mastermind/ }).waitFor({ timeout: 10_000 });

  // The panel only mounts once a take exists — seeded above.
  const panel = page.getByRole("region", { name: "Recent takes" });
  await expect(panel).toBeVisible({ timeout: 5_000 });
  await expect(panel).toContainText("Autumn Leaves");
  // Tempo + meter + instrument summarized in the mono meta row.
  await expect(panel).toContainText("120 BPM");
  await expect(panel).toContainText("4/4");

  // The option-C tally rides on the take: 3/5 guide tones = 60%.
  await expect(panel).toContainText("3/5");
  await expect(panel.getByRole("progressbar", { name: "Guide-tone accuracy 60%" })).toBeVisible();

  // Rate the take 4/5 — the button flips to active and persists.
  const rate5 = panel.getByRole("radio", { name: /^5 — mastered$/ });
  await rate5.click();
  await expect(rate5).toHaveAttribute("aria-checked", "true");

  // The rating survives a reload (written back to localStorage).
  await page.reload();
  await expect(page.getByRole("region", { name: "Recent takes" })).toBeVisible({ timeout: 5_000 });
  await expect(
    page.getByRole("region", { name: "Recent takes" }).getByRole("radio", { name: /^5 — mastered$/ }),
  ).toHaveAttribute("aria-checked", "true");
});
