const { test, expect } = require("@playwright/test");
const { setup, newClient } = require("./helpers/app");

test("creates an appointment and sends a private calendar upsert", async ({ page }) => {
  const requests = [];
  await page.route("https://relay.test/exec", async route => {
    requests.push(JSON.parse(route.request().postData()));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, calendarEventId: "event-1" }) });
  });
  await setup(page);
  await page.evaluate(async () => {
    const s = DB.get("settings");
    await DB.put({ ...s, emailRelayUrl: "https://relay.test/exec", relaySecret: "secret", calendarSync: true });
  });
  await newClient(page);
  await page.getByRole("button", { name: "Book appointment" }).click();
  await page.locator("#apptClientSearch").fill("Alex");
  await page.locator("[data-client]").click();
  await page.locator("#apptTitle").fill("small fern");
  await page.locator("#saveAppointment").click();
  await expect(page.getByText("small fern")).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0].action).toBe("calendar.upsert");
  expect(JSON.stringify(requests[0])).not.toContain("alex@example.com");
  expect(JSON.stringify(requests[0])).not.toContain("9285550100");
  expect(requests[0].title).toBe("Alex – small fern");
});

test("converts an appointment to a session", async ({ page }) => {
  await setup(page);
  await newClient(page, "Jamie Example");
  await page.getByRole("button", { name: "Book appointment" }).click();
  await page.locator("#apptClientSearch").fill("Jamie");
  await page.locator("[data-client]").click();
  await page.locator("#apptTitle").fill("first appointment");
  await page.locator("#saveAppointment").click();
  await expect(page.getByText("first appointment")).toBeVisible();
  await page.locator('[data-appt="start"]').click();
  await expect(page.getByText("Procedure record (artist use)")).toBeVisible();
  expect(await page.evaluate(() => DB.all("appointment")[0].status)).toBe("completed");
});
