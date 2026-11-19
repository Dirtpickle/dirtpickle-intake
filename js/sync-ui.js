"use strict";

/* Settings > Google connection > Sync card. Guided steps; the engine does the work (sync-engine.js). */
const SyncUI = (() => {
  const intro = "Sync keeps your iPad and phone matching. An encrypted copy of your data is stored in your own Google Drive. Google cannot read it. Both devices must use the same PIN. A forgotten PIN still cannot be recovered.";
  const configured = () => Mailer.configured(Mailer.relayFromSettings());
  const last = value => value ? new Date(value).toLocaleString() : "never";
  const codeOf = s => s.syncCode || SyncSeal.pairingCode({ salt: s.syncSalt });
  const fail = (root, e) => { const m = $("#syncMsg", root); m.textContent = e.message; m.hidden = false; };

  function offHtml() {
    return `<p><b>Not set up yet.</b> Pick one:</p>
      <div class="actions"><button id="syncTurnOn" type="button" class="primary">This is my MAIN device: turn on sync</button></div>
      <div class="actions"><button id="syncPairOpen" type="button">This is my SECOND device: pair it</button></div>
      <div id="syncPairBox" hidden><label for="syncCodeIn">Type the pairing code from your main device (like K7M-4QX9)</label>
        <input id="syncCodeIn" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="40" style="font-size:24px;letter-spacing:2px"><div class="actions"><button id="syncPairGo" type="button" class="primary">Pair</button></div></div>`;
  }
  function onHtml(s) {
    return `<p><b>Sync is on.</b> Last synced: ${esc(last(s.lastSyncAt))}.</p>
      <div class="actions"><button id="syncNow" type="button" class="primary">Sync now</button></div><div id="syncResult" class="sub"></div>
      <div class="actions"><button id="syncShowCode" type="button" class="small ghost">Show pairing code for another device</button><button id="syncReset" type="button" class="small ghost">Turn off sync on this device</button></div><div id="syncCodeBox"></div>`;
  }
  function settingsHtml() {
    const s = DB.get("settings") || {};
    return `<hr><strong>Sync between devices</strong><p class="mute" style="font-size:16px">${esc(intro)}</p>
      ${s.syncSalt ? onHtml(s) : offHtml()}<div id="syncMsg" class="banner bad" hidden></div>`;
  }

  function showCode(root, s) {
    $("#syncCodeBox", root).innerHTML = `<div class="banner ok"><div style="font-size:15px">Pairing code. On your other device go to Settings, Google connection, "This is my SECOND device", and type this code. You only enter it once.</div>
      <div id="syncCodeText" style="font-family:monospace;font-size:34px;letter-spacing:3px;margin:10px 0;user-select:all">${esc(codeOf(s))}</div>
      <div class="actions"><button id="syncCopy" type="button" class="small">Copy code</button>${navigator.share ? `<button id="syncShare" type="button" class="small">Send it to myself</button>` : ""}</div></div>`;
    $("#syncCopy", root).onclick = async () => { try { await navigator.clipboard.writeText(codeOf(s)); $("#syncCopy", root).textContent = "Copied"; } catch (_) { $("#syncCopy", root).textContent = "Select the code and copy it"; } };
    const share = $("#syncShare", root); if (share) share.onclick = () => navigator.share({ text: codeOf(s) }).catch(() => {});
  }
  async function turnOn(root) {
    if (!configured()) throw new Error("First enter the Apps Script URL and secret in the Email section above, and save.");
    const kit = await SyncSeal.newPairing();
    settings = { ...settings, syncSalt: kit.salt, syncCode: kit.code, syncEnabled: true };
    await DB.put(settings);
    $("#syncTurnOn", root).closest(".actions").outerHTML = `<p><b>Sync is on for this device.</b> Tap Sync now below, then pair your other device with this code.</p>`;
    $("#syncPairOpen", root).closest(".actions").remove();
    $("#syncPairBox", root).insertAdjacentHTML("beforebegin", `<div id="syncCodeBox"></div><div class="actions"><button id="syncNow" type="button" class="primary">Sync now</button></div><div id="syncResult" class="sub"></div>`);
    $("#syncNow", root).onclick = () => sync(root);
    showCode(root, settings);
  }
  async function pair(root) {
    if (!configured()) throw new Error("First enter the same Apps Script URL and secret in the Email section above, and save.");
    const typed = $("#syncCodeIn", root).value.trim();
    const salt = typed.startsWith("v1.") ? SyncSeal.fromPairingCode(typed).salt : await SyncSeal.saltFromCode(typed);
    settings = { ...settings, syncSalt: salt, syncCode: typed.startsWith("v1.") ? undefined : typed.toUpperCase(), syncEnabled: true };
    await DB.put(settings);
    go("settingsGoogle");
  }
  async function sync(root) {
    const msg = $("#syncMsg", root); msg.hidden = true;
    const pin = prompt("Enter your PIN to sync. It must be the same PIN on both devices.");
    if (!pin) return;
    $("#syncResult", root).textContent = "Syncing…";
    try {
      const r = await SyncEngine.run(pin);
      $("#syncResult", root).textContent = `Done. Added ${r.added}, updated ${r.updated}, deleted ${r.deleted}, merged ${r.merged}. ${r.uploaded} records now in sync.`;
    } catch (e) { $("#syncResult", root).textContent = ""; fail(root, e); }
  }
  function bindSettings(root) {
    const on = (id, fn) => $(id, root)?.addEventListener("click", () => fn(root).catch(e => fail(root, e)));
    on("#syncTurnOn", turnOn); on("#syncPairGo", pair); on("#syncNow", sync);
    $("#syncPairOpen", root)?.addEventListener("click", () => { $("#syncPairBox", root).hidden = false; $("#syncCodeIn", root).focus(); });
    $("#syncReset", root)?.addEventListener("click", async () => {
      if (!confirm("Turn off sync on this device? Your data stays here. You can turn sync on again and get a new pairing code.")) return;
      settings = { ...settings, syncSalt: undefined, syncCode: undefined, syncEnabled: false, lastSyncAt: undefined };
      await DB.put(settings); go("settingsGoogle");
    });
    $("#syncShowCode", root)?.addEventListener("click", () => showCode(root, DB.get("settings") || {}));
  }
  return { settingsHtml, bindSettings };
})();
