const { test, expect } = require("@playwright/test");
const { setup } = require("./helpers/app");

test("pinMatches checks the unlock PIN without changing anything", async ({ page }) => {
  await setup(page);
  expect(await page.evaluate(() => DB.pinMatches("123456"))).toBe(true);
  expect(await page.evaluate(() => DB.pinMatches("654321"))).toBe(false);
  expect(await page.evaluate(() => DB.pinMatches("123456"))).toBe(true);
});

test("Settings can make this device's PIN match the sync PIN", async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => { settings = { ...settings, syncEnabled: true, syncPinDiffers: true }; await DB.put(settings); go("settingsGoogle"); });
  page.on("dialog", d => d.accept());
  await page.locator("#syncMatchPin").click();
  for (const digit of "654321") await page.locator(`[data-k="${digit}"]`).click();
  await expect(page.locator("#syncMatchPin")).toHaveCount(0);
  expect(await page.evaluate(() => DB.pinMatches("654321"))).toBe(true);
  expect(await page.evaluate(() => DB.pinMatches("123456"))).toBe(false);
});
