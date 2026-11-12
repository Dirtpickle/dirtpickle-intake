"use strict";

/* Flash gallery, import, edit, and pick screens. Rules live in flash.js. */
const FlashUI = (() => {
  let sheetFilter = "", kindFilter = "";
  const money = n => (n || n === 0) && n !== "" ? "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "";

  function resize(file, max = 1000) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Could not read " + file.name)); };
      img.src = url;
    });
  }

  function filtered() {
    return Flash.list().filter(f => (!sheetFilter || (f.sheet || "Unsorted") === sheetFilter) && (!kindFilter || f.kind === kindFilter));
  }

  screens.flash = {
    html() {
      const all = Flash.list(), sheets = [...new Set(all.map(f => f.sheet || "Unsorted"))].sort(), items = filtered().sort((a, b) => a.name.localeCompare(b.name));
      const available = all.filter(f => f.status === "available").length, sold = all.filter(f => f.status === "sold").length;
      const chip = (value, label) => `<button class="small ${kindFilter === value ? "primary" : ""}" data-kind="${value}">${label}</button>`;
      return `${bar("Flash", { back: "home" })}
        <div class="actions" style="margin:0 0 12px"><label class="btn primary" style="display:inline-flex;align-items:center;background:var(--pink);color:#000;border-color:var(--pink)">+ Import flash images<input id="fImport" type="file" accept="image/*" multiple hidden></label><button class="ghost" data-go="queue">Queue</button></div>
        <div class="chips">${chip("", `All (${all.length})`)}${chip("repeatable", "Repeatable")}${chip("one-off", "One-off")}</div>
        <div class="chips"><button class="small ${sheetFilter ? "" : "primary"}" data-sheet="">All sheets</button>${sheets.map(sh => `<button class="small ${sheetFilter === sh ? "primary" : ""}" data-sheet="${esc(sh)}">${esc(sh)}</button>`).join("")}</div>
        <div class="stats"><div class="stat"><b>${available}</b><span>available</span></div><div class="stat"><b>${sold}</b><span>sold</span></div></div><div id="fMsg"></div>
        <div class="fgrid">${items.map(f => `<div class="fitem ${f.status !== "available" ? "dim" : ""}" data-go="flashEdit" data-id="${esc(f.id)}"><img src="${f.image}" alt=""><div>${esc(f.name)}${f.kind === "one-off" ? ' <span class="badge">ONE-OFF</span>' : ""}</div><div class="sub">${money(f.price)}${f.minutes ? " · " + f.minutes + " min" : ""} · ${esc(f.status)}</div></div>`).join("")}</div>
        ${all.length ? "" : '<div class="card mute">No flash yet. Import images of your designs; each becomes an item with a price and time you can edit.</div>'}`;
    },
    bind(root) {
      root.onclick = e => {
        const kind = e.target.closest("[data-kind]"), sheet = e.target.closest("[data-sheet]");
        if (kind) { kindFilter = kind.dataset.kind; go("flash"); }
        if (sheet) { sheetFilter = sheet.dataset.sheet; go("flash"); }
      };
      $("#fImport", root).onchange = async e => {
        const files = [...e.target.files]; if (!files.length) return;
        const sheet = sheetFilter || prompt("Which sheet or collection are these on? (e.g. Sheet 1)", "Sheet 1") || "Unsorted";
        const answer = prompt("Kind for this batch: repeatable or one-off", "repeatable");
        const kind = answer === "one-off" ? "one-off" : "repeatable";
        for (let i = 0; i < files.length; i++) {
          $("#fMsg", root).innerHTML = `<div class="banner warn">Importing ${i + 1} of ${files.length}…</div>`;
          try { await DB.put({ type: "flash", name: files[i].name.replace(/\.[^.]+$/, ""), sheet, kind, price: Events.pricing().flashMin, minutes: 60, status: "available", purchase: null, notes: "", image: await resize(files[i]) }); } catch (_) {}
        }
        go("flash");
      };
    }
  };

  screens.flashEdit = {
    html({ id }) {
      const f = Flash.get(id); if (!f) return `${bar("Flash", { back: "flash" })}<div class="banner bad">Not found.</div>`;
      const fld = (k, l, v, a = "") => `<label for="f_${k}">${l}</label><input id="f_${k}" value="${esc(v)}" ${a}>`;
      return `${bar(esc(f.name), { back: "flash" })}<div class="cols"><div><img src="${f.image}" style="width:100%;border-radius:14px;background:#fff" alt=""></div><div>${fld("name", "Name or number", f.name)}${fld("sheet", "Sheet / collection", f.sheet)}${fld("price", "Price", f.price, 'inputmode="decimal"')}${fld("minutes", "Approx. minutes", f.minutes, 'inputmode="numeric"')}${fld("sku", "SKU (for web shop later)", f.sku || "")}
        <label for="f_kind">Kind</label><select id="f_kind">${Flash.KINDS.map(o => `<option ${o === f.kind ? "selected" : ""}>${o}</option>`).join("")}</select><label for="f_status">Status</label><select id="f_status">${Flash.STATUSES.map(o => `<option ${o === f.status ? "selected" : ""}>${o}</option>`).join("")}</select>${fld("notes", "Notes", f.notes || "")}</div></div><div class="actions"><button class="primary" id="fSave">Save</button><button class="danger" id="fDel">Delete</button></div>`;
    },
    bind(root, { id }) {
      const v = k => $("#f_" + k, root).value.trim();
      $("#fSave", root).onclick = async () => { await DB.put({ ...Flash.get(id), name: v("name") || "Untitled", sheet: v("sheet") || "Unsorted", price: v("price"), minutes: v("minutes"), sku: v("sku"), kind: $("#f_kind", root).value, status: $("#f_status", root).value, notes: v("notes") }); go("flash"); };
      let armed = false; $("#fDel", root).onclick = async e => { if (!armed) { armed = true; e.target.textContent = "Tap again to delete"; return; } await DB.remove(id); go("flash"); };
    }
  };

  screens.flashPick = {
    html({ id }) {
      const items = Flash.list().filter(f => Flash.available(f)).sort((a, b) => (a.sheet || "").localeCompare(b.sheet || "") || a.name.localeCompare(b.name));
      return `${bar("Pick a flash design for " + esc((DB.get(id) || {}).legalName || "Unknown"), { back: "queue" })}<div class="actions" style="margin:0 0 16px"><button data-pickflash="" class="primary">No flash / custom design</button></div><div class="fgrid">${items.map(f => `<div class="fitem" data-pickflash="${esc(f.id)}"><img src="${f.image}" alt=""><div>${esc(f.name)}${f.kind === "one-off" ? ' <span class="badge">ONE-OFF</span>' : ""}</div><div class="sub">${money(f.price)}${f.minutes ? " · " + f.minutes + " min" : ""}</div></div>`).join("")}</div>${items.length ? "" : '<div class="card mute">No available flash yet. Add designs in the Flash gallery.</div>'}`;
    },
    bind(root, { id }) { root.onclick = async e => { const t = e.target.closest("[data-pickflash]"); if (t) { await Sessions.createSession(id, t.dataset.pickflash || null); go("queue"); } }; }
  };
})();
