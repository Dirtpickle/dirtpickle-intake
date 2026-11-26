"use strict";

screens.flashSettings = {
  html() {
    const s = FlashSettings.get();
    const option = kind => `<option value="${kind}" ${s.defaultKind === kind ? "selected" : ""}>${Flash.kindLabel(kind)}</option>`;
    return `${bar("Flash settings", { back: "flash" })}<div class="card"><label for="flashDefaultKind">Default type</label><select id="flashDefaultKind">${Flash.KINDS.map(option).join("")}</select><label for="flashDefaultPrice">Default price</label><input id="flashDefaultPrice" value="${esc(s.defaultPrice)}" inputmode="decimal"><label for="flashDefaultQuantity">Default quantity (limited)</label><input id="flashDefaultQuantity" type="number" min="1" step="1" value="${s.defaultQuantity}"><label for="flashPrefix">Code prefix</label><input id="flashPrefix" value="${esc(s.prefix)}" autocapitalize="characters"><label for="flashDeposit">Deposit to hold a Unique design (%)</label><input id="flashDeposit" type="number" min="1" max="100" step="1" value="${s.depositPercent}"><label for="flashInfo">Info line</label><textarea id="flashInfo" maxlength="300" rows="5">${esc(s.info)}</textarea><div id="flashSettingsMsg"></div><button class="primary" id="saveFlashSettings">Save</button></div>`;
  },
  bind(root) {
    $("#saveFlashSettings", root).onclick = async () => {
      const quantity = Math.max(1, parseInt($("#flashDefaultQuantity", root).value, 10) || 1);
      await FlashSettings.save({ defaultKind: $("#flashDefaultKind", root).value, defaultPrice: $("#flashDefaultPrice", root).value.trim(), defaultQuantity: quantity, depositPercent: Math.min(100, Math.max(1, parseInt($("#flashDeposit", root).value, 10) || 50)), prefix: FlashOrder.cleanPrefix($("#flashPrefix", root).value), info: $("#flashInfo", root).value.trim() });
      if (typeof FlashPublish !== "undefined") FlashPublish.run().catch(() => {});
      $("#flashSettingsMsg", root).textContent = "Saved.";
    };
  }
};
