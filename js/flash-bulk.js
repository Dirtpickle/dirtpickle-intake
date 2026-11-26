"use strict";

/* Bulk Flash changes. No DOM: callers decide how to confirm, report, and publish. */
const FlashBulk = (() => {
  const records = ids => ids.map(id => Flash.get(id)).filter(Boolean);
  const save = async (item, changes) => DB.put({ ...item, ...changes });

  function sessionUses(ids) {
    const wanted = new Set(ids);
    return DB.all("session").filter(s => wanted.has(s.flashId)).map(s => ({ id: s.flashId, code: Flash.get(s.flashId)?.code || s.flashCode || s.flashId }));
  }

  async function apply(action, ids, value = "") {
    const selected = records(ids);
    if (action === "delete") {
      const used = sessionUses(ids);
      const blocked = new Set(used.map(s => s.id));
      for (const item of selected) if (!blocked.has(item.id)) await DB.remove(item.id);
      return { changed: selected.filter(item => !blocked.has(item.id)).length, refused: used };
    }
    if (action === "top" || action === "bottom") return move(action, ids);
    let changed = 0, skipped = 0;
    for (const item of selected) {
      if (["hold", "release", "sold"].includes(action) && ["repeatable", "limited"].includes(item.kind)) { skipped++; continue; }
      if (action === "repeatable") await save(item, { kind: "repeatable", status: "available", reservedFor: null, purchase: null });
      else if (action === "one-off") await save(item, { kind: "one-off", status: item.kind === "repeatable" ? "available" : item.status });
      else if (action === "limited") { const quantity = item.quantity || FlashSettings.get().defaultQuantity; await save(item, { kind: "limited", quantity, sold: item.sold || 0, status: (item.sold || 0) >= quantity ? "sold" : "available", reservedFor: null, purchase: null }); }
      else if (action === "quantity") { if (item.kind !== "limited") { skipped++; continue; } const q = Math.max(1, Math.floor(Number(value))); await save(item, { quantity: q, status: (item.sold || 0) >= q ? "sold" : "available" }); }
      else if (action === "price") await save(item, { price: value });
      else if (action === "sheet") await save(item, { sheet: value || "Unsorted" });
      else if (action === "hold") await Flash.hold(item.id);
      else if (action === "release") await Flash.release(item.id);
      else if (action === "sold") await Flash.markSold(item.id);
      else if (action === "hide" && item.status === "available") await save(item, { status: "hidden" });
      else if (action === "show" && item.status === "hidden") await save(item, { status: "available" });
      else { continue; }
      changed++;
    }
    return { changed, skipped };
  }

  async function move(action, ids) {
    const selected = new Set(ids);
    const all = FlashOrder.sorted(Flash.list());
    const chosen = all.filter(item => selected.has(item.id));
    const rest = all.filter(item => !selected.has(item.id));
    const ordered = action === "top" ? chosen.concat(rest) : rest.concat(chosen);
    for (let i = 0; i < ordered.length; i++) {
      if (ordered[i].order !== i + 1) await save(ordered[i], { order: i + 1 });
    }
    return { changed: chosen.length, skipped: 0 };
  }

  return { apply, sessionUses };
})();
