"use strict";

const FlashFeed = (() => {
  const status = f => f.kind === "repeatable" ? "available" : ({ available: "available", reserved: "hold", sold: "sold" }[f.status] || "available");
  const bytesToHex = bytes => [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, "0")).join("");
  const base64 = picture => String(picture || "").replace(/^data:[^,]+,/, "");

  async function hash(picture) {
    const raw = atob(base64(picture));
    return bytesToHex(await crypto.subtle.digest("SHA-256", Uint8Array.from(raw, c => c.charCodeAt(0))));
  }

  async function build(items, { event = "", now = new Date() } = {}) {
    const output = [];
    for (const f of FlashOrder.sorted(items || [])) {
      if (f.status === "hidden") continue;
      const code = FlashCode.normalize(f.code || "");
      const digest = f.picture ? await hash(f.picture) : "";
      const price = f.price === "" || f.price === undefined || !Number.isFinite(Number(f.price)) ? "" : Number(f.price);
      output.push({ code, name: f.name || "", image: digest ? `img/${code}-${digest.slice(0, 8)}.jpg` : "",
        price, kind: f.kind,
        sheet: f.sheet || "Unsorted", status: status(f) });
    }
    return { version: 1, updatedAt: new Date(now).toISOString(), event: event || "", items: output };
  }

  async function images(items) {
    const output = [];
    for (const f of items || []) if (f.picture && f.status !== "hidden") {
      const digest = await hash(f.picture);
      output.push({ path: `img/${FlashCode.normalize(f.code)}-${digest.slice(0, 8)}.jpg`, base64: base64(f.picture) });
    }
    return output;
  }

  return { build, images };
})();
