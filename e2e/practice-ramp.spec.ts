/**
 * e2e/practice-ramp.spec.ts - PRD-001 Phase 7 S2 (D121/D124), leg 3.
 *
 * THE ANTI-FLAKE ANCHOR: both tests are CLICK-DETERMINISTIC with NO
 * PLAYBACK. The ramp ladder is a pure state machine driven by Made it /
 * Missed it clicks (each click IS one rep outcome - D121); the chip is
 * a role=status mirror. No transport, no audio, no timing budgets -
 * the only async is React's microtask mirror flush, absorbed by
 * expect.poll.
 *
 * Test 1: the exact ladder (90 -> 102, step 6, reps 2, threshold 2):
 *   Made x2 -> 96; Missed x2 -> 90; Made x2 -> 96; Made x2 -> 102 ->
 *   TARGET (REQ-PRAC-33 visible state; session marking is S3).
 * Test 2: reseed (D124.5) - with the ramp engaged, moving the tempo
 *   slider RESEEDS the ladder to the user's tempo and resets reps;
 *   then two ramp clicks climb 120 -> 124 with the streak at S2/F0 -
 *   the text pin proves the echo guard is intact (a broken equality
 *   check would reseed on the ramp's own write -> S0/F0).
 */
import { test, expect, type Page } from "@playwright/test";

test.setTimeout(60_000);

async function openDrills(page: Page) {
  await page.goto("/");
  const gear = page.getByTestId("mechanics-settings-toggle");
  await expect(gear).toBeVisible({ timeout: 15_000 });
  await gear.click();
  const panel = page.getByTestId("mechanics-panel");
  await expect(panel).toBeVisible();
  return panel;
}

test("S2 ramp: Made/Missed clicks drive the ladder to TARGET (no playback)", async ({
  page,
}) => {
  const panel = await openDrills(page);
  const chip = page.getByTestId("ramp-chip");

  // Engage + configure 90 -> 102 (+6), reps 2, threshold 2.
  await panel.getByTestId("mech-ramp-enabled").check();
  await panel.getByTestId("mech-ramp-start").fill("90");
  await panel.getByTestId("mech-ramp-target").fill("102");
  await panel.getByTestId("mech-ramp-step").fill("6");
  await panel.getByTestId("mech-ramp-reps").fill("2");
  await panel.getByTestId("mech-ramp-threshold").fill("2");

  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("data-bpm", "90");
  await expect(chip).toContainText("RAMP 90 -> 102 (+6)");

  // Made it x2 -> 96 (repsPerStep reached).
  await panel.getByTestId("mech-made-it").click();
  await panel.getByTestId("mech-made-it").click();
  await expect
    .poll(() => chip.getAttribute("data-bpm"), { timeout: 5_000 })
    .toBe("96");

  // Missed it x2 -> back to 90 (failThreshold reached, CONSECUTIVE).
  await panel.getByTestId("mech-missed-it").click();
  await panel.getByTestId("mech-missed-it").click();
  await expect
    .poll(() => chip.getAttribute("data-bpm"), { timeout: 5_000 })
    .toBe("90");

  // Made it x2 -> 96; Made it x2 more -> 102 -> TARGET (REQ-PRAC-33).
  await panel.getByTestId("mech-made-it").click();
  await panel.getByTestId("mech-made-it").click();
  await expect
    .poll(() => chip.getAttribute("data-bpm"), { timeout: 5_000 })
    .toBe("96");
  await panel.getByTestId("mech-made-it").click();
  await panel.getByTestId("mech-made-it").click();
  await expect
    .poll(() => chip.getAttribute("data-bpm"), { timeout: 5_000 })
    .toBe("102");
  await expect(chip).toHaveAttribute("data-phase", "complete");
  await expect(chip).toContainText("TARGET");

  // Reset returns the ladder to the floor (the panel Reset button).
  await panel.getByTestId("mech-ramp-reset").click();
  await expect
    .poll(() => chip.getAttribute("data-bpm"), { timeout: 5_000 })
    .toBe("90");
  await expect(chip).toHaveAttribute("data-phase", "climb");
});

test("S2 ramp reseed: manual tempo takeover reseeds the ladder, reps reset (D124.5)", async ({
  page,
}) => {
  const panel = await openDrills(page);
  const chip = page.getByTestId("ramp-chip");

  // Engage with the DEFAULT ladder (90 -> 150, step 4, reps 2).
  await panel.getByTestId("mech-ramp-enabled").check();
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("data-bpm", "90");

  // Count one rep so the reset is observable.
  await panel.getByTestId("mech-made-it").click();
  await expect(chip).toContainText("rep 1/2");

  // Manual takeover via the header tempo slider (the slider-equivalent
  // path, D124): the ladder RESEEDS to the user's tempo, reps reset,
  // phase back to climb. No playback involved.
  await page
    .getByRole("region", { name: "Practice loop" })
    .getByRole("slider", { name: "Tempo" })
    .fill("120");
  await expect
    .poll(() => chip.getAttribute("data-bpm"), { timeout: 5_000 })
    .toBe("120");
  await expect(chip).toContainText("rep 0/2");
  await expect(chip).toHaveAttribute("data-phase", "climb");

  // The echo loop stays broken: ramp-owned writes never reseed (the
  // equality guard) - after a ramp click the chip tracks the ladder,
  // not a reseed bounce. S2 fix-round (MED-2): the OLD pin polled
  // "120" and passed vacuously on stale DOM; the two clicks CLIMB to
  // 124, and the S2/F0 TEXT is what makes this leg discriminative -
  // a broken equality guard would reseed on the ramp's own
  // setTempo(124): data-bpm still reads 124 but the streaks reset to
  // S0/F0 (law 5), so the text pin fails.
  await panel.getByTestId("mech-made-it").click();
  await panel.getByTestId("mech-made-it").click();
  await expect
    .poll(() => chip.getAttribute("data-bpm"), { timeout: 5_000 })
    .toBe("124");
  await expect(chip).toContainText("S2/F0");
});
