const { test, expect } = require('@playwright/test');
const { setup } = require('./helpers/app');

test('normalizes and finds forgiving flash codes', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(() => FlashCode.find([{ code: '1BF26', name: 'Skull' }], '1-bf 26'));
  expect(result.name).toBe('Skull');
});

test('rejects duplicate codes and skips existing range entries', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => DB.put({ type: 'flash', id: 'existing', code: '1BF26', name: 'Existing', status: 'available', kind: 'repeatable' }));
  await page.locator('[data-go="flash"]').click();
  await page.locator('[data-go="flashAdd"]').click();
  await page.locator('#f_code').fill('1-BF-26');
  await page.locator('#fSave').click();
  await expect(page.locator('#fErr')).toContainText('already exists');
  await page.evaluate(() => go('flash'));
  await page.locator('[data-go="flashRange"]').click();
  await page.locator('#f_from').fill('1');
  await page.locator('#f_to').fill('2');
  await page.locator('#fSave').click();
  await expect(page.locator('.fitem')).toHaveCount(2);
});

test('migrates an old image flash record to a code-only record', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    await DB.put({ type: 'flash', id: 'old-image', name: 'Skull & Roses', image: 'data:image/jpeg;base64,old' });
    await Flash.migrateAll();
    return DB.get('old-image');
  });
  expect(result.code).toBe('SKULLROSES');
  expect(result.image).toBeUndefined();
});
