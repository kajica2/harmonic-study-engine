/**
 * e2e/count-in.spec.ts - PRD-001 Phase 3 Slice 3 (D44, T10).
 *
 * Serves the BUILT dist/ via the playwright.config webServer
 * (`npx serve dist -p 4173`). Run AFTER `npm run build`:
 *   npx playwright test e2e/count-in.spec.ts
 *
 * Why a browser leg at all: the count-in is a TIMING feature (the
 * pre-roll gate sequencing across three effects: requestPlayState,
 * useCountIn's interval, and the transport boot). jsdom cannot
 * assert "the countdown ran BEFORE the grid started" - the DOM-state
 * sequence here is the only end-to-end proof. Volume/preset/accents/
 * subdivision stay unit-covered (T1/T2/T6): audio OUTPUT is
 * untestable in CI and more legs would be theater (D44 honesty).
 *
 * Honest cost: +1 page load and ~4 s of real-time counting (1 bar x
 * 4 beats at the 60 BPM fresh-boot default) - ~25 s wall time.
 *
 * DISCRIMINATIVE: without the feature, pressing Start starts
 * playback immediately and NO overlay element ever exists in the DOM
 * (the suite fails at the overlay assertion, not at a timing edge).
 */
import { test, expect } from "@playwright/test";

// Page load (audio chunks) + the 4-beat pre-roll at 60 BPM + the
// playback settle + stop. Generous by design (real-time feature);
// the assertions themselves poll DOM state, not fixed sleeps.
test.setTimeout(60_000);

test("count-in pre-roll: overlay counts DOWN before playback, then releases into it", async ({
  page,
}) => {
  await page.goto("/");
  const header = page.getByRole("region", { name: "Practice loop" });
  await expect(header).toBeVisible({ timeout: 10_000 });

  // Arm a 1-bar count-in through the Click-settings popover (D36).
  await page.getByRole("button", { name: "Click settings" }).click();
  await page.getByRole("button", { name: "Count in 1 bar" }).click();
  await page.keyboard.press("Escape"); // popover closes on Escape

  // Fresh boot: idle, default path active. Press Start.
  const start = page.getByRole("button", { name: "Start practice" });
  await expect(start).toBeVisible();
  await start.click();

  // 1) THE DISCRIMINATOR: the overlay exists (absent pre-feature,
  //    where Start goes straight to playing with no overlay ever).
  const overlay = page.locator('[data-testid="countin-overlay"]');
  await expect(overlay).toBeVisible({ timeout: 2_000 });

  // 2) It shows a DECREASING beats-left number (1 bar x 4 beats at
  //    60 BPM: 4 -> 3 within ~1.2 s; generous 5 s poll).
  const first = Number(await overlay.getAttribute("data-beats-left"));
  expect(first).toBeGreaterThanOrEqual(2);
  await expect
    .poll(
      async () => Number(await overlay.getAttribute("data-beats-left")),
      { timeout: 5_000 },
    )
    .toBeLessThan(first);

  // 3) The pre-roll releases: overlay gone...
  await expect(overlay).toBeHidden({ timeout: 10_000 });

  // 4) ...and the transport is LIVE (the header shows Pause - the
  //    isPlayingAuto || countIn.active display prop is true because
  //    the GATE already released into real playback).
  const pause = page.getByRole("button", { name: "Pause practice" });
  await expect(pause).toBeVisible({ timeout: 5_000 });

  // Stop through the same gate (idempotent raw-stop path stays intact).
  await pause.click();
  await expect(start).toBeVisible({ timeout: 5_000 });
});
