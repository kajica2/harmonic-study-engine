/**
 * e2e/compose-mixer-export.spec.ts - PRD-001 Phase 4 Slice 4 (D92).
 *
 * Fixture strategy (D65 rails, copied from compose-accompaniment.spec
 * .ts): MIDI bytes generated IN-SPEC with @tonejs/midi (+ a keySig
 * event inserted via the already-bundled midi-file), handed to the
 * page via setInputFiles(buffer). Requires `npm run build` first
 * (serves dist/ on :4173). The EXISTING compose-accompaniment.spec.ts
 * must survive UNEDITED (D92.7 - run it in the full-gates step).
 *
 * Discriminative legs (each fails if its mechanism is removed):
 *  1. MIXER STATE: 4 rows; M flips aria-pressed; S dims the other
 *     rows via data-dimmed; Play mix -> rendering -> playing -> Stop
 *     -> idle (STATE + DOM assertions - audio OUTPUT is manual,
 *     honest: the S3 leg-5 precedent).
 *  2. EXPORT FIDELITY (REQ-COMP-40) BEFORE any override: the FILE
 *     tempo map + meter change preserved, track count = originals +
 *     2 roles, drums EXPORTED (data != mix), keySig ROUND-TRIPS (the
 *     D80 insertion - equality, not degradation).
 *  3. TEMPO TRUTH (TD-043 close-out pinned end-to-end): override 150
 *     -> Export MIDI -> download -> parse IN-SPEC -> the SINGLE
 *     override tempo. (Legs 2/3 are SWAPPED vs the D92 sketch: the
 *     tempo CommitField rejects "" by design, so the no-override
 *     export must run FIRST.)
 *  4. WAV (REQ-COMP-41/43): RIFF/WAVE magic + the effective-key
 *     filename regex.
 *  5. CHART PASTE (REQ-IO-10..16): paste -> live parse (bars/warnings
 *     per the REAL grammar) -> % repeat + split bar VISIBLE in the
 *     editable preview -> cell edit -> Use chart -> chart-only mixer
 *     row DISABLED -> Generate -> roll layers -> Play mix -> playing.
 *  6. URL ROUND TRIP (REQ-IO-50/51, fresh context = cross-device
 *     proxy): cchart present + cfile ABSENT -> new context -> chart
 *     loads with NO upload. Sub-leg: MIDI session URL (cfile+chash)
 *     -> fresh context -> hash-gate prompt carries the URL identity
 *     -> re-upload -> "edits restored" (the override survives).
 */
import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import type { Midi as MidiType } from "@tonejs/midi";

const requireCjs = createRequire(import.meta.url);
const { Midi } = requireCjs("@tonejs/midi") as { Midi: typeof MidiType };
const { parseMidi, writeMidi } = requireCjs("midi-file") as {
  parseMidi: (bytes: Uint8Array) => {
    header: Record<string, unknown>;
    tracks: { type: string; deltaTime: number; meta?: boolean; key?: number; scale?: number }[][];
  };
  writeMidi: (data: unknown) => number[];
};

test.setTimeout(120_000);

const BAR_TICKS = 1920;

/** 8 bars of C / Dm7 / G7 -> C (ch0 piano + ch1 melody), a channel-9
 *  drum track (the D78 disclosure + D80 "export includes drums"
 *  proof), TWO tempos (120 + 96@7680), a METER CHANGE (3/4@9600) and
 *  a C-major keySig INSERTED at the byte level (the @tonejs encoder
 *  keySig path is broken per errata D6 - midi-file writes the real
 *  spec byte). */
