const { test, expect } = require("@playwright/test");
const { setup, newClient, goHome } = require("./helpers/app");

test("exports, wipes, and restores encrypted data; wrong PIN fails", async ({ page }) => {
  await setup(page);
  await newClient(page, "Backup Client");
  await goHome(page);
  const backupText = await page.evaluate(() => Backup.create());
  const wrong = await page.evaluate(async text => (await Backup.verify(text, "000000")).pinOk, backupText);
  expect(wrong).toBe(false);
  await page.evaluate(async () => { for (const c of DB.all("client")) await DB.remove(c.id, { force: true }); });
  await page.evaluate(async text => Backup.restore(text, "123456"), backupText);
  await page.reload();
  await page.locator("#kStaff").click();
  await page.locator('[data-k="1"]').click(); await page.locator('[data-k="2"]').click();
  await page.locator('[data-k="3"]').click(); await page.locator('[data-k="4"]').click();
  await page.locator('[data-k="5"]').click(); await page.locator('[data-k="6"]').click();
  await expect(page.locator("#lockNow")).toBeVisible();
  await page.locator('[data-go="clients"]').click();
  await expect(page.getByText("Backup Client", { exact: true })).toBeVisible();
});
