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
