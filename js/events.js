"use strict";

/* Event records own the temporary flash pricing and availability rules. */
const Events = (() => {
  const DEFAULTS = {
    name: "Black Friday Flash",
    date: "2026-11-27",
    flashMin: 80,
    flashMax: 150,
    hourlyApplies: false
  };

  function normalize(input = {}) {
    return {
      type: "event",
      name: String(input.name || DEFAULTS.name).trim() || DEFAULTS.name,
      date: input.date || DEFAULTS.date,
      flashMin: numberOr(input.flashMin, DEFAULTS.flashMin),
      flashMax: numberOr(input.flashMax, DEFAULTS.flashMax),
      hourlyApplies: input.hourlyApplies === true,
      active: input.active !== false,
      createdAt: input.createdAt || new Date().toISOString(),
      ...(input.id ? { id: input.id } : {})
    };
  }

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  }

  function list() { return DB.all("event").sort((a, b) => (b.date || "").localeCompare(a.date || "")); }
  function getActive() { return list().find(event => event.active) || null; }

  async function create(input) {
    const event = normalize(input);
    await endActive();
    return DB.put(event);
  }

  async function update(id, input) {
    const old = DB.get(id);
    if (!old) throw new Error("Event not found");
    const event = normalize({ ...old, ...input, id, active: old.active });
    return DB.put(event);
  }

  async function end(id) {
    const event = DB.get(id);
    if (!event) throw new Error("Event not found");
    return DB.put({ ...event, active: false });
  }

  async function endActive() {
    const active = getActive();
    if (active) await DB.put({ ...active, active: false });
  }

  async function migrateLegacy(settings) {
    const legacy = settings && settings.event;
    if (!legacy || DB.all("event").length) return settings;
    await create({
      name: legacy.name,
      date: legacy.date || DEFAULTS.date,
      flashMin: legacy.flashMin ?? legacy.minPrice,
      flashMax: legacy.flashMax ?? legacy.maxPrice,
      hourlyApplies: legacy.hourlyApplies,
      createdAt: legacy.createdAt
    });
    const next = { ...settings };
    delete next.event;
    await DB.put(next);
    return next;
  }

  function pricing() {
    const active = getActive();
    return active ? { ...active, minPrice: active.flashMin, maxPrice: active.flashMax } : {
      name: "Event", flashMin: 80, flashMax: 150, minPrice: 80, maxPrice: 150,
      hourlyApplies: false
    };
  }

  return { DEFAULTS, normalize, list, getActive, create, update, end, migrateLegacy, pricing };
})();
