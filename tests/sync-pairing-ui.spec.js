const { test, expect } = require("@playwright/test");
const { setup } = require("./helpers/app");

test("sync card guides main-device setup and second-device pairing", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage(), b = await (await browser.newContext()).newPage();
  const cfg = p => p.evaluate(async () => { await DB.put({ ...DB.get("settings"), emailRelayUrl: "https://relay.test/exec", relaySecret: "test-secret" }); settings = DB.get("settings"); go("settingsGoogle"); });
  await setup(a); await setup(b); await cfg(a); await cfg(b);
  await expect(a.getByRole("button", { name: /MAIN device/ })).toBeVisible();
  await a.getByRole("button", { name: /MAIN device/ }).click();
  const code = (await a.locator("#syncCodeText").textContent()).trim();
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await expect(a.getByRole("button", { name: "Copy code" })).toBeVisible();
  await b.getByRole("button", { name: /SECOND device/ }).click();
  await b.locator("#syncCodeIn").fill(code);
  await b.getByRole("button", { name: "Pair", exact: true }).click();
  await expect(b.getByRole("button", { name: "Sync now" })).toBeVisible();
  const same = await b.evaluate(() => DB.get("settings").syncSalt);
  const mainSalt = await a.evaluate(() => DB.get("settings").syncSalt);
  expect(same).toBe(mainSalt);
});
