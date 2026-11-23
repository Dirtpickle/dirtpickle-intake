const { test, expect } = require("@playwright/test");
const { setup } = require("./helpers/app");

test.use({ viewport: { width: 390, height: 844 } });

test("main screens fit a phone width with no sideways scrolling", async ({ page }) => {
  await setup(page);
  for (const name of ["home", "flash", "events", "documents", "settings", "settingsGoogle", "settingsContracts", "backup"]) {
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

for (const [w, h] of [[390, 844], [360, 640], [412, 700]]) {
  test(`the PIN keypad fits fully on a ${w}x${h} phone`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await setup(page);
    await page.evaluate(() => showPin("unlock"));
    const fit = await page.evaluate(() => {
      const keys = [...document.querySelectorAll(".keys button")].filter(b => !b.classList.contains("blank"));
      return { bottom: Math.max(...keys.map(b => b.getBoundingClientRect().bottom)), top: Math.min(...keys.map(b => b.getBoundingClientRect().top)),
        smallest: Math.min(...keys.map(b => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height))), inner: window.innerHeight, count: keys.length };
    });
    expect(fit.count).toBeGreaterThanOrEqual(10);
    expect(fit.bottom).toBeLessThanOrEqual(fit.inner);
    expect(fit.smallest).toBeGreaterThanOrEqual(44);
  });
}

test("phone action buttons take the full row so labels do not wrap to a lone letter", async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => { await DB.put({ type: "client", id: "c-w", legalName: "Wrap Client", dob: "1990-01-01", email: "a@b.co" }); go("profile", { id: "c-w" }); });
  const rows = await page.evaluate(() => [...document.querySelectorAll("#app .actions > button:not(.small)")].filter(b => b.offsetParent)
    .map(b => ({ text: b.textContent.trim(), w: b.getBoundingClientRect().width, parent: b.parentElement.getBoundingClientRect().width })));
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows) expect(r.w, r.text).toBeGreaterThanOrEqual(r.parent - 2);
});
