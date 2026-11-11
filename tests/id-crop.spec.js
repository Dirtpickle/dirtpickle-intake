const { test, expect } = require("@playwright/test");

test("auto-crop finds a card on a plain background", async ({ page }) => {
  await page.goto("/");
  const rect = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 600; canvas.height = 400;
    const context = canvas.getContext("2d");
    context.fillStyle = "#222"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#eee"; context.fillRect(110, 90, 380, 220);
    return IdCrop.autoCrop(canvas);
  });
  expect(rect.x).toBeLessThan(120);
  expect(rect.y).toBeLessThan(100);
  expect(rect.x + rect.w).toBeGreaterThan(480);
  expect(rect.y + rect.h).toBeGreaterThan(300);
});

test("crop screen offers full-photo and crop choices", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const source = document.createElement("canvas");
    source.width = 200; source.height = 120;
    IdCropUI.open(source, { x: 20, y: 20, w: 160, h: 80 }).then(result => { window.cropResult = result; });
  });
  await expect(page.getByRole("heading", { name: "Adjust your license photo" })).toBeVisible();
  await page.getByRole("button", { name: "Use full photo" }).click();
  await expect.poll(() => page.evaluate(() => window.cropResult.action)).toBe("full");

  await page.evaluate(() => {
    const source = document.createElement("canvas");
    source.width = 200; source.height = 120;
    IdCropUI.open(source, { x: 20, y: 20, w: 160, h: 80 }).then(result => { window.cropResult = result; });
  });
  await page.getByRole("button", { name: "Use crop" }).click();
  await expect.poll(() => page.evaluate(() => window.cropResult.action)).toBe("use");
  await expect.poll(() => page.evaluate(() => window.cropResult.canvas.width)).toBe(160);
});
