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
  const started = Date.now();
  await page.locator('#fImport').setInputFiles(images.map(name => path.join(folder, name)));
  const elapsed = Date.now() - started;
  await expect(page.locator('.fitem')).toHaveCount(images.length);
  console.log(`Imported ${images.length} flash images in ${elapsed} ms`);
});
