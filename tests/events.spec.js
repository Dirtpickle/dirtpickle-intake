const { test, expect } = require('@playwright/test');
const { setup, newClient, goHome, lock, unlock } = require('./helpers/app');

test('creates an event from home and a second event ends the first', async ({ page }) => {
  await setup(page);
  await expect(page.locator('[data-go="events"]')).toContainText('No active event');
  await page.locator('[data-go="events"]').click();
  await page.locator('[data-go="eventNew"]').click();
  await page.locator('#eventName').fill('Black Friday Flash');
  await page.locator('#eventDate').fill('2026-11-27');
  await page.locator('#eventMin').fill('80');
  await page.locator('#eventMax').fill('150');
  await page.locator('#saveEvent').click();
  await expect(page.locator('.card')).toContainText('Active');
  await page.locator('[data-go="eventNew"]').click();
  await page.locator('#eventName').fill('Friday the 13th');
  await page.locator('#eventDate').fill('2026-11-13');
  await page.locator('#eventMin').fill('90');
  await page.locator('#eventMax').fill('120');
  await page.locator('#saveEvent').click();
  await expect(page.locator('.card')).toContainText('Friday the 13th');
  await expect(page.locator('.card')).toContainText('Black Friday Flash');
  await expect(page.locator('.card')).toContainText('Ended');
  await page.locator('[data-go="home"]').click();
  await expect(page.locator('[data-go="events"]')).toContainText('Friday the 13th');
});

test('active event flash minimum applies to a new flash session', async ({ page }) => {
  await setup(page);
  await newClient(page, 'Event Price Client');
  await page.evaluate(async () => {
    await Events.create({ name: 'Price Range', date: '2026-11-27', flashMin: 90, flashMax: 110 });
    await DB.put({ type: 'flash', name: 'Unpriced flash', sheet: 'Test', price: null, minutes: 60, status: 'available', image: '' });
  });
  await goHome(page);
  await page.locator('[data-go="queue"]').click();
  await page.locator('[data-go="walkin"]').click();
  await page.locator('#q').fill('Event Price Client');
  await page.locator('[data-pick]').click();
  await page.getByText('Unpriced flash').click();
  await page.locator('[data-go="session"]').click();
  await expect(page.locator('#s_price')).toHaveValue('90');
  expect(await page.evaluate(() => DB.all('session')[0].eventId)).toBeTruthy();
});

test('migrates legacy settings event into an event record', async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => DB.put({ type: 'settings', id: 'settings', business: 'Dirtpickle', event: {
    name: 'Legacy Event', date: '2026-11-27', minPrice: 85, maxPrice: 125, markTaken: false, hourlyApplies: true
  } }));
  await lock(page);
  await page.getByRole('button', { name: 'Artist sign-in' }).click();
  await unlock(page);
  const result = await page.evaluate(() => ({ event: Events.getActive(), settings: DB.get('settings') }));
  expect(result.event.name).toBe('Legacy Event');
  expect(result.event.flashMin).toBe(85);
  expect(result.event.flashMax).toBe(125);
  expect(result.settings.event).toBeUndefined();
});
