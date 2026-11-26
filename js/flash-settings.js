"use strict";

const FlashSettings = (() => {
  const DEFAULTS = {
    defaultKind: "repeatable",
    defaultPrice: "100",
    defaultQuantity: 5,
    prefix: "BLK",
    info: "Claim a design in person at the shop. Unique designs can be held with a deposit; if one is not held, it goes to whoever gets it tattooed first."
  };
  function get() {
    const saved = (DB.get("settings") || {}).flash || {};
    const kind = Flash.KINDS.includes(saved.defaultKind) ? saved.defaultKind : DEFAULTS.defaultKind;
    const quantity = Number.isInteger(Number(saved.defaultQuantity)) && Number(saved.defaultQuantity) >= 1 ? Number(saved.defaultQuantity) : DEFAULTS.defaultQuantity;
    return { ...DEFAULTS, ...saved, defaultKind: kind, defaultQuantity: quantity, prefix: FlashOrder.cleanPrefix(saved.prefix || DEFAULTS.prefix), info: String(saved.info ?? DEFAULTS.info).slice(0, 300) };
  }
  async function save(values) {
    const current = DB.get("settings") || { type: "settings", id: "settings" };
    const flash = { ...get(), ...values, info: String(values.info ?? get().info).slice(0, 300) };
    settings = { ...settings, ...current, flash };
    await DB.put(settings);
    return flash;
  }
  return { DEFAULTS, get, save };
})();
