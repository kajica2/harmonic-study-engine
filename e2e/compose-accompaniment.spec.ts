/**
 * e2e/compose-accompaniment.spec.ts - PRD-001 Phase 4 Slice 3 (D76).
 *
 * Fixture strategy (D65 rails, copied from compose-upload.spec.ts):
 * MIDI bytes generated IN-SPEC with @tonejs/midi (specs run in NODE),
 * handed to the page via setInputFiles(buffer) - zero committed
 * binaries. Requires `npm run build` first (serves dist/ on :4173).
 *
 * Discriminative legs (each fails if the mechanism it pins is
 * removed):
 *  1. upload -> AccompanimentPanel visible -> Generate (defaults:
 *     jazz, bass+chords, density 3, seed 42) -> roll gains
 *     roll-layer-bass / roll-layer-chords rect groups + the meta
 *     status line shows note counts (the roll IS the visual proof).
 *  2. seed 42 -> 43 -> regenerate -> the SERIALIZED roll summary
 *     CHANGES (approach pitches differ; count may not - we assert the
 *     string, not the count).
 *  3. RELOAD + re-upload -> style select + seed input RESTORED (the
 *     only browser-level proof partialize keeps the request, D73) ->
 *     Generate the same seed -> summary BYTE-IDENTICAL to leg 1
 *     (determinism across reload).
 *  4. density 0 -> strictly fewer notes than density 5 (thinning
 *     visible in a real browser).
 *  5. Preview button state machine: idle -> rendering -> playing ->
 *     idle via a MutationObserver on data-preview (audio OUTPUT is
 *     manual - honest; a headless browser proves the plumbing only:
 *     the "rendering" state can ONLY be entered by a real
 *     renderAccompaniment call, and "playing" only after a buffer
 *     exists).
 */
import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import type { Midi as MidiType } from "@tonejs/midi";

const requireCjs = createRequire(import.meta.url);
const { Midi } = requireCjs("@tonejs/midi") as { Midi: typeof MidiType };

test.setTimeout(90_000);

const BAR_TICKS = 1920;

/** 8 bars of C / Dm7 / G7 -> C with a quarter-note melody line (the
 *  S2 fixture - same shape, its own copy: specs stay independent). */
function buildFixtureBuffer(): Buffer {
  const prog: readonly { readonly chord: readonly number[]; readonly line: readonly number[] }[] = [
    { chord: [60, 64, 67], line: [72, 76, 79, 72] }, // C
    { chord: [62, 65, 69, 72], line: [74, 77, 81, 74] }, // Dm7
    { chord: [55, 59, 62, 65], line: [79, 74, 71, 67] }, // G7
    { chord: [60, 64, 67], line: [72, 76, 79, 84] }, // C
  ];
  const midi = new Midi();
  midi.header.setTempo(120);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  const chords = midi.addTrack();
  chords.name = "Piano";
  chords.channel = 0;
  chords.instrument.number = 0;
  const melody = midi.addTrack();
  melody.name = "Melody";
  melody.channel = 1;
  melody.instrument.number = 56;
  for (let b = 0; b < 8; b++) {
    const step = prog[b % prog.length];
    for (const m of step.chord) {
      chords.addNote({ midi: m, ticks: b * BAR_TICKS, durationTicks: BAR_TICKS, velocity: 0.7 });
    }
    step.line.forEach((m, q) => {
      melody.addNote({ midi: m, ticks: b * BAR_TICKS + q * 480, durationTicks: 440, velocity: 0.8 });
    });
  }
  return Buffer.from(midi.toArray());
}

const FIXTURE = { name: "s3-fixture.mid", mimeType: "audio/midi", buffer: buildFixtureBuffer() };

async function uploadFixture(page: import("@playwright/test").Page): Promise<void> {
  await page.getByTestId("midi-file-input").setInputFiles(FIXTURE);
  await expect(page.getByTestId("analysis-card")).toBeVisible({ timeout: 15_000 });
}

async function serializeRoll(page: import("@playwright/test").Page): Promise<string> {
  return page.getByTestId("roll-serialize").innerText();
}

