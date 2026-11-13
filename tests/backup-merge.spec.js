const { test, expect } = require("@playwright/test");
const { setup, newClient } = require("./helpers/app");

test("backup merge rules add, update, skip, and protect locked/settings records", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(() => {
    const local = [
      { id: "old", type: "client", updatedAt: "2026-01-02T00:00:00Z", name: "local" },
      { id: "locked", type: "consent", locked: true, sha256: "local", signedAt: "2026-01-01T00:00:00Z" },
      { id: "settings", type: "settings", business: "local" },
      { id: "untimed", type: "session", name: "keep" }
    ];
    const incoming = [
      { id: "new", type: "client", createdAt: "2026-01-03T00:00:00Z" },
      { id: "old", type: "client", updatedAt: "2026-01-03T00:00:00Z", name: "new" },
      { id: "locked", type: "consent", locked: true, sha256: "incoming" },
      { id: "settings", type: "settings", business: "other" },
      { id: "untimed", type: "session", name: "replace" }
    ];
    const merged = BackupMerge.merge(local, incoming);
    return { merged, again: BackupMerge.merge([...local, ...merged.add, ...merged.update], incoming) };
  });
  expect(result.merged.add.map(r => r.id)).toEqual(["new"]);
  expect(result.merged.update.map(r => r.id)).toEqual(["old"]);
  expect(result.merged.skip.map(r => r.id)).toEqual(["locked", "untimed"]);
  expect(result.merged.conflicts).toBe(1);
  expect(result.merged.counts.byType.client).toMatchObject({ add: 1, update: 1 });
  expect(result.again.add).toHaveLength(0);
  expect(result.again.update).toHaveLength(0);
});

test("merging a backup keeps this device PIN and settings", async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pageA = await a.newPage();
  const pageB = await b.newPage();
  try {
    await setup(pageA, "123456");
    await newClient(pageA, "Device A Client");
    const backupText = await pageA.evaluate(() => Backup.create());
    await setup(pageB, "654321");
    await newClient(pageB, "Device B Client");
    const before = await pageB.evaluate(() => ({ business: settings.business, pin: DB.isUnlocked(), clients: DB.all("client").map(c => c.legalName) }));
    const merged = await pageB.evaluate(async text => {
      window.__backupText = text;
      return Backup.merge(text, "123456");
    }, backupText);
    const after = await pageB.evaluate(async () => {
      const names = DB.all("client").map(c => c.legalName).sort();
      DB.lock();
      const pinWorks = await DB.unlock("654321");
      const again = await Backup.merge(window.__backupText, "123456");
      return { names, pinWorks, business: settings.business, again };
    });
    expect(before.business).toBe("Dirtpickle");
    expect(merged.added).toBe(1);
    expect(after.names).toEqual(["Device A Client", "Device B Client"]);
    expect(after.pinWorks).toBe(true);
    expect(after.business).toBe("Dirtpickle");
  } finally { await a.close(); await b.close(); }
});
