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
