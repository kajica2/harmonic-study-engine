/**
 * e2e/practice-inputs.spec.ts - PRD-001 Phase 7 S4 (D137-D141),
 * docs/PHASE-7-S4-INPUTS.md section 6.2: FOUR legs for the input
 * surfaces.
 *
 * Unlike MIDI (impossible in headless Chromium), REAL keyboard and
 * pointer input IS possible: page.keyboard.down/up dispatch trusted
 * keydown/keyup, and locator.click() dispatches trusted pointer
 * events. The positive legs therefore drive the app's OWN listener
 * (user key -> useNoteInput -> noteInputBus -> "midin" seam ->
 * detector) - strictly stronger than S3's seam injection.
 *
 * Boot-state pins (verified against src/lib/paths.ts + shipped
 * defaults, the same facts the S3 spec pins): ALL_PATHS[0] =
 * "path-1" The Resolution, 16-bar form, bars 1-4 = Dm7 / G7 / Cmaj7
 * / A7 -> expected guide-tone pcs [0,5] / free / [4,11] / [1,7].
 * KeyA = the mapping root = C4 = midi 60 = pc 0 - EXPECTED IN BAR 1.
 * Headless Chromium: the Web MIDI API EXISTS (no device), so
 * detection arms even before the D138 widening - the legs prove the
 * FALLBACK PATH carries the notes, not the gate.
 *
 * FLAKE LAW (TD-CI-E2E-FLAKE, the shipped discipline): monotonic
 * counters only, 15 s budgets, pigeonhole cadence (a ~150 ms key
 * period vs the 120 ms default window = every 1000 ms boundary at
 * 240 BPM lands within ~75 ms of a note-on), NO per-bar attribution
 * asserts. Leg 4 is ZERO-timing (manual entry; the median math is
 * unit-pinned with fake timers).
 *
 * POPOVER LIFECYCLE: the Drills panel lives in a popover that closes
 * on any outside mousedown. Leg 1 polls the panel summary (keyboard
 * events never close it); leg 2 polls the header detect-chip (the
 * SAME phrase mirror, always mounted) because its stream is real
 * clicks on the page body.
 *
 * BREAK-GUARD (design section 6.2): on the pre-S4 build the
 * noteinput-toggle does not exist (locator timeout) and KeyA is
 * inert -> legs 1-3 FAIL; no source selector -> leg 4 FAILS.
 */
import { test, expect, type Page, type Locator } from "@playwright/test";

test.setTimeout(120_000);

/** Drills gear popover (the S2/S3 specs' established helper). */
async function openDrills(page: Page): Promise<Locator> {
  await page.goto("/");
  const gear = page.getByTestId("mechanics-settings-toggle");
  await expect(gear).toBeVisible({ timeout: 15_000 });
  await gear.click();
  const panel = page.getByTestId("mechanics-panel");
  await expect(panel).toBeVisible();
  return panel;
}

/** Arm the S4 rig: note-input ON, loop mode, detection ON. The
 *  tempo slider is filled FIRST (a .fill leaves focus on an INPUT -
 *  the typing guard would eat the keyboard stream if it stayed
 *  focused; every later step moves focus to a BUTTON). */
async function armFallbackRig(page: Page): Promise<Locator> {
  const panel = await openDrills(page);
  await page
    .getByRole("region", { name: "Practice loop" })
    .getByRole("slider", { name: "Tempo" })
    .fill("240");
  await panel.getByTestId("noteinput-toggle").check();
  await panel.getByTestId("mech-mode-loop").click();
  await panel.getByTestId("detect-toggle").check();
  return panel;
}

/** Park the loop window on bars 1-4 and the cursor on bar 1 (the
 *  S3 spec's established sequence; the outside clicks close the
 *  popover on the way). */
async function loopBars1to4(page: Page): Promise<void> {
  await page.locator('button[title^="Bar 1 "]').first().click({ modifiers: ["Shift"] });
  await page.locator('button[title^="Bar 4 "]').first().click({ modifiers: ["Shift"] });
  await page.locator('button[title^="Bar 1 "]').first().click();
}

