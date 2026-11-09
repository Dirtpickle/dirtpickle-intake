const { test, expect } = require('@playwright/test');
const { setup, newClient, goHome } = require('./helpers/app');

test('walk-in queue creates a session and timer pauses', async ({ page }) => {
  await setup(page);
  await newClient(page, 'Queue Client');
  await goHome(page);
  await page.locator('[data-go="queue"]').click();
  await page.locator('[data-go="walkin"]').click();
  await page.locator('#q').fill('Queue Client');
  await page.locator('[data-pick]').click();
  await page.getByText('No flash / custom design').click();
  await expect(page.getByText('Queue Client')).toBeVisible();
  await page.locator('[data-go="session"]').click();
  await page.locator('#tStart').click();
  await expect(page.locator('#tPause')).toBeVisible();
  await page.locator('#tPause').click();
  await expect(page.locator('#tResume')).toBeVisible();
});
