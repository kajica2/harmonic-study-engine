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
 *
 * FIX ROUND (TESTER HIGH) adds: (a) the TD-035 gate leg - the
 * Co-compose region is ABSENT while an etude path is active (test 1)
 * and PRESENT while a curated path is active (test 2 positive
 * control, so the gate can never be "fixed" by blanket removal), and
 * (b) a third test: Escape CANCELS an active count-in pre-roll
 * (guards the requestPlayState-routed Escape stop, REVIEWER M2).
 */
import { test, expect, type Page } from "@playwright/test";
// TD-033e (D43): FIRST_PATH_TITLE is DERIVED from the source of truth
// (src/lib/paths.ts) instead of hardcoded - drift-gated by
// construction: a rename flows here automatically. Playwright
// transpiles the TS import; paths.ts is pure data (no browser
// globals at module load), so the e2e runner boundary is clean.
import { ALL_PATHS } from "../src/lib/paths";

// The fix-3 highlight guard waits for the roll to cross the full
// 8-bar form at real-time playback (~1 measure/bar). 90s covers the
// audio-chunk load + form traversal; the 45s poll below stays
// discriminative against the legacy 4x-slower mapping (needs ~28
// measures, i.e. 60s+).
test.setTimeout(90_000);

/** ALL_PATHS[0] - the active path on a fresh boot (index 0). */
const FIRST_PATH_TITLE = ALL_PATHS[0].title;
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

  // FIX ROUND (TESTER HIGH, TD-035 gate leg): while the ETUDE path is
  // active, the Co-compose region MUST be absent - its accept handler
  // writes FOUR steps per click (legacy 4-steps/bar shape) and would
  // silently rewrite four one-step-per-bar etude bars (D41 MUST-FIX).
  // Mutation-discriminative: delete the gate at App.tsx (~2179) and
  // this region appears. Test 2's positive control pins the opposite
  // mutation (blanket removal).
  await expect(
    page.getByRole("region", { name: "Co-composition suggestion" }),
  ).toHaveCount(0);

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

  // FIX ROUND (REVIEWER M2, playing half): Escape stops PLAIN
  // playback. The old Escape branch read the raw isPlayingAuto state
  // from a STALE closure (the keydown effect deps are the path
  // lengths only - the generate above re-ran it with false), so
  // Escape was a no-op here; routing through requestPlayState (live
  // refs) makes it work. Discriminative: revert the fix and Pause
  // stays.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Start practice" })).toBeVisible({
    timeout: 5_000,
  });

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

  // FIX ROUND (TESTER HIGH) POSITIVE CONTROL for the TD-035 gate leg
  // in generatePop8: with the first BUILT-IN (curated) path active,
  // the Co-compose region is PRESENT - the gate is etude-path-
  // specific, so "fixing" it by blanket-removing the panel fails.
  await expect(
    page.getByRole("region", { name: "Co-composition suggestion" }),
  ).toBeVisible({ timeout: 10_000 });

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

test("Escape cancels an active count-in pre-roll (fix round, REVIEWER M2)", async ({
  page,
}) => {
  // Guards the Escape stop branch now routed through requestPlayState:
  // the OLD raw branch checked isPlayingAuto - FALSE throughout the
  // pre-roll by construction (the gate holds the transport) - so
  // Escape was a no-op and the countdown kept running into playback,
  // contradicting the gate contract ("a stop must never leave a
  // countdown running"). Pre-fix this fails at the toBeHidden below
  // (the overlay lives out its full 4-beat pre-roll at the 60 BPM
  // fresh-boot default, then releases into Pause).
  await page.goto("/");
  const header = page.getByRole("region", { name: "Practice loop" });
  await expect(header).toBeVisible({ timeout: 10_000 });

  // Arm a 1-bar count-in through the Click-settings popover (same
  // harness as e2e/count-in.spec.ts).
  await page.getByRole("button", { name: "Click settings" }).click();
  await page.getByRole("button", { name: "Count in 1 bar" }).click();
  await page.keyboard.press("Escape"); // closes the popover (count-in NOT yet running)

  await page.getByRole("button", { name: "Start practice" }).click();
  const overlay = page.locator('[data-testid="countin-overlay"]');
  await expect(overlay).toBeVisible({ timeout: 2_000 });

  // THE ESCAPE: the countdown must DIE...
  await page.keyboard.press("Escape");
  await expect(overlay).toBeHidden({ timeout: 2_000 });

  // ...and playback must NEVER start behind it (the pre-roll would
  // otherwise release into Pause ~3 s later).
  await expect(page.getByRole("button", { name: "Pause practice" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Start practice" })).toBeVisible();
});
