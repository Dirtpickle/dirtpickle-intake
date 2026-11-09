const { test, expect } = require("@playwright/test");
const { setup } = require("./helpers/app");

async function relaySettings(page) {
  await page.evaluate(async () => {
    await DB.put({ ...DB.get("settings"), emailRelayUrl: "https://relay.test/exec", relaySecret: "test-secret" });
  });
}

async function document(page) {
  return page.evaluate(async () => {
    const bytes = Uint8Array.from([1, 2, 3]);
    const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(b => b.toString(16).padStart(2, "0")).join("");
    const d = { type: "consent", id: "email-doc", locked: true, signedAt: new Date().toISOString(),
      clientId: "email-client", clientSnapshot: { legalName: "Email Client", email: "client@example.com" },
      pdf: "AQID", sha256, emailStatus: "not-sent" };
    await DB.put(d);
    return d.id;
  });
}

test("sends a text/plain relay request and records sent status", async ({ page }) => {
  await setup(page); await relaySettings(page); await document(page);
  let requestBody;
  await page.route("https://relay.test/exec", async route => {
    requestBody = JSON.parse(route.request().postData());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.evaluate(() => Mailer.send(DB.get("email-doc")));
  expect(requestBody.secret).toBe("test-secret");
  expect(requestBody.body).toContain("signed tattoo agreement is attached");
  expect(requestBody.pdfBase64).toBe("AQID");
  expect(await page.evaluate(() => DB.get("email-doc").emailStatus)).toBe("sent");
});

test("records a failed relay response without changing the PDF hash", async ({ page }) => {
  await setup(page); await relaySettings(page); await document(page);
  await page.route("https://relay.test/exec", route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ ok: false, error: "quota" })
  }));
  await expect(page.evaluate(() => Mailer.send(DB.get("email-doc")))).rejects.toThrow("quota");
  const result = await page.evaluate(async () => {
    const d = DB.get("email-doc");
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(atob(d.pdf), c => c.charCodeAt(0))))].map(b => b.toString(16).padStart(2, "0")).join("");
    return { status: d.emailStatus, pdf: d.pdf, sha256: d.sha256, hash };
  });
  expect(result.status).toBe("failed");
  expect(result.pdf).toBe("AQID");
  expect(result.sha256).toBe(result.hash);
});

test("queues while offline and retries when online", async ({ page, context }) => {
  await setup(page); await relaySettings(page); await document(page);
  let calls = 0;
  await page.route("https://relay.test/exec", async route => {
    calls++;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await context.setOffline(true);
  await page.evaluate(() => Mailer.send(DB.get("email-doc")));
  expect(await page.evaluate(() => DB.get("email-doc").emailStatus)).toBe("queued");
  await context.setOffline(false);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
  await page.evaluate(() => Mailer.retryAll());
  expect(calls).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => DB.get("email-doc").emailStatus)).toBe("sent");
});

test("removes the email promise from no-relay client wording", async ({ page }) => {
  await setup(page);
  const text = await page.evaluate(() => {
    Consent.startIntake({ template: Consent.activeTemplate(), relayConfigured: false });
    return Consent.privacyText();
  });
  expect(text).not.toContain("will be emailed");
  expect(text).toContain("Ask the artist for a copy.");
});
