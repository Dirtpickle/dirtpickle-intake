"use strict";

/* Extra PDFs that travel with a signed contract email (the artist's aftercare sheet).
   Loaded from the app's own files, so it works offline once cached. Failure never blocks the contract email. */
const MailerAttachments = (() => {
  const WITH_CONTRACT = [{ path: "assets/Tattoo-Aftercare.pdf", filename: "Tattoo-Aftercare.pdf" }];
  const cache = new Map();

  const toBase64 = bytes => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };

  async function load(item) {
    if (!cache.has(item.path)) {
      const response = await fetch(item.path);
      if (!response.ok) throw new Error("attachment unavailable");
      cache.set(item.path, { filename: item.filename, pdfBase64: toBase64(new Uint8Array(await response.arrayBuffer())) });
    }
    return cache.get(item.path);
  }

  async function forDoc(doc) {
    if (!["consent", "countersign"].includes(doc.type)) return [];
    const found = [];
    for (const item of WITH_CONTRACT) { try { found.push(await load(item)); } catch (_) { /* send the contract anyway */ } }
    return found;
  }

  return { forDoc };
})();
