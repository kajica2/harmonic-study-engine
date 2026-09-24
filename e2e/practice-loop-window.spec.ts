/**
 * e2e/practice-loop-window.spec.ts - PRD-001 Phase 7 Slice 1 (F3, D110).
 *
 * THE F3 REGRESSION LEG - the release gate for the whole phase
 * (docs/PHASE-7-PRACTICE.md section 7). Written RED-FIRST: it fails
 * against the legacy 4-steps-per-bar window math and only goes green
 * when the form-relative 1:1 windows (D110) land.
 *
 * Serves the BUILT dist/ via the playwright.config webServer
 * (`npx serve dist -p 4173`). Run AFTER `npm run build`:
 *   npx playwright test e2e/practice-loop-window.spec.ts
 *
 * The bug (forensics 1.1): selecting "bars 5-8" in the rail set
 * loopStartBar=4 / loopEndBar=7 (strip-cell indices); the handler
 * turned them into steps 16..31 via *4 - so a 4-bar selection played
 * 16 bars of audio. The fix: 1 path step = 1 bar of audio (identity
 * map within the first form pass), bars are form-relative.
 *
 * Discriminative design (TD-CI-E2E-FLAKE-aware, per the doc):
 *   - Tempo 240 BPM compresses one bar to ~1 s (4/4: 16 x 62.5 ms).
 *   - Poll DOM state (the rail Position line), generous windows,
 *     NO exact-frame asserts. The 6 s wrap budget vs the 4 s cycle
 *     leaves ~2 s slack; the legacy math needs ~16 s per cycle and
 *     CANNOT pass.
 *   - The Start anchor: we wait for the FIRST "Bar 5" sighting after
 *     Play before starting the wrap budget, so audio-chunk boot
 *     latency is absorbed outside the timed window.
 *   - Second assertion: strip cell count == formLen (the boot path
 *     is a 16-bar form padded to 96 steps: legacy shows 24 cells,
 *     honest transport shows 16).
 *   - Third test (fix-round GAP c): strip cell LABELS are the true
 *     1:1 chords (cell 2 = steps[1].name, not steps[4].name) and the
 *     highlight reaches Bar 2 after one bar of slow transport -
 *     killing the stepIdx=barIdx*4 regression class on the mapping.
 *
 * Path + formLen are DERIVED from source (TD-033e precedent: the
 * e2e runner transpiles the pure-data import, so a data rename or
 * re-pad flows into this spec automatically).
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { ALL_PATHS } from "../src/lib/paths";
import { detectFormPeriod } from "../src/lib/formPeriod";

// Boot + audio-chunk load + one 16-bar legacy cycle (~16 s) + margin.
test.setTimeout(120_000);

/** ALL_PATHS[0] - the active path on a fresh boot (index 0). */
const BOOT_PATH = ALL_PATHS[0];
/** The repeating form length (16 for the curated 16-bar path-1). */
const FORM_LEN = detectFormPeriod(BOOT_PATH.steps);
/** The selection under test: form bars 5..8 (4 bars, 0-based 4..7). */
const LOOP_FROM = 5;
const LOOP_TO = 8;

/** The rail Position line ("Bar 5 / 16" post-fix; legacy appends a
 *  " -- Step N / M" segment - the regex matches BOTH shapes). */
function positionLine(page: Page): Locator {
  return page.locator("span").filter({ hasText: /^Bar \d+ \/ \d+/ }).first();
}

/** The rail's transport Stop (title-pinned; the page has a second
 *  "Stop preview playback" button in the inspect panel). */
function railStop(page: Page): Locator {
  return page.locator('button[title="Stop playback and rewind to step 1"]');
}

/** Parse the bar number out of the Position line, or null. */
async function currentBar(page: Page): Promise<number | null> {
  const text = await positionLine(page)
    .innerText()
    .catch(() => "");
  const m = /^Bar (\d+) \/ (\d+)/.exec(text.trim());
  return m ? Number(m[1]) : null;
}

