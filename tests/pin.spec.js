const { test, expect } = require("@playwright/test");
const { setup, unlock, lock, enterPin } = require("./helpers/app");

test("sets up, unlocks, rejects a wrong PIN, and locks", async ({ page }) => {
  await setup(page);
  await lock(page);
  await page.locator("#kStaff").click();
  await enterPin(page, "000000");
  await expect(page.locator("#pinErr")).toHaveText("Wrong PIN");
  await unlock(page);
  await expect(page.locator(".tile").filter({ hasText: "NEW CLIENT" })).toBeVisible();
});

test("auto-locks after inactivity", async ({ page }) => {
  await setup(page);
  await page.locator('[data-go="settings"]').click();
  await page.locator("#autoLock").fill("1");
  await page.locator("#saveSettings").click();
  const now = Date.now();
  await page.evaluate(current => { Date.now = () => current + 61 * 60 * 1000; }, now);
  await page.waitForTimeout(11_000);
  await expect(page.getByRole("button", { name: "Artist sign-in" })).toBeVisible();
});
