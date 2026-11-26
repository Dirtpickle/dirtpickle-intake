const { test, expect } = require("@playwright/test");
const { setup } = require("./helpers/app");

test("flash kind labels and limited lifecycle keep stored kinds", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const f = await DB.put({ type: "flash", id: "limited-1", code: "L1", kind: "limited", quantity: 2, sold: 0, status: "available" });
    await Flash.sellOne(f.id); const first = DB.get(f.id);
    await Flash.complete(f.id); const final = DB.get(f.id);
    await Flash.putBackOne(f.id); const back = DB.get(f.id);
    return { labels: [Flash.kindLabel("repeatable"), Flash.kindLabel("one-off"), Flash.kindLabel("limited")], first, final, back };
  });
  expect(result.labels).toEqual(["Repeatable", "Unique", "Limited edition"]);
  expect(result.first).toMatchObject({ kind: "limited", quantity: 2, sold: 1, status: "available" });
  expect(result.final).toMatchObject({ sold: 2, status: "sold" });
  expect(result.back).toMatchObject({ sold: 1, status: "available" });
});

test("limited feed has info, remaining, and strict item keys", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => FlashFeed.build([
    { type: "flash", code: "L2", name: "Limited", kind: "limited", quantity: 5, sold: 2, status: "available", price: "100", sheet: "A" }
  ], { info: "Claim in person", event: "Friday", now: "2026-11-27T10:00:00.000Z" }));
  expect(result).toMatchObject({ event: "Friday", info: "Claim in person" });
  expect(result.items[0]).toMatchObject({ kind: "limited", quantity: 5, remaining: 3, status: "available" });
  expect(Object.keys(result.items[0]).sort()).toEqual(["code", "image", "kind", "name", "price", "quantity", "remaining", "sheet", "status"]);
  expect(Object.keys(result).sort()).toEqual(["event", "info", "items", "updatedAt", "version"]);
});

test("flash settings merge defaults and import uses saved defaults", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const defaults = FlashSettings.get();
    await FlashSettings.save({ defaultKind: "limited", defaultPrice: "125", defaultQuantity: 4, prefix: " blk ", info: "Shop info" });
    const saved = FlashSettings.get();
    return { defaults, saved, stored: DB.get("settings").flash };
  });
  expect(result.defaults).toMatchObject({ defaultKind: "repeatable", defaultPrice: "100", defaultQuantity: 5, prefix: "BLK" });
  expect(result.saved).toMatchObject({ defaultKind: "limited", defaultPrice: "125", defaultQuantity: 4, prefix: "BLK", info: "Shop info" });
  expect(result.stored).toMatchObject({ defaultKind: "limited", defaultQuantity: 4 });
});

test("old flash records keep their stored kind and shape", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    await DB.put({ type: "flash", id: "old-shape", code: "OLD1", kind: "one-off", status: "available", price: "80" });
    await Flash.migrateAll();
    return DB.get("old-shape");
  });
  expect(result.kind).toBe("one-off");
  expect(result.quantity).toBeUndefined();
  expect(result.sold).toBeUndefined();
});
