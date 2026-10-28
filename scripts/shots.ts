/** Dev: full-page screenshots of the running app (pnpm start -p 3123) → tmp/shot_*.png */
import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:3123/');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'tmp/shot_home.png', fullPage: true });
  await page.waitForTimeout(3500);
  const chart = page.getByTestId('chart');
  await chart.scrollIntoViewIfNeeded();
  const box = (await chart.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.5);
  await page.waitForTimeout(900);
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.4);
  await page.waitForTimeout(800);
  await page.locator('#trade').screenshot({ path: 'tmp/shot_trade_dbg.png' });
  await page.getByTestId('add-entry').click({ timeout: 5000 });
  await page.waitForTimeout(900);
  await chart.scrollIntoViewIfNeeded();
  let b2 = (await chart.boundingBox())!;
  await page.mouse.click(b2.x + b2.width * 0.45, b2.y + b2.height * 0.55);
  await page.waitForTimeout(900);
  await page.waitForTimeout(600);
  await page.getByTestId('add-exit').click();
  await page.waitForTimeout(900);
  await chart.scrollIntoViewIfNeeded();
  b2 = (await chart.boundingBox())!;
  await page.mouse.click(b2.x + b2.width * 0.6, b2.y + b2.height * 0.45);
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'tmp/shot_trade.png', fullPage: true });
  console.log(await page.getByTestId('fills-table').innerText());
  await page.getByTestId('play-toggle').click();
  await page.getByTestId('scrubber').fill('740');
  await page.getByTestId('preview-canvas').screenshot({ path: 'tmp/shot_preview.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:3123/');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tmp/shot_mobile.png', fullPage: false });
  console.log('errors', errors);
  await browser.close();
}
main();