/** Close the popover (Escape; pre-play stop is a no-op) and press
 *  Play - focus lands on the Play BUTTON, so the typing guard never
 *  eats the keyboard stream. */
async function playClosedPopover(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  const play = page.getByRole("button", { name: "Play path" });
  await expect(play).toBeVisible({ timeout: 15_000 });
  await play.click();
}

async function railStop(page: Page): Promise<void> {
  await page
    .locator('button[title="Stop playback and rewind to step 1"]')
    .click();
}

async function notesHitOf(locator: Locator): Promise<number> {
  const v = await locator.getAttribute("data-notes-hit").catch(() => null);
  return Number(v ?? "0");
}

// ------------------------------------------------------------------
// LEG 1 - KEYBOARD -> DETECTION (real trusted key events)
// ------------------------------------------------------------------

test("S4 keyboard: real KeyA presses score played-correctly detection (positive)", async ({
  page,
}) => {
  await armFallbackRig(page);
  await loopBars1to4(page);
  await playClosedPopover(page);
  await page.getByTestId("mechanics-settings-toggle").click(); // reopen for the summary
  const summary = page.getByTestId("detect-summary");
  await expect(summary).toBeVisible();

  // The background key stream: down/up ~150 ms period (pigeonhole:
  // every 1000 ms bar boundary is within ~75 ms of a note-on,
  // inside the 120 ms window). Keyboard events never close the
  // popover (no mousedown outside).
  const stream = (async () => {
    for (let i = 0; i < 80; i++) {
      await page.keyboard.down("a");
      await page.waitForTimeout(70);
      await page.keyboard.up("a");
      await page.waitForTimeout(70);
    }
  })();

  await expect
    .poll(() => notesHitOf(summary), {
      timeout: 15_000,
      message: "keyboard notes must reach the detector (notes-hit >= 1)",
    })
    .toBeGreaterThanOrEqual(1);
  await expect
    .poll(() => page.locator("button[data-match]").count(), {
      timeout: 15_000,
      message: "at least one rail cell must gain a data-match attr",
    })
    .toBeGreaterThanOrEqual(1);

  await stream;
  await railStop(page);
});

// ------------------------------------------------------------------
// LEG 2 - ON-SCREEN PIANO (positive + REQ-IO-6 geometry)
// ------------------------------------------------------------------

test("S4 piano: pointer taps score detection and white keys meet the 44x56 floor", async ({
  page,
}) => {
  await armFallbackRig(page);
  await loopBars1to4(page);

  const piano = page.getByTestId("note-input-piano");
  await expect(piano).toBeVisible();
  const key = page.getByTestId("note-key-60"); // C4 = pc 0, expected bar 1

  await playClosedPopover(page);

  // Tap the root key on a ~150 ms cadence - locator.click()
  // dispatches TRUSTED pointer events through the real input path.
  const stream = (async () => {
    for (let i = 0; i < 60; i++) {
      await key.click({ timeout: 5_000 });
    }
  })();

  // The header chip carries the SAME phrase mirror as the panel
  // summary and survives the popover closing under the clicks.
  const chip = page.getByTestId("detect-chip");
  await expect
    .poll(() => notesHitOf(chip), {
      timeout: 15_000,
      message: "pointer taps must reach the detector (notes-hit >= 1)",
    })
    .toBeGreaterThanOrEqual(1);
  await expect
    .poll(() => page.locator("button[data-match]").count(), {
      timeout: 15_000,
      message: "at least one rail cell must gain a data-match attr",
    })
    .toBeGreaterThanOrEqual(1);

  await stream.catch(() => {
    /* a late click raced the stop - the polls already passed */
  });
  await railStop(page);

  // REQ-IO-6 GEOMETRY (deterministic layout math, not a timing
  // assert): white keys >= 44 x 56 CSS px.
  const box = await key.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(56);
});

// ------------------------------------------------------------------
// LEG 3 - PERSISTENCE + MODIFIER GUARD (deterministic)
// ------------------------------------------------------------------

