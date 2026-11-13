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
  /* The browser's own online-event retry may already be mid-flight (loading the attachment), so wait for it. */
  await expect.poll(() => calls).toBeGreaterThanOrEqual(1);
  await expect.poll(() => page.evaluate(() => DB.get("email-doc").emailStatus)).toBe("sent");
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

test("the contract copy is always emailed: address is required and checked at the end", async ({ page }) => {
  await page.goto("/");
  const out = await page.evaluate(() => {
    const root = document.createElement("div");
    root.innerHTML = ConsentCopy.html("me@example.com", true);
    document.body.appendChild(root);
    const good = ConsentCopy.read(root);
    root.querySelector("#copyTo").value = "bad";
    const bad = ConsentCopy.read(root);
    root.querySelector("#copyTo").value = "";
    return { good, bad, empty: ConsentCopy.read(root), noRelay: ConsentCopy.html("a@b.co", false).includes("copyTo"), noRelayRead: ConsentCopy.read(document.createElement("div")) };
  });
  expect(out.good).toEqual({ wants: true, to: "me@example.com" });
  expect(out.bad.error).toBeTruthy();
  expect(out.empty.error).toBeTruthy();
  expect(out.noRelay).toBe(false);
  expect(out.noRelayRead).toEqual({ wants: false, to: "" });
});

test("contract email carries the aftercare PDF; aftercare emails do not", async ({ page }) => {
  await setup(page); await relaySettings(page); await document(page);
  const bodies = [];
  await page.route("https://relay.test/exec", async route => {
    bodies.push(JSON.parse(route.request().postData()));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.evaluate(() => Mailer.send(DB.get("email-doc")));
  expect(bodies[0].attachments.map(a => a.filename)).toEqual(["Tattoo-Aftercare.pdf"]);
  expect(Buffer.from(bodies[0].attachments[0].pdfBase64, "base64").subarray(0, 5).toString()).toBe("%PDF-");
  expect(await page.evaluate(() => MailerAttachments.forDoc({ type: "aftercare" }))).toEqual([]);
});
