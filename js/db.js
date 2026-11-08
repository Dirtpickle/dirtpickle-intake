"use strict";
/* Local encrypted store.
   - Data lives in IndexedDB on this device only.
   - Every record payload is AES-GCM encrypted with a key derived from the admin PIN (PBKDF2).
   - The key exists only in memory while unlocked. A forgotten PIN means unrecoverable data
     (keep backups). This is app-level encryption in a browser: strong against casual access,
     but not equivalent to iOS Keychain / SQLCipher in a native build. */
const DB = (() => {
  const NAME = "dp-app", VER = 1, ITER = 600000;
  let idb = null, key = null;
  const cache = new Map(); // id -> decrypted object (only while unlocked)

  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore("meta");
      d.createObjectStore("records", { keyPath: "id" }).createIndex("type", "type");
    };
    r.onsuccess = () => { idb = r.result; res(); };
    r.onerror = () => rej(r.error);
  });

  const run = (store, mode, fn) => new Promise((res, rej) => {
    const t = idb.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req ? req.result : undefined);
    t.onerror = t.onabort = () => rej(t.error);
  });

  async function derive(pin, salt) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function enc(obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
    return { iv, data };
  }
  async function dec(rec) {
    const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: rec.iv }, key, rec.data);
    return JSON.parse(new TextDecoder().decode(buf));
  }

  return {
    open,
    async hasPin() { return !!(await run("meta", "readonly", s => s.get("auth"))); },
    async pinLength() { const a = await run("meta", "readonly", s => s.get("auth")); return a ? a.pinLength : 6; },
    async setup(pin) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      key = await derive(pin, salt);
      const check = await enc({ ok: "dirtpickle" });
      await run("meta", "readwrite", s => s.put({ salt, check, pinLength: pin.length }, "auth"));
      cache.clear();
    },
    async unlock(pin) {
      const auth = await run("meta", "readonly", s => s.get("auth"));
      if (!auth) return false;
      const k = await derive(pin, auth.salt);
      key = k;
      try { await dec(auth.check); }
      catch (_) { key = null; return false; }
      cache.clear();
      const all = await run("records", "readonly", s => s.getAll());
      for (const rec of all) { try { cache.set(rec.id, await dec(rec)); } catch (_) { /* skip unreadable */ } }
      return true;
    },
    lock() { key = null; cache.clear(); },
    isUnlocked() { return !!key; },
    get(id) { return cache.get(id); },
    all(type) { return [...cache.values()].filter(o => o.type === type); },
    async put(obj) {
      if (!key) throw new Error("Locked");
      if (!obj.id) obj.id = crypto.randomUUID();
      const { iv, data } = await enc(obj);
      await run("records", "readwrite", s => s.put({ id: obj.id, type: obj.type, iv, data }));
      cache.set(obj.id, obj);
      return obj;
    }
  };
})();
