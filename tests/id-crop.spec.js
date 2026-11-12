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

test("auto-crop finds a card in a noisy photo despite a stray bright speck", async ({ page }) => {
  await page.goto("/");
  const rect = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 800; canvas.height = 600;
    const c = canvas.getContext("2d");
    c.fillStyle = "#6a5a48"; c.fillRect(0, 0, 800, 600);
    for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(${40 + (i * 37) % 90},${30 + (i * 53) % 80},20,.35)`; c.fillRect((i * 97) % 800, (i * 61) % 600, 3, 2); }
    c.fillStyle = "#e8e4da"; c.fillRect(150, 110, 500, 315);
    c.fillStyle = "#555"; for (let y = 150; y < 400; y += 22) c.fillRect(190, y, 260, 7);
    c.fillStyle = "#fff"; c.fillRect(2, 2, 6, 6);
    return IdCrop.autoCrop(canvas);
  });
  expect(Math.abs(rect.x - 150)).toBeLessThan(40);
  expect(Math.abs(rect.y - 110)).toBeLessThan(40);
  expect(Math.abs(rect.x + rect.w - 650)).toBeLessThan(40);
  expect(Math.abs(rect.y + rect.h - 425)).toBeLessThan(40);
});

test("dragging a crop edge past the photo border keeps the opposite edge fixed", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const source = document.createElement("canvas");
    source.width = 200; source.height = 120;
    IdCropUI.open(source, { x: 20, y: 20, w: 160, h: 80 }).then(result => { window.cropResult = result; });
  });
  const box = await page.locator(".id-crop-canvas").boundingBox();
  const at = (x, y) => [box.x + x * box.width / 200, box.y + y * box.height / 120];
  const [sx, sy] = at(20, 60);
  await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx - 400, sy, { steps: 5 }); await page.mouse.up();
  await page.getByRole("button", { name: "Use crop" }).click();
  const size = await page.evaluate(() => ({ w: window.cropResult.canvas.width, h: window.cropResult.canvas.height }));
  expect(size).toEqual({ w: 180, h: 80 });
});
