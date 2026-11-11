const { test, expect } = require("@playwright/test");
const { setup, newClient } = require("./helpers/app");

test("browser Back returns to the previous in-app screen", async ({ page }) => {
  await setup(page);
  await newClient(page, "History Client");
  await page.locator('[data-go="clients"]').click();
  await page.locator('[data-go="home"]').click();
  await page.locator('[data-go="clients"]').click();
  await page.locator('[data-go="profile"]').first().click();
  await expect(page.getByRole("heading", { name: "History Client", exact: true })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();
  expect(page.url()).not.toContain("about:blank");

  await page.goForward();
  await expect(page.getByRole("heading", { name: "History Client", exact: true })).toBeVisible();
});

test("browser Back while locked does not reveal a previous screen", async ({ page }) => {
  await setup(page);
  await page.locator('[data-go="clients"]').click();
  await page.locator("#lockNow").click();
  await expect(page.getByRole("button", { name: "Artist sign-in" })).toBeVisible();
  await page.locator("#kStaff").click();
  await expect(page.locator('[data-k="1"]')).toBeVisible();

  await page.goBack();
  await expect(page.locator('[data-k="1"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Clients", exact: true })).toHaveCount(0);
});

test("browser Back restores route parameters", async ({ page }) => {
  await setup(page);
  await newClient(page, "Parameter Client");
  await page.locator('[data-go="clients"]').click();
  await page.locator('[data-go="home"]').click();
  await page.locator('[data-go="clients"]').click();
  await page.locator('[data-go="profile"]').first().click();
  await page.locator('[data-go="clientForm"]').click();
  await expect(page.locator("#legalName")).toHaveValue("Parameter Client");

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Parameter Client", exact: true })).toBeVisible();

  await page.goForward();
  await expect(page.locator("#legalName")).toHaveValue("Parameter Client");
});
