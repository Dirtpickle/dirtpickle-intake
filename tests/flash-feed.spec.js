const { test, expect } = require("@playwright/test");
const { setup } = require("./helpers/app");

test("public flash feed allowlists fields, maps status and excludes hidden", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const picture = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    const rows = [
      { type: "flash", code: "hold-1", name: "Held", kind: "one-off", status: "reserved", sheet: "A", price: "80", picture, id: "secret", reservedFor: "client", purchase: { source: "in-person" }, notes: "private", minutes: 60, sessionId: "s", clientId: "c" },
      { type: "flash", code: "repeat-1", name: "Repeat", kind: "repeatable", status: "sold", sheet: "A", price: 90 },
      { type: "flash", code: "hidden-1", name: "Hidden", kind: "one-off", status: "hidden" }
    ];
    const feed = await FlashFeed.build(rows, { event: "Friday", now: "2026-11-27T10:00:00.000Z" });
    return { feed, keys: Object.keys(feed.items[0]).sort(), images: await FlashFeed.images(rows) };
  });
  expect(result.feed).toMatchObject({ version: 1, updatedAt: "2026-11-27T10:00:00.000Z", event: "Friday" });
  expect(result.feed.items.map(i => i.status)).toEqual(["hold", "available"]);
  expect(result.keys).toEqual(["code", "image", "kind", "name", "price", "sheet", "status"]);
  expect(result.feed.items[0].image).toMatch(/^img\/HOLD1-[0-9a-f]{8}\.jpg$/);
  expect(result.images[0].base64).toBe("/9j/4AAQSkZJRg==");
});

test("artist hold, release and in-person sold transitions publish-safe records", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const f = await DB.put({ type: "flash", code: "STATUS1", kind: "one-off", status: "available" });
    await Flash.hold(f.id); const held = DB.get(f.id).status;
    await Flash.release(f.id); const released = DB.get(f.id).status;
    await Flash.markSold(f.id); const sold = DB.get(f.id);
    return { held, released, status: sold.status, purchase: sold.purchase };
  });
  expect(result.held).toBe("reserved");
  expect(result.released).toBe("available");
  expect(result.status).toBe("sold");
  expect(result.purchase.source).toBe("in-person");
});

test("flash publish asks what exists, sends only new pictures, then the feed", async ({ page }) => {
  await setup(page);
  const sent = await page.evaluate(async () => {
    await DB.put({ ...DB.get("settings"), emailRelayUrl: "https://script.google.com/macros/s/x/exec", relaySecret: "test-secret" });
    const png = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=";
    await DB.put({ type: "flash", id: "pic1", code: "PIC1", name: "Pic", kind: "one-off", status: "available", picture: png });
    const oldFetch = window.fetch, bodies = [];
    window.fetch = async (_, options) => { const body = JSON.parse(options.body); bodies.push(body); return new Response(JSON.stringify({ ok: true, have: [] }), { status: 200 }); };
    await FlashPublish.run();
    window.fetch = oldFetch;
    return bodies;
  });
  expect(sent.map(b => b.action)).toEqual(["flash.list", "flash.image", "flash.publish"]);
  expect(Object.keys(sent[2]).sort()).toEqual(["action", "feed", "secret"]);
  expect(sent[1].path.startsWith("img/PIC1-") && sent[1].path.endsWith(".jpg")).toBe(true);
});

test("old flash records without picture still migrate", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    await DB.put({ type: "flash", id: "old-pictureless", name: "Old", code: "OLD1", kind: "one-off", status: "available" });
    await Flash.migrateAll();
    const f = DB.get("old-pictureless");
    return { picture: f.picture, status: f.status, kind: f.kind };
  });
  expect(result).toEqual({ picture: undefined, status: "available", kind: "one-off" });
});

test("import, reorder, and assign codes in order", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => go("flashImport"));
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await page.locator("#flashFiles").setInputFiles([
    { name: "first-file.png", mimeType: "image/png", buffer: png },
    { name: "second-file.png", mimeType: "image/png", buffer: png }
  ]);
  await expect(page.locator("#flashImportResult")).toContainText("New designs: 2");
  await page.evaluate(() => go("flash"));
  await page.locator('.fitem', { hasText: "NEW2" }).locator('[data-flash-action="up"]').click();
  await expect.poll(() => page.evaluate(() => FlashOrder.sorted(Flash.list())[0].code)).toBe("NEW2");
  await page.evaluate(() => go("flashCodes"));
  await page.locator("#codesPrefix").fill("blk");
  await page.locator("#codesGo").click();
  await expect.poll(() => page.evaluate(() => FlashOrder.sorted(Flash.list()).map(f => f.code).join(","))).toBe("BLK1,BLK2");
  const first = await page.evaluate(() => FlashOrder.sorted(Flash.list())[0].picture.slice(0, 10));
  expect(first).toBe("data:image");
  const feed = await page.evaluate(async () => (await FlashFeed.build(Flash.list())).items.map(i => i.code).join(","));
  expect(feed).toBe("BLK1,BLK2");
});
