"use strict";

/* Flash data rules. This module deliberately has no DOM dependencies. */
const Flash = (() => {
  const KINDS = ["repeatable", "one-off"];
  const STATUSES = ["available", "reserved", "sold", "hidden"];

  function normalize(input = {}) {
    const oldStatus = input.status === "taken" ? "sold" : input.status;
    const status = STATUSES.includes(oldStatus) ? oldStatus : "available";
    return {
      ...input,
      kind: KINDS.includes(input.kind) ? input.kind : "one-off",
      status,
      price: input.price ?? "",
      minutes: input.minutes ?? "",
      sheet: input.sheet || "Unsorted",
      purchase: input.purchase || null,
      ...(input.status === "taken" ? { reservedFor: undefined } : {})
    };
  }

  function changed(a, b) {
    return a.kind !== b.kind || a.status !== b.status || a.sheet !== b.sheet ||
      JSON.stringify(a.purchase) !== JSON.stringify(b.purchase);
  }

  async function migrateAll() {
    for (const old of DB.all("flash")) {
      const next = normalize(old);
      if (changed(old, next)) await DB.put(next);
    }
  }

  function list() { return DB.all("flash").map(normalize); }
  function get(id) { const item = DB.get(id); return item ? normalize(item) : null; }
  function available(item) { return item.status === "available"; }

  async function claim(id, sessionId) {
    const item = get(id);
    if (!item) return null;
    if (item.kind === "repeatable" || item.status !== "available") return item;
    return DB.put({ ...item, status: "reserved", reservedFor: sessionId || null });
  }

  async function complete(id) {
    const item = get(id);
    if (!item || item.kind === "repeatable") return item;
    return DB.put({ ...item, status: "sold", reservedFor: null });
  }

  async function release(id) {
    const item = get(id);
    if (!item || item.kind === "repeatable" || item.purchase) return item;
    if (item.status === "reserved") return DB.put({ ...item, status: "available", reservedFor: null });
    return item;
  }

  return { KINDS, STATUSES, normalize, migrateAll, list, get, available, claim, complete, release };
})();
