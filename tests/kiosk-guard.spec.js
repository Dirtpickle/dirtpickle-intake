const { test, expect } = require("@playwright/test");
const { setup } = require("./helpers/app");

test("locked kiosk refuses pro screens and Back never lands on a dead check-in step", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await setup(page);
  await page.locator("#lockNow").click();
  await expect(page.getByRole("button", { name: "Artist sign-in" })).toBeVisible();

  await page.evaluate(() => { go("clients"); go("settings"); go("home"); });
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();

  await page.locator("#iNew").click();
  await page.evaluate(() => { go("kSign"); go("kDone"); });
  await page.evaluate(() => go("iWelcome"));
  await page.goBack();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  expect(errors).toEqual([]);
});
