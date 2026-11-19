"use strict";

const SyncUI = (() => {
  const text = "Sync stores an encrypted copy in your own Google Drive. Google cannot read it. A forgotten PIN still cannot be recovered.";
  const configured = () => Mailer.configured(Mailer.relayFromSettings());
  const last = value => value ? new Date(value).toLocaleString() : "never";

  function settingsHtml() {
    const s = DB.get("settings") || {};
    return `<hr><strong>Sync</strong><p class="mute" style="font-size:16px">${text}</p>
      <div id="syncState">${s.syncSalt ? `Sync is on. Last synced: ${last(s.lastSyncAt)}.` : "Sync is off."}</div>
      ${s.syncSalt ? `<button id="syncNow" type="button" style="margin-top:10px">Sync now</button><div id="syncResult" class="sub"></div>` : `<button id="syncTurnOn" type="button">Turn on sync</button><button id="syncPair" type="button" class="ghost" style="margin-left:8px">Pair with another device</button>`}
      <div id="syncMsg" class="banner bad" hidden></div>`;
  }

  function showCode(root, code) { $("#syncMsg", root).outerHTML = `<div id="syncMsg" class="banner ok">Pairing code (QR is not available in this app):<br><code>${esc(code)}</code><br>Enter this code on the other device, then use the same PIN.</div>`; }
  async function turnOn(root) {
    if (!configured()) throw new Error("Save the relay URL and secret in Settings first.");
    const kit = SyncSeal.newKit();
    settings = { ...settings, syncSalt: kit.salt, syncEnabled: true };
    await DB.put(settings);
    showCode(root, SyncSeal.pairingCode(kit));
    $("#syncState", root).textContent = "Sync is on. Sync now is available after saving settings.";
  }
  async function pair(root) {
    const code = prompt("Paste the pairing code from the other device:");
    if (!code) return;
    const kit = SyncSeal.fromPairingCode(code.trim());
    settings = { ...settings, syncSalt: kit.salt, syncEnabled: true };
    await DB.put(settings);
    $("#syncState", root).textContent = "Paired. Save settings, then sync now. The same PIN must be used on both devices.";
  }
  async function sync(root) {
    const msg = $("#syncMsg", root); msg.hidden = true;
    try {
      const result = await SyncEngine.run(prompt("Enter this device's PIN to sync:"));
      $("#syncResult", root).textContent = `Uploaded ${result.uploaded} records; added ${result.added}, updated ${result.updated}, deleted ${result.deleted}, merged ${result.merged}.`;
      $("#syncState", root).textContent = `Sync is on. Last synced: ${last((DB.get("settings") || {}).lastSyncAt)}.`;
    } catch (e) { msg.textContent = e.message; msg.hidden = false; }
  }
  function bindSettings(root) {
    $("#syncTurnOn", root)?.addEventListener("click", () => turnOn(root).catch(e => { const m = $("#syncMsg", root); m.textContent = e.message; m.hidden = false; }));
    $("#syncPair", root)?.addEventListener("click", () => pair(root).catch(e => { const m = $("#syncMsg", root); m.textContent = e.message; m.hidden = false; }));
    $("#syncNow", root)?.addEventListener("click", () => sync(root));
  }
  return { settingsHtml, bindSettings };
})();
