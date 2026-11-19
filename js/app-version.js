"use strict";

/* Shows the running app version (read from the service worker cache name, so it never goes stale). */
const AppVersion = (() => {
  const html = () => `<div class="sub mute" id="appVersion" style="margin-top:14px">Version …</div>`;
  async function bind(root) {
    const el = root.querySelector("#appVersion");
    if (!el) return;
    try {
      const names = (await caches.keys()).filter(k => /^dp-app-v\d+$/.test(k)).sort();
      el.textContent = names.length ? `Version ${names[names.length - 1].replace("dp-app-", "")}` : "Version (not installed offline yet)";
    } catch (_) { el.textContent = "Version unknown"; }
  }
  return { html, bind };
})();