test("S4 persistence + guard: octave survives reload; Meta+A never sounds", async ({
  page,
}) => {
  const panel = await openDrills(page);
  await panel.getByTestId("noteinput-toggle").check();
  await expect(page.getByTestId("note-input-piano")).toBeVisible();
  await expect(page.getByTestId("noteinput-root-label")).toHaveText("Root C4");
  await page.getByTestId("noteinput-octave-up").click();
  await expect(page.getByTestId("noteinput-root-label")).toHaveText("Root C5");

  // Envelope roundtrip (noteInput rides practiceMechanics, no v5):
  // a real reload keeps BOTH the toggle and the shifted root.
  await page.reload();
  const panel2 = await openDrills(page);
  await expect(panel2.getByTestId("noteinput-toggle")).toBeChecked();
  await expect(page.getByTestId("note-input-piano")).toBeVisible();
  await expect(page.getByTestId("noteinput-root-label")).toHaveText("Root C5");

  // MODIFIER GUARD in a REAL browser: arm detection + play, then
  // hammer Meta+A across a full pass - the detector must see
  // NOTHING (if the guard were broken, ~24 late presses against
  // 120 ms windows per second of bar 1 would score hits with
  // probability ~1; the passing side is deterministic: zero events).
  await panel2.getByTestId("mech-mode-loop").click();
  await panel2.getByTestId("detect-toggle").check();
  await loopBars1to4(page);
  await playClosedPopover(page);
  await page.getByTestId("mechanics-settings-toggle").click(); // reopen for the summary
  const summary = page.getByTestId("detect-summary");
  await expect(summary).toHaveAttribute("data-notes-hit", "0");
  for (let i = 0; i < 24; i++) {
    await page.keyboard.press("Meta+a");
    await page.waitForTimeout(120);
  }
  await expect(summary).toHaveAttribute("data-notes-hit", "0");
  // And the input piano's pressed-state contract stayed clean.
  await expect(page.locator('[data-testid^="note-key-"][data-note-down="1"]')).toHaveCount(0);
  await railStop(page);
});

// ------------------------------------------------------------------
// LEG 4 - WIZARD FALLBACK (zero timing: manual entry + merge law)
// ------------------------------------------------------------------

test("S4 wizard: fallback source selectable, embedded piano, manual 37 ms merges past the MIDI row", async ({
  page,
}) => {
  const panel = await openDrills(page);
  await panel.getByTestId("noteinput-toggle").check();
  await panel.getByTestId("latency-calibrate-btn").click();
  const wizard = page.getByTestId("latency-wizard");
  await expect(wizard).toBeVisible();

  // Headless: API present, NO device -> gateOk false; with the
  // toggle on the fallback source is selectable and pressed by
  // default, the MIDI chip honestly disabled.
  const fb = wizard.getByTestId("wizard-source-fallback");
  await expect(fb).toBeVisible();
  await expect(fb).toHaveAttribute("aria-pressed", "true");
  await expect(wizard.getByTestId("wizard-source-midi")).toBeDisabled();

  // The embedded compact input piano is on the pre-roll screen (and
  // stays mounted while rolling - touch users calibrate with a
  // thumb; the roll itself is unit-pinned, e2e stays zero-timing).
  await expect(wizard.getByTestId("wizard-piano")).toBeVisible();

  // Manual fallback entry (the deterministic path):
  await wizard.getByTestId("wizard-input-ms").fill("37");
  await wizard.getByTestId("wizard-save").click();
  await expect(wizard.getByTestId("wizard-saved")).toBeVisible();
  await wizard.getByTestId("wizard-close").click();
  await expect(wizard).toBeHidden();

  // Reload: the fallback number persists AND the MIDI row still
  // reads uncalibrated (the D141 merge law, honestly rendered).
  await page.reload();
  const panel2 = await openDrills(page);
  await expect(panel2.getByTestId("latency-record-fallback")).toContainText(
    "Keyboard/piano: 37 ms",
  );
  await expect(panel2.getByTestId("latency-record")).toContainText("uncalibrated");
});
