import { chromium } from 'playwright';
const APP = process.env.APP_URL || 'https://harmonic-study-engine.vercel.app';
const OUT = process.env.OUT || '/tmp/beginner-trumpet-vol1-clean.pdf';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ acceptDownloads: true });
try {
  await page.goto(APP, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.keyboard.press('4');
  await page.waitForTimeout(3000);
  // Enable Verovio engraving
  const vLabel = page.locator('label:has-text("Verovio")').first();
  if (await vLabel.count()) { await vLabel.click(); console.log('Verovio on'); }
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
