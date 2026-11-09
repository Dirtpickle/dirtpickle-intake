const { test, expect } = require("@playwright/test");
const { setup, newClient, makeSignature, answerContract, unlock } = require("./helpers/app");

async function completeContract(page) {
  await page.locator("#startPaper").click();
  await page.locator("#privOk").check();
  await page.locator("#kNext").click();
  await page.locator("#kNext").click();
  await answerContract(page);
  await page.locator("#kNext").click();
  await makeSignature(page);
  await page.locator("#kSubmit").click();
  await expect(page.getByText("Thank you!")).toBeVisible();
}

test("requires contract answers and creates a locked PDF with matching SHA-256", async ({ page }) => {
  await setup(page);
  await newClient(page, "Consent Client");
  await completeContract(page);
  await page.locator("#kStaff").click();
  await page.locator("#kStaff").click();
  await unlock(page);
  await page.locator('[data-go="documents"]').click();
  await page.locator('[data-go="doc"]').click();
  await page.getByRole("button", { name: "Verify integrity" }).click();
  await expect(page.locator("#dMsg")).toContainText("matches the fingerprint");
  await expect(page.getByText("locked records", { exact: false })).toBeVisible();
  const writeRejected = await page.evaluate(async () => {
    try { await DB.put(DB.all("consent")[0]); return false; } catch (_) { return true; }
  });
  expect(writeRejected).toBe(true);
});

test("countersigns a consent and keeps the final PDF locked", async ({ page }) => {
  await setup(page);
  await newClient(page, "Countersign Client");
  await completeContract(page);
  await page.locator("#kStaff").click();
  await page.locator("#kStaff").click();
  await unlock(page);
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 140; canvas.height = 60;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "white"; ctx.fillRect(0, 0, 140, 60); ctx.strokeStyle = "black";
    ctx.beginPath(); ctx.moveTo(10, 35); ctx.lineTo(120, 20); ctx.stroke();
    const sig = canvas.toDataURL("image/png");
    await DB.put({ ...DB.get("settings"), artistSignature: sig, artistInitials: sig });
  });
  await page.reload();
  if (await page.locator("#kStaff").count()) {
    await page.locator("#kStaff").click();
    await page.waitForTimeout(100);
    if (await page.locator("#kStaff").count()) await page.locator("#kStaff").click();
  }
  await unlock(page);
  await page.locator('[data-go="documents"]').click();
  await page.locator('[data-go="doc"]').click();
  await page.once("dialog", dialog => dialog.accept());
  await page.locator("#cSign").click();
  await expect(page.locator("#cVerify")).toBeVisible();
  await page.locator("#cVerify").click();
  await expect(page.locator("#cMsg")).toContainText("matches the fingerprint");
  const locked = await page.evaluate(() => DB.all("countersign").every(r => r.locked));
  expect(locked).toBe(true);
});
