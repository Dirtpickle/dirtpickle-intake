"use strict";

const FlashImport = (() => {
  async function files(fileList) {
    const byCode = new Map(Flash.list().map(f => [FlashCode.normalize(f.code), f]));
    const result = { matched: [], unmatched: [] };
    for (const file of fileList || []) {
      const name = String(file.name || "").replace(/\.[^.]+$/, "");
      const item = byCode.get(FlashCode.normalize(name));
      if (!item) { result.unmatched.push(file.name); continue; }
      const picture = await FlashPicture.jpeg(file);
      await DB.put({ ...item, picture });
      result.matched.push(item.code);
    }
    return result;
  }
  return { files };
})();
