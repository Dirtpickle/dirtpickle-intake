"use strict";

/* Selection-mode state and controls for the Flash gallery. */
const FlashSelectUI = (() => {
  let active = true, query = "", selected = new Set(), deleteArmed = false, notice = "", refocus = false;
  const matches = f => !query || `${f.code} ${f.name || ""}`.toLowerCase().includes(query.toLowerCase());
  const isActive = () => active;
  const search = () => query;
  const selectedIds = () => [...selected];
  const tick = f => active ? `<label class="flash-tick"><input type="checkbox" data-flash-select="${esc(f.id)}" ${selected.has(f.id) ? "checked" : ""} aria-label="Select ${esc(f.code)}"></label>` : "";
  const controls = () => active ? `<div class="card flash-select-tools"><button class="small" data-select-all>Select all</button><button class="small" data-select-none>Select none</button></div>` : "";
  const bottom = () => active ? `<div class="flash-bulk-bar"><span>${selected.size} selected</span><div class="actions"><button class="small" data-bulk-action="delete">${deleteArmed ? "Tap again to delete" : "Delete"}</button><button class="small" data-bulk-action="repeatable">Make Repeatable</button><button class="small" data-bulk-action="one-off">Make One-off</button><button class="small" data-bulk-action="price">Set price</button><button class="small" data-bulk-action="sheet">Set sheet</button><button class="small" data-bulk-action="hold">Hold</button><button class="small" data-bulk-action="release">Release</button><button class="small" data-bulk-action="sold">Mark sold</button><button class="small" data-bulk-action="hide">Hide</button><button class="small" data-bulk-action="show">Show</button><button class="small" data-bulk-action="top">Move to top</button><button class="small" data-bulk-action="bottom">Move to bottom</button></div></div>` : "";
  function header() { const note = notice ? `<div class="banner warn">${esc(notice)}</div>` : ""; notice = ""; return `${note}<div class="flash-search"><label for="flashSearch">Search flash</label><input id="flashSearch" value="${esc(query)}" placeholder="Code or name"></div>`; }
  function leave() { selected.clear(); deleteArmed = false; }
  function refresh() { go("flash"); }
  function publish() { if (typeof FlashPublish !== "undefined") FlashPublish.run().catch(() => {}); }
  function message(text) { notice = notice ? `${notice} ${text}` : text; }
  async function bulk(action) {
    const ids = selectedIds(); if (!ids.length) return;
    if (action === "delete" && !deleteArmed) { deleteArmed = true; message(`Delete ${ids.length} designs? Tap Delete again to confirm.`); refresh(); return; }
    if (action === "delete") deleteArmed = false;
    if ((action === "repeatable" && ids.some(id => Flash.get(id)?.status === "sold")) && !confirm("Make sold designs repeatable and available?")) return;
    let value = "";
    if (action === "price") { value = prompt("Price for selected designs", ""); if (value === null) return; if (value.trim() === "" || !Number.isFinite(Number(value))) { message("Enter a numeric price."); return refresh(); } }
    if (action === "sheet") { value = prompt("Sheet for selected designs", ""); if (value === null) return; value = value.trim(); }
    const result = await FlashBulk.apply(action, ids, value);
    if (result.refused?.length) message(`Could not delete: ${result.refused.map(item => item.code).join(", ")} is used by a session.`);
    if (result.skipped) message(`${result.skipped} repeatable design${result.skipped === 1 ? "" : "s"} skipped.`);
    if (result.changed) publish();
    selected.clear();
    refresh();
  }
  async function handleClick(e) {
    if (!active) return false;
    const input = e.target.closest("#flashSearch");
    if (input) return false;
    const select = e.target.closest("[data-flash-select]");
    if (select) { selected.has(select.dataset.flashSelect) ? selected.delete(select.dataset.flashSelect) : selected.add(select.dataset.flashSelect); refresh(); return true; }
    const card = e.target.closest(".fitem[data-id]");
    if (card && !e.target.closest("button")) { const id = card.dataset.id; selected.has(id) ? selected.delete(id) : selected.add(id); refresh(); return true; }
    if (e.target.closest("[data-select-all]")) { document.querySelectorAll(".fitem[data-id]").forEach(card => selected.add(card.dataset.id)); refresh(); return true; }
    if (e.target.closest("[data-select-none]")) { selected.clear(); refresh(); return true; }
    const action = e.target.closest("[data-bulk-action]");
    if (action) { await bulk(action.dataset.bulkAction); return true; }
    return false;
  }
  function bind(root) {
    const bar = root.querySelector("header.bar");
    if (bar && !$("#flashSearch", root)) bar.insertAdjacentHTML("afterend", header());
    if (active) {
      const list = root.querySelector(".fgrid");
      if (list && !root.querySelector(".flash-select-tools")) list.insertAdjacentHTML("beforebegin", controls());
      root.querySelectorAll(".fitem[data-id]").forEach(card => {
        if (card.querySelector("[data-flash-select]")) return;
        card.insertAdjacentHTML("afterbegin", tick({ id: card.dataset.id, code: card.querySelector(".flash-code")?.textContent || "" }));
        card.querySelector(".actions")?.insertAdjacentHTML("afterbegin", `<button class="small" data-go="flashEdit" data-id="${esc(card.dataset.id)}">Edit</button>`);
      });
      if (selected.size && !root.querySelector(".flash-bulk-bar")) root.insertAdjacentHTML("beforeend", bottom());
      root.querySelectorAll("[data-flash-select]").forEach(input => input.checked = selected.has(input.dataset.flashSelect));
      root.querySelectorAll("[data-bulk-action]").forEach(button => button.disabled = selected.size === 0);
    }
    const input = $("#flashSearch", root);
    if (input) { input.oninput = () => { query = input.value; refocus = true; refresh(); }; if (refocus) { refocus = false; input.focus(); input.setSelectionRange(input.value.length, input.value.length); } }
  }
  return { isActive, search, matches, tick, header, controls, bottom, bind, handleClick, leave };
})();
