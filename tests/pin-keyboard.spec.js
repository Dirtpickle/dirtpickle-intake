const { test, expect } = require("@playwright/test");
const { setup, lock } = require("./helpers/app");

test("the keyboard can type the PIN on the lock screen", async ({ page }) => {
  await setup(page);
  await lock(page);
  await page.getByRole("button", { name: "Artist sign-in" }).click();
  await expect(page.locator('[data-k="1"]')).toBeVisible();
  await page.keyboard.type("123456");
  await expect(page.locator("#lockNow")).toBeVisible();
});

test("Backspace deletes a digit and the keyboard works in the PIN prompt", async ({ page }) => {
  await setup(page);
  await page.waitForTimeout(600); // the app ignores taps for a moment right after unlocking
  await page.evaluate(() => { window.__pin = PinPrompt.ask("Test", ""); });
  await page.keyboard.type("1239");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("456");
  expect(await page.evaluate(() => window.__pin)).toBe("123456");
});
