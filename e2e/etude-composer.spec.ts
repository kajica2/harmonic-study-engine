/**
 * e2e/etude-composer.spec.ts - PRD-001 Phase 3 Slice 2 FIX ROUND
 * (REVIEWER D5 CONDITION: browser smoke for the composer flow).
 *
 * Serves the BUILT dist/ via the playwright.config webServer
 * (`npx serve dist -p 4173`). Run AFTER `npm run build`:
 *   npx playwright test e2e/etude-composer.spec.ts
 *
 * Test 1 (same-context journey, the reviewer's checklist): Etude
 * surface -> composer panel -> style=pop / bars=8 -> Generate -> path
 * ACTIVE + transport playing (DOM state, not audio) -> piano-roll
 * highlight crosses the WHOLE 8-bar form (fix 3: the legacy
 * floor(step/4) mapping advances the bar 4x slower - ~28 measures
 * vs ~7 to reach the last column - and then DROPS the highlight
 * entirely for the final two thirds of every loop) -> the debounced
 * single writer lands the etude params in the URL -> reload restores
 * the same etude title/seed WITHOUT dirtying -> Compose and back
 * preserves the committed draft.
 *
 * Test 2 (HIGH-001 guard): deep-link the SAME generated URL in a
 * FRESH context (empty localStorage): the boot restore must PREPEND
 * the etude path WITHOUT ACTIVATING it - the first built-in path
 * stays active (identity preserved via the +1 index shift) and the
 * piano roll (gated on the ACTIVE path being the etude) stays
 * absent.
 */
import { test, expect, type Page } from "@playwright/test";

// The fix-3 highlight guard waits for the roll to cross the full
// 8-bar form at real-time playback (~1 measure/bar). 90s covers the
// audio-chunk load + form traversal; the 45s poll below stays
// discriminative against the legacy 4x-slower mapping (needs ~28
// measures, i.e. 60s+).
test.setTimeout(90_000);

/** ALL_PATHS[0] - the active path on a fresh boot (index 0). */
const FIRST_PATH_TITLE = "Path I: The Resolution (II-V-I)";
/** 8-bar form: the LAST roll column's x (EtudePianoRoll: bar * 8 slots * 10px). */
const LAST_BAR_X = 7 * 8 * 10;

async function generatePop8(page: Page): Promise<string> {
  await page.goto("/");
  await expect(page.getByText("Choose a mastermind")).toBeVisible({
    timeout: 10_000,
  });

  // Pin the Etude mode explicitly (it is also the first-run default).
  // The mode selector renders as role=tab (tablist "Mode").
  await page.getByRole("tab", { name: "Etude mode (shortcut 2)" }).click();
  await expect(page.getByText("Etude Composer")).toBeVisible({ timeout: 5_000 });

  await page.locator('select[aria-label="Etude style"]').selectOption("pop");
  await page.locator('input[aria-label="Bars"]').fill("8");
  await page.getByRole("button", { name: "Generate etude" }).click();

  // ACTIVE-path gate: the roll renders ONLY while the active path is
  // the loaded etude -> its presence IS the "path became active" pin.
  await expect(page.locator('[data-testid="etude-piano-roll"]')).toBeVisible({
    timeout: 5_000,
  });
  const status = page.locator("#etude-composer-status");
  await expect(status).toContainText("Loaded:", { timeout: 5_000 });
  return (await status.innerText()).trim();
}

async function waitForEtudeUrl(page: Page): Promise<string> {
  await expect.poll(() => page.url(), { timeout: 5_000 }).toMatch(/seed=\d+/);
  return page.url();
}

