"use strict";
/* Local encrypted store, with a sealed "inbox" so the intake side can ADD records without being able to READ any.
   - The intake side only ever has the PUBLIC key. It seals each submission to that key (RSA-OAEP wraps a fresh
     AES-256 key; AES-GCM encrypts the data). Nothing on the intake side can decrypt a submission.
   - The PRIVATE key is itself encrypted with a key derived from the admin PIN, so only the pro side (after PIN)
     can open the inbox and import submissions into the main store.
   - Data lives in IndexedDB on this device only.
   - Every record payload is AES-GCM encrypted with a key derived from the admin PIN (PBKDF2).
   - The key exists only in memory while unlocked. A forgotten PIN means unrecoverable data
     (keep backups). This is app-level encryption in a browser: strong against casual access,
     but not equivalent to iOS Keychain / SQLCipher in a native build. */
const DB = (() => {
  const NAME = "dp-app", VER = 2, ITER = 600000;
  let idb = null, key = null, priv = null; // priv: RSA private key, only while pro side is unlocked
  const cache = new Map(); // id -> decrypted object (only while unlocked)
  let unreadable = 0;

  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta");
      if (!d.objectStoreNames.contains("records")) d.createObjectStore("records", { keyPath: "id" }).createIndex("type", "type");
      if (!d.objectStoreNames.contains("inbox")) d.createObjectStore("inbox", { keyPath: "id" });
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

  const b64 = u8 => { let t = ""; const a = new Uint8Array(u8); for (let i = 0; i < a.length; i += 0x8000) t += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(t); };
  const unb64 = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
  const RSA = { name: "RSA-OAEP", hash: "SHA-256" };

  /* Create the key pair on first run (or on upgrade from an older install); otherwise unwrap the private key. */
  async function ensureKeys() {
    const keys = await run("meta", "readonly", s => s.get("keys"));
    if (!keys) {
      const kp = await crypto.subtle.generateKey({ ...RSA, modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]) }, true, ["encrypt", "decrypt"]);
      const pkcs8 = await crypto.subtle.exportKey("pkcs8", kp.privateKey);
      const spki = await crypto.subtle.exportKey("spki", kp.publicKey);
      const wrappedPriv = await enc({ k: b64(pkcs8) });
      await run("meta", "readwrite", s => s.put({ pub: new Uint8Array(spki), wrappedPriv }, "keys"));
      priv = kp.privateKey;
      return;
    }
    const { k } = await dec(keys.wrappedPriv);
    priv = await crypto.subtle.importKey("pkcs8", unb64(k), RSA, true, ["decrypt"]);
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
      await run("meta", "readwrite", s => s.delete("keys"));
      await ensureKeys();
      cache.clear();
    },
    async unlock(pin) {
      const auth = await run("meta", "readonly", s => s.get("auth"));
      if (!auth) return false;
      const k = await derive(pin, auth.salt);
      key = k;
      try { await dec(auth.check); }
      catch (_) { key = null; return false; }
      await ensureKeys();
      cache.clear();
      const all = await run("records", "readonly", s => s.getAll());
      unreadable = 0;
      for (const rec of all) { try { cache.set(rec.id, await dec(rec)); } catch (_) { unreadable++; } }
      return true;
    },
    /* ---- backup / restore / PIN change (records stay encrypted; nothing readable leaves the device) ---- */
    async exportRaw() {
      const auth = await run("meta", "readonly", s => s.get("auth"));
      const recs = await run("records", "readonly", s => s.getAll());
      const keys = await run("meta", "readonly", s => s.get("keys"));
      const inbox = await run("inbox", "readonly", s => s.getAll());
      const pub = await run("meta", "readonly", s => s.get("public"));
      return { auth, recs, keys, inbox, pub };
    },
    async testBackup(auth, recs, pin) {
      const k = await derive(pin, auth.salt);
      const d = r => crypto.subtle.decrypt({ name: "AES-GCM", iv: r.iv }, k, r.data);
      try { await d(auth.check); } catch (_) { return { pinOk: false, readable: 0, total: recs.length }; }
      let readable = 0;
      for (const r of recs) { try { await d(r); readable++; } catch (_) { /* counted as unreadable */ } }
      return { pinOk: true, readable, total: recs.length };
    },
    async importRaw(auth, recs, extra = {}) {
      await new Promise((res, rej) => {
        const t = idb.transaction(["meta", "records", "inbox"], "readwrite");
        t.objectStore("records").clear(); t.objectStore("inbox").clear();
        t.objectStore("meta").put(auth, "auth");
        if (extra.keys) t.objectStore("meta").put(extra.keys, "keys"); else t.objectStore("meta").delete("keys");
        if (extra.pub) t.objectStore("meta").put(extra.pub, "public");
        for (const i of (extra.inbox || [])) t.objectStore("inbox").put(i);
        for (const r of recs) t.objectStore("records").put(r);
        t.oncomplete = res; t.onerror = t.onabort = () => rej(t.error);
      });
      key = null; priv = null; cache.clear();
    },
    async changePin(newPin) {
      if (!key) throw new Error("Locked");
      if (unreadable) throw new Error("Some records could not be read; PIN change refused to avoid losing them. Make a backup first.");
      const oldKey = key;
      try {
        const privBytes = await crypto.subtle.exportKey("pkcs8", priv);
        const salt = crypto.getRandomValues(new Uint8Array(16));
        key = await derive(newPin, salt);
        const recs = [];
        for (const o of cache.values()) { const { iv, data } = await enc(o); recs.push({ id: o.id, type: o.type, iv, data }); }
        const check = await enc({ ok: "dirtpickle" });
        const wrappedPriv = await enc({ k: b64(privBytes) });
        const oldKeys = await run("meta", "readonly", s => s.get("keys"));
        await new Promise((res, rej) => {
          const t = idb.transaction(["meta", "records"], "readwrite");
          t.objectStore("meta").put({ salt, check, pinLength: newPin.length }, "auth");
          t.objectStore("meta").put({ pub: oldKeys.pub, wrappedPriv }, "keys");
          for (const r of recs) t.objectStore("records").put(r);
          t.oncomplete = res; t.onerror = t.onabort = () => rej(t.error);
        });
      } catch (e) { key = oldKey; throw e; }
    },
    lock() { key = null; priv = null; cache.clear(); },
    isUnlocked() { return !!key; },
    /* ---- intake side: add-only. No PIN, no private key, nothing readable. ---- */
    async hasKeys() { return !!(await run("meta", "readonly", s => s.get("keys"))); },
    async seal(obj) {
      const keys = await run("meta", "readonly", s => s.get("keys"));
      if (!keys) throw new Error("Not set up");
      const pub = await crypto.subtle.importKey("spki", keys.pub, RSA, false, ["encrypt"]);
      const aes = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, new TextEncoder().encode(JSON.stringify(obj)));
      const wk = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, await crypto.subtle.exportKey("raw", aes));
      const rec = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), iv, data, wk };
      await run("inbox", "readwrite", s => s.put(rec));
      return rec.id;
    },
    async inboxCount() { return (await run("inbox", "readonly", s => s.count())) || 0; },
    /* The non-secret data the intake side needs (form wording, business name, flash designs). Plain text on purpose. */
    async getPublic() { return (await run("meta", "readonly", s => s.get("public"))) || null; },
    async setPublic(obj) { await run("meta", "readwrite", s => s.put(obj, "public")); },
    /* ---- pro side: open the inbox (needs the private key, i.e. the PIN) ---- */
    async inboxOpen() {
      if (!priv) throw new Error("Locked");
      const out = []; let failed = 0;
      for (const r of await run("inbox", "readonly", s => s.getAll())) {
        try {
          const raw = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, priv, r.wk);
          const aes = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
          const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: r.iv }, aes, r.data);
          out.push({ id: r.id, createdAt: r.createdAt, payload: JSON.parse(new TextDecoder().decode(buf)) });
        } catch (_) { failed++; }
      }
      return { items: out, failed };
    },
    async inboxRemove(id) { await run("inbox", "readwrite", s => s.delete(id)); },
    get(id) { return cache.get(id); },
    all(type) { return [...cache.values()].filter(o => o.type === type); },
    async remove(id) {
      if (!key) throw new Error("Locked");
      const o = cache.get(id);
      if (o && o.locked) throw new Error("Signed records are locked and cannot be deleted");
      await run("records", "readwrite", s => s.delete(id));
      cache.delete(id);
    },
    async put(obj) {
      if (!key) throw new Error("Locked");
      if (!obj.id) obj.id = crypto.randomUUID();
      if (cache.has(obj.id) && cache.get(obj.id).locked) throw new Error("Signed records are locked and cannot be changed");
      const { iv, data } = await enc(obj);
      await run("records", "readwrite", s => s.put({ id: obj.id, type: obj.type, iv, data }));
      cache.set(obj.id, obj);
      return obj;
    }
  };
})();
