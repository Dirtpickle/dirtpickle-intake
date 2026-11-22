const { test, expect } = require("@playwright/test");
const { setup } = require("./helpers/app");

test("a failed save shows a visible warning, and a full device gets a clear message", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { Promise.reject(Object.assign(new Error("x"), { name: "QuotaExceededError" })); });
  await expect(page.locator("#errorBanner")).toContainText("out of storage space");
});

test("the check-in inbox stops accepting submissions at its cap", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const original = DB.inboxCount;
    // Fill the inbox store directly, then try one more sealed submission.
    for (let i = 0; i < 300; i++) await DB.seal({ n: i });
    try { await DB.seal({ n: "over" }); return "accepted"; } catch (e) { return e.message; }
  });
  expect(result).toContain("inbox is full");
});

test("the page ships a content security policy with no inline script allowance", async ({ page }) => {
  await page.goto("/");
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
});
