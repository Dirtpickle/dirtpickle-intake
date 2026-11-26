"use strict";

/* Bulk import: every picture becomes a new design with a temporary code and the next place in the list.
   Reorder them, then use "Assign codes" to give them their real codes. */
const FlashImport = (() => {
  async function files(fileList) {
    const result = { created: [], failed: [] };
    let order = FlashOrder.nextOrder();
    for (const file of fileList || []) {
      try {
        const picture = await FlashPicture.jpeg(file);
        const code = `NEW${order}`;
        await DB.put({ type: "flash", code, name: "", sheet: "Unsorted", kind: "one-off", price: "", minutes: "", status: "available", purchase: null, picture, order });
        result.created.push(code); order += 1;
      } catch (e) { result.failed.push(file.name); }
    }
    return result;
  }
  return { files };
})();