test("composer journey: generate -> active + playing -> highlight crosses the form -> reload restores clean", async ({
  page,
}) => {
  const loadedBefore = await generatePop8(page);

  // Capture the resting highlight BEFORE the transport runs (step 0
  // -> x=0), so the later "it really moved" assertion is unambiguous.
  const bar = page.locator(".etu-roll-active-bar");
  await expect(bar).toBeVisible({ timeout: 5_000 });
  const x0 = await bar.getAttribute("x");

  // Transport: assert DOM state (Start <-> Pause swap), not audio.
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.getByRole("button", { name: "Pause practice" })).toBeVisible({
    timeout: 10_000,
  });

  // FIX-3 GUARD in a real browser: the highlight advances column by
  // column ALL THE WAY to the last bar of the 8-bar form (x=560).
  // Pacing: rhythmEngine fires onMeasureStart ONCE PER MEASURE and
  // the App handler advances one step per fire, so the fixed mapping
  // (step % bars, one step per bar) crosses the form in ~7 measures
  // (~15-25s with the audio-chunk load + first-measure wait). The
  // legacy floor(step/4) mapping would need ~28-31 measures (~60-90s)
  // to reach x=560 - so 45s keeps this assertion DISCRIMINATIVE
  // against the bug while tolerating CI jitter.
  await expect
    .poll(async () => await bar.getAttribute("x"), { timeout: 45_000 })
    .toBe(String(LAST_BAR_X));
  expect(x0).not.toBe(String(LAST_BAR_X)); // really moved

  // The single debounced writer lands the etude params in the URL.
  const url = await waitForEtudeUrl(page);
  expect(url).toContain("style=pop");
  expect(url).toContain("bars=8");
  const seed = new URL(url).searchParams.get("seed");
  expect(seed).toBeTruthy();

  // RELOAD: session restore - the etude was active + persisted, so
  // it comes back active with the SAME title + seed (canonicalId).
  await page.reload();
  await expect(page.locator('[data-testid="etude-piano-roll"]')).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator("#etude-composer-status")).toHaveText(loadedBefore, {
    timeout: 10_000,
  });

  // NOT ACTIVE-DIRTIED (D30): dirty is session-scoped and never
  // persisted, so a mode switch after reload must NOT raise the
  // dirty-prompt modal.
  await page.getByRole("tab", { name: "Compose mode (shortcut 1)" }).click();
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
  await expect(page.getByText("Etude Composer")).toBeHidden();

  // Back to Etude: the panel + the COMMITTED draft (same seed) survive
  // the round trip.
  await page.getByRole("tab", { name: "Etude mode (shortcut 2)" }).click();
  await expect(page.getByText("Etude Composer")).toBeVisible();
  await expect(page.locator('input[aria-label="Seed"]')).toHaveValue(seed!);
});

test("fresh-browser deep link: etude PREPENDED but NOT activated, active-path identity preserved (HIGH-001)", async ({
  browser,
}) => {
  // Mint a real share URL in a throwaway context (and keep the title).
  const mint = await browser.newContext();
  const mintPage = await mint.newPage();
  const mintStatus = await generatePop8(mintPage);
  const mintTitle = mintStatus
    .replace(/^Loaded: /, "")
    .replace(/ \(seed \d+\)$/, "");
  const shareUrl = new URL(await waitForEtudeUrl(mintPage));
  await mint.close();

  // FRESH context: empty localStorage -> paths = ALL_PATHS, persisted
  // activePathIndex = 0. Without the fix, the prepend would slide the
  // etude under index 0 and ACTIVATE it.
  const fresh = await browser.newContext();
  const page = await fresh.newPage();
  await page.goto(`${shareUrl.pathname}${shareUrl.search}`);

  // The composer restored the URL constraints (committed draft).
  await expect(page.getByText("Etude Composer")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('select[aria-label="Etude style"]')).toHaveValue("pop");
  await expect(page.locator('input[aria-label="Seed"]')).toHaveValue(
    shareUrl.searchParams.get("seed")!,
  );

  // Identity preserved: the FIRST built-in path is STILL the active
  // one (the +1 shift kept the persisted index pointing at the same
  // path after the prepend).
  const header = page.getByRole("region", { name: "Practice loop" });
  await expect(header.getByText(FIRST_PATH_TITLE)).toBeVisible({ timeout: 10_000 });

  // Prepend WITHOUT activating (asserted on the practice surface,
  // BEFORE any tab switch): settle past the lazy-chunk window, then
  // the roll - gated on the ACTIVE path === etude path - must be
  // absent even though activeEtude was restored from the URL.
  await page.waitForTimeout(1_500);
  await expect(page.locator('[data-testid="etude-piano-roll"]')).toBeHidden();

  // Positive proof the prepend HAPPENED: the etude path is listed in
  // the Catalog (it reads the live session paths).
  await page.getByRole("button", { name: /Catalog/i }).first().click();
  await expect(page.getByText(mintTitle).first()).toBeVisible({ timeout: 5_000 });

  await fresh.close();
});
