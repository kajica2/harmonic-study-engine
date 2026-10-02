/**
 * e2e/book-score-export.spec.ts - SVG + PNG score export from the book
 * flow (src/components/BookSection.tsx -> src/lib/scoreImages.ts).
 *
 * The browser half (Verovio WASM engraving, canvas rasterization) is
 * deliberately NOT unit-tested per policy, so this spec is its
 * verification: it drives the real built bundle, downloads the ZIP,
 * and unzips it IN-SPEC to pin the payload.
 *
 * Legs (each fails if its mechanism is removed):
 *  1. GATING: with zero exercises selected, both score buttons are
 *     disabled (the shared busy/empty guard).
 *  2. SVG: Download SVG (all) fires a real download named
 *     harmonic-study-book-svg.zip whose single member is a {slug}.svg
 *     carrying xmlns + engraved <path> glyphs (portable, no music font).
 *  3. PNG: Download PNG (all) fires harmonic-study-book-png.zip whose
 *     single member is a {slug}.png with the PNG magic bytes and real
 *     raster dimensions (canvas produced a non-empty image).
 *
 * Only ONE exercise is selected so the engraving stays fast and the
 * archive content is exactly assertable (one member, no name guessing).
 *
 * Run via `npx playwright test e2e/book-score-export.spec.ts`
 * (requires `npm run build` first - the config serves dist/ on :4173).
 */
import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const requireCjs = createRequire(import.meta.url);
const { unzipSync } = requireCjs("fflate") as {
  unzipSync: (data: Uint8Array) => Record<string, Uint8Array>;
};

test.setTimeout(180_000);

/** Read a Playwright download into unzipped members keyed by name. */
async function downloadZip(download: {
  path(): Promise<string | null>;
  suggestedFilename(): string;
}): Promise<{ zipName: string; members: Record<string, Uint8Array> }> {
  const zipName = download.suggestedFilename();
  const filePath = await download.path();
  if (!filePath) throw new Error("download has no temp file");
  const bytes = new Uint8Array(await readFile(filePath));
  return { zipName, members: unzipSync(bytes) };
}

/** PNG big-endian dimensions straight out of the IHDR chunk. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

test("book flow exports engraved SVG and PNG score ZIPs", async ({ page }) => {
  await page.goto("/?mode=marketplace");

  const book = page.locator('section[aria-label="Print-ready book"]');
  await expect(book.getByText("Print-Ready Book")).toBeVisible({
    timeout: 15_000,
  });

  const exerciseBoxes = book.locator("div.grid input[type='checkbox']");
  await expect(exerciseBoxes.first()).toBeVisible({ timeout: 15_000 });

  // Leg 1: empty selection disables both score buttons.
  const boxCount = await exerciseBoxes.count();
  for (let i = 0; i < boxCount; i++) {
    const box = exerciseBoxes.nth(i);
    if (await box.isChecked()) await box.uncheck();
  }
  const svgButton = book.getByRole("button", {
    name: "Download SVG scores for all selected exercises",
  });
  const pngButton = book.getByRole("button", {
    name: "Download PNG scores for all selected exercises",
  });
  await expect(svgButton).toBeDisabled();
  await expect(pngButton).toBeDisabled();

  // Exactly one exercise selected -> one archive member.
  await exerciseBoxes.first().check();
  await expect(svgButton).toBeEnabled();

  // Leg 2: SVG zip.
  const [svgDownload] = await Promise.all([
    page.waitForEvent("download"),
    svgButton.click(),
  ]);
  const svgZip = await downloadZip(svgDownload);
  expect(svgZip.zipName).toBe("harmonic-study-book-svg.zip");
  const svgNames = Object.keys(svgZip.members);
  expect(svgNames).toHaveLength(1);
  expect(svgNames[0]).toMatch(/^[a-z0-9-]+\.svg$/);
  const svgText = new TextDecoder().decode(svgZip.members[svgNames[0]]);
  expect(svgText).toContain("<svg");
  expect(svgText).toContain('xmlns="http://www.w3.org/2000/svg"');
  expect(svgText).toContain("<path");
  expect(await book.getByRole("status").innerText()).toContain("Downloaded SVG");

  // Leg 3: PNG zip (binary raster produced by canvas.toBlob).
  const [pngDownload] = await Promise.all([
    page.waitForEvent("download"),
    pngButton.click(),
  ]);
  const pngZip = await downloadZip(pngDownload);
  expect(pngZip.zipName).toBe("harmonic-study-book-png.zip");
  const pngNames = Object.keys(pngZip.members);
  expect(pngNames).toHaveLength(1);
  expect(pngNames[0]).toMatch(/^[a-z0-9-]+\.png$/);
  const pngBytes = pngZip.members[pngNames[0]];
  expect(Array.from(pngBytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  const { width, height } = pngSize(pngBytes);
  expect(width).toBeGreaterThan(100);
  expect(height).toBeGreaterThan(100);
  expect(await book.getByRole("status").innerText()).toContain("Downloaded PNG");
});
