const { test, expect } = require("@playwright/test");
const { setup, answerContract } = require("./helpers/app");

const scan = { idNumber: "R1234567", idState: "AZ", idExpiry: "2030-01-01", idExpired: false, scanned: { legalName: "Scan Return", dob: "1990-01-01" } };

test("returning scan allows no front photo and skips contact info", async ({ page }) => {
  await setup(page);
  await page.locator("#lockNow").click();
  await page.getByRole("button", { name: "BEEN HERE BEFORE" }).click();
  await page.evaluate(scan => {
    const k = Consent.K();
    Object.assign(k, { scan, scanOnly: true, relayConfigured: true, client: { legalName: scan.scanned.legalName, dob: scan.scanned.dob, licenseNumber: scan.idNumber } });
    go("iStaffId");
  }, scan);
  await expect(page.getByText(/optional for returning clients/)).toBeVisible();
  await expect(page.locator("#iStaffNext")).toBeEnabled();
  await page.locator("#iStaffNext").click();
  await page.getByRole("button", { name: "Client has the iPad" }).click();
  await page.locator("#privOk").check();
  await page.locator("#kNext").click();
  await expect(page.locator("#iInfo")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Tattoo Consent/ })).toBeVisible();
  await answerContract(page);
  await page.locator("#kNext").click();
  await expect(page.getByText("A copy will be emailed to the address we have on file.")).toBeVisible();
  await expect(page.locator("#copyTo")).toHaveCount(0);
});

test("scan-only import matches by license and queues the on-file email", async ({ page }) => {
  await setup(page);
  await page.evaluate(async scan => {
    const client = { type: "client", legalName: "Stored Client", dob: "1990-01-01", licenseNumber: scan.idNumber, phone: "9285550100", email: "stored@example.com", visits: [] };
    await DB.put(client);
    await DB.put({ type: "settings", id: "settings", emailRelayUrl: "https://relay.test", relaySecret: "secret" });
    await DB.seal({ submittedAt: new Date().toISOString(), returning: true, scanOnly: true,
      client: { legalName: client.legalName, dob: client.dob, licenseNumber: scan.idNumber }, idCheck: null, idPhoto: null,
      session: { id: crypto.randomUUID(), flashId: null, flashName: "" },
      consent: { id: crypto.randomUUID(), signedAt: new Date().toISOString(), copyTo: "", copyToOnFile: true, template: {}, answers: {}, signature: "", idCheck: null, ageAtSigning: 35, privacy: {}, pdf: "", sha256: "" } });
    await Intake.importAll();
  }, scan);
  const result = await page.evaluate(() => ({
    clients: DB.all("client").filter(c => c.licenseNumber === "R1234567"),
    consents: DB.all("consent")
  }));
  expect(result.clients).toHaveLength(1);
  expect(result.clients[0]).toMatchObject({ phone: "9285550100", email: "stored@example.com" });
  expect(result.consents[0]).toMatchObject({ emailStatus: "queued", copyTo: "", copyToOnFile: true });
});

test("unmatched scan-only import flags missing contact details", async ({ page }) => {
  await setup(page);
  await page.evaluate(async scan => {
    await DB.seal({ submittedAt: new Date().toISOString(), returning: true, scanOnly: true,
      client: { legalName: "Unknown Scan", dob: "1990-01-01", licenseNumber: scan.idNumber }, idCheck: null, idPhoto: null,
      session: { id: crypto.randomUUID(), flashId: null, flashName: "" },
      consent: { id: crypto.randomUUID(), signedAt: new Date().toISOString(), copyTo: "", copyToOnFile: true, template: {}, answers: {}, signature: "", idCheck: null, ageAtSigning: 35, privacy: {}, pdf: "", sha256: "" } });
    await Intake.importAll();
  }, { ...scan, idNumber: "NEW9999" });
  const result = await page.evaluate(() => ({ client: DB.all("client").find(c => c.licenseNumber === "NEW9999"), notice: Intake.takeNotice() }));
  expect(result.client).toMatchObject({ needsContact: true });
  expect(result.client).not.toHaveProperty("phone");
  expect(result.client).not.toHaveProperty("email");
  expect(result.notice).toContain("returning client(s) were not found; phone and email are missing");
});
