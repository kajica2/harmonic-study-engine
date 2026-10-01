// scripts/generate-book.mjs — drive the deployed app, generate the real
// book PDF (Verovio engraving + memory cards), save the download.
import { chromium } from 'playwright';

const APP = process.env.APP_URL || 'https://harmonic-study-engine.vercel.app';
const OUT = process.env.OUT || '/tmp/beginner-trumpet-vol1-real.pdf';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ acceptDownloads: true });

try {
  console.log('Loading app...');
  await page.goto(APP, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Press 4 to enter marketplace mode
  await page.keyboard.press('4');
  await page.waitForTimeout(3000);

  // Find the Book section
  const bookHeading = page.locator('text=Book').first();
  if (await bookHeading.count()) {
    console.log('Book section found');
  } else {
    console.log('Book section NOT found - dumping visible text');
    const body = await page.locator('body').innerText();
    console.log(body.slice(0, 800));
    throw new Error('Book section missing');
  }

  // Enable Verovio engraving if the checkbox exists
  const verovioCheck = page.locator('input[type="checkbox"]').filter({ hasText: /verovio/i });
  // Try label-based
  const verovioLabel = page.locator('label:has-text("Verovio")').first();
  if (await verovioLabel.count()) {
    await verovioLabel.click();
    console.log('Verovio engraving enabled');
  }

  // Click "Generate book PDF"
  const genBtn = page.locator('button:has-text("Generate book PDF")').first();
  if (await genBtn.count()) {
    console.log('Clicking Generate book PDF...');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120000 }),
      genBtn.click(),
    ]);
    await download.saveAs(OUT);
    console.log('Saved:', OUT);
  } else {
    // Try "Generate" variants
    const anyGen = page.locator('button:has-text("Generate")').first();
    if (await anyGen.count()) {
      console.log('Clicking Generate...');
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 120000 }),
        anyGen.click(),
      ]);
      await download.saveAs(OUT);
      console.log('Saved:', OUT);
    } else {
      const body = await page.locator('body').innerText();
      console.log('No generate button. Body:', body.slice(0, 1000));
      throw new Error('No generate button found');
    }
  }
} catch (e) {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}