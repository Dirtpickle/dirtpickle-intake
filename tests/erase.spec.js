const { test, expect } = require("@playwright/test");
const { setup, newClient } = require("./helpers/app");

test("deletes a client and erases all client data", async ({ page }) => {
  await setup(page);
  await newClient(page, "Delete Client");
  await page.evaluate(() => DB.put({ type: "photo", sessionId: "missing-session", clientId: DB.all("client")[0].id,
    kind: "reference", image: "data:image/jpeg;base64,AA==", note: "erase me", createdAt: new Date().toISOString() }));
  await page.locator('[data-go="clients"]').click();
  await page.locator('[data-go="home"]').click();
  await page.locator('[data-go="clients"]').click();
  await page.getByText("Delete Client", { exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#delClient").click();
  await expect(page.locator("#results")).toContainText("No matches");
  await expect.poll(() => page.evaluate(() => DB.all("photo").length)).toBe(0);
  await page.locator('[data-go="home"]').click();
  await newClient(page, "Erase Client");
  await page.locator('[data-go="clients"]').click();
  await page.locator('[data-go="home"]').click();
  await page.locator('[data-go="settings"]').click();
  page.once("dialog", dialog => dialog.accept("ERASE"));
  await page.locator("#eraseAll").click();
  await page.locator('[data-go="home"]').click();
  await page.locator('[data-go="clients"]').click();
  await expect(page.locator("#results")).toContainText("No matches");
});
