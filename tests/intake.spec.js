const { test, expect } = require("@playwright/test");
const { setup } = require("./helpers/app");

test("intake opens without PIN and does not expose stored clients", async ({ page }) => {
  await setup(page);
  await page.locator('[data-go="clientForm"]').click();
  await page.locator("#legalName").fill("Private Client");
  await page.locator("#dob").fill("1990-01-01");
  await page.locator("#phone").fill("9285550199");
  await page.locator("#saveClient").click();
  await page.locator("#lockNow").click();
  await expect(page.getByRole("button", { name: "NEW CLIENT" })).toBeVisible();
  await expect(page.getByText("Private Client")).toHaveCount(0);
});

test("the kiosk contact step refuses to continue without an email address", async ({ page }) => {
  await setup(page);
  await page.locator('[data-go="clientForm"]').click();
  await page.locator("#legalName").fill("No Email Client");
  await page.locator("#dob").fill("1990-01-01");
  await page.locator("#phone").fill("9285550188");
  await page.locator("#skipIdPhoto").click();
  await page.locator("#photoOverrideReason").fill("Routine test artist override");
  await page.locator("#confirmPhotoOverride").click();
  await page.locator("#saveClient").click();
  await page.locator("#startPaper").click();
  await page.locator("#privOk").check();
  await page.locator("#kNext").click();
  await page.locator("#kNext").click();
  await expect(page.getByText("An email address is required")).toBeVisible();
  await page.locator("#k_email").fill("me@example.com");
  await page.locator("#kNext").click();
  await expect(page.getByText("An email address is required")).toHaveCount(0);
});
