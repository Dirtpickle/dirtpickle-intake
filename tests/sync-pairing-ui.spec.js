const { test, expect } = require("@playwright/test");
const { setup } = require("./helpers/app");

test("sync card is one switch per device, with no pairing code", async ({ browser }) => {
  const pages = [await (await browser.newContext()).newPage(), await (await browser.newContext()).newPage()];
  for (const p of pages) {
    await setup(p);
    await p.evaluate(async () => { await DB.put({ ...DB.get("settings"), emailRelayUrl: "https://script.google.com/macros/s/x/exec", relaySecret: "test-secret" }); settings = DB.get("settings"); go("settingsGoogle"); });
    await expect(p.getByRole("button", { name: "Turn on sync on this device" })).toBeVisible();
    await p.getByRole("button", { name: "Turn on sync on this device" }).click();
    await expect(p.getByRole("button", { name: "Sync now" })).toBeVisible();
    await expect(p.getByText(/pairing code/i)).toHaveCount(0);
  }
});

test("sync PIN uses the on-screen keypad, not a browser prompt", async ({ page }) => {
  await setup(page);
  const result = page.evaluate(() => PinPrompt.ask("Enter your PIN to sync"));
  for (const k of "123456") await page.locator(`.id-crop-screen [data-k="${k}"]`).click();
  expect(await result).toBe("123456");
  const cancelled = page.evaluate(() => PinPrompt.ask("x"));
  await page.locator('.id-crop-screen [data-k="cancel"]').click();
  expect(await cancelled).toBe(null);
});
