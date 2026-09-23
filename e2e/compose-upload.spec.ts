/**
 * e2e/compose-upload.spec.ts - PRD-001 Phase 4 Slice 2 (D65,
 * REQ-COMP-1/21/24 + REQ-IO-51 + D57 persistence).
 *
 * Fixture strategy (D65): the MIDI bytes are generated IN-SPEC with
 * @tonejs/midi (specs run in NODE; precedent: etude-composer.spec.ts
 * imports src sources at spec level) and handed to the page via
 * setInputFiles({ name, mimeType, buffer }) - ZERO committed binaries,
 * deterministic, self-documenting. NO key-signature meta (the encoder
 * keySig byte is broken per errata D6; its absence exercises the
 * inferred-only blend path in a real browser).
 *
 * Discriminative legs (each fails if the mechanism it pins is removed):
 *  1. upload -> card with fileName + "C major" (auto tier) + >= 8 cells
 *  2. key override via the manual input -> merged truth flips
 *  3. RELOAD -> re-upload PROMPT names the file: the ONLY way to prove
 *     partialize residency in a browser (remove composeSession from
 *     the persist partialize and this leg shows the empty state
 *     instead - no prompt)
 *  4. re-setInputFiles -> hash MATCH restores the override (break the
 *     hash gate or the restore and the key reverts to C major)
 *  5. popover cell edit -> Cmd/Ctrl+Z restores the previous cell
 *     (remove the surface-local undo listener and the cell stays
 *     edited - REQ-COMP-24 in a real browser)
 *
 * Run AFTER `npm run build` (serves dist/ on :4173 via the shared
 * playwright webServer config).
 */
import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import type { Midi as MidiType } from "@tonejs/midi";

// Playwright loads specs as ESM; @tonejs/midi's package main is a UMD
// bundle whose named exports Node's cjs-lexer cannot statically see
// (vitest resolves the ESM "module" field instead, so the unit tests
// keep the plain named import). createRequire keeps the D65 contract -
// fixture generated IN-SPEC via @tonejs/midi - under both loaders.
const requireCjs = createRequire(import.meta.url);
const { Midi } = requireCjs("@tonejs/midi") as { Midi: typeof MidiType };

test.setTimeout(60_000);

const BAR_TICKS = 1920;

/** 8 bars of C / Dm7 / G7 -> C with a quarter-note melody line:
 *  diatonic mass 1.0 + V-I cadence + ii-V-I, ppq 480, 120 BPM, 4/4,
 *  NO key-signature meta (inferred-only blend path, D65). */
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

const FIXTURE = { name: "s2-fixture.mid", mimeType: "audio/midi", buffer: buildFixtureBuffer() };

async function uploadFixture(page: import("@playwright/test").Page): Promise<void> {
  await page.getByTestId("midi-file-input").setInputFiles(FIXTURE);
  await expect(page.getByTestId("analysis-card")).toBeVisible({ timeout: 15_000 });
}

test("compose upload journey: analyze -> override -> reload -> prompt -> restore -> undo (REQ-COMP-1/21/24, D57/D65)", async ({
  page,
}) => {
  await page.goto("/");
  // Enter Compose mode via the real tab UI (ModeGate wiring, zero
  // App.tsx edits - the surface reads the store).
  await page.getByRole("tab", { name: "Compose mode (shortcut 1)" }).click();
  await expect(page.getByText("Drop a .mid file to get started.")).toBeVisible({
    timeout: 10_000,
  });

  // LEG 1: upload -> card.
  await uploadFixture(page);
  await expect(page.getByTestId("analysis-file-name")).toHaveText("s2-fixture.mid");
  const key = page.getByTestId("key-value");
  await expect(key).toContainText("C major", { timeout: 5_000 });
  await expect(key).toHaveAttribute("data-tier", "auto"); // honest auto: mass 1.0 + cadence
  await expect(page.getByTestId(/^chord-cell-/)).toHaveCount(8, { timeout: 5_000 });

  // LEG 2: key override via the manual input (REQ-COMP-21).
  await page.getByTestId("key-change").click();
  await page.getByTestId("key-input").fill("F major");
  await page.getByTestId("key-input").press("Enter");
  await expect(page.getByTestId("key-value")).toContainText("F major");
  await expect(page.getByTestId("key-value")).toHaveAttribute("data-tier", "manual");

  // LEG 3: RELOAD -> re-upload PROMPT names the file. This is the
  // browser-discriminative proof of the D57 partialize residency:
  // the 30MB project is NOT persisted (prompt state), the small
  // composeSession record IS.
  await page.reload();
  await expect(page.getByTestId("reupload-prompt")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("reupload-file-name")).toContainText("s2-fixture.mid");
  await expect(page.getByText("Drop a .mid file to get started.")).toBeVisible();

  // LEG 4: re-upload the SAME bytes -> hash match -> overrides
  // restored (REQ-IO-51 semantics; 127.0.0.1 is a secure context so
  // crypto.subtle gives the real hash here).
  await uploadFixture(page);
  await expect(page.getByTestId("compose-notice")).toContainText("Previous edits restored", {
    timeout: 10_000,
  });
  await expect(page.getByTestId("key-value")).toContainText("F major");

  // LEG 5: popover cell edit + browser Ctrl+Z (REQ-COMP-23/24).
  const cell0 = page.getByTestId("chord-cell-0-0");
  const before = await cell0.innerText();
  expect(before).not.toBe("Am7");
  await cell0.click();
  await expect(page.getByTestId("chord-cell-popover")).toBeVisible();
  await page.getByTestId("chord-symbol-input").fill("Am7");
  await page.getByTestId("chord-symbol-input").press("Enter");
  await expect(cell0).toHaveText("Am7", { timeout: 5_000 });
  await page.keyboard.press("Control+z");
  await expect(cell0).toHaveText(before, { timeout: 5_000 }); // undo restored
  await page.keyboard.press("Control+Shift+z");
  await expect(cell0).toHaveText("Am7", { timeout: 5_000 }); // redo re-applied
});

test("upload edge arms in a real browser: wrong bytes banner stays empty-state (REQ-COMP-15/50)", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Compose mode (shortcut 1)" }).click();
  await page.getByTestId("midi-file-input").setInputFiles({
    name: "garbage.mid",
    mimeType: "audio/midi",
    buffer: Buffer.from("this is not a standard midi file"),
  });
  await expect(page.getByTestId("compose-error")).toContainText("Not a valid MIDI file", {
    timeout: 10_000,
  });
  // The drop zone survives; nothing entered the store.
  await expect(page.getByTestId("upload-drop-zone")).toBeVisible();
  await expect(page.getByTestId("analysis-card")).toHaveCount(0);
});
