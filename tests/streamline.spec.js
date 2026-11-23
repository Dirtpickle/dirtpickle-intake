const { test, expect } = require("@playwright/test");
const { setup, newClient } = require("./helpers/app");

test("home has the flattened pro destinations", async ({ page }) => {
  await setup(page);
  await expect(page.locator(".grid > .tile")).toHaveCount(8);
  await expect(page.locator("[data-go=more]")).toHaveCount(0);
  await expect(page.locator("[data-go=returning]")).toHaveCount(0);
  await expect(page.getByText("Import tattoo times", { exact: true })).toHaveCount(0);
});

test("Clients search finds a client", async ({ page }) => {
  await setup(page);
  await newClient(page, "Searchable Client");
  await page.locator("[data-go=clients]").click();
  await page.locator("#q").fill("Searchable");
  await expect(page.locator("#results")).toContainText("Searchable Client");
});

test("queue walk-in goes straight to the new-client form", async ({ page }) => {
  await setup(page);
  await page.locator("[data-go=queue]").click();
  await page.getByRole("button", { name: "+ Add walk-in" }).click();
  await expect(page.locator("#legalName")).toBeVisible();
});

test("profile shows contract actions without a More tap", async ({ page }) => {
  await setup(page);
  await newClient(page, "Action Client");
  await expect(page.locator("#emailContract")).toBeVisible();
  await expect(page.locator("#printPaper")).toBeVisible();
  await expect(page.locator("#profileMoreToggle")).toHaveCount(0);
});

test("client file shows PDF options directly", async ({ page }) => {
  await setup(page);
  await newClient(page, "File Client");
  await page.locator("[data-go=clientFile]").click();
  await expect(page.locator("#buildFilePdf")).toBeVisible();
  await expect(page.locator("[data-open-print]")).toHaveCount(0);
});

test("settings has four items and erase is under Backup & security", async ({ page }) => {
  await setup(page);
  await page.locator("[data-go=settings]").click();
  await expect(page.locator(".settings-menu > button")).toHaveCount(4);
  await page.locator("[data-go=backup]").click();
  await expect(page.locator("#eraseAll")).toBeVisible();
});