function buildFixtureBuffer(): Buffer {
  const prog: readonly { readonly chord: readonly number[]; readonly line: readonly number[] }[] = [
    { chord: [60, 64, 67], line: [72, 76, 79, 72] }, // C
    { chord: [62, 65, 69, 72], line: [74, 77, 81, 74] }, // Dm7
    { chord: [55, 59, 62, 65], line: [79, 74, 71, 67] }, // G7
    { chord: [60, 64, 67], line: [72, 76, 79, 84] }, // C
  ];
  const midi = new Midi();
  midi.header.tempos.push({ ticks: 0, bpm: 120 });
  midi.header.tempos.push({ ticks: 7680, bpm: 96 });
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  midi.header.timeSignatures.push({ ticks: 9600, timeSignature: [3, 4] });
  const chords = midi.addTrack();
  chords.name = "Piano";
  chords.channel = 0;
  chords.instrument.number = 0;
  const melody = midi.addTrack();
  melody.name = "Melody";
  melody.channel = 1;
  melody.instrument.number = 56;
  const drums = midi.addTrack();
  drums.name = "Drums";
  drums.channel = 9;
  for (let b = 0; b < 8; b++) {
    const step = prog[b % prog.length];
    for (const m of step.chord) {
      chords.addNote({ midi: m, ticks: b * BAR_TICKS, durationTicks: BAR_TICKS, velocity: 0.7 });
    }
    step.line.forEach((m, q) => {
      melody.addNote({ midi: m, ticks: b * BAR_TICKS + q * 480, durationTicks: 440, velocity: 0.8 });
    });
    drums.addNote({ midi: 36, ticks: b * BAR_TICKS, durationTicks: 120, velocity: 0.9 });
  }
  // Insert the C-major keySig (sf 0, scale 0) into track 0 at the
  // byte level via midi-file (the encoder bypass, D80).
  const raw = new Uint8Array(midi.toArray());
  const parsed = parseMidi(raw);
  parsed.tracks[0].splice(1, 0, {
    meta: true,
    type: "keySignature",
    deltaTime: 0,
    key: 0,
    scale: 0,
  });
  return Buffer.from(writeMidi(parsed));
}

const FIXTURE = { name: "s4-fixture.mid", mimeType: "audio/midi", buffer: buildFixtureBuffer() };

async function uploadFixture(page: import("@playwright/test").Page): Promise<void> {
  await page.getByTestId("midi-file-input").setInputFiles(FIXTURE);
  await expect(page.getByTestId("analysis-card")).toBeVisible({ timeout: 15_000 });
}

async function grabDownload(
  page: import("@playwright/test").Page,
  click: () => Promise<void>,
): Promise<{ bytes: Buffer; name: string }> {
  const wait = page.waitForEvent("download", { timeout: 30_000 });
  await click();
  const dl = await wait;
  const path = await dl.path();
  return { bytes: readFileSync(path!), name: dl.suggestedFilename() };
}

