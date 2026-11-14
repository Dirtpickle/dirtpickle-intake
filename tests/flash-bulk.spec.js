const { test, expect } = require('@playwright/test');
const { setup } = require('./helpers/app');
test('adds a range of text-only flash codes', async ({ page }) => {
  await setup(page);
  await page.locator('[data-go="flash"]').click();
  await page.locator('[data-go="flashRange"]').click();
  await page.locator('#f_from').fill('1');
  await page.locator('#f_to').fill('5');
  await page.locator('#f_suffix').fill('BF26');
  await page.locator('#fSave').click();
  await expect(page.locator('.fitem')).toHaveCount(5);
  await expect(page.locator('.fitem').first()).toContainText('1BF26');
  await expect(page.locator('img')).toHaveCount(0);
});
