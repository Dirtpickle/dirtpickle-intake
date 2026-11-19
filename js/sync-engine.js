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

  async function syncOnce(pin) {
    const settings = DB.get("settings") || {};
    if (!settings.syncSalt) throw new Error("Sync is not turned on on this device. Turn it on in Settings first.");
    const remote = await SyncRelay.get();
    const incoming = remote.data ? await SyncSeal.open(remote.data, pin, settings.syncSalt) : [];
    const result = await applyMerge(incoming);
    const sealed = await SyncSeal.seal(packageRecords(), pin, settings.syncSalt);
    const size = new Blob([sealed]).size;
    if (size > MAX_BYTES) throw new Error(`Sync package is ${Math.ceil(size / 1024 / 1024)} MB, over the 8 MB limit.`);
    await SyncRelay.put(sealed, remote.version);
    await DB.put({ ...settings, lastSyncAt: new Date().toISOString() });
    return summary(result, packageRecords().length);
  }

  async function run(pin) {
    if (!DB.isUnlocked()) throw new Error("Unlock the pro side before syncing.");
    try { return await syncOnce(pin); }
    catch (error) {
      if (!/conflict/i.test(error.message)) throw error;
      return await syncOnce(pin);
    }
  }

  return { run };
})();
