const { test, expect } = require("@playwright/test");
const { setup } = require("./helpers/app");

async function seed(page) {
  await page.evaluate(async () => {
    await DB.put({ id: "fm-a", type: "flash", code: "ALPHA", name: "Moon", kind: "one-off", status: "available", price: "40", sheet: "A", order: 1 });
    await DB.put({ id: "fm-b", type: "flash", code: "BETA", name: "Sun", kind: "repeatable", status: "available", price: "50", sheet: "B", order: 2 });
    await DB.put({ id: "fm-c", type: "flash", code: "GAMMA", name: "Star", kind: "one-off", status: "sold", sheet: "A", order: 3 });
  });
}

test("select all respects search and delete needs a second tap", async ({ page }) => {
  await setup(page); await seed(page); await page.evaluate(() => go("flash"));
  await page.locator("#flashSearch").fill("alpha");
  await page.getByRole("button", { name: "Select all" }).click();
  await expect(page.locator(".flash-bulk-bar")).toContainText("1 selected");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  expect(await page.evaluate(() => !!DB.get("fm-a"))).toBe(true);
  await page.getByRole("button", { name: "Tap again to delete" }).click();
  await expect.poll(() => page.evaluate(() => !!DB.get("fm-a"))).toBe(false);
});

test("bulk data actions protect sessions and preserve relative moves", async ({ page }) => {
  await setup(page); await seed(page);
  const result = await page.evaluate(async () => {
    await DB.put({ id: "fm-session", type: "session", flashId: "fm-a", flashCode: "ALPHA", status: "waiting" });
    const refused = await FlashBulk.apply("delete", ["fm-a", "fm-b"]);
    await FlashBulk.apply("price", ["fm-a"], "75");
    await FlashBulk.apply("top", ["fm-c"]);
    return { refused: refused.refused.map(x => x.code), kept: !!DB.get("fm-a"), price: DB.get("fm-a").price, order: FlashOrder.sorted(Flash.list()).map(x => x.code) };
  });
  expect(result).toEqual({ refused: ["ALPHA"], kept: true, price: "75", order: ["GAMMA", "ALPHA"] });
});

test("bulk kind and lifecycle actions skip repeatables", async ({ page }) => {
  await setup(page); await seed(page);
  const result = await page.evaluate(async () => {
    await FlashBulk.apply("repeatable", ["fm-c"]);
    const repeatable = DB.get("fm-c");
    await FlashBulk.apply("hide", ["fm-a"]);
    const hidden = (await FlashFeed.build(Flash.list())).items.some(x => x.code === "ALPHA");
    await FlashBulk.apply("show", ["fm-a"]);
    const lifecycle = await FlashBulk.apply("sold", ["fm-a", "fm-b"]);
    return { kind: repeatable.kind, status: repeatable.status, skipped: lifecycle.skipped, sold: DB.get("fm-a").status, hidden, shown: (await FlashFeed.build(Flash.list())).items.some(x => x.code === "ALPHA") };
  });
  expect(result).toEqual({ kind: "repeatable", status: "available", skipped: 1, sold: "sold", hidden: false, shown: true });
});

test("search keeps focus while typing and the delete prompt stays visible", async ({ page }) => {
  await setup(page); await seed(page); await page.evaluate(() => go("flash"));
  await page.locator("#flashSearch").pressSequentially("alp");
  await expect(page.locator("#flashSearch")).toBeFocused();
  await expect(page.locator("#flashSearch")).toHaveValue("alp");
  await page.getByRole("button", { name: "Select all" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".banner.warn")).toContainText("Delete 1 designs?");
});

test("tick boxes are always there, the bar appears only with a selection, Edit opens the editor", async ({ page }) => {
  await setup(page); await seed(page); await page.evaluate(() => go("flash"));
  await expect(page.locator("[data-flash-select]")).toHaveCount(3);
  await expect(page.locator(".flash-bulk-bar")).toHaveCount(0);
  await page.locator("[data-flash-select]").first().check();
  await expect(page.locator(".flash-bulk-bar")).toContainText("1 selected");
  await page.locator('.fitem button[data-go="flashEdit"]').first().click();
  await expect(page.locator("#f_code")).toBeVisible();
});