test("F3: a 4-bar section loop plays 4 bars, not 16 (wrap timing)", async ({
  page,
}) => {
  await page.goto("/");
  const play = page.getByRole("button", { name: "Play path" });
  await expect(play).toBeVisible({ timeout: 15_000 });

  // 240 BPM -> one 4/4 bar per second (the doc's compression trick).
  // Scoped to the header's Practice-loop region: the page carries
  // several Tempo-named controls, so a bare label query is ambiguous.
  await page
    .getByRole("region", { name: "Practice loop" })
    .getByRole("slider", { name: "Tempo" })
    .fill("240");

  // Arm the section loop via shift-click on strip cells "Bar 5" then
  // "Bar 8" (isLooping is ON by default - the fresh-boot default).
  await page
    .locator('button[title^="Bar 5 "]')
    .first()
    .click({ modifiers: ["Shift"] });
  await page
    .locator('button[title^="Bar 8 "]')
    .first()
    .click({ modifiers: ["Shift"] });

  // Rewind to the top so the cycle is measured from the loop START
  // (the shift-click itself parks the cursor at the second cell).
  await railStop(page).click();

  await play.click();

  // Anchor: the first fire must land on the loop start bar. Generous
  // 10 s (absorbs boot); true in BOTH worlds - not the discriminator.
  await expect
    .poll(() => currentBar(page), { timeout: 10_000 })
    .toBe(LOOP_FROM);

  // THE DISCRIMINATOR: within 6 s the playhead must traverse bars
  // 5->6->7->8 and WRAP back to 5 (4 bars at ~1 s each). The legacy
  // *4 math loops steps 16..31 = 16 bars = ~16 s per cycle - it can
  // never complete this window. And while the loop is armed the
  // readout must NEVER show a bar outside 5..8.
  const deadline = Date.now() + 6_000;
  let sawEnd = false;
  let wrappedToStart = false;
  while (Date.now() < deadline && !wrappedToStart) {
    const bar = await currentBar(page);
    if (bar !== null) {
      expect
        .soft(
          bar >= LOOP_FROM && bar <= LOOP_TO,
          `loop window escaped: saw Bar ${bar} (expected bars ${LOOP_FROM}-${LOOP_TO})`,
        )
        .toBe(true);
      if (bar === LOOP_TO) sawEnd = true;
      else if (sawEnd && bar === LOOP_FROM) wrappedToStart = true;
    }
    await page.waitForTimeout(120);
  }
  expect(
    wrappedToStart,
    "a 4-bar selection must complete a full 5->8->5 pass within 6 s at " +
      "240 BPM; the legacy 4-steps-per-bar loop math plays 16 bars (~16 s) " +
      "and cannot pass this window (F3, D110)",
  ).toBe(true);

  // Stop while we still can (soft asserts above may have failed the
  // test - the cleanup is best-effort).
  await railStop(page).click();
});

test("F3: the bar strip shows TRUE form bars (cell count == formLen)", async ({
  page,
}) => {
  await page.goto("/");
  const play = page.getByRole("button", { name: "Play path" });
  await expect(play).toBeVisible({ timeout: 15_000 });

  // The boot path is a FORM_LEN-bar form padded to
  // BOOT_PATH.steps.length steps. Honest transport renders ONE cell
  // per FORM bar (FORM_LEN); the legacy ceil(steps/4) model renders
  // steps/4 cells (24 for a 96-step padded path) - the 24->32-class
  // display lie this slice fixes.
  const cells = page.locator('button[title^="Bar "]');
  await expect(cells).toHaveCount(FORM_LEN);

  // The Position line total must agree with the strip, and the
  // legacy " -- Step N / M" segment must be gone (blast-table #4).
  await expect(positionLine(page)).toHaveText(`Bar 1 / ${FORM_LEN}`);
});

/** The strip cell for 1-based form bar N (title-pinned; the trailing
 *  space separates "Bar 1 " from "Bar 15 "). */
function stripCell(page: Page, bar: number): Locator {
  return page.locator(`button[title^="Bar ${bar} "]`).first();
}

/** 1-based form bar of the ACTIVE strip cell (the "· here" marker
 *  rendered only when isActiveBar), or null when nothing is active. */
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

test("F3: strip cells carry TRUE chord labels (kills stepIdx=barIdx*4)", async ({
  page,
}) => {
  await page.goto("/");
  const play = page.getByRole("button", { name: "Play path" });
  await expect(play).toBeVisible({ timeout: 15_000 });

  // Labels are DERIVED from the same source the strip reads
  // (TD-033e precedent): honest 1:1 maps cell N (1-based) to
  // BOOT_PATH.steps[N-1].name. The legacy "* 4" map would show
  // steps[4].name on cell 2 - a different chord on path-1.
  const NAME_1 = BOOT_PATH.steps[0].name;
  const NAME_2 = BOOT_PATH.steps[1].name;
  expect(
    NAME_1,
    "this pin needs steps[0].name != steps[1].name to discriminate " +
      "the 1:1 map from barIdx*4 (path-1 is Dm7/G7 by curation)",
  ).not.toBe(NAME_2);

  // Static leg: no playback needed - the mapping itself.
  await expect(stripCell(page, 1)).toContainText(NAME_1);
  await expect(stripCell(page, 2)).toContainText(NAME_2);

  // Live leg: one bar of transport must move the highlight to cell 1
  // (Bar 2) - and cell 1's label must still be steps[1].name there.
  // 60 BPM keeps each bar window ~4 s wide; the poll absorbs boot +
  // count-in + first-fire latency with a 30 s budget (TD-CI-E2E-FLAKE
  // shape: poll-based, generous, NO exact-frame asserts).
  await page
    .getByRole("region", { name: "Practice loop" })
    .getByRole("slider", { name: "Tempo" })
    .fill("60");
  await play.click();

  await expect
    .poll(() => activeCellBar(page), { timeout: 30_000, intervals: [150] })
    .toBe(2);
  await expect(stripCell(page, 2)).toContainText(NAME_2);

  await railStop(page).click();
});