test("S4 journey: mixer state -> tempo truth -> export fidelity -> WAV -> chart paste -> URL round-trip", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Compose mode (shortcut 1)" }).click();
  await expect(page.getByText("Drop a .mid file to get started.")).toBeVisible({ timeout: 10_000 });

  // --- LEG 1: MIXER STATE (REQ-COMP-37, state + DOM only - audio is
  // manual per RK-S4-1; the render path itself is proven by the
  // rendering->playing transitions, exactly the S3 leg-5 logic).
  await uploadFixture(page);
  await page.getByTestId("accomp-generate").click();
  await expect(page.getByTestId("accomp-meta")).toContainText("seed 42", { timeout: 5_000 });
  const mixer = page.getByTestId("compose-mixer");
  await expect(mixer).toBeVisible();
  for (const g of ["original", "bass", "chords", "pad"]) {
    await expect(page.getByTestId(`mix-row-${g}`)).toBeVisible();
  }
  await expect(page.getByTestId("mix-row-original")).toHaveAttribute("data-disabled", "false");
  // Drums in the file -> the honest disclosure label (D78).
  await expect(page.getByTestId("mix-original-sub")).toContainText("drums not played");
  await page.getByTestId("mix-mute-original").click();
  await expect(page.getByTestId("mix-mute-original")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("mix-solo-bass").click();
  await expect(page.getByTestId("mix-row-chords")).toHaveAttribute("data-dimmed", "true");
  await expect(page.getByTestId("mix-row-original")).toHaveAttribute("data-dimmed", "true");
  await expect(page.getByTestId("mix-row-bass")).toHaveAttribute("data-dimmed", "false");
  // Play mix -> rendering -> playing -> Stop -> idle.
  await expect(page.getByTestId("mix-play")).toHaveAttribute("data-preview", "idle");
  await page.getByTestId("mix-play").click();
  await expect(page.getByTestId("mix-play")).toHaveAttribute("data-preview", "playing", {
    timeout: 20_000,
  });
  await page.getByTestId("mix-play").click(); // Stop
  await expect(page.getByTestId("mix-play")).toHaveAttribute("data-preview", "idle", {
    timeout: 5_000,
  });

  // --- LEG 2: EXPORT FIDELITY (REQ-COMP-40) BEFORE any override ->
  // the file's map (two tempos + meter change) preserved; track
  // count = originals + 2 roles; keySig ROUND-TRIPS (D80 insertion -
  // the equality arm, not the documented degradation).
  const midiDl2 = await grabDownload(page, () => page.getByTestId("mix-export-midi").click());
  const full = new Midi(midiDl2.bytes);
  expect(full.header.tempos.length).toBe(2);
  expect(full.header.tempos[0].bpm).toBeCloseTo(120, 1);
  expect(full.header.tempos[1].bpm).toBeCloseTo(96, 1);
  expect(full.header.timeSignatures.length).toBe(2);
  expect(Array.from(full.header.timeSignatures[1].timeSignature)).toEqual([3, 4]);
  expect(full.header.keySignatures.length).toBe(1);
  expect(full.header.keySignatures[0].key).toBe("C"); // sf byte 0 read back CORRECTLY
  expect(full.header.keySignatures[0].scale).toBe("major");
  expect(full.tracks.length).toBe(5); // piano + melody + drums + bass + chords
  expect(full.tracks.some((t) => t.channel === 9 && t.notes.length > 0)).toBe(true); // drums EXPORT (data != mix)
  expect(full.tracks.some((t) => t.instrument.number === 33)).toBe(true); // GM bass 33

  // --- LEG 3: TEMPO TRUTH (D79/TD-043 close-out pinned through a
  // REAL export download): override 150 -> the SINGLE override tempo.
  await page.getByTestId("tempo-input").fill("150");
  await page.getByTestId("tempo-input").press("Enter");
  await expect(page.getByTestId("tempo-input")).toHaveValue("150");
  const midiDl = await grabDownload(page, () => page.getByTestId("mix-export-midi").click());
  const exported = new Midi(midiDl.bytes);
  expect(exported.header.tempos.length).toBe(1);
  expect(exported.header.tempos[0].bpm).toBeCloseTo(150, 1);

  // --- LEG 4: WAV (REQ-COMP-41/43): RIFF/WAVE magic + effective-key
  // filename (fixture key C major -> spellTonic "C").
  const wavDl = await grabDownload(page, () => page.getByTestId("mix-export-wav").click());
  expect(wavDl.bytes.subarray(0, 4).toString()).toBe("RIFF");
  expect(wavDl.bytes.subarray(8, 12).toString()).toBe("WAVE");
  expect(wavDl.name).toMatch(/_accomp_C\.wav$/);

  // --- LEG 5: CHART PASTE (REQ-IO-10..16). The REAL grammar: each
  // whitespace token is a BAR, so this chart is 8 bars (the design
  // sketch's "4 bars" counted pipe-groups - the parser's rule is the
  // authority, RK-S4-4). % repeats bar 5 (Bbmaj7); "F7/Am" SPLITS
  // into two cells; "junk" is the one non-fatal warning.
  await page.getByTestId("start-over").click();
  await expect(page.getByTestId("paste-chart-button")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("paste-chart-button").click();
  await page.getByTestId("chart-textarea").fill(
    "{key: Bb}\n{tempo: 132}\nBbmaj7 Gm7 Ebmaj7 Ab7 Bbmaj7 % junk F7/Am",
  );
  await expect(page.getByTestId("chart-parse-summary")).toContainText("8 bars", { timeout: 5_000 });
  await expect(page.getByTestId("chart-parse-summary")).toContainText("warnings: 1");
  await expect(page.getByTestId("chart-warnings")).toContainText("'junk' is not a chord symbol");
  await expect(page.getByTestId("chart-cell-5-0")).toHaveValue("Bbmaj7"); // % repeat
  await expect(page.getByTestId("chart-cell-7-0")).toHaveValue("F7"); // split cell 1
  await expect(page.getByTestId("chart-cell-7-1")).toHaveValue("Am"); // split cell 2
  await page.getByTestId("chart-cell-1-0").fill("Gm9"); // EDITABLE preview (REQ-IO-14)
  await expect(page.getByTestId("chart-cell-1-0")).toHaveAttribute("data-reject", "false");
  await page.getByTestId("chart-use").click();
  await expect(page.getByTestId("chart-summary-card")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("chart-directives")).toContainText("key: Bb major");
  await expect(page.getByTestId("chart-directives")).toContainText("tempo: 132");
  await expect(page.getByTestId("analysis-card")).toHaveCount(0); // honest chart header
  await expect(page.getByTestId("mix-row-original")).toHaveAttribute("data-disabled", "true");
  await expect(page.getByTestId("mix-original-sub")).toContainText("chart only");
  await page.getByTestId("accomp-generate").click();
  await expect(page.getByTestId("accomp-meta")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("roll-layer-bass")).toBeVisible();
  await page.getByTestId("mix-play").click();
  await expect(page.getByTestId("mix-play")).toHaveAttribute("data-preview", "playing", {
    timeout: 20_000,
  });
  await page.getByTestId("mix-play").click();

  // --- LEG 6: URL ROUND TRIP (REQ-IO-50 compose + REQ-IO-51).
  await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("cchart=");
  const chartUrl = page.url();
  expect(chartUrl).not.toContain("cfile="); // chart identity rides cchart ALONE
  {
    const ctx = await browser.newContext(); // fresh storage = cross-device proxy
    const p2 = await ctx.newPage();
    await p2.goto(chartUrl);
    await p2.getByRole("tab", { name: "Compose mode (shortcut 1)" }).click();
    await expect(p2.getByTestId("chart-summary-card")).toBeVisible({ timeout: 15_000 });
    await expect(p2.getByTestId("reupload-prompt")).toHaveCount(0); // NO upload needed
    // The EDITED cell survived the URL round-trip (committed text is
    // regenerated from the approved preview grid - D84 honesty):
    await p2.getByTestId("chart-edit-button").click();
    await expect(p2.getByTestId("chart-cell-0-0")).toHaveValue("Bbmaj7");
    await expect(p2.getByTestId("chart-cell-1-0")).toHaveValue("Gm9");
    await ctx.close();
  }
  // Sub-leg: the MIDI-session URL (cfile + chash) seeds the EXISTING
  // hash-gate prompt cross-device, and the override rides covr.
  await page.getByTestId("chart-start-over").click();
  await uploadFixture(page);
  await page.getByTestId("tempo-input").fill("140");
  await page.getByTestId("tempo-input").press("Enter");
  await expect
    .poll(() => page.url(), { timeout: 10_000 })
    .toContain("cfile=s4-fixture.mid");
  const midiUrl = page.url();
  expect(midiUrl).toContain("chash=");
  {
    const ctx = await browser.newContext();
    const p3 = await ctx.newPage();
    await p3.goto(midiUrl);
    await p3.getByRole("tab", { name: "Compose mode (shortcut 1)" }).click();
    await expect(p3.getByTestId("reupload-prompt")).toBeVisible({ timeout: 10_000 });
    await expect(p3.getByTestId("reupload-file-name")).toContainText("s4-fixture.mid");
    await p3.getByTestId("midi-file-input").setInputFiles(FIXTURE);
    await expect(p3.getByTestId("compose-notice")).toContainText("edits restored", {
      timeout: 15_000,
    });
    await expect(p3.getByTestId("tempo-input")).toHaveValue("140"); // covr restored
    await ctx.close();
  }
});
