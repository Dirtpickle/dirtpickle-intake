"use strict";

/* Runs a background sync right after the artist unlocks. Never blocks the app; failures show a small note only. */
const SyncAuto = (() => {
  const note = (text, ms) => {
    let el = document.getElementById("syncAutoNote");
    if (!el) {
      el = document.createElement("div"); el.id = "syncAutoNote"; el.setAttribute("role", "status");
      el.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9000;padding:10px 16px;border-radius:12px;background:#222;color:#fff;font:600 16px system-ui,sans-serif;max-width:90vw;text-align:center";
      document.body.appendChild(el);
    }
    el.textContent = text; el.hidden = false;
    clearTimeout(el._t); if (ms) el._t = setTimeout(() => { el.hidden = true; }, ms);
  };

  function enabled() {
    const s = DB.get("settings") || {};
    return !!s.syncSalt && s.syncEnabled !== false && s.autoSync !== false && navigator.onLine !== false
      && Mailer.configured(Mailer.relayFromSettings());
  }

  async function run(pin) {
    if (!enabled()) return null;
    note("Syncing…");
    try {
      const result = await SyncEngine.run(pin);
      const changed = result.added + result.updated + result.deleted + result.merged;
      note(changed ? `Synced: ${changed} change${changed === 1 ? "" : "s"} from your other device` : "Synced", 3500);
      if (changed && cur.name === "home") go("home", {}, { replace: true });
      return result;
    } catch (_) {
      note("Sync didn't finish. Your data is safe. Try Sync now in Settings.", 6000);
      return null;
    }
  }

  return { run, enabled };
})();
