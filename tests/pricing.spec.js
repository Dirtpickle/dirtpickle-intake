const { test, expect } = require('@playwright/test');
const { setup, newClient, goHome } = require('./helpers/app');

test('pricing suggestion rounds to the nearest configured amount', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => Pricing.suggest(90 * 60 * 1000, 120))).toBe(180);
  expect(await page.evaluate(() => Pricing.suggest(60 * 60 * 1000, 123, { round: 5 }))).toBe(125);
  expect(await page.evaluate(() => Pricing.suggest(30 * 60 * 1000, 125, { round: 0 }))).toBe(62.5);
});

test('finished timed session offers a suggestion without overwriting price', async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => Events.create({ name: 'Hourly pricing', date: '2026-11-27', hourlyApplies: true }));
  await newClient(page, 'Pricing Client');
  await goHome(page);
  await page.locator('[data-go="settings"]').click();
  await page.locator('#hourlyRate').fill('120');
  await page.locator('#priceRound').fill('5');
  await page.locator('#saveSettings').click();
  await page.locator('[data-go="home"]').click();
  await page.locator('[data-go="queue"]').click();
  await page.locator('[data-go="walkin"]').click();
  await page.locator('#q').fill('Pricing Client');
  await page.locator('[data-pick]').click();
  await page.getByText('No flash / custom design').click();
  await page.locator('[data-go="session"]').click();
  await page.locator('#s_price').fill('77');
  await page.locator('#tStart').click();
  await page.locator('#tDone').click();
  await expect(page.locator('#priceSuggestion')).toContainText('Suggested: $0');
  await expect(page.locator('#s_price')).toHaveValue('77');
  await page.locator('#useSuggested').click();
  await expect(page.locator('#s_price')).toHaveValue('0');
});

test('flash session hides hourly suggestion until event pricing is enabled', async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => Events.create({ name: 'Flash pricing', date: '2026-11-27', hourlyApplies: false }));
  await newClient(page, 'Flash Pricing Client');
  await goHome(page);
  await page.evaluate(async () => {
    const f = { type: 'flash', name: 'Test flash', sheet: 'Test', price: 100, minutes: 60, status: 'available', image: '' };
    await DB.put(f);
  });
  await page.locator('[data-go="queue"]').click();
  await page.locator('[data-go="walkin"]').click();
  await page.locator('#q').fill('Flash Pricing Client');
  await page.locator('[data-pick]').click();
  await page.getByText('Test flash').click();
  await page.locator('[data-go="session"]').click();
  await page.locator('#tStart').click();
  await page.locator('#tDone').click();
  await expect(page.locator('#priceSuggestion')).toHaveCount(0);
  await page.locator('[data-go="queue"]').click();
  await page.locator('[data-go="home"]').click();
  await page.evaluate(async () => Events.update(Events.getActive().id, { hourlyApplies: true }));
  await page.locator('[data-go="queue"]').click();
  await page.locator('[data-go="session"]').click();
  await expect(page.locator('#priceSuggestion')).toBeVisible();
});
