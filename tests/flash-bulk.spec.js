const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { setup } = require('./helpers/app');

const folder = path.resolve(__dirname, '..', 'test-flash');
const images = fs.existsSync(folder) ? fs.readdirSync(folder).filter(name => /\.(png|jpe?g|webp)$/i.test(name)) : [];

test('imports every test flash image', async ({ page }) => {
  test.skip(!images.length, 'test-flash folder is missing or empty');
  await setup(page);
  await page.locator('[data-go="flash"]').click();
  page.on('dialog', async dialog => dialog.accept(dialog.message().startsWith('Kind') ? 'repeatable' : 'Sheet 1'));
  const started = Date.now();
  await page.locator('#fImport').setInputFiles(images.map(name => path.join(folder, name)));
  await expect(page.locator('.fitem')).toHaveCount(images.length);
  const elapsed = Date.now() - started;
  console.log(`Imported ${images.length} flash images in ${elapsed} ms`);
});
