const { test, expect } = require("@playwright/test");
const { setup, lock, newClient, answerContract, makeSignature } = require("./helpers/app");

async function validPrior(page, clientId) {
  return page.evaluate(async clientId => {
    const template = Consent.activeTemplate();
    const pdf = "AQID";
    const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(atob(pdf), c => c.charCodeAt(0))))].map(b => b.toString(16).padStart(2, "0")).join("");
    const prior = { type: "consent", id: "prior-consent", locked: true, clientId, signedAt: "2026-01-01T00:00:00.000Z", template, pdf, sha256, answers: {}, signature: "sig" };
    await DB.put(prior);
    settings = { ...settings, allowShortReturning: true };
    await DB.put(settings);
    return prior;
  }, clientId);
}

test("new and returning clients produce the expected status reasons", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    settings = { ...settings, allowShortReturning: true };
    const id = "status-client";
    await DB.put({ type: "client", id, legalName: "Status Client", dob: "1990-01-01", idChecks: [{ at: new Date().toISOString() }] });
    const fresh = await ReturningConsent.status(id);
    settings = { ...settings, allowShortReturning: false };
    const off = await ReturningConsent.status(id);
    return { fresh: fresh.reason, off: off.reason };
  });
  expect(result.fresh).toBe("no-prior");
  expect(result.off).toBe("setting-off");
});

test("same-version returning short flow creates a new locked consent and preserves the old one", async ({ page }) => {
  await setup(page);
  await newClient(page, "Short Client");
  const clientId = await page.evaluate(() => DB.all("client").find(c => c.legalName === "Short Client").id);
  const old = await validPrior(page, clientId);
  await page.locator("#startPaper").click();
  await expect(page.locator("#privOk")).toBeVisible();
  await expect(page.locator(".banner.warn")).toContainText("Short returning-client form will run");
  await page.locator("#privOk").check();
  await page.locator("#kNext").click();
  await answerContract(page);
  await page.locator("#kNext").click();
  await makeSignature(page);
  await page.locator("#kSubmit").click();
  await expect(page.getByText("Thank you!")).toBeVisible();
  const result = await page.evaluate(() => {
    const records = DB.all("consent").sort((a, b) => a.id.localeCompare(b.id));
    return { old: records.find(r => r.id === "prior-consent"), created: records.find(r => r.short) };
  });
  expect(result.old).toEqual(old);
  expect(result.created.short).toBe(true);
  expect(result.created.basedOn).toBe(old.id);
  expect(result.created.signature).toBeTruthy();
});

test("a changed template forces the full flow", async ({ page }) => {
  await setup(page);
  const clientId = await page.evaluate(async () => {
    const id = "changed-client";
    await DB.put({ type: "client", id, legalName: "Changed Client", dob: "1990-01-01", idChecks: [{ at: new Date().toISOString() }] });
    const template = Consent.activeTemplate();
    const pdf = "AQID";
    const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(atob(pdf), c => c.charCodeAt(0))))].map(b => b.toString(16).padStart(2, "0")).join("");
    await DB.put({ type: "consent", id: "changed-prior", locked: true, clientId: id, signedAt: "2026-01-01T00:00:00.000Z", template: { ...template, version: template.version - 1 }, pdf, sha256 });
    settings = { ...settings, allowShortReturning: true };
    return id;
  });
  const result = await page.evaluate(id => ReturningConsent.status(id), clientId);
  expect(result.reason).toBe("form-changed");
  expect(result.mode).toBe("full");
});

test("the intake side has no returning-client lookup and holds no records", async ({ page }) => {
  await setup(page); await lock(page);
  const intake = await page.context().newPage(); await intake.goto("/");
  await expect(intake.getByRole("button", { name: "Artist sign-in" })).toBeVisible();
  expect(await intake.evaluate(() => [typeof ReturningConsent, typeof ClientMatch])).toEqual(["undefined", "undefined"]);
  expect(await intake.evaluate(() => DB.isUnlocked())).toBe(false);
  expect(await intake.evaluate(() => DB.all().length)).toBe(0);
  await intake.close();
});

test("another client's signed agreement never counts for this client", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const template = Consent.activeTemplate();
    await DB.put({ type: "client", id: "client-a", legalName: "Client A", dob: "1990-01-01", idChecks: [{ at: new Date().toISOString() }] });
    await DB.put({ type: "client", id: "client-b", legalName: "Client B", dob: "1991-01-01", idChecks: [{ at: new Date().toISOString() }] });
    await DB.put({ type: "consent", id: "b-consent", locked: true, clientId: "client-b", signedAt: "2026-01-01T00:00:00.000Z", template, pdf: "AQID", sha256: "x", answers: {}, signature: "sig" });
    settings = { ...settings, allowShortReturning: true };
    const a = await ReturningConsent.status("client-a");
    return { reason: a.reason, prior: a.prior };
  });
  expect(result).toEqual({ reason: "no-prior", prior: null });
});
