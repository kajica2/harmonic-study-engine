/**
 * e2e/ear-training.spec.ts - PRD-001 Phase 6 (REQ-PED-20/25, REQ-PED-12/13).
 *
 * ONE spec, 2 tests (served dist on :4173 - run AFTER `npm run build`):
 *
 * A. EAR FLOW: Etude surface -> Ear training section -> Generate
 *    (interval) -> 4 options visible -> click correct -> feedback
 *    "Correct" + streak line + SRS entry in localStorage pedagogy.srs
 *    for the prompt conceptId (NODE-side read). Discriminative: break
 *    generateEarPrompt (or the grade wiring) and feedback never shows.
 * B. DRAWER-OPEN: submit WRONG -> concept offer visible -> click ->
 *    ConceptDrawer with the offered title visible -> header
 *    ConceptSearch type "cad" -> suggestion -> open -> drawer switches
 *    (key-prop). Discriminative: break the failure-concept offer (or
 *    the header search host) and the drawer never switches.
 *
 * Existing 7 e2e specs run UNCHANGED in the full-gates step.
 */

import { test, expect, type Page } from "@playwright/test";

test.setTimeout(90_000);

async function gotoEtudeEar(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("ear-section")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("ear-generate")).toBeVisible({ timeout: 10_000 });
}

test("ear flow: generate interval -> correct -> feedback + streak + SRS (REQ-PED-20/25)", async ({
  page,
}) => {
  await gotoEtudeEar(page);
  await page.getByTestId("ear-generate").click();
  await expect(page.getByTestId("ear-prompt")).toBeVisible({ timeout: 10_000 });

  // 4 options visible (multiple-choice interval type default).
  for (let i = 0; i < 4; i++) {
    await expect(page.getByTestId(`ear-option-${i}`)).toBeVisible();
  }

  // Read the 4 option texts NODE-side, compute the correct one via the
  // exposed prompt? The panel does not expose the answer; instead try
  // each option until feedback says Correct (max 4 clicks, deterministic
  // leg still discriminative: a broken grader never says Correct).
  let found = false;
  for (let i = 0; i < 4; i++) {
    await page.getByTestId(`ear-option-${i}`).click();
    const feedback = page.getByTestId("ear-feedback");
    await expect(feedback).toBeVisible({ timeout: 5_000 });
    const text = (await feedback.textContent()) ?? "";
    if (text.includes("Correct")) {
      found = true;
      break;
    }
  }
  expect(found).toBe(true);

  // Streak line shows the honesty string (accuracy-% + streak, no XP).
  await expect(page.getByTestId("ear-streak")).toContainText("correct");
  await expect(page.getByTestId("ear-streak")).toContainText("streak");

  // SRS entry landed in localStorage pedagogy.srs (NODE-side read).
  const srsRaw = await page.evaluate(() => localStorage.getItem("pedagogy.srs") ?? "");
  expect(srsRaw).not.toBe("");
  expect(srsRaw).toContain("voice-leading");
  const logRaw = await page.evaluate(() => localStorage.getItem("pedagogy.log") ?? "");
  expect(logRaw).toContain("ear");
});

test("drawer-open: wrong answer -> concept offer -> header search switches drawer (REQ-PED-12/25)", async ({
  page,
}) => {
  await gotoEtudeEar(page);
  await page.getByTestId("ear-generate").click();
  await expect(page.getByTestId("ear-prompt")).toBeVisible({ timeout: 10_000 });

  // Submit WRONG answers until the concept offer appears (at most 4).
  let offered = false;
  for (let i = 0; i < 4; i++) {
    await page.getByTestId(`ear-option-${i}`).click();
    const offer = page.getByTestId("ear-concept-offer");
    if ((await offer.count()) > 0) {
      offered = true;
      break;
    }
  }
  expect(offered).toBe(true);
  await page.getByTestId("ear-concept-offer").click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });

  // Header ConceptSearch: type "cad" -> open -> drawer switches to Cadences.
  // Two hosts can co-render (local failure-offer + App global); assert the
  // GLOBAL host opened by filtering on its accessible name (key-prop switch).
  await page.getByTestId("concept-search").fill("cad");
  await page.getByTestId("concept-search").press("Enter");
  await expect(page.getByRole("dialog", { name: "Cadences" })).toBeVisible({ timeout: 5_000 });
});
