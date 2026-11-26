"use strict";

/* Flash order and codes. A design's place in the list is its `order`; "Assign codes" numbers codes from that order. */
const FlashOrder = (() => {
  const rank = f => Number.isFinite(f.order) ? f.order : Number.MAX_SAFE_INTEGER;
  const GROUPS = ["repeatable", "limited", "one-off"];
  const group = f => { const i = GROUPS.indexOf(f.kind); return i < 0 ? GROUPS.length - 1 : i; };
  // Same order everywhere (app list, codes, website): Repeatable, then Limited edition, then Unique; your own order inside each.
  const sorted = list => [...list].sort((a, b) => group(a) - group(b) || rank(a) - rank(b) || String(a.code).localeCompare(String(b.code)));
  const nextOrder = () => Math.max(0, ...Flash.list().map(f => Number.isFinite(f.order) ? f.order : 0)) + 1;
  const locked = () => !!(DB.get("settings") || {}).flashPublishedAt;
  const cleanPrefix = text => String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  // Swap a design with its neighbour in the given (visible) list. Gives everything a fresh 1..n order first.
  async function move(id, direction, visible) {
    const all = sorted(Flash.list());
    for (let i = 0; i < all.length; i++) if (all[i].order !== i + 1) await DB.put({ ...DB.get(all[i].id), order: i + 1 });
    const ids = sorted(visible.map(f => DB.get(f.id))).map(f => f.id);
    const at = ids.indexOf(id), other = ids[at + direction];
    if (at < 0 || !other) return;
    const a = DB.get(id), b = DB.get(other);
    await DB.put({ ...a, order: b.order });
    await DB.put({ ...b, order: a.order });
  }

  // Codes become PREFIX1, PREFIX2... following the current order. Two passes avoid clashes while renaming.
  async function assignCodes(prefix) {
    const p = cleanPrefix(prefix);
    if (!p) throw new Error("Type a prefix first, like BLK.");
    const all = sorted(Flash.list());
    for (let i = 0; i < all.length; i++) await DB.put({ ...DB.get(all[i].id), code: `TMP${i + 1}`, order: i + 1 });
    for (let i = 0; i < all.length; i++) await DB.put({ ...DB.get(all[i].id), code: `${p}${i + 1}` });
    return all.length;
  }

  return { GROUPS, sorted, nextOrder, locked, move, assignCodes, cleanPrefix };
})();
