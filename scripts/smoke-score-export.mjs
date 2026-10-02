import { chromium } from 'playwright';
const APP = 'https://harmonic-study-engine.vercel.app';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ acceptDownloads: true });
try {
  await page.goto(APP, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.keyboard.press('4');
  await page.waitForTimeout(3000);

  const svgBtn = page.getByRole('button', { name: /svg/i }).first();
  const pngBtn = page.getByRole('button', { name: /png/i }).first();
  const xmlBtn = page.getByRole('button', { name: /musicxml/i }).first();
  console.log('SVG button:', await svgBtn.count() ? 'FOUND' : 'MISSING');
  console.log('PNG button:', await pngBtn.count() ? 'FOUND' : 'MISSING');
  console.log('MusicXML button:', await xmlBtn.count() ? 'FOUND' : 'MISSING');

  if (await svgBtn.count()) {
    console.log('clicking Download SVG (all)...');
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      svgBtn.click(),
    ]);
    await dl.saveAs('/tmp/smoke-scores.zip');
    console.log('SVG zip saved:', dl.suggestedFilename());
  }
} catch (e) {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
