const { test, expect } = require("@playwright/test");
const { setup, newClient, goHome } = require("./helpers/app");

test("adds a walk-in, creates a session, and pauses its timer", async ({ page }) => {
  await setup(page);
  await newClient(page, "Queue Client");
  await goHome(page);
  await page.locator('[data-go="queue"]').click();
  await page.getByRole("button", { name: "+ Add walk-in" }).click();
  await page.locator("#q").fill("Queue Client");
  await page.locator('[data-pick]').click();
  await page.getByRole("button", { name: /No flash/ }).click();
  await expect(page.locator(".card")).toContainText("Queue Client");
  await page.locator('[data-go="session"]').click();
  await page.locator("#tStart").click();
  await expect(page.locator("#tPause")).toBeVisible();
  await page.locator("#tPause").click();
  await expect(page.locator("#tResume")).toBeVisible();
});
