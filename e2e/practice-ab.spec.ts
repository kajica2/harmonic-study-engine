/**
 * e2e/practice-ab.spec.ts - PRD-001 Phase 7 S2 (D122/D127), leg 2.
 *
 * A/B compare: capture TWO windows from the rail selection (Capture
 * A / Capture B snapshot loopStartBar/loopEndBar - no new rail
 * gesture), alternate every swapBars bars. The active slot is visible
 * as TEXT/ATTRIBUTES only (data-window on the container + per-cell
 * data-window + corner letter glyphs - never color-only, PRD 9.8).
 *
 * Discriminative: the legacy app has NO data-window attribute AT ALL;
 * the static presence check alone fails the old build.
 *
 * Sequence math (swapBars=2, A=bars 5-8, B=bars 9-12, cursor parked on
 * bar 5 by a plain click before Play): bars play 5,6 (A) -> 9,10 (B)
 * -> 5,6 (A) -> ... The scheduler JUMPS to the new window head on
 * every slot change (bar-aligned, inside the handler - D122).
 */
import { test, expect, type Page, type Locator } from "@playwright/test";

test.setTimeout(120_000);

function railStop(page: Page): Locator {
  return page.locator('button[title="Stop playback and rewind to step 1"]');
}

/** 1-based form bar of the ACTIVE strip cell ("· here" marker), or null. */
async function activeCellBar(page: Page): Promise<number | null> {
  const title = await page
    .locator('button[title^="Bar "]')
    .filter({ hasText: "· here" })
    .first()
    .getAttribute("title")
    .catch(() => null);
  const m = /^Bar (\d+) /.exec(title ?? "");
  return m ? Number(m[1]) : null;
}

test("S2 A/B: capture two windows, alternate every 2 bars, slot visible via data attrs", async ({
  page,
}) => {
  await page.goto("/");
  const play = page.getByRole("button", { name: "Play path" });
  await expect(play).toBeVisible({ timeout: 15_000 });

  await page
    .getByRole("region", { name: "Practice loop" })
    .getByRole("slider", { name: "Tempo" })
    .fill("240");

  // --- A: shift-click bars 5..8, Capture A --------------------------
  await page.locator('button[title^="Bar 5 "]').first().click({ modifiers: ["Shift"] });
  await page.locator('button[title^="Bar 8 "]').first().click({ modifiers: ["Shift"] });
  await page.getByTestId("mechanics-settings-toggle").click();
  const panel = page.getByTestId("mechanics-panel");
  await expect(panel).toBeVisible();
  await panel.getByTestId("mech-capture-a").click();
  await expect(panel.getByTestId("mech-window-a")).toHaveText("A: bars 5-8");

  // --- B: shift-click bars 9..12 (outside click closes the popover),
  // reopen, Capture B -------------------------------------------------
  await page.locator('button[title^="Bar 9 "]').first().click({ modifiers: ["Shift"] });
  await page.locator('button[title^="Bar 12 "]').first().click({ modifiers: ["Shift"] });
  await page.getByTestId("mechanics-settings-toggle").click();
  await panel.getByTestId("mech-capture-b").click();
  await expect(panel.getByTestId("mech-window-b")).toHaveText("B: bars 9-12");

  await panel.getByTestId("mech-swap-bars").fill("2");
  await panel.getByTestId("mech-mode-ab").click();
  await page.keyboard.press("Escape");

  // Static leg (discriminative vs the legacy app): the cells carry
  // data-window attrs - A cells 5..8, B cells 9..12.
  await expect(page.locator('button[data-window="a"]').first()).toBeVisible();
  await expect(page.locator('button[data-window="b"]').first()).toBeVisible();

  // Park the cursor at the A head so segment 1 is deterministic.
  await page.locator('button[title^="Bar 5 "]').first().click();

  const strip = page.getByTestId("rail-strip");
  await play.click();

  // First segment: the active cell stays within 5..8 (slot A)...
  await expect
    .poll(async () => {
      const b = await activeCellBar(page);
      return b !== null && b >= 5 && b <= 8;
    }, { timeout: 10_000, message: "first segment must play inside window A (bars 5-8)" })
    .toBe(true);
  await expect
    .poll(() => strip.getAttribute("data-window"), { timeout: 10_000 })
    .toBe("a");

  // ...then swaps into 9..12 (slot B) - poll, generous, no exact frame.
  await expect
    .poll(async () => {
      const b = await activeCellBar(page);
      return b !== null && b >= 9 && b <= 12;
    }, { timeout: 12_000, message: "the transport must jump into window B (bars 9-12)" })
    .toBe(true);
  await expect
    .poll(() => strip.getAttribute("data-window"), { timeout: 12_000 })
    .toBe("b");

  // Sweep: for the remainder of one cycle the playhead never escapes
  // the union of the two windows (soft - timing is compressed, not
  // frame-exact).
  for (let i = 0; i < 30; i++) {
    const b = await activeCellBar(page);
    if (b !== null) {
      expect
        .soft(b >= 5 && b <= 12, `A/B escaped: saw Bar ${b}`)
        .toBe(true);
    }
    await page.waitForTimeout(100);
  }

  await railStop(page).click();
});
