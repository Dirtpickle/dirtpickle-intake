const { test, expect } = require("@playwright/test");
const { setup } = require("./helpers/app");

test("flash rules preserve repeatable designs and lifecycle one-offs", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const repeat = await DB.put({ type: "flash", id: "repeat-rule", name: "Repeat", kind: "repeatable", status: "available" });
    const one = await DB.put({ type: "flash", id: "one-rule", name: "One", kind: "one-off", status: "available" });
    await Flash.claim(repeat.id, "session-1");
    await Flash.claim(one.id, "session-1");
    const reserved = DB.get(one.id).status;
    await Flash.release(one.id);
    const available = DB.get(one.id).status;
    await Flash.complete(one.id);
    const sold = DB.get(one.id).status;
    return { repeat: DB.get(repeat.id).status, reserved, available, sold };
  });
  expect(result).toEqual({ repeat: "available", reserved: "reserved", available: "available", sold: "sold" });
});

test("legacy flash records migrate taken to sold and missing kind to one-off", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    await DB.put({ type: "flash", id: "legacy-rule", name: "Legacy", status: "taken" });
    await Flash.migrateAll();
    const f = DB.get("legacy-rule");
    return { kind: f.kind, status: f.status };
  });
  expect(result).toEqual({ kind: "one-off", status: "sold" });
});

test("local shop seam reserves and marks a flash sold", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    await DB.put({ type: "flash", id: "shop-rule", name: "Shop", kind: "one-off", status: "available" });
    const reserved = await FlashStore.reserve("shop-rule", "buyer-1");
    const sold = await FlashStore.markSold("shop-rule", { source: "web-shop", orderId: "order-1" });
    return { reserved: reserved.ok, status: DB.get("shop-rule").status, orderId: sold.flash.purchase.orderId, stub: FlashStore.redeem("x").reason };
  });
  expect(result).toEqual({ reserved: true, status: "sold", orderId: "order-1", stub: "not-implemented" });
});
