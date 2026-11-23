const { test, expect } = require("@playwright/test");
const { setup, openMoreTarget } = require("./helpers/app");

test("settings menu has four entries and each opens", async ({ page }) => {
  await setup(page);
  await openMoreTarget(page, "settings");
  const entries = page.locator(".settings-menu > button");
  await expect(entries).toHaveCount(4);
  for (const target of ["settingsBusiness", "settingsContracts", "settingsGoogle", "backup"]) {
    await page.locator(`[data-go="${target}"]`).click();
    await expect(page.locator("header h1")).toBeVisible();
    await openMoreTarget(page, "settings");
  }
});

test("business settings save and Google connection has one relay URL and secret", async ({ page }) => {
  await setup(page);
  await openMoreTarget(page, "settings");
  await page.locator('[data-go="settingsBusiness"]').click();
  await page.locator("#biz").fill("Saved Studio");
  await page.locator("#saveSettings").click();
  await expect.poll(() => page.evaluate(() => DB.get("settings").business)).toBe("Saved Studio");
  await openMoreTarget(page, "settings");
  await page.locator('[data-go="settingsGoogle"]').click();
  await expect(page.locator("#relayUrl")).toHaveCount(1);
  await expect(page.locator("#relaySecret")).toHaveCount(1);
});

test("blank contract and old signed PDF retain their separate version and bytes", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const oldPdf = "AQID", oldHash = "old-hash";
    await DB.put({ type: "consent", id: "old-signed", locked: true, pdf: oldPdf, sha256: oldHash, signedAt: "2026-01-01T00:00:00.000Z", clientId: "old" });
    await Consent.paperBytes();
    const saved = DB.get("old-signed");
    const pdf = await PDFLib.PDFDocument.load(await Consent.paperBytes());
    return { oldPdf: saved.pdf, oldHash: saved.sha256, subject: pdf.getSubject() };
  });
  expect(result.oldPdf).toBe("AQID");
  expect(result.oldHash).toBe("old-hash");
  expect(result.subject).toContain("Blank wet-ink contract");
  expect(result.subject).toContain("Form v");
});
