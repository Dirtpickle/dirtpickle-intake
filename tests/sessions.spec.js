const { test, expect } = require('@playwright/test');
const { setup, newClient, goHome } = require('./helpers/app');

test('walk-in queue creates a session without a built-in timer', async ({ page }) => {
  await setup(page);
  await newClient(page, 'Queue Client');
  await goHome(page);
  await page.locator('[data-go="queue"]').click();
  await page.evaluate(() => go('flashPick', { id: DB.all('client')[0].id }));
  await page.getByText('No flash / custom design').click();
  await expect(page.getByText('Queue Client')).toBeVisible();
  await page.locator('[data-go="session"]').click();
  await page.locator('#tStart').click();
  await expect(page.locator('#tDone')).toBeVisible();
  await expect(page.locator('#timer')).toHaveCount(0);
  await expect(page.getByText('Pause (break)')).toHaveCount(0);
});
