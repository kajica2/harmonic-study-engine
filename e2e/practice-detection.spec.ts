/**
 * e2e/practice-detection.spec.ts - PRD-001 Phase 7 S3 (D129-D135),
 * docs/PHASE-7-S3-DETECTION.md section 8.2: THE honest-MIDI question,
 * answered with three legs in one file.
 *
 * Real MIDI in headless Chromium is IMPOSSIBLE (no devices). The
 * positive leg therefore drives the SHIPPED seam, not a test-only
 * hook: midiIn dispatches every real note-on as a window "midin"
 * CustomEvent (src/lib/midiIn.ts header + :167) and the detector
 * subscribes to THAT event (D135.1 - the only seam reachable from
 * page.evaluate; the in-process onMidin listener list is a closure).
 * The injected detail shape is copied verbatim from the midiIn.ts
 * header contract and consumed by usePlayedCorrectly's listener:
 *   {note, velocity, type: "noteon", channel, inputId, inputName,
 *    timestamp}  with timestamp = performance.now() - the SAME clock
 *   domain the hook stamps boundaries with.
 * channel 1: the fresh-boot bass-exclusion channel is 2 (App
 * usePersistedState default), so ch-1 notes are never dropped.
 *
 * FLAKE LAW (TD-CI-E2E-FLAKE, section 8.2 verbatim): monotonic
 * counter asserts ONLY - data-notes-hit >= 1 and SOME cell gains
 * data-match; the exact per-bar kind is phase-dependent and
 * deliberately NOT asserted. The only timing assumption is
 * pigeonhole-grade: a ~120 ms injection period against the 240 ms
 * default window (+/-120 ms) guarantees a note inside every bar
 * window. 240 BPM compression, 15 s poll budgets, ZERO exact-frame
 * or per-bar attribution asserts. The tolerance/latency MATH is
 * pinned at unit level (engine/practice/detect.test.ts), not here.
 *
 * Boot-state pins (verified against src/lib/paths.ts + the shipped
 * defaults: voice-leading OFF, transpose 0, drift 0, fresh context
 * localStorage): ALL_PATHS[0] = "path-1" The Resolution, 16-bar
 * form, bars 1-4 = Dm7 / G7 / Cmaj7 / A7 -> expected guide-tone pcs
 * [0,5] / free / [4,11] / [1,7] (src/lib/practiceExpected.guideTonePcs
 * law). Note 60 (C) is pc 0 - expected in bar 1; note 62 (D) is pc 2
 * - absent from the WHOLE span's expected union {0,1,4,5,7,11}, so a
 * pass played on 62 can only score misses + wrongs.
 *
 * Legs:
 * 1. NEGATIVE (REQ-PRAC-54): no Web MIDI API -> honest unavailable
 *    state. Discriminative: pre-S3 the Detection section does not
 *    exist at all.
 * 2. POSITIVE (synthetic stream, REAL transport): arm loop 1-4 +
 *    detection at 240 BPM, inject on pc 0 -> notes-hit >= 1 + a
 *    scored cell appears; switch to the absent pc -> 0 hits + a
 *    nonzero wrong count (counters move, nothing frame-exact).
 * 3. WIZARD (no device): Calibrate -> gate -> manual 42 ms -> Save ->
 *    reload -> panel shows "42 ms (manual)". ZERO timing involved.
 */
import { test, expect, type Page, type Locator } from "@playwright/test";

test.setTimeout(120_000);

/** Drills gear popover (the S2 specs' established helper). */
async function openDrills(page: Page): Promise<Locator> {
  await page.goto("/");
  const gear = page.getByTestId("mechanics-settings-toggle");
  await expect(gear).toBeVisible({ timeout: 15_000 });
  await gear.click();
  const panel = page.getByTestId("mechanics-panel");
  await expect(panel).toBeVisible();
  return panel;
}

