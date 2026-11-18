const { test, expect } = require("@playwright/test");
const { setup } = require("./helpers/app");

test("tombstones remove mutable records, preserve locked records, and old backups parse", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const mutable = await DB.put({ type: "session", id: "sync-session", createdAt: "2026-01-01T00:00:00Z" });
    await DB.remove(mutable.id);
    const locked = { type: "consent", id: "sync-consent", locked: true, signedAt: "2026-01-01T00:00:00Z" };
    const planned = BackupMerge.merge([locked], [{ type: "tombstone", id: "ts-sync-consent", targetId: locked.id, targetType: locked.type, deletedAt: "2026-10-01T00:00:00Z" }]);
    const backup = JSON.parse(await Backup.create()); backup.version = 2; delete backup.sha256;
    const body = JSON.stringify(backup); const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)))].map(b => b.toString(16).padStart(2, "0")).join("");
    backup.sha256 = hash; await Backup.parse(JSON.stringify(backup));
    return { tombstone: DB.get("ts-sync-session"), remove: planned.remove, tombstones: planned.tombstones.length };
  });
  expect(result.tombstone.targetId).toBe("sync-session");
  expect(result.remove).toEqual([]);
  expect(result.tombstones).toBe(1);
});

test("backup merge deduplicates by license and name/dob, and counts ambiguity", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(() => BackupMerge.merge([
    { type: "client", id: "local-license", legalName: "A", dob: "1990-01-01", licenseNumber: "L1", visits: [{ at: "2026-01-01" }] },
    { type: "client", id: "local-name", legalName: "B", dob: "1991-01-01" },
    { type: "client", id: "local-name-2", legalName: "B", dob: "1991-01-01" }
  ], [
    { type: "client", id: "incoming-license", legalName: "Changed", dob: "1990-01-01", licenseNumber: "L1", visits: [{ at: "2026-02-01" }] },
    { type: "session", id: "incoming-session", clientId: "incoming-license", createdAt: "2026-02-01" },
    { type: "client", id: "incoming-name", legalName: "B", dob: "1991-01-01" }
  ]));
  expect(result.merged).toBe(1);
  expect(result.ambiguous).toBe(1);
  expect(result.update.find(r => r.id === "local-license").visits).toHaveLength(2);
  expect(result.add.find(r => r.id === "incoming-session").clientId).toBe("local-license");
});

test("sync seal round trips, rejects wrong PIN, and pairing code has no PIN", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const kit = SyncSeal.newKit(); const sealed = await SyncSeal.seal([{ id: "x", type: "event" }], "123456", kit.salt);
    let wrong = false; try { await SyncSeal.open(sealed, "000000", kit.salt); } catch (_) { wrong = true; }
    const code = SyncSeal.pairingCode(kit); return { opened: await SyncSeal.open(sealed, "123456", kit.salt), wrong, code, pairing: SyncSeal.fromPairingCode(code) };
  });
  expect(result.opened).toEqual([{ id: "x", type: "event" }]);
  expect(result.wrong).toBe(true);
  expect(result.code).not.toContain("123456");
  expect(result.pairing.salt).toBeTruthy();
});
