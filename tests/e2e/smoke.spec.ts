import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test('demo replay plays and exports a valid MP4', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const scrub = page.getByTestId('scrubber');
  await expect.poll(async () => Number(await scrub.inputValue()), { timeout: 10_000 }).toBeGreaterThan(0);
  await page.screenshot({ path: 'tmp/home.png', fullPage: true });

  // final frame via the scrubber
  await page.getByTestId('play-toggle').click();
  await scrub.fill('749');
  await page.getByTestId('preview-canvas').screenshot({ path: 'tmp/preview-final.png' });

  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.getByTestId('download-mp4').click()]);
  expect(download.suggestedFilename()).toMatch(/^replayed-HYPE-replayedtrade-\d{8}\.mp4$/);
  await download.saveAs('tmp/export.mp4');
  expect(fs.statSync('tmp/export.mp4').size).toBeGreaterThan(100_000);
  expect(errors).toEqual([]);
});

test('pick on chart: entry, exit, extra entry updates the executions table', async ({ page }) => {
  await page.goto('/');
  const chart = page.getByTestId('chart');
  await expect(chart).toBeVisible();
  await page.waitForTimeout(3500);
  await chart.scrollIntoViewIfNeeded();
  let b = (await chart.boundingBox())!;
  await page.mouse.click(b.x + b.width * 0.25, b.y + b.height * 0.5);
  await page.waitForTimeout(900);
  await page.mouse.click(b.x + b.width * 0.75, b.y + b.height * 0.45);
  await expect(page.getByTestId('fills-table')).toContainText('1 in · 1 out', { ignoreCase: true });
  await page.getByTestId('add-entry').click();
  await page.waitForTimeout(900);
  await chart.scrollIntoViewIfNeeded();
  b = (await chart.boundingBox())!;
  await page.mouse.click(b.x + b.width * 0.45, b.y + b.height * 0.5);
  await expect(page.getByTestId('fills-table')).toContainText('2 in · 1 out', { ignoreCase: true });

  // size in tokens instead of USD
  await page.getByTestId('size-mode').getByRole('radio', { name: 'HYPE' }).click();
  await page.getByTestId('size-amount').fill('100');
  await expect(page.getByText('Max position (HYPE)')).toBeVisible();
  await expect(page.getByTestId('fills-table')).toContainText('HYPE');
  await expect(page.getByTestId('size-amount')).toHaveValue('100');

  // a partial exit sized in exact tokens: 100 HYPE max → close 40, the last exit closes the other 60+
  await page.getByTestId('add-exit').click();
  await page.waitForTimeout(900);
  await chart.scrollIntoViewIfNeeded();
  b = (await chart.boundingBox())!;
  await page.mouse.click(b.x + b.width * 0.6, b.y + b.height * 0.45);
  await expect(page.getByTestId('fills-table')).toContainText('2 in · 2 out', { ignoreCase: true });
  await page.getByTestId('exit-unit').getByRole('radio', { name: 'HYPE' }).click();
  const exitInput = page.locator('[data-testid^="exit-size-"]').first();
  await exitInput.fill('40');
  await expect(exitInput).toHaveValue('40');
  await expect(page.getByTestId('closes-rest')).toContainText('HYPE');
  await page.getByTestId('exit-unit').getByRole('radio', { name: 'USD' }).click();
  await expect(page.getByTestId('closes-rest')).toContainText('$');
});

test('typing an X handle loads its profile picture', async ({ page }) => {
  await page.goto('/');
  const input = page.getByTestId('username');
  await input.fill('hyperliquidx');
  await expect(page.getByTestId('x-avatar-status')).toContainText('loaded from X', { timeout: 20_000 });
  await expect(page.getByTestId('avatar-preview')).toBeVisible();
  await input.fill('nohandle_zz9q01');
  await expect(page.getByTestId('x-avatar-status')).toContainText('No X profile picture', { timeout: 20_000 });
});

test('broken share link falls back to the demo', async ({ page }) => {
  await page.goto('/?r=garbage');
  await expect(page.getByTestId('banner')).toBeVisible();
});
