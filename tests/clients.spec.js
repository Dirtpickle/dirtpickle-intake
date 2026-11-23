const { test, expect } = require("@playwright/test");
const { setup, newClient, goHome } = require("./helpers/app");

test("creates a client, merges a returning check-in, and warns on duplicates", async ({ page }) => {
  await setup(page);
  await newClient(page);
  await goHome(page);
  await page.locator('[data-go="clientForm"]').click();
  await page.locator("#legalName").fill("Alex Example");
  await page.locator("#dob").fill("1990-01-01");
  await page.locator("#phone").fill("9285550100");
  await page.locator("#skipIdPhoto").click();
  await page.locator("#photoOverrideReason").fill("Verified in person for duplicate test");
  await page.locator("#confirmPhotoOverride").click();
  await page.locator("#saveClient").click();
  await expect(page.locator("#dupBox")).toContainText("Possible existing client");
  await page.locator("#saveAnyway").click();
  await expect(page.locator("h1")).toContainText("Alex Example");
});

test("blocks clients under the 18-year minimum", async ({ page }) => {
  await setup(page);
  await page.locator('[data-go="clientForm"]').click();
  await page.locator("#legalName").fill("Young Person");
  await page.locator("#dob").fill("2015-01-01");
  await expect(page.locator("#saveClient")).toBeDisabled();
  await expect(page.locator("#ageLine")).toContainText("Under the minimum age");
});

test("imports a returning check-in into the existing client", async ({ page }) => {
  await setup(page);
  await newClient(page, "Returning Client");
  await page.evaluate(async () => {
    const client = { legalName: "Returning Client", dob: "1990-01-01", phone: "9285550100", email: "alex@example.com" };
    await DB.seal({ submittedAt: new Date().toISOString(), client, idCheck: null, idPhoto: null,
      session: { id: crypto.randomUUID(), flashId: null, flashName: "" },
      consent: { id: crypto.randomUUID(), signedAt: new Date().toISOString(), template: {}, answers: {}, signature: "", idCheck: null, ageAtSigning: 35, privacy: {}, pdf: "", sha256: "" } });
    await DB.setPublic({ ...(await DB.getPublic()), at: new Date().toISOString() });
  });
  await page.locator("#lockNow").click();
  await page.locator("#kStaff").click();
  await page.locator('[data-k="1"]').click(); await page.locator('[data-k="2"]').click();
  await page.locator('[data-k="3"]').click(); await page.locator('[data-k="4"]').click();
  await page.locator('[data-k="5"]').click(); await page.locator('[data-k="6"]').click();
  await expect(page.locator("#lockNow")).toBeVisible();
  const count = await page.evaluate(() => DB.all("client").filter(c => c.legalName === "Returning Client").length);
  expect(count).toBe(1);
});

test("loads an old-format client without license or ID history fields", async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => DB.put({ type: "client", id: "old-format", legalName: "Old Format", dob: "1990-01-01", visits: [] }));
  await page.locator('[data-go="clients"]').click();
  await page.locator('[data-go="profile"][data-id="old-format"]').click();
  await expect(page.getByRole("heading", { name: "Old Format", exact: true })).toBeVisible();
  await expect(page.getByText("Status: not verified")).toBeVisible();
});

test("blocks a new PRO client without a photo or override", async ({ page }) => {
  await setup(page);
  await page.locator('[data-go="clientForm"]').click();
  await page.locator("#legalName").fill("Photo Required");
  await page.locator("#dob").fill("1990-01-01");
  await page.locator("#saveClient").click();
  await expect(page.locator("#dupBox")).toContainText("Take a photo of the front");
});

async function fillGeneratedPhoto(page) {
  await page.locator("#idFront").setInputFiles("test/sample-license-barcode.png");
  await page.getByRole("button", { name: "Use full photo" }).click();
  await expect(page.locator("#idPhotoPreview img")).toBeVisible();
}

test("saves a generated license photo and does not ask again", async ({ page }) => {
  await setup(page);
  await page.locator('[data-go="clientForm"]').click();
  await page.locator("#legalName").fill("Photo Client");
  await page.locator("#dob").fill("1990-01-01");
  await fillGeneratedPhoto(page);
  await page.locator("#saveClient").click();
  await page.getByRole("button", { name: "Review / edit info" }).click();
  await expect(page.getByText(/ID photo on file/)).toBeVisible();
  await expect(page.locator("#skipIdPhoto")).toHaveCount(0);
  const photos = await page.evaluate(() => DB.all("client").find(c => c.legalName === "Photo Client").idPhotos);
  expect(photos).toHaveLength(1);
});

test("saves a PRO client with an artist override reason", async ({ page }) => {
  await setup(page);
  await page.locator('[data-go="clientForm"]').click();
  await page.locator("#legalName").fill("Override Client");
  await page.locator("#dob").fill("1990-01-01");
  await page.locator("#skipIdPhoto").click();
  await page.locator("#photoOverrideReason").fill("Client presented ID in person");
  await page.locator("#confirmPhotoOverride").click();
  await page.locator("#saveClient").click();
  await expect(page.getByRole("heading", { name: "Override Client", exact: true })).toBeVisible();
  const check = await page.evaluate(() => DB.all("client").find(c => c.legalName === "Override Client").idChecks.slice(-1)[0]);
  expect(check).toMatchObject({ type: "artist-override", reason: "Client presented ID in person" });
});
