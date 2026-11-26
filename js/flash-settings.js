"use strict";

const FlashSettings = (() => {
  const DEFAULTS = {
    defaultKind: "repeatable",
    defaultPrice: "100",
    defaultQuantity: 5,
    prefix: "BLK",
    depositPercent: 50,
    info: "Claim a design in person at the shop."
  };
  const OLD_INFO = "Claim a design in person at the shop. Unique designs can be held with a deposit; if one is not held, it goes to whoever gets it tattooed first.";
  const percent = v => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 1 && n <= 100 ? n : DEFAULTS.depositPercent; };
  const publicInfo = () => { const s = get(); return `${s.info} Unique designs are held with a ${s.depositPercent}% deposit; without one, a design goes to whoever gets it tattooed first.`.trim(); };
  function get() {
    const saved = (DB.get("settings") || {}).flash || {};
    const kind = Flash.KINDS.includes(saved.defaultKind) ? saved.defaultKind : DEFAULTS.defaultKind;
    const quantity = Number.isInteger(Number(saved.defaultQuantity)) && Number(saved.defaultQuantity) >= 1 ? Number(saved.defaultQuantity) : DEFAULTS.defaultQuantity;
    return { ...DEFAULTS, ...saved, defaultKind: kind, defaultQuantity: quantity, prefix: FlashOrder.cleanPrefix(saved.prefix || DEFAULTS.prefix), info: saved.info === OLD_INFO ? DEFAULTS.info : String(saved.info ?? DEFAULTS.info).slice(0, 300), depositPercent: percent(saved.depositPercent) };
  }
  async function save(values) {
    const current = DB.get("settings") || { type: "settings", id: "settings" };
    const flash = { ...get(), ...values, info: String(values.info ?? get().info).slice(0, 300) };
    settings = { ...settings, ...current, flash };
    await DB.put(settings);
    return flash;
  }
  return { DEFAULTS, get, save, publicInfo };
})();
