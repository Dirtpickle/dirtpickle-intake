const { test, expect } = require("@playwright/test");
const { setup, newClient, goHome, answerContract, makeSignature } = require("./helpers/app");

test("adds a walk-in, creates a session, and pauses its timer", async ({ page }) => {
  await setup(page);
  await newClient(page, "Queue Client");
  await goHome(page);
  await page.locator('[data-go="queue"]').click();
  await page.getByRole("button", { name: "+ Add walk-in" }).click();
  await page.locator("#q").fill("Queue Client");
  await page.locator('[data-pick]').click();
  await page.getByRole("button", { name: /No flash/ }).click();
  await expect(page.locator(".card")).toContainText("Queue Client");
  await page.locator('[data-go="session"]').click();
  await page.locator("#tStart").click();
  await expect(page.locator("#tPause")).toBeVisible();
  await page.locator("#tPause").click();
  await expect(page.locator("#tResume")).toBeVisible();
});

test("starting paperwork from a profile reuses the client's waiting queue entry", async ({ page }) => {
  await setup(page);
  await newClient(page, "Queue Once");
  const clientId = await page.evaluate(() => DB.all("client").find(c => c.legalName === "Queue Once").id);
  await page.evaluate(id => Sessions.createSession(id, null), clientId);
  await page.locator("#startPaper").click();
  await page.locator("#privOk").check();
  await page.locator("#kNext").click();
  await page.locator("#kNext").click();
  await answerContract(page);
  await page.locator("#kNext").click();
  await makeSignature(page);
  await page.locator("#kSubmit").click();
  await expect(page.getByText("Thank you!")).toBeVisible();
  const sessions = await page.evaluate(id => DB.all("session").filter(s => s.clientId === id).map(s => s.status), clientId);
  expect(sessions).toEqual(["ready"]);
});

test("Confirm ID shows the saved ID photo and records the artist's decision", async ({ page }) => {
  await setup(page);
  const ids = await page.evaluate(async () => {
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const client = await DB.put({ type: "client", id: "cid-client", legalName: "Photo Check", dob: "1990-01-01", phone: "9285550100", email: "a@b.co",
      idPhotos: [{ at: new Date().toISOString(), image: png }],
      idChecks: [{ at: new Date().toISOString(), method: "pdf417-barcode", idState: "AZ", idExpiry: "2030-01-01", matched: true, visuallyMatched: false }] });
    const session = await Sessions.createSession(client.id, null);
    return { client: client.id, session: session.id };
  });
  await page.locator('[data-go="queue"]').click();
  await page.getByRole("button", { name: "Confirm ID" }).click();
  await expect(page.getByRole("img", { name: "Saved photo of the ID" })).toBeVisible();
  await expect(page.getByText("Photo Check").first()).toBeVisible();
  await page.getByRole("button", { name: "Does not match" }).click();
  await expect.poll(() => page.evaluate(id => DB.get(id).idChecks[0].visuallyMatched, ids.client)).toBe(false);
  await page.getByRole("button", { name: "Confirm ID" }).click();
  await page.getByRole("button", { name: "It matches: confirm" }).click();
  await expect.poll(() => page.evaluate(id => DB.get(id).idChecks[0].visuallyMatched, ids.client)).toBe(true);
  await expect(page.getByRole("button", { name: "Confirm ID" })).toHaveCount(0);
});
