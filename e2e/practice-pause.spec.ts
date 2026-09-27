/**
 * e2e/practice-pause.spec.ts - PRD-001 Phase 7 S2 (D122/D128), leg 1.
 *
 * Pause mode: play N bars, rest M bars over the form. THE DRILL IS
 * RESTING IN TIME: the transport never stops during a rest - the
 * playhead keeps moving, the click keeps running (REQ-PRAC-3; the
 * rhythm.ts zero-diff is the STRUCTURAL proof, not the DOM - this leg
 * asserts the toggle stays engaged and playback never halts).
 *
 * TD-CI-E2E-FLAKE discipline (S1 precedent): 240 BPM compression
 * (~1 s per 4/4 bar), POLL asserts, generous budgets, NO exact-frame
 * asserts. N=2 M=2 -> a 4 s cycle; the 12 s budget sees ~3 cycles.
 *
 * Discriminative: the legacy app has NO mechanics gear, NO
 * data-phase attribute and NO rest behavior at all.
 */
import { test, expect, type Page, type Locator } from "@playwright/test";

test.setTimeout(120_000);

/** The rail Position line ("Bar N / M"). */
function positionLine(page: Page): Locator {
  return page.locator("span").filter({ hasText: /^Bar \d+ \/ \d+/ }).first();
}

/** The rail's transport Stop (title-pinned; S1 precedent). */
function railStop(page: Page): Locator {
  return page.locator('button[title="Stop playback and rewind to step 1"]');
}

async function currentBar(page: Page): Promise<number | null> {
  const text = await positionLine(page)
    .innerText()
    .catch(() => "");
  const m = /^Bar (\d+) \/ (\d+)/.exec(text.trim());
  return m ? Number(m[1]) : null;
}

test("S2 pause: duty cycle over the form; transport + click keep running through rests", async ({
  page,
}) => {
  await page.goto("/");
  const play = page.getByRole("button", { name: "Play path" });
  await expect(play).toBeVisible({ timeout: 15_000 });

  // Arm the click BEFORE play: the structural REQ-PRAC-3 leg asserts
  // the toggle STAYS engaged through rests (rhythm.ts is byte-frozen -
  // the click path cannot be gated by S2; the DOM leg here proves the
  // toggle never disengages and playback never halts).
  const metronome = page.getByTestId("metronome-toggle");
  await metronome.click();
  await expect(metronome).toHaveAttribute("aria-pressed", "true");

  // Drills popover (D36 pattern): open, mode Pause, N=2 M=2, close.
  await page.getByTestId("mechanics-settings-toggle").click();
  const panel = page.getByTestId("mechanics-panel");
  await expect(panel).toBeVisible();
  await panel.getByTestId("mech-mode-pause").click();
  await panel.getByTestId("mech-pause-play").fill("2");
  await panel.getByTestId("mech-pause-rest").fill("2");
  await page.keyboard.press("Escape"); // pre-play Escape is a no-op stop

  // 240 BPM -> one 4/4 bar per second.
  await page
    .getByRole("region", { name: "Practice loop" })
    .getByRole("slider", { name: "Tempo" })
    .fill("240");

  const strip = page.getByTestId("rail-strip");
  await expect(strip).toHaveAttribute("data-phase", "play");

  await play.click();

  // (a) data-phase shows BOTH "rest" and "play" at least twice each;
  // (b) while data-phase="rest", the Position bar ADVANCES (transport
  // honesty); (c) the metronome toggle stays engaged + playback never
  // halts (bar count traverses past a full N+M cycle). The sample loop
  // keeps running until ALL FOUR accumulations hold (fix round: the
  // first draft exited once a/b were satisfied, starving (c)).
  let playSamples = 0;
  let restSamples = 0;
  let restBarFirst: number | null = null;
  let restBarAdvanced = false;
  const distinctBars = new Set<number>();
  const deadline = Date.now() + 12_000;
  while (
    Date.now() < deadline &&
    !(
      playSamples >= 2 &&
      restSamples >= 2 &&
      restBarAdvanced &&
      distinctBars.size >= 5
    )
  ) {
    const phase = await strip.getAttribute("data-phase").catch(() => null);
    const bar = await currentBar(page);
    if (bar !== null) distinctBars.add(bar);
    if (phase === "play") {
      playSamples++;
    } else if (phase === "rest") {
      restSamples++;
      if (bar !== null) {
        if (restBarFirst === null) restBarFirst = bar;
        else if (bar !== restBarFirst) restBarAdvanced = true;
      }
    }
    await page.waitForTimeout(100);
  }

  await railStop(page).click();

  expect(
    playSamples,
    "pause mode must show data-phase=play samples (S2, D122)",
  ).toBeGreaterThanOrEqual(2);
  expect(
    restSamples,
    "pause mode must show data-phase=rest samples (S2, D122)",
  ).toBeGreaterThanOrEqual(2);
  expect(
    restBarAdvanced,
    "the Position bar must ADVANCE while data-phase=rest - the drill " +
      "rests IN TIME, the transport never stops (REQ-PRAC-3, D122)",
  ).toBe(true);
  expect(
    distinctBars.size,
    "playback must traverse past a full N+M=4 cycle within 12 s at 240 BPM",
  ).toBeGreaterThanOrEqual(5);
  await expect(metronome).toHaveAttribute("aria-pressed", "true");
});