/** The rail's transport Stop (title-pinned; S1/S2 precedent). */
function railStop(page: Page): Locator {
  return page.locator('button[title="Stop playback and rewind to step 1"]');
}

/**
 * Start (or REPLACE) a synthetic note-on stream on the window "midin"
 * seam. The detail object is the midiIn.ts header contract verbatim;
 * timestamp rides the page's performance.now() - the same domain the
 * hook's boundary stamps use (D129).
 */
async function startNoteStream(page: Page, note: number, periodMs: number) {
  await page.evaluate(([n, p]) => {
    const w = window as unknown as { __hseNoteTimer?: number };
    if (w.__hseNoteTimer !== undefined) window.clearInterval(w.__hseNoteTimer);
    w.__hseNoteTimer = window.setInterval(() => {
      window.dispatchEvent(
        new CustomEvent("midin", {
          detail: {
            note: n,
            velocity: 90,
            type: "noteon",
            channel: 1,
            inputId: "e2e-synth",
            inputName: "e2e synth",
            timestamp: performance.now(),
          },
        }),
      );
    }, p);
  }, [note, periodMs]);
}

async function stopNoteStream(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __hseNoteTimer?: number };
    if (w.__hseNoteTimer !== undefined) {
      window.clearInterval(w.__hseNoteTimer);
      w.__hseNoteTimer = undefined;
    }
  });
}

// ------------------------------------------------------------------
// LEG 1 - NEGATIVE (REQ-PRAC-54, D135.4 arm gate)
// ------------------------------------------------------------------

test("S3 detection: no Web MIDI API -> honest unavailable state (REQ-PRAC-54)", async ({
  page,
}) => {
  // requestMIDIAccess lives on Navigator.prototype; an own
  // defineProperty with value undefined shadows it, so
  // typeof navigator.requestMIDIAccess === "undefined" - the exact
  // gate the hook reads (midiInAvailable). addInitScript runs before
  // ANY app code.
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "requestMIDIAccess", {
      value: undefined,
      configurable: true,
    });
  });

  const panel = await openDrills(page);
  const toggle = panel.getByTestId("detect-toggle");
  const unavailable = panel.getByTestId("detect-unavailable");
  await expect(unavailable).toBeVisible();
  await expect(unavailable).toContainText("Web MIDI");
  await expect(toggle).toBeDisabled();

  // The honest part of honest: everything else stays usable.
  await expect(panel.getByTestId("mech-made-it")).toBeVisible();
  await expect(panel.getByTestId("mech-mode-pause")).toBeVisible();
});

// ------------------------------------------------------------------
// LEG 2 - POSITIVE (synthetic stream on the real transport)
// ------------------------------------------------------------------

