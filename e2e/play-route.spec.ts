/**
 * e2e/play-route.spec.ts - PRD-001 Phase 8 S1 (D148, doc 6.2).
 *
 * Serves the BUILT dist/ (webServer command BYTE-IDENTICAL - the
 * new public/serve.json does the routing: vite copies it to
 * dist/serve.json and `serve` reads rewrites from the served dir;
 * Vercel ignores it, vercel.json wins). Run AFTER `npm run build`.
 *
 * ALL 3 legs are discriminative pre-S1: `serve` 404s /play without
 * serve.json (audit #13), so each leg doubles as the config's own
 * pin (if serve.json ever stops being read, leg 5 fails LOUDLY - it
 * cannot false-pass).
 *
 * 5. ARMED -> PLAYING: decode + summary + autofocus; the CLICK is
 *    the gesture (headless autoplay is gesture-satisfied); the
 *    data-state flips to playing through the shipped
 *    composePreviewPlayer machinery (UI state, NEVER audio bytes -
 *    the explore.spec precedent).
 * 6. EMPTY honesty: bare /play shows the CTA and the link lands in
 *    the real App; garbage ?idea= degrades to empty, no crash.
 * 7. URL PRISTINISM: no writer runs on /play (App never mounts) -
 *    the URL is untouched after a settle window (the minimal-UI
 *    contract).
 */

import { test, expect, type Page } from "@playwright/test";
import { ideaFromChord } from "../engine/core/idea";

test.setTimeout(90_000);

function encodeIdeaParam(idea: ReturnType<typeof ideaFromChord>): string {
  // The shipped scheme (ideaShare.ts is byte-compatible with it):
  // btoa(encodeURIComponent(JSON)) then percent-encoded into the URL.
  return encodeURIComponent(btoa(encodeURIComponent(JSON.stringify(idea))));
}

async function armedPage(page: Page): Promise<string> {
  const idea = ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0);
  await page.goto(`/play?idea=${encodeIdeaParam(idea)}`);
  await expect(page.getByTestId("play-surface")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId("play-armed")).toBeVisible();
  await expect(page.getByTestId("play-idea-summary")).toContainText(
    "chord - Cmaj7",
  );
  // ABSOLUTE url for the pristineness compare (goto resolves it).
  return page.url();
}

test("/play armed -> playing through the shipped machinery; one click is the gesture (D148)", async ({
  page,
}) => {
  await armedPage(page);
  const play = page.getByTestId("play-button");
  await expect(play).toBeFocused(); // Space/Enter IS the gesture
  await play.click();
  // The state attr rides composePreviewPlayer (rendering/playing
  // both land on "playing" in the minimal UI - state, not audio).
  await expect(page.getByTestId("play-surface")).toHaveAttribute(
    "data-state",
    "playing",
    { timeout: 15_000 },
  );
  await page.getByTestId("play-stop-button").click();
  await expect(page.getByTestId("play-surface")).toHaveAttribute(
    "data-state",
    "armed",
    { timeout: 5_000 },
  );
});

test("/play empty honesty: bare + garbage degrade to the CTA, and the CTA lands in the App", async ({
  page,
}) => {
  await page.goto("/play");
  await expect(page.getByTestId("play-empty")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("play-open-app")).toHaveAttribute("href", "/");
  await page.getByTestId("play-open-app").click();
  // Plain document navigation - the real App boots (mode gate).
  await expect(page.getByText("Choose a mastermind")).toBeVisible({
    timeout: 10_000,
  });

  await page.goto("/play?idea=%25%25%25garbage%25%25%25");
  await expect(page.getByTestId("play-empty")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId("play-surface")).toHaveAttribute(
    "data-state",
    "empty",
  );
});

test("/play URL pristineness: no writer runs - the shared link stays pristine (D148)", async ({
  page,
}) => {
  const url = await armedPage(page);
  await page.waitForTimeout(1_000); // past any debounce window
  expect(page.url()).toBe(url); // no mode/transpose pollution ever
});
