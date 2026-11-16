const { test, expect } = require("@playwright/test");
const { setup } = require("./helpers/app");

test("client file screen collects the full record and masks the license", async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => {
    const client = { type: "client", id: "file-client", legalName: "File Client", preferredName: "Ink", dob: "1990-01-01", phone: "9285550100", email: "file@example.com", address: "1 Main St", licenseNumber: "RECOGNIZABLE-987654", createdAt: "2024-01-01T00:00:00.000Z", visits: [], idChecks: [{ at: "2024-02-01T00:00:00.000Z", method: "manual", matched: true, visuallyMatched: true, reason: "Seen in person", by: "Artist" }], idPhotos: [] };
    await DB.put(client);
    await DB.put({ type: "session", id: "file-session", clientId: client.id, createdAt: "2024-03-01T00:00:00.000Z", status: "completed", tattoo: { description: "Rose", location: "Arm", size: "3 in" }, flashName: "R-1 - Rose", price: "200", deposit: "50", paid: "200", payMethod: "Card", durationMs: 3600000, record: { aftercareProvided: true }, notes: "Good session" });
  });
  await page.locator('[data-go="clients"]').click();
  await page.locator('[data-go="profile"][data-id="file-client"]').click();
  await page.getByRole("button", { name: "View full file" }).click();
  await expect(page.getByRole("heading", { name: "Client details" })).toBeVisible();
  await expect(page.locator("#fileLicense")).toContainText("••••7654");
  await page.locator("#fileLicenseToggle").click();
  await expect(page.locator("#fileLicense")).toHaveText("RECOGNIZABLE-987654");
  const lines = await page.evaluate(() => ClientFile.summaryLines(ClientFile.collect("file-client")));
  expect(lines.join("\n")).not.toContain("RECOGNIZABLE-987654");
  expect(lines.join("\n")).toContain("Rose");
});

test("client file PDF reports contract append and ID-photo choice", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const pdf = await PDFLib.PDFDocument.create(); pdf.addPage();
    const bytes = await pdf.save();
    const b64 = btoa(String.fromCharCode(...bytes));
    const client = { type: "client", id: "pdf-client", legalName: "PDF Client", licenseNumber: "LICENSE-123456", idPhotos: [{ at: new Date().toISOString(), image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" }] };
    await DB.put(client);
    await DB.put({ type: "consent", id: "pdf-contract", clientId: client.id, signedAt: new Date().toISOString(), template: { title: "Contract" }, pdf: b64, sha256: "abc" });
    const data = ClientFile.collect(client.id);
    const without = await ClientFilePdf.build(data, { includeIdPhoto: false });
    const withPhoto = await ClientFilePdf.build(data, { includeIdPhoto: true });
    return { without: without.includedIdPhoto, withPhoto: withPhoto.includedIdPhoto, appended: without.appendedPages, header: String.fromCharCode(...without.bytes.slice(0, 5)) };
  });
  expect(result.header).toBe("%PDF-");
  expect(result.without).toBe(false);
  expect(result.withPhoto).toBe(true);
  expect(result.appended).toBe(1);
});
