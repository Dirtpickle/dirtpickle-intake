"use strict";

/* Settings > Google connection > Sync card. One switch per device; the engine does the work (sync-engine.js). */
const SyncUI = (() => {
  const intro = "Sync keeps all your devices matching, with no codes to type. An encrypted copy of your data is stored in your own Google Drive. Google cannot read it. Every device needs the same Apps Script URL and the same PIN. A forgotten PIN still cannot be recovered.";
  const configured = () => Mailer.configured(Mailer.relayFromSettings());
  const last = value => value ? new Date(value).toLocaleString() : "never";
  const fail = (root, e) => { const m = $("#syncMsg", root); m.textContent = e.message; m.hidden = false; };

  function offHtml() {
    return `<p><b>Sync is off on this device.</b></p>
      <div class="actions"><button id="syncTurnOn" type="button" class="primary">Turn on sync on this device</button></div>`;
  }
  function onHtml(s) {
    return `<p><b>Sync is on.</b> Last synced: ${esc(last(s.lastSyncAt))}.</p>
      <div class="actions"><button id="syncNow" type="button" class="primary">Sync now</button></div>
      <label style="display:flex;gap:12px;align-items:center;color:var(--fg)"><input id="autoSync" type="checkbox" style="width:26px;height:26px" ${s.autoSync === false ? "" : "checked"}> Sync automatically when I unlock</label>
      <div id="syncResult" class="sub"></div>${s.syncPinDiffers ? `<div class="banner warn">This device unlocks with a different PIN than your sync PIN.</div><div class="actions"><button id="syncMatchPin" type="button">Make this device's PIN match the sync PIN</button></div>` : ""}
      <div class="actions"><button id="syncReset" type="button" class="small ghost">Turn off sync on this device</button><button id="syncStartOver" type="button" class="small ghost">Start over: replace the Drive copy with this device</button></div>`;
  }
  function settingsHtml() {
    const s = DB.get("settings") || {};
    return `<hr><strong>Sync between devices</strong><p class="mute" style="font-size:16px">${esc(intro)}</p>
      ${s.syncEnabled ? onHtml(s) : offHtml()}<div id="syncMsg" class="banner bad" hidden></div>`;
  }

  async function turnOn() {
    if (!configured()) throw new Error("First enter the Apps Script URL and secret in the Email section above, and save.");
    settings = { ...settings, syncEnabled: true };
    await DB.put(settings);
    go("settingsGoogle");
  }
  const askPin = () => PinPrompt.ask("Enter your PIN to sync", "It must be the same PIN on every device.");
  async function sync(root) {
    $("#syncMsg", root).hidden = true;
    const pin = await askPin();
    if (!pin) return;
    $("#syncResult", root).textContent = "Syncing…";
    try {
      const r = await SyncEngine.run(pin);
      await notePinDifference(pin);
      $("#syncResult", root).textContent = `Done. Added ${r.added}, updated ${r.updated}, deleted ${r.deleted}, merged ${r.merged}. Everything is now matched on all devices: ${r.byType || "nothing yet"}.`;
    } catch (e) { $("#syncResult", root).textContent = ""; fail(root, e); }
  }
  async function notePinDifference(pin) {
    const differs = !(await DB.pinMatches(pin));
    if (differs === !!(DB.get("settings") || {}).syncPinDiffers) return;
    settings = { ...settings, syncPinDiffers: differs };
    await DB.put(settings);
  }
  async function matchPin(root) {
    const pin = await PinPrompt.ask("Enter your sync PIN", "This device will unlock with this PIN from now on.");
    if (!pin) return;
    if (await DB.pinMatches(pin)) { settings = { ...settings, syncPinDiffers: false }; await DB.put(settings); return go("settingsGoogle"); }
    if (!confirm("Change this device's unlock PIN to the sync PIN? Old backups still need the old PIN, so make a new backup afterward.")) return;
    await DB.changePin(pin);
    settings = { ...settings, syncPinDiffers: false };
    await DB.put(settings);
    go("settingsGoogle");
  }
  async function startOver(root) {
    if (!confirm("Replace the copy in Google Drive with the data on THIS device? Your other devices keep their own data and will merge with it on their next sync.")) return;
    const pin = await askPin();
    if (!pin) return;
    const r = await SyncEngine.startOver(pin);
    $("#syncResult", root).textContent = `Drive copy replaced: ${r.byType || "nothing yet"}.`;
  }
  async function turnOff() {
    if (!confirm("Turn off sync on this device? Your data stays here. You can turn it on again any time.")) return;
    settings = { ...settings, syncEnabled: false, syncSalt: undefined, syncCode: undefined, lastSyncAt: undefined };
    await DB.put(settings); go("settingsGoogle");
  }
  function bindSettings(root) {
    const on = (id, fn) => $(id, root)?.addEventListener("click", () => fn(root).catch(e => fail(root, e)));
    on("#syncTurnOn", turnOn); on("#syncNow", sync); on("#syncStartOver", startOver); on("#syncMatchPin", matchPin); on("#syncReset", turnOff);
    $("#autoSync", root)?.addEventListener("change", async e => { await DB.put({ ...(DB.get("settings") || {}), autoSync: e.target.checked }); });
  }
  return { settingsHtml, bindSettings };
})();
