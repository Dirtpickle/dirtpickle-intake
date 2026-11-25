"use strict";

/* Bulk import: every picture becomes a design. A filename that matches an existing code updates that design;
   any other filename creates a new one, using the filename as its code and name. */
const FlashImport = (() => {
  const baseName = file => String(file.name || "").replace(/\.[^.]+$/, "");
  const pretty = text => text.replace(/[_]+/g, " ").trim();

  function uniqueCode(wanted, used, n) {
    const base = wanted || "FLASH";
    let code = wanted && !used.has(base) ? base : "", i = 2;
    if (!code) { do { code = `${base}-${wanted ? i++ : n++}`; } while (used.has(code)); }
    used.add(code);
    return code;
  }

  async function files(fileList) {
    const existing = Flash.list();
    const byCode = new Map(existing.map(f => [FlashCode.normalize(f.code), f]));
    const used = new Set(byCode.keys());
    const result = { matched: [], created: [], failed: [] };
    let n = 1;
    for (const file of fileList || []) {
      try {
        const picture = await FlashPicture.jpeg(file);
        const name = baseName(file), item = byCode.get(FlashCode.normalize(name));
        if (item) { await DB.put({ ...item, picture }); result.matched.push(item.code); continue; }
        const code = uniqueCode(FlashCode.normalize(name).replace(/[^A-Z0-9]/g, ""), used, n);
        n += 1;
        await DB.put({ type: "flash", code, name: pretty(name), sheet: "Unsorted", kind: "one-off", price: "", minutes: "", status: "available", purchase: null, picture });
        result.created.push(code);
      } catch (e) { result.failed.push(file.name); }
    }
    return result;
  }
  return { files };
})();
