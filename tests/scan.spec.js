const { test, expect } = require("@playwright/test");
const fs = require("fs");

test("photo decoding reads the sample license barcode", async ({ page }) => {
  await page.goto("/");
  const b64 = fs.readFileSync("test/sample-license-barcode.png").toString("base64");
  const text = await page.evaluate(async data => {
    const blob = await (await fetch("data:image/png;base64," + data)).blob();
    return Scan.decodeBlob(blob);
  }, b64);
  expect(text).toBeTruthy();
  expect(text).toContain("ANSI");
});
