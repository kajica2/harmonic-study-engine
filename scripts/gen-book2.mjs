import { chromium } from 'playwright';
const APP = process.env.APP_URL || 'https://harmonic-study-engine.vercel.app';
const OUT = process.env.OUT || '/tmp/beginner-trumpet-vol1-clean.pdf';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ acceptDownloads: true });
try {
  await page.goto(APP, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  console.log('LOADED URL:', page.url());
  const served = await page.evaluate(() => fetch('/src/lib/bookPdf.ts').then((r) => r.text()));
  console.log('served has patternPath:', served.includes('patternPath'));
  await page.keyboard.press('4');
  await page.waitForTimeout(3000);
  // Engraver checkbox: default is ON (verovio) - only click if unchecked.
  const vCheckbox = page.locator('input[type="checkbox"]').filter({ has: page.locator('xpath=..') }).first();
  const vBox = page.getByRole('checkbox', { name: /verovio/i });
  if (await vBox.count()) {
    const isChecked = await vBox.isChecked();
    if (!isChecked) await vBox.check();
    console.log('Verovio on:', await vBox.isChecked());
  } else {
    console.log('no verovio checkbox found');
  }
  // Select Triplets arpeggiation
  const arpSelect = page.locator('select').filter({ hasText: /Quarters|Eighths|Triplets/ }).first();
  if (await arpSelect.count()) {
    await arpSelect.selectOption({ label: 'Triplets' });
    console.log('Arpeggiation: Triplets');
  } else {
    // try by value
    const anySelect = page.locator('select').first();
    console.log('selects found:', await page.locator('select').count());
  }
  await page.waitForTimeout(500);
  const genBtn = page.locator('button:has-text("Generate book PDF")').first();
  if (await genBtn.count()) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 180000 }),
      genBtn.click(),
    ]);
    await download.saveAs(OUT);
    console.log('Saved:', OUT);
  } else {
    console.log('No generate button. Body:', (await page.locator('body').innerText()).slice(0, 800));
  }
} catch (e) { console.error('FAILED:', e.message); process.exitCode = 1; }
finally { await browser.close(); }
