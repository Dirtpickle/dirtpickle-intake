"use strict";

/* Flash data rules. This module deliberately has no DOM dependencies. */
const Flash = (() => {
  const KINDS = ["repeatable", "one-off", "limited"];
  const STATUSES = ["available", "reserved", "sold", "hidden"];
  const LABELS = { repeatable: "Repeatable", "one-off": "Unique", limited: "Limited edition" };
  const kindLabel = kind => LABELS[kind] || LABELS["one-off"];
  const integer = (value, fallback, minimum) => Number.isInteger(Number(value)) && Number(value) >= minimum ? Number(value) : fallback;

  function normalize(input = {}) {
    const oldStatus = input.status === "taken" ? "sold" : input.status;
    const status = STATUSES.includes(oldStatus) ? oldStatus : "available";
    return {
      ...input,
      code: input.code ? FlashCode.normalize(input.code) : String(input.name || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
      kind: KINDS.includes(input.kind) ? input.kind : "one-off",
      status,
      price: input.price ?? "",
      minutes: input.minutes ?? "",
      sheet: input.sheet || "Unsorted",
      purchase: input.purchase || null,
      ...(input.status === "taken" ? { reservedFor: undefined } : {}),
      ...(input.kind === "limited" ? { quantity: integer(input.quantity, 1, 1), sold: integer(input.sold, 0, 0) } : {})
    };
  }

  function changed(a, b) {
    return a.code !== b.code || a.image !== undefined || a.kind !== b.kind || a.status !== b.status || a.sheet !== b.sheet ||
      a.quantity !== b.quantity || a.sold !== b.sold || JSON.stringify(a.purchase) !== JSON.stringify(b.purchase);
  }

  async function migrateAll() {
    const used = new Set();
    for (const old of DB.all("flash")) {
      const next = normalize(old);
      const base = next.code || "FLASH";
      let code = base, n = 2;
      while (used.has(code)) code = `${base}-${n++}`;
      next.code = code; used.add(code);
      if (changed(old, next)) {
        delete next.image;
        await DB.put(next);
      }
    }
  }

  function list() { return DB.all("flash").map(normalize); }
  function get(id) { const item = DB.get(id); return item ? normalize(item) : null; }
  function available(item) { return item.kind === "limited" ? item.sold < item.quantity : item.status === "available"; }

  async function claim(id, sessionId) {
    const item = get(id);
    if (!item) return null;
    if (item.kind === "repeatable" || item.kind === "limited" || item.status !== "available") return item;
    return DB.put({ ...item, status: "reserved", reservedFor: sessionId || null });
  }

  async function complete(id) {
    const item = get(id);
    if (!item || item.kind === "repeatable") return item;
    if (item.kind === "limited") return sellOne(id);
    return DB.put({ ...item, status: "sold", reservedFor: null });
  }

  async function release(id) {
    const item = get(id);
    if (!item || item.kind === "repeatable" || item.kind === "limited" || item.purchase) return item;
    if (item.status === "reserved") return DB.put({ ...item, status: "available", reservedFor: null });
    return item;
  }

  async function hold(id) {
    const item = get(id);
    if (!item || item.kind === "repeatable" || item.kind === "limited" || item.status !== "available") return item;
    return DB.put({ ...item, status: "reserved", reservedFor: null });
  }

  async function markSold(id) {
    const item = get(id);
    if (!item || item.kind === "repeatable") return item;
    if (item.kind === "limited") return sellOne(id);
    return DB.put({ ...item, status: "sold", reservedFor: null,
      purchase: { source: "in-person", at: new Date().toISOString() } });
  }

  async function sellOne(id) {
    const item = get(id);
    if (!item || item.kind !== "limited" || item.sold >= item.quantity) return item;
    const sold = item.sold + 1;
    return DB.put({ ...item, sold, status: sold >= item.quantity ? "sold" : "available" });
  }
  async function putBackOne(id) {
    const item = get(id);
    if (!item || item.kind !== "limited" || item.sold <= 0) return item;
    return DB.put({ ...item, sold: item.sold - 1, status: "available" });
  }

  return { KINDS, STATUSES, kindLabel, normalize, migrateAll, list, get, available, claim, complete, release, hold, markSold, sellOne, putBackOne };
})();