test("S3 detection: synthetic midin stream scores rail + summary (monotonic counters only)", async ({
  page,
}) => {
  await page.goto("/");
  const play = page.getByRole("button", { name: "Play path" });
  await expect(play).toBeVisible({ timeout: 15_000 });

  // 240 BPM -> one 4/4 bar per second -> a 4-bar loop pass completes
  // in ~4 s (the compression the pause/ab legs already use).
  await page
    .getByRole("region", { name: "Practice loop" })
    .getByRole("slider", { name: "Tempo" })
    .fill("240");

  // Loop window bars 1-4 (shift-click the S2 way), then park the
  // cursor at bar 1 so the first pass starts at the span head (the
  // ab spec's parking precedent).
  await page.locator('button[title^="Bar 1 "]').first().click({ modifiers: ["Shift"] });
  await page.locator('button[title^="Bar 4 "]').first().click({ modifiers: ["Shift"] });
  await page.locator('button[title^="Bar 1 "]').first().click();

  // Arm: mode Loop + detection ON (fresh boot: API present in
  // headless Chromium, no device -> ARMED-and-silent per D135.4,
  // which is exactly what makes this leg possible).
  await page.getByTestId("mechanics-settings-toggle").click();
  const panel = page.getByTestId("mechanics-panel");
  await expect(panel).toBeVisible();
  await panel.getByTestId("mech-mode-loop").click();
  const strip = page.getByTestId("rail-strip");
  await panel.getByTestId("detect-toggle").check();
  await expect(strip).toHaveAttribute("data-detect", "on");
  const summary = panel.getByTestId("detect-summary");
  // The shipped contract: the summary exists with a ZEROED counter
  // before the first pass (never absent, never NaN).
  await expect(summary).toHaveAttribute("data-notes-hit", "0");
  await page.keyboard.press("Escape"); // pre-play Escape is a no-op stop

  await play.click();
  await startNoteStream(page, 60, 120); // pc 0: Dm7's 7th, expected bar 1
  await page.getByTestId("mechanics-settings-toggle").click(); // reopen for the summary

  // (a) monotonic: the pass verdict reaches the summary (15 s budget
  // = ~3 passes; the verdict lands at the span wrap ~4 s in).
  await expect
    .poll(
      async () => {
        const v = await summary.getAttribute("data-notes-hit");
        return Number(v ?? "0");
      },
      { timeout: 15_000, message: "data-notes-hit must reach >= 1 on the real transport" },
    )
    .toBeGreaterThanOrEqual(1);

  // (b) SOME cell gained data-match (kind deliberately NOT asserted -
  // phase-dependent per the section 8.2 flake law).
  await expect
    .poll(() => page.locator("button[data-match]").count(), {
      timeout: 15_000,
      message: "at least one rail cell must gain a data-match attr",
    })
    .toBeGreaterThanOrEqual(1);

  // (c) the absent pc: note 62 (pc 2) is in NO expected set of the
  // span, so a clean pass can ONLY score 0 hits + a nonzero wrong
  // count. The poll tolerates one mixed pass in flight at switch
  // time; ~2 passes (8 s) is well inside the 15 s budget.
  await startNoteStream(page, 62, 120);
  await expect
    .poll(
      async () => {
        const v = await summary.getAttribute("data-notes-hit");
        const hit = Number(v ?? "-1");
        const text = await summary.innerText().catch(() => "");
        return hit === 0 && /\b\d+ wrong\b/.test(text);
      },
      {
        timeout: 15_000,
        message: "the absent-pc pass must move the error buckets: 0 hits + a wrong count",
      },
    )
    .toBe(true);

  await stopNoteStream(page);
  await railStop(page).click();
});

// ------------------------------------------------------------------
// LEG 3 - WIZARD (no device, no timing at all - deterministic)
// ------------------------------------------------------------------

test("S3 wizard: gate without a device, manual 42 ms survives reload (REQ-PRAC-40/41)", async ({
  page,
}) => {
  const panel = await openDrills(page);
  await panel.getByTestId("latency-calibrate-btn").click();
  const wizard = page.getByTestId("latency-wizard");
  await expect(wizard).toBeVisible();

  // Headless Chromium: the Web MIDI API EXISTS but no input device
  // does - the D134 gate ("API + a device to tap") fails honestly
  // and lands on the manual escape hatch.
  await expect(wizard.getByTestId("wizard-gate")).toBeVisible();
  await expect(wizard.getByTestId("wizard-save")).toBeDisabled(); // never a silent 0

  await wizard.getByTestId("wizard-input-ms").fill("42");
  await wizard.getByTestId("wizard-save").click();
  await expect(wizard.getByTestId("wizard-saved")).toBeVisible();
  await wizard.getByTestId("wizard-close").click();
  await expect(wizard).toBeHidden();

  // Persistence leg: the record rides K.practiceLatency through a
  // real reload; manual saves store output 0, so the panel shows the
  // typed number exactly (the single-sum law).
  await page.reload();
  const panel2 = await openDrills(page);
  await expect(panel2.getByTestId("latency-record")).toContainText("42 ms (manual)");
});
