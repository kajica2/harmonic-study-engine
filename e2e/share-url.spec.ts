/**
 * e2e/share-url.spec.ts - PRD-001 Phase 8 S1 (D145/D146/D149, doc 6.2).
 *
 * Serves the BUILT dist/ via the playwright.config webServer (npx
 * serve dist -p 4173 - the command stays BYTE-IDENTICAL). Run AFTER
 * `npm run build`:
 *   npx playwright test e2e/share-url.spec.ts
 *
 * 4 legs, ALL discriminative pre-S1 (missing keys / missing buttons /
 * stale warn):
 * 1. PRACTICE ROUND-TRIP: bpm/path/persona/voicing ride the ONE
 *    writer into a FRESH context (cross-device proxy, the shipped
 *    compose leg-6 pattern) and restore field-wise (D145).
 * 2. FLUSH-BEFORE-COPY (THE break-guard leg for the stale-copy bug
 *    class): change tempo and click Share IMMEDIATELY (inside the
 *    200ms debounce window) - the REAL clipboard must hold the NEW
 *    bpm. Pre-S1: no share-url-button -> locator timeout -> FAILS.
 *    Flake law (doc 6.2): the app's own status text is asserted
 *    FIRST; the clipboard read is the discriminator (documented
 *    degrade to status-text-only if CI read ever flakes - the flush
 *    ORDER stays unit-pinned in shareUrl.test.ts).
 * 3. EXPLORE eseed ROUND-TRIP + governor honesty (D146).
 * 4. IDEA SYNC + STALE-WARN KILL: the minted idea rides idea=, the
 *    copied link carries the FULL context (the search-dropping base
 *    is gone) and no console line matches "not yet implemented".
 */

import { test, expect, type Page } from "@playwright/test";

test.setTimeout(90_000);

async function bootStudy(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByText("Choose a mastermind")).toBeVisible({
    timeout: 10_000,
  });
}

test("practice round-trip: bpm/path/persona/voicing ride the URL into a FRESH context (D145)", async ({
  page,
  browser,
}) => {
  await bootStudy(page);

  // Persona FIRST (it re-seeds path/tempo/voicing per the shipped
  // handleSelectPersona), THEN the explicit picks override it. The
  // persona grid is the only button cluster with aria-pressed (the
  // path-picker buttons share the name text - scope by attribute).
  await page
    .locator('button[aria-pressed]', { hasText: "Thelonious Monk" })
    .click();
  await page.getByRole("button", { name: /Catalog/i }).first().click();
  await page.getByTestId("catalog-open-study-solar").click();
  await page.locator('select[aria-label="Voicing style"]').selectOption("drop2");
  // The header's tempo slider (the mobile bar mirrors a second one -
  // scope to the Practice loop region).
  const header = page.getByRole("region", { name: "Practice loop" });
  await header.locator('input[aria-label="Tempo"]').fill("132");

  // The ONE debounced writer lands all four practice keys.
  await expect
    .poll(() => page.url(), { timeout: 5_000 })
    .toMatch(/bpm=132/);
  const url = page.url();
  expect(url).toContain("path=study-solar");
  expect(url).toContain("persona=monk");
  expect(url).toContain("voicing=drop2");

  // FRESH context = cross-device proxy (empty localStorage).
  const fresh = await browser.newContext();
  const p2 = await fresh.newPage();
  await p2.goto(url);
  await expect(
    p2.getByRole("region", { name: "Practice loop" }).locator('input[aria-label="Tempo"]'),
  ).toHaveValue("132", { timeout: 10_000 });
  // Active path (BY ID lookup after the boot restore - never an
  // index): the header shows the Solar title.
  await expect(p2.getByText(/^Solar/).first()).toBeVisible({ timeout: 10_000 });
  await expect(
    p2.locator('button[aria-pressed]', { hasText: "Thelonious Monk" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(p2.locator('select[aria-label="Voicing style"]')).toHaveValue(
    "drop2",
  );
  await fresh.close();
});

test("flush-before-copy: a Share click inside the debounce window copies the NEW bpm (D149)", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await bootStudy(page);

  const header = page.getByRole("region", { name: "Practice loop" });
  // Change tempo -> the 200ms debounce is PENDING...
  await header.locator('input[aria-label="Tempo"]').fill("132");
  // ...and IMMEDIATELY share (no polling in between): the flush must
  // write synchronously BEFORE the copy reads the location.
  await header.getByTestId("share-url-button").click();

  // Status text FIRST (the documented degrade anchor):
  await expect(header.getByTestId("share-url-status")).toContainText(
    "Share link copied to clipboard.",
    { timeout: 5_000 },
  );
  // The discriminator: the REAL clipboard holds the NEW bpm (a
  // pre-flush copy would carry the pre-change URL - no bpm key at
  // all, since 60 is the deleted default).
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("bpm=132");
});

test("explore eseed round-trip + governor honesty (D146)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Explore mode (shortcut 3)" }).click();
  await expect(page.getByTestId("explore-seed")).toBeVisible({
    timeout: 10_000,
  });

  await page.getByTestId("seed-input").fill("Dm7 G7 Cmaj7");
  await page.getByTestId("seed-input").press("Enter");
  await expect
    .poll(() => page.url(), { timeout: 5_000 })
    .toContain("eseed=");

  // Reload: the ephemeral field -> boot -> surface precedence chain
  // restores the seed box (the deep link wins - D146).
  await page.reload();
  await expect(page.getByTestId("seed-input")).toHaveValue("Dm7 G7 Cmaj7", {
    timeout: 10_000,
  });

  // Governor: a 250-char seed shows the honest notice and the key is
  // SKIPPED (only eseed - other families untouched).
  await page.getByTestId("seed-input").fill(`Cmaj7 ${"x".repeat(250)}`);
  await page.getByTestId("seed-input").press("Enter");
  await expect(page.getByTestId("explore-url-notice")).toBeVisible();
  await expect
    .poll(() => page.url(), { timeout: 5_000 })
    .not.toContain("eseed=");
});

test("idea sync + stale-warn kill: minted idea rides idea=, the copied link keeps full context (D149)", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await bootStudy(page);

  const consoleLines: string[] = [];
  page.on("console", (msg) => {
    const t = msg.type();
    if (t === "warning" || t === "error") consoleLines.push(msg.text());
  });

  // Mint via the shipped HIGH-003 + button (active step exists on a
  // fresh boot - the default path is loaded).
  await page.getByLabel("Create idea from current chord").click();
  await expect
    .poll(() => page.url(), { timeout: 5_000 })
    .toContain("idea=");

  // IdeaBar's Share (scoped inside idea-bar - the single-testid law).
  const ideaBar = page.getByTestId("idea-bar");
  await ideaBar.getByTestId("share-url-button").click();
  // Status text FIRST (the leg-2 pattern, the documented degrade
  // anchor): the pill renders only AFTER copyShareUrl has AWAITED
  // clipboard.writeText - that ordering is the barrier that kills
  // the async writeText/readText race (reviewer W2). The read below
  // stays the discriminator.
  await expect(ideaBar.getByTestId("share-url-status")).toContainText(
    "Share link copied to clipboard.",
    { timeout: 5_000 },
  );
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("idea=");
  // The search-dropping base is GONE: context keys ride (transpose
  // is written by every shipped write; path carries the study pick).
  expect(copied).toContain("transpose=");
  expect(copied).toContain("path=");

  // The stale warn is DEAD (browser-proven): no console line even
  // mentions it.
  expect(
    consoleLines.filter((t) => t.includes("not yet implemented")),
  ).toEqual([]);
});
