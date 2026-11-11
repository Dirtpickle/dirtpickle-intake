const { test, expect } = require("@playwright/test");
const { setup, newClient } = require("./helpers/app");

test("paper contract is blank without consent and pre-fills the latest signed consent", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const blank = await Consent.paperBytes();
    const client = await DB.put({ type: "client", id: "paper-client", legalName: "Paper Client", dob: "1990-01-01", phone: "555", email: "paper@example.com", address: "123 Main" });
    const answers = { finalAgreement: { v: true }, m1: { v: "no" }, "init:9": { v: "PC" } };
    await DB.put({ type: "consent", id: "paper-consent", locked: true, signedAt: "2026-11-09T12:00:00.000Z", clientId: client.id,
      clientSnapshot: { id: client.id, legalName: client.legalName, dob: client.dob, phone: client.phone, email: client.email, address: client.address },
      template: CONTRACT, answers, pdf: "", sha256: "", emailStatus: "not-sent" });
    const filled = await Consent.paperBytes(client.id);
    const pdf = await PDFLib.PDFDocument.load(filled);
    return { blank: blank.length, filled: filled.length, title: pdf.getTitle(), subject: pdf.getSubject() };
  });
  expect(result.blank).toBeGreaterThan(0);
  expect(result.filled).not.toBe(result.blank);
  expect(result.title).toContain("Paper Client");
  expect(result.subject).toContain("Pre-filled");
});

test("intake and consent email labels explain the optional contract copy", async ({ page }) => {
  await setup(page);
  await newClient(page, "Label Client");
  await page.locator("#startPaper").click();
  await page.locator("#privOk").check();
  await page.locator("#kNext").click();
  await expect(page.getByText("Email (optional - for a copy of your signed contract)")).toHaveCount(1);
});
