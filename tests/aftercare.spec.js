const { test, expect } = require("@playwright/test");
const { setup } = require("./helpers/app");

async function seedSession(page) {
  return page.evaluate(async () => {
    const client = await DB.put({ type: "client", id: "ac-client", legalName: "Aftercare Client", email: "client@example.com", visits: [] });
    const session = await DB.put({ type: "session", id: "ac-session", clientId: client.id, createdAt: new Date().toISOString(), status: "completed", tattoo: {}, segments: [] });
    return session.id;
  });
}

test("aftercare templates save new versions and keep read-only history", async ({ page }) => {
  await setup(page);
  await page.locator('[data-go="settings"]').click();
  await page.locator('[data-go="aftercare"]').click();
  await page.locator('[data-go="aftercareEdit"]').click();
  await page.locator("#acTitle").fill("Studio aftercare");
  await page.locator("#acBody").fill("First wording.");
  await page.locator("#acSave").click();
  await expect(page.getByText("Studio aftercare", { exact: true })).toBeVisible();
  await page.locator('[data-ac-edit]').last().click();
  await page.locator("#acBody").fill("Second wording.");
  await page.locator("#acSave").click();
  await expect(page.getByText("Studio aftercare", { exact: true })).toBeVisible();
  const versions = await page.evaluate(() => DB.all("aftercare-template").filter(t => t.title === "Studio aftercare").sort((a, b) => a.version - b.version));
  expect(versions.map(t => t.version)).toEqual([1, 2]);
  expect(versions[0].body).toBe("First wording.");
  expect(versions[1].body).toBe("Second wording.");
});

test("giving aftercare locks a hashed PDF and preserves the template snapshot", async ({ page }) => {
  await setup(page);
  const id = await seedSession(page);
  const result = await page.evaluate(async sessionId => {
    const template = Aftercare.latest("starter");
    const doc = await Aftercare.give(sessionId, template.key);
    await Aftercare.save({ key: template.key, title: template.title, body: "Changed later." });
    const locked = await (async () => { try { await DB.put(doc); return false; } catch (_) { return true; } })();
    const hash = await AftercarePdf.hash(Uint8Array.from(atob(doc.pdf), c => c.charCodeAt(0)));
    return { doc, locked, hash, latest: Aftercare.latest("starter").body };
  }, id);
  expect(result.doc.snapshotText).toBe("Replace this text with your own aftercare instructions.");
  expect(result.doc.templateVersion).toBe(1);
  expect(result.hash).toBe(result.doc.sha256);
  expect(result.latest).toBe("Changed later.");
  expect(result.locked).toBe(true);
});

test("aftercare email uses the relay and records failure", async ({ page }) => {
  await setup(page);
  const id = await seedSession(page);
  await page.evaluate(async () => DB.put({ ...DB.get("settings"), emailRelayUrl: "https://relay.test/exec", relaySecret: "test-secret" }));
  await page.evaluate(sessionId => Aftercare.give(sessionId, "starter"), id);
  let requestBody;
  await page.route("https://relay.test/exec", async route => {
    requestBody = JSON.parse(route.request().postData());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false, error: "quota" }) });
  });
  await expect(page.evaluate(() => Mailer.send(DB.all("aftercare")[0]))).rejects.toThrow("quota");
  expect(requestBody.subject).toBe("Your aftercare instructions from Dirtpickle");
  expect(requestBody.body).not.toContain("health");
  expect(await page.evaluate(() => DB.all("aftercare")[0].emailStatus)).toBe("failed");
});
