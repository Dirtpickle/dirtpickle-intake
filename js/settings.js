"use strict";

const SettingsMenu = (() => {
  const entries = [
    ["settingsBusiness", "Business", "Name, age, pricing and auto-lock"],
    ["settingsContracts", "Signature & contracts", "Signatures, forms, blank contracts and aftercare"],
    ["settingsGoogle", "Google connection", "Email, calendar and Drive sync"],
    ["backup", "Backup & security", "Back up, restore or change the PIN"]
  ];

  function html() {
    return `${bar("Settings", { back: "home" })}<div class="card settings-menu">${entries.map(([id, title, help]) =>
      `<button class="tile" data-go="${id}" style="width:100%;text-align:left;margin-bottom:12px"><span>${title}</span><small>${help}</small></button>`).join("")}
</div>`;
  }

  function register(screens) {
    screens.settings = { html };
  }

  return { register };
})();
