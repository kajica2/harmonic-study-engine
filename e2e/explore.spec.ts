/**
 * e2e/explore.spec.ts - PRD-001 Phase 5 (REQ-EXP-1/2/10/20/21/22, REQ-IDEA-3).
 *
 * ONE spec, 3 tests (served dist on :4173 - run AFTER `npm run build`):
 *
 * A. SEED->CARDS->COMPOSE: type "Dm7 G7 Cmaj7" -> 3+ cards, each with
 *    a technique chip + Hear button -> first Send-to-Compose lands a
 *    3-bar chart session (summary card + directives + textarea text
 *    match). Discriminative: break progressionToChartText (or the
 *    setComposeChart call) and the summary never appears.
 * B. HEAR: the D96 singleton state machine idle -> rendering ->
 *    playing -> idle via a MutationObserver on data-preview (audio
 *    OUTPUT is manual - S3 precedent; "rendering" is only entered by
 *    a real renderAccompaniment call). Discriminative: stub out
 *    hearIdeaCard and playing never arrives.
 * C. ETUDE-CARRY + TRUTH SPOT: seed "C F G C" (no chromatic
 *    candidates) -> zero tritone technique chips anywhere; first
 *    Send-to-Etude carries bars 4 (4 chords, vs the default 8) into
 *    the Etude constraint panel. Discriminative: break
 *    cardToEtudeConstraints and Bars stays 8.
 *
 * Existing compose/etude specs run UNCHANGED in the full-gates step
 * (leg 6 - no-op here by design).
 */

import { test, expect, type Page } from "@playwright/test";

test.setTimeout(90_000);

async function gotoExplore(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("tab", { name: "Explore mode (shortcut 3)" }).click();
  await expect(page.getByTestId("explore-seed")).toBeVisible({ timeout: 10_000 });
}

async function commitSeed(page: Page, text: string): Promise<void> {
  await page.getByTestId("seed-input").fill(text);
  await page.getByTestId("seed-input").press("Enter");
  await expect(page.getByTestId("explore-cards")).toBeVisible({ timeout: 10_000 });
}

test("explore seed -> cards -> send-to-compose lands a 3-bar chart (REQ-EXP-1/20, D97)", async ({
  page,
}) => {
  await gotoExplore(page);
  await commitSeed(page, "Dm7 G7 Cmaj7");

  // LEG 1: 3+ cards, each with a technique chip + Hear button.
  const cards = page.getByTestId(/^idea-card-/);
  await expect(cards).not.toHaveCount(0);
  expect(await cards.count()).toBeGreaterThanOrEqual(3);
  const chips = page.getByTestId(/^idea-technique-/);
  expect(await chips.count()).toBeGreaterThanOrEqual(3);
  const hearButtons = page.getByTestId(/^hear-/);
  expect(await hearButtons.count()).toBeGreaterThanOrEqual(3);

  // LEG 2: first Send-to-Compose -> chart summary on the Compose surface.
  await page.getByTestId(/^send-compose-/).first().click();
  await expect(page.getByTestId("chart-summary-card")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId("chart-directives")).toContainText("3 bars");
  // The symbols really landed: Edit-chart round trip shows 3 tokens.
  await page.getByTestId("chart-edit-button").click();
  const text = await page.getByTestId("chart-textarea").inputValue();
  const tokens = text.replace(/\{[^}]*\}/g, " ").split(/\s+/).filter((t) => t !== "");
  expect(tokens).toHaveLength(3);
});

test("explore Hear runs the preview state machine (REQ-EXP-21, D96)", async ({
  page,
}) => {
  await gotoExplore(page);
  await commitSeed(page, "Dm7 G7 Cmaj7");

  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid^="hear-"]');
    const holder = window as unknown as { __hearStates?: string[] };
    holder.__hearStates = [];
    if (btn !== null) {
      const obs = new MutationObserver(() => {
        holder.__hearStates?.push(btn.getAttribute("data-preview") ?? "?");
      });
      obs.observe(btn, { attributes: true, attributeFilter: ["data-preview"] });
    }
  });
  const hear = page.getByTestId(/^hear-/).first();
  await expect(hear).toHaveAttribute("data-preview", "idle");
  await hear.click();
  await expect(hear).toHaveAttribute("data-preview", "playing", {
    timeout: 15_000,
  });
  await hear.click(); // Stop
  await expect(hear).toHaveAttribute("data-preview", "idle", {
    timeout: 5_000,
  });
  const states = await page.evaluate(
    () => (window as unknown as { __hearStates?: string[] }).__hearStates ?? [],
  );
  expect(states).toContain("rendering");
  expect(states).toContain("playing");
  expect(states[states.length - 1]).toBe("idle");
});

test("explore truth spot + send-to-etude carries bars (REQ-EXP-22, D97b/D99)", async ({
  page,
}) => {
  await gotoExplore(page);
  await commitSeed(page, "C F G C");

  // LEG 5 (truth spot): diatonic seed, no chromatic candidates anywhere
  // -> zero tritone-sub technique chips in the DOM.
  await expect(
    page.getByTestId(/^idea-technique-/).filter({ hasText: "tritone" }),
  ).toHaveCount(0);

  // LEG 4: first Send-to-Etude -> carried bars land in the panel.
  await page.getByTestId(/^send-etude-/).first().click();
  await expect(page.getByText("Etude Composer")).toBeVisible({ timeout: 10_000 });
  // 4 chords clamp to 4 bars (vs the default 8 - the discriminative delta).
  await expect(page.locator('input[aria-label="Bars"]')).toHaveValue("4");
  await expect(page.locator('select[aria-label="Etude key"]')).toHaveValue("C");
});
