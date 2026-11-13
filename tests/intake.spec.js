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

test("new intake starts with staff ID check and requires photo plus a disposition", async ({ page }) => {
  await setup(page);
  await page.locator("#lockNow").click();
  await page.getByRole("button", { name: "NEW CLIENT" }).click();
  await expect(page.getByRole("heading", { name: "Staff: check the license" })).toBeVisible();
  await expect(page.locator("#iStaffNext")).toBeDisabled();
  await page.locator("#iFront").setInputFiles("test/sample-license-barcode.png");
  await page.getByRole("button", { name: "Use full photo" }).click();
  await expect(page.locator("#iStaffNext")).toBeDisabled();
  await page.getByRole("button", { name: /Barcode will not scan/ }).click();
  await expect(page.locator("#iStaffNext")).toBeEnabled();
  await page.locator("#iStaffNext").click();
  await expect(page.getByText("Hand the license and this iPad back to the client.")).toBeVisible();
  await page.getByRole("button", { name: "Client has the iPad" }).click();
  await expect(page.getByText(/privacy/i).first()).toBeVisible();
});

test("client details omit staff controls and lock scanned name and birth date", async ({ page }) => {
  await setup(page);
  await page.locator("#lockNow").click();
  await page.getByRole("button", { name: "NEW CLIENT" }).click();
  await page.evaluate(() => { const k = Consent.K(); k.frontPhoto = "data:image/jpeg;base64,test"; k.scan = { idState: "AZ", idExpiry: "2030-01-01", idExpired: false, scanned: { legalName: "Sample Client", dob: "1990-01-01" } }; k.client = { legalName: "Sample Client", dob: "1990-01-01" }; go("iInfo"); });
  await expect(page.locator("#iScanBtn, #iFront")).toHaveCount(0);
  await expect(page.locator("#i_legalName")).toHaveAttribute("readonly", "");
  await expect(page.locator("#i_dob")).toHaveAttribute("readonly", "");
});
