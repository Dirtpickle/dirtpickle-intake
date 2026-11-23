"use strict";

const SyncEngine = (() => {
  const MAX_BYTES = 8 * 1024 * 1024;

  function packageRecords() {
    return DB.all().filter(record => record.type !== "settings");
  }

  async function applyMerge(incoming) {
    const result = BackupMerge.merge(packageRecords(), incoming || []);
    for (const record of result.add.concat(result.update, result.tombstones)) await DB.put(record);
    for (const record of result.remove) await DB.remove(record.id, { force: true });
    return result;
  }

  function summary(result, uploaded) {
    return { added: result ? result.add.length : 0, updated: result ? result.update.length : 0,
      deleted: result ? result.remove.length + result.tombstones.length : 0, merged: result ? result.merged : 0, uploaded };
  }

  /* Opens with the URL-derived key; copies made by older versions used a pairing-code key, so try that as a fallback. */
  async function openRemote(data, pin, salt, legacySalt) {
    try { return await SyncSeal.open(data, pin, salt); }
    catch (error) { if (!legacySalt) throw error; return SyncSeal.open(data, pin, legacySalt); }
  }

  /* Start over: replace the Drive copy with this device (use when the Drive copy cannot be opened). Devices keep their own data. */
  async function startOver(pin) {
    if (!DB.isUnlocked()) throw new Error("Unlock the pro side before syncing.");
    const salt = await SyncSeal.saltFromUrl(Mailer.relayFromSettings().url);
    const remote = await SyncRelay.get();
    const extra = SyncMarks.record();
    await SyncRelay.put(await SyncSeal.seal(extra ? packageRecords().concat(extra) : packageRecords(), pin, salt), remote.version);
    await DB.put({ ...(DB.get("settings") || {}), lastSyncAt: new Date().toISOString() });
    return { uploaded: packageRecords().length, byType: countByType(packageRecords()) };
  }

  async function syncOnce(pin) {
    const settings = DB.get("settings") || {};
    if (settings.syncEnabled !== true) throw new Error("Sync is not turned on on this device. Turn it on in Settings first.");
    const salt = await SyncSeal.saltFromUrl(Mailer.relayFromSettings().url);
    const remote = await SyncRelay.get();
    const opened = remote.data ? await openRemote(remote.data, pin, salt, settings.syncSalt) : [];
    const { marks, rest } = SyncMarks.split(opened);
    const result = await applyMerge(rest);
    await SyncMarks.apply(marks);
    const extra = SyncMarks.record();
    const sealed = await SyncSeal.seal(extra ? packageRecords().concat(extra) : packageRecords(), pin, salt);
    const size = new Blob([sealed]).size;
    if (size > MAX_BYTES) throw new Error(`Sync package is ${Math.ceil(size / 1024 / 1024)} MB, over the 8 MB limit.`);
    await SyncRelay.put(sealed, remote.version);
    await DB.put({ ...(DB.get("settings") || settings), lastSyncAt: new Date().toISOString() });
    return { ...summary(result, packageRecords().length), byType: countByType(packageRecords()) };
  }

  const LABELS = { client: "clients", consent: "signed contracts", session: "sessions", appointment: "appointments", template: "contract forms", aftercare: "aftercare records", photo: "photos", flash: "flash designs", event: "events" };
  function countByType(records) {
    const counts = {};
    for (const r of records) if (r.type !== "tombstone") counts[r.type] = (counts[r.type] || 0) + 1;
    return Object.entries(counts).map(([type, n]) => n + " " + (LABELS[type] || type)).join(", ");
  }

  async function run(pin) {
    if (!DB.isUnlocked()) throw new Error("Unlock the pro side before syncing.");
    try { return await syncOnce(pin); }
    catch (error) {
      if (!/conflict/i.test(error.message)) throw error;
      return await syncOnce(pin);
    }
  }

  return { run, startOver, countByType };
})();
