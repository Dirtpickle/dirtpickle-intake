const { test, expect } = require("@playwright/test");
const { setup } = require("./helpers/app");

async function seed(page, withContract = true) {
  await page.evaluate(async withContract => {
    await DB.put({ ...DB.get("settings"), emailRelayUrl: "https://script.google.com/macros/s/x/exec", relaySecret: "test-secret" });
    await DB.put({ type: "client", id: "c-mail", legalName: "Mail Client", dob: "1990-01-01", email: "mail@example.com", phone: "5551234567" });
    if (withContract) {
      await DB.put({ type: "consent", id: "old-doc", locked: true, clientId: "c-mail", signedAt: "2026-01-01T00:00:00.000Z", template: { title: "Tattoo agreement", version: 1 }, clientSnapshot: { legalName: "Mail Client", email: "mail@example.com" }, pdf: "AQID", sha256: "a", emailStatus: "not-sent" });
      await DB.put({ type: "consent", id: "new-doc", locked: true, clientId: "c-mail", signedAt: "2026-06-01T00:00:00.000Z", template: { title: "Tattoo agreement", version: 2 }, clientSnapshot: { legalName: "Mail Client", email: "mail@example.com" }, pdf: "BAUG", sha256: "b", emailStatus: "not-sent" });
    }
    go("profile", { id: "c-mail" });
  }, withContract);
}

test("Email signed contract re-sends the newest contract to a confirmed address", async ({ page }) => {
  await setup(page); await seed(page);
  let body;
  await page.route("https://script.google.com/macros/s/x/exec", async route => { body = JSON.parse(route.request().postData()); await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }); });
  await page.locator("#emailContract").click();
  await expect(page.locator("#ecTo")).toHaveValue("mail@example.com");
  await page.locator("#ecTo").fill("other@example.com");
  await page.locator("#ecSend").click();
  await expect(page.locator("#ecMsg")).toContainText("Sent");
  expect(body.to).toBe("other@example.com");
  expect(body.pdfBase64).toBe("BAUG");
  expect(await page.evaluate(() => DB.get("new-doc").emailStatus)).toBe("sent");
  expect(await page.evaluate(() => DB.get("old-doc").emailStatus)).toBe("not-sent");
});

test("Email signed contract explains when there is no signed contract", async ({ page }) => {
  await setup(page); await seed(page, false);
  await page.locator("#emailContract").click();
  await expect(page.locator("#emailContractBox")).toContainText("No signed contract");
});
