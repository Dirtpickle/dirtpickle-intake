"use strict";

screens.settingsBusiness = {
  html: () => `${bar("Business", { back: "settings" })}<div class="card">
    <label for="biz" style="margin-top:0">Business name</label><input id="biz" value="${esc(settings.business)}">
    <label for="artist">Tattoo artist legal name / business entity (printed on contracts)</label><input id="artist" value="${esc(settings.artistName)}">
    <label for="minAge">Minimum client age</label><input id="minAge" type="number" inputmode="numeric" min="0" max="99" value="${settings.minAge}">
    <hr><strong>Pricing</strong>${Pricing.settingsHtml(settings)}
    <label for="autoLock">Auto-lock after (minutes of no activity)</label><input id="autoLock" type="number" inputmode="numeric" min="1" max="120" value="${settings.autoLockMin}">
    <div class="actions"><button class="primary" id="saveSettings">Save settings</button><span id="setMsg" class="mute" style="align-self:center"></span></div></div>`,
  bind(root) {
    $("#saveSettings", root).onclick = async () => {
      const minAge = Math.max(0, Math.min(99, parseInt($("#minAge", root).value, 10) || 18));
      const autoLockMin = Math.max(1, Math.min(120, parseInt($("#autoLock", root).value, 10) || 5));
      settings = { ...Pricing.readSettings(root, settings), business: $("#biz", root).value.trim() || "Dirtpickle",
        artistName: $("#artist", root).value.trim() || DEFAULTS.artistName, minAge, autoLockMin };
      await DB.put(settings); await publishPublic(); $("#setMsg", root).textContent = "Saved.";
    };
  }
};
