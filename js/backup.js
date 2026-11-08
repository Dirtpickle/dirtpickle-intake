"use strict";
/* Encrypted backups. The backup file holds the same encrypted records stored on the device, plus the
   salt needed to derive the key from your PIN. Without the PIN it is unreadable. A SHA-256 fingerprint
   detects damage or tampering. Restoring replaces everything on this device. */
const Backup = (() => {
  const u8ToB64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const b64ToU8 = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  const sha = async str => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)));
  const encBox = b => ({ iv: u8ToB64(b.iv), data: u8ToB64(new Uint8Array(b.data)) });
  const decBox = b => ({ iv: b64ToU8(b.iv), data: b64ToU8(b.data).buffer });

  async function create() {
    const { auth, recs } = await DB.exportRaw();
    const body = {
      format: "dirtpickle-backup", version: 1, createdAt: new Date().toISOString(), count: recs.length,
      auth: { salt: u8ToB64(auth.salt), check: encBox(auth.check), pinLength: auth.pinLength },
      records: recs.map(r => ({ id: r.id, type: r.type, ...encBox(r) }))
    };
    const text = JSON.stringify(body);
    return JSON.stringify({ ...body, sha256: await sha(text) });
  }

  async function parse(text) {
    let j;
    try { j = JSON.parse(text); } catch (_) { throw new Error("This is not a Dirtpickle backup file."); }
    if (j.format !== "dirtpickle-backup" || !j.auth || !Array.isArray(j.records)) throw new Error("This is not a Dirtpickle backup file.");
    const { sha256, ...body } = j;
    if (!sha256 || (await sha(JSON.stringify(body))) !== sha256) throw new Error("This backup file is damaged or was changed. Do not use it.");
    return {
      meta: j,
      auth: { salt: b64ToU8(j.auth.salt), check: decBox(j.auth.check), pinLength: j.auth.pinLength },
      recs: j.records.map(r => ({ id: r.id, type: r.type, ...decBox(r) }))
    };
  }

  async function verify(text, pin) {
    const p = await parse(text);
    if (!pin) return { ...p, intact: true, tested: false };
    return { ...p, intact: true, tested: true, ...(await DB.testBackup(p.auth, p.recs, pin)) };
  }
  async function restore(text, pin) {
    const p = await parse(text);
    const t = await DB.testBackup(p.auth, p.recs, pin);
    if (!t.pinOk) throw new Error("That PIN does not open this backup.");
    if (t.readable !== t.total) throw new Error(`Only ${t.readable} of ${t.total} records in this backup are readable. Restore cancelled.`);
    await DB.importRaw(p.auth, p.recs);
    if (!(await DB.unlock(pin))) throw new Error("Restore wrote the data but could not unlock it. Do not close the app; contact support.");
    return t.total;
  }

  const days = iso => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null;
  function overdue() {
    const hasData = DB.all("client").length > 0;
    if (!hasData) return null;
    const d = days(settings.lastBackupAt);
    if (d === null) return "You have client records but no backup yet.";
    return d >= settings.backupDays ? `Your last backup was ${d} day${d === 1 ? "" : "s"} ago.` : null;
  }

  const pinInput = (id, label) => `<label for="${id}">${label}</label><input id="${id}" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off">`;
  const readFile = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(f); });

  screens.backup = {
    html: () => `${bar("Backup and security", { back: "settings" })}
      <div class="card"><strong>Make a backup</strong>
        <p class="mute" style="font-size:16px">Saves an encrypted file of all your records. It needs your PIN to open. Send it to Files, a USB drive, or your PC.
          Last backup: ${settings.lastBackupAt ? esc(Consent.stamp(settings.lastBackupAt)) : "never"}.</p>
        <button class="primary" id="bkMake">Create backup file</button><div id="bkMsg"></div></div>
      <div class="card"><strong>Check or restore a backup file</strong>
        <label class="btn" style="display:flex;align-items:center;justify-content:center;margin-top:12px">Choose backup file<input id="bkFile" type="file" hidden></label>
        <div id="bkPicked" class="mute" style="margin-top:8px"></div>
        ${pinInput("bkPin", "PIN used when the backup was made (needed to fully test or restore)")}
        <div class="actions"><button id="bkVerify">Check backup</button><button class="danger" id="bkRestore">Restore from backup</button></div>
        <div id="bkOut"></div></div>
      <div class="card"><strong>Change PIN</strong>${pinInput("pinOld", "Current PIN")}${pinInput("pinNew", "New 6-digit PIN")}${pinInput("pinNew2", "New PIN again")}
        <div class="actions"><button id="pinChange">Change PIN</button></div><div id="pinMsg"></div></div>
      <div class="card"><label for="bkDays" style="margin-top:0">Remind me when a backup is older than (days)</label>
        <input id="bkDays" type="number" inputmode="numeric" min="1" max="90" value="${settings.backupDays}">
        <div class="actions"><button id="bkDaysSave">Save</button></div></div>`,
    bind(root) {
      const msg = (id, cls, t) => { $(id, root).innerHTML = t ? `<div class="banner ${cls}">${esc(t)}</div>` : ""; };
      let fileText = null;
      $("#bkMake", root).onclick = async () => {
        try {
          const text = await create();
          const name = `dirtpickle-backup-${new Date().toISOString().slice(0, 10)}.dpbackup`;
          const file = new File([text], name, { type: "application/octet-stream" });
          let done = false;
          try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); done = true; } }
          catch (e) { if (e.name === "AbortError") { msg("#bkMsg", "warn", "Cancelled. No backup was saved."); return; } }
          if (!done) { const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name; a.click(); }
          settings = { ...settings, lastBackupAt: new Date().toISOString() }; await DB.put(settings);
          msg("#bkMsg", "ok", `Backup created: ${name}. Check that the file really landed where you wanted (Files app or PC).`);
        } catch (e) { msg("#bkMsg", "bad", "Backup failed: " + e.message); }
      };
      $("#bkFile", root).onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        fileText = await readFile(f); $("#bkPicked", root).textContent = f.name; msg("#bkOut", "", "");
      };
      $("#bkVerify", root).onclick = async () => {
        if (!fileText) { msg("#bkOut", "warn", "Choose a backup file first."); return; }
        try {
          const r = await verify(fileText, $("#bkPin", root).value);
          if (!r.tested) msg("#bkOut", "ok", `File is intact (${r.recs.length} records, made ${Consent.stamp(r.meta.createdAt)}). Enter the PIN to test that it can be opened.`);
          else if (!r.pinOk) msg("#bkOut", "bad", "File is intact, but that PIN does not open it.");
          else msg("#bkOut", r.readable === r.total ? "ok" : "bad", `File is intact and ${r.readable} of ${r.total} records are readable with that PIN.`);
        } catch (e) { msg("#bkOut", "bad", e.message); }
      };
      let armed = false;
      $("#bkRestore", root).onclick = async e => {
        if (!fileText) { msg("#bkOut", "warn", "Choose a backup file first."); return; }
        if (!armed) { armed = true; e.target.textContent = "Tap again: REPLACE all data on this iPad"; msg("#bkOut", "warn", "Restoring replaces every record on this iPad with the backup. Make a backup of the current data first if you need it."); return; }
        try {
          const n = await restore(fileText, $("#bkPin", root).value);
          await afterUnlock();
          alert(`Restored ${n} records. The PIN is now the one from the backup.`);
        } catch (err) { armed = false; e.target.textContent = "Restore from backup"; msg("#bkOut", "bad", err.message); }
      };
      $("#pinChange", root).onclick = async () => {
        const o = $("#pinOld", root).value, n = $("#pinNew", root).value, n2 = $("#pinNew2", root).value;
        if (!/^\d{6}$/.test(n)) { msg("#pinMsg", "bad", "The new PIN must be exactly 6 digits."); return; }
        if (n !== n2) { msg("#pinMsg", "bad", "The new PINs do not match."); return; }
        const { auth } = await DB.exportRaw();
        const t = await DB.testBackup(auth, [], o);
        if (!t.pinOk) { msg("#pinMsg", "bad", "Current PIN is wrong."); return; }
        try { await DB.changePin(n); msg("#pinMsg", "ok", "PIN changed. Old backups still need the OLD PIN, so make a new backup now."); }
        catch (e) { msg("#pinMsg", "bad", e.message); }
      };
      $("#bkDaysSave", root).onclick = async () => {
        settings = { ...settings, backupDays: Math.max(1, Math.min(90, parseInt($("#bkDays", root).value, 10) || 7)) }; await DB.put(settings);
        go("backup");
      };
    }
  };
  return { create, verify, restore, overdue };
})();
