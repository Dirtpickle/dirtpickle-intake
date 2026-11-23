const { test, expect } = require("@playwright/test");
const { setup, newClient, lock, unlock } = require("./helpers/app");

const tinyJpeg = {
  name: "finished.jpg",
  mimeType: "image/jpeg",
  buffer: Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AYf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AYf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Arf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEPP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EDf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EDf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EDf/2gAMAwEAAgADAAAAEPH/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EHf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EHf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EHf/2g==", "base64")
};

test("adds, restores, and erases session photos", async ({ page }) => {
  await setup(page);
  await newClient(page, "Photo Client");
  const sessionId = await page.evaluate(async () => (await Sessions.createSession(DB.all("client")[0].id, null)).id);
  await page.evaluate(id => go("session", { id }), sessionId);
  await page.locator("#photoFiles").setInputFiles(tinyJpeg);
  await expect(page.locator(".photo-thumb")).toHaveCount(1);
  await expect(page.locator("#s_photo")).toBeChecked();

  const backupText = await page.evaluate(() => Backup.create());
  expect(await page.evaluate(text => Backup.verify(text).then(result => result.recs.some(r => r.type === "photo")), backupText)).toBe(true);
  await lock(page);
  await page.getByRole("button", { name: "Artist sign-in" }).click();
  await unlock(page);
  await page.evaluate(id => go("session", { id }), sessionId);
  await expect(page.locator(".photo-thumb")).toHaveCount(1);

  await page.evaluate(async () => {
    for (const record of DB.all("photo")) await DB.remove(record.id);
  });
  await page.evaluate(text => Backup.restore(text, "123456"), backupText);
  await expect.poll(() => page.evaluate(() => DB.all("photo").length)).toBe(1);

  await page.evaluate(clientId => go("profile", { id: clientId }), await page.evaluate(() => DB.all("client")[0].id));
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#delClient").click();
  await expect(page.locator("#results")).toContainText("No matches");
  expect(await page.evaluate(() => DB.all("photo").length)).toBe(0);
});