test("accompaniment journey: generate -> seed -> reload determinism -> thinning -> preview states (D76)", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Compose mode (shortcut 1)" }).click();
  await expect(page.getByText("Drop a .mid file to get started.")).toBeVisible({
    timeout: 10_000,
  });

  // LEG 1: panel + generate with the DEFAULTS.
  await uploadFixture(page);
  const panel = page.getByTestId("accompaniment-panel");
  await expect(panel).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("accomp-style")).toHaveValue("jazz");
  await expect(page.getByTestId("accomp-seed")).toHaveValue("42");
  await page.getByTestId("accomp-generate").click();
  await expect(page.getByTestId("accomp-meta")).toContainText("seed 42", { timeout: 5_000 });
  const metaText = (await page.getByTestId("accomp-meta").innerText()) ?? "";
  expect(metaText).toMatch(/\d+ notes/); // counts visible
  await expect(page.getByTestId("roll-layer-bass")).toBeVisible();
  await expect(page.getByTestId("roll-layer-chords")).toBeVisible();
  await expect(page.getByTestId("roll-layer-bass").locator("rect")).not.toHaveCount(0, {
    timeout: 5_000,
  });
  const summary42 = await serializeRoll(page);
  expect(summary42.length).toBeGreaterThan(50);

  // LEG 2: seed 42 -> 43 changes the SERIALIZED SUMMARY (not just a
  // count - approach picks differ per seed).
  await page.getByTestId("accomp-seed").fill("43");
  await page.getByTestId("accomp-generate").click();
  await expect(page.getByTestId("accomp-meta")).toContainText("seed 43", { timeout: 5_000 });
  const summary43 = await serializeRoll(page);
  expect(summary43).not.toBe(summary42);

  // LEG 3: RELOAD + re-upload -> request RESTORED (the browser-level
  // proof partialize keeps request, D73) -> same seed reproduces leg
  // 1's summary BYTE-identically (REQ-FND-3 across reload).
  await page.reload();
  await expect(page.getByTestId("reupload-prompt")).toBeVisible({ timeout: 10_000 });
  await uploadFixture(page);
  await expect(page.getByTestId("accompaniment-panel")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("accomp-style")).toHaveValue("jazz");
  await expect(page.getByTestId("accomp-seed")).toHaveValue("43"); // persisted
  await page.getByTestId("accomp-seed").fill("42");
  await page.getByTestId("accomp-generate").click();
  await expect(page.getByTestId("accomp-meta")).toContainText("seed 42", { timeout: 5_000 });
  const summary42Again = await serializeRoll(page);
  expect(summary42Again).toBe(summary42); // byte-identical across reload

  // LEG 4: density 5 vs 0 -> strictly fewer notes (thinning visible).
  await page.getByTestId("accomp-density").fill("5");
  await page.getByTestId("accomp-generate").click();
  const denseCount =
    (await page.getByTestId("roll-layer-bass").locator("rect").count()) +
    (await page.getByTestId("roll-layer-chords").locator("rect").count());
  await page.getByTestId("accomp-density").fill("0");
  await page.getByTestId("accomp-generate").click();
  const thinCount =
    (await page.getByTestId("roll-layer-bass").locator("rect").count()) +
    (await page.getByTestId("roll-layer-chords").locator("rect").count());
  expect(thinCount).toBeLessThan(denseCount);
  expect(thinCount).toBeGreaterThan(0); // anchors survive

  // LEG 5: preview state machine (idle -> rendering -> playing ->
  // idle). Audio OUTPUT is manual (RK6); a headless browser proves
  // the plumbing: "rendering" is only entered by a real
  // renderAccompaniment call, "playing" only after a buffer exists.
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="accomp-preview"]');
    const holder = window as unknown as { __previewStates?: string[] };
    holder.__previewStates = [];
    if (btn !== null) {
      const obs = new MutationObserver(() => {
        holder.__previewStates?.push(btn.getAttribute("data-preview") ?? "?");
      });
      obs.observe(btn, { attributes: true, attributeFilter: ["data-preview"] });
    }
  });
  await expect(page.getByTestId("accomp-preview")).toHaveAttribute("data-preview", "idle");
  await page.getByTestId("accomp-preview").click();
  await expect(page.getByTestId("accomp-preview")).toHaveAttribute("data-preview", "playing", {
    timeout: 15_000,
  });
  await page.getByTestId("accomp-preview").click(); // Stop
  await expect(page.getByTestId("accomp-preview")).toHaveAttribute("data-preview", "idle", {
    timeout: 5_000,
  });
  const states = await page.evaluate(
    () => (window as unknown as { __previewStates?: string[] }).__previewStates ?? [],
  );
  expect(states).toContain("rendering");
  expect(states).toContain("playing");
  expect(states[states.length - 1]).toBe("idle");
});
