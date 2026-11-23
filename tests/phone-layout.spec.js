const { test, expect } = require("@playwright/test");
const { setup } = require("./helpers/app");

test.use({ viewport: { width: 390, height: 844 } });

test("main screens fit a phone width with no sideways scrolling", async ({ page }) => {
  await setup(page);
  for (const name of ["home", "more", "settings", "settingsGoogle", "settingsContracts"]) {
    await page.evaluate(n => go(n), name);
    await page.waitForTimeout(150);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, name + " overflows by " + over + "px").toBeLessThanOrEqual(1);
  }
});

test("phone tap targets stay at least 44px tall", async ({ page }) => {
  await setup(page);
  const small = await page.evaluate(() => [...document.querySelectorAll("#app button")].filter(b => b.offsetParent && b.getBoundingClientRect().height < 44).length);
  expect(small).toBe(0);
});
