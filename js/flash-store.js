"use strict";

/* Extension point for a future web-shop integration. All current operations are local and offline. */
const FlashStore = (() => {
  async function reserve(flashId, buyerRef) {
    const item = Flash.get(flashId);
    if (!item || item.status !== "available") return { ok: false, reason: "unavailable" };
    const next = await DB.put({ ...item, status: "reserved", reservedFor: buyerRef || null });
    return { ok: true, flash: next };
  }

  async function markSold(flashId, purchase) {
    const item = Flash.get(flashId);
    if (!item) return { ok: false, reason: "not-found" };
    const next = await DB.put({ ...item, status: "sold", purchase: {
      source: purchase?.source || "shop", orderId: purchase?.orderId || "", at: purchase?.at || new Date().toISOString()
    } });
    return { ok: true, flash: next };
  }

  function redeem() { return { ok: false, reason: "not-implemented" }; }
  function importOrders() { return { ok: false, reason: "not-implemented" }; }
  return { reserve, markSold, redeem, importOrders };
})();
