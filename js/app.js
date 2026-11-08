"use strict";
/* Dirtpickle intake app: Phase 1 (shell, PIN, local encrypted DB, client intake + search). */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DEFAULTS = { type: "settings", id: "settings", business: "Dirtpickle", minAge: 18, autoLockMin: 5 };
let settings = { ...DEFAULTS };

/* ---------- helpers ---------- */
function ageOn(dob, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob || "");
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (y < 1900) return null;
  let a = now.getFullYear() - y;
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) a--;
  return a >= 0 ? a : null;
}
const digits = s => String(s || "").replace(/\D/g, "");
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
const clients = () => DB.all("client");
const nameOf = c => c.preferredName ? `${c.legalName} (${c.preferredName})` : c.legalName;
function searchClients(q) {
  q = q.trim().toLowerCase();
  const qd = digits(q);
  const list = clients();
  if (!q) return list.sort((a, b) => a.legalName.localeCompare(b.legalName));
  return list.filter(c =>
    c.legalName.toLowerCase().includes(q) || (c.preferredName || "").toLowerCase().includes(q) ||
    (c.email || "").toLowerCase().includes(q) || (qd.length >= 3 && digits(c.phone).includes(qd))
  ).sort((a, b) => a.legalName.localeCompare(b.legalName));
}
function findDuplicate(c, selfId) {
  const nm = c.legalName.trim().toLowerCase();
  return clients().find(o => o.id !== selfId && (
    (o.legalName.trim().toLowerCase() === nm && o.dob === c.dob) ||
    (c.email && o.email && o.email.toLowerCase() === c.email.toLowerCase()) ||
    (digits(c.phone).length >= 7 && digits(o.phone) === digits(c.phone))));
}

/* ---------- router / chrome ---------- */
let cur = { name: "home", params: {} };
const screens = {};
function go(name, params = {}) {
  cur = { name, params };
  const s = screens[name];
  const root = $("#app");
  root.innerHTML = s.html(params);
  if (s.bind) s.bind(root, params);
  window.scrollTo(0, 0);
}
function bar(title, { back, backId } = {}) {
  return `<header class="bar">
    ${back ? `<button class="small ghost" data-go="${back}"${backId ? ` data-id="${esc(backId)}"` : ""}>‹ Back</button>` : ""}
    <h1>${title || `DIRT<b>PICKLE</b>`}</h1>
    <button class="small ghost" id="lockNow">Lock</button></header>`;
}
document.addEventListener("click", e => {
  const g = e.target.closest("[data-go]");
  if (g && !g.disabled) { go(g.dataset.go, g.dataset.id ? { id: g.dataset.id } : {}); return; }
  if (e.target.closest("#lockNow")) lock();
});

/* ---------- lock / PIN ---------- */
const PIN_LEN = 6;
let pinBuf = "", pinFirst = null, pinFails = 0, pinBusyUntil = 0, lastActive = Date.now();

function pinHtml(title, hint, err = "") {
  return `<div class="pin"><h1>DIRT<b>PICKLE</b></h1><div class="mute">${esc(title)}</div>
    <div class="dots">${Array.from({ length: PIN_LEN }, (_, i) => `<i class="${i < pinBuf.length ? "on" : ""}"></i>`).join("")}</div>
    <div class="err" id="pinErr">${esc(err)}</div>
    <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join("")}
      <button class="blank" disabled>.</button><button data-k="0">0</button><button data-k="del" aria-label="Delete">⌫</button></div>
    <p class="mute" style="font-size:15px;margin-top:22px">${esc(hint)}</p></div>`;
}
function showPin(mode, err = "") {
  cur = { name: "pin", params: {} };
  const title = mode === "setup1" ? "Create a 6-digit admin PIN" : mode === "setup2" ? "Enter the PIN again to confirm" : "Enter PIN";
  const hint = mode === "unlock" ? "" : "This PIN encrypts your records. If you forget it, the data cannot be recovered.";
  $("#app").innerHTML = pinHtml(title, hint, err);
  $("#app").querySelector(".keys").onclick = async e => {
    const b = e.target.closest("button[data-k]");
    if (!b) return;
    if (Date.now() < pinBusyUntil) return;
    const k = b.dataset.k;
    if (k === "del") pinBuf = pinBuf.slice(0, -1);
    else if (pinBuf.length < PIN_LEN) pinBuf += k;
    if (pinBuf.length < PIN_LEN) { showPin(mode); return; }
    const entered = pinBuf; pinBuf = "";
    await submitPin(mode, entered);
  };
}
async function submitPin(mode, pin) {
  if (mode === "setup1") { pinFirst = pin; showPin("setup2"); return; }
  if (mode === "setup2") {
    if (pin !== pinFirst) { pinFirst = null; showPin("setup1", "PINs did not match. Start again."); return; }
    $("#pinErr").textContent = "Setting up…";
    await DB.setup(pin);
    pinFirst = null;
    await DB.put({ ...DEFAULTS });
    afterUnlock();
    return;
  }
  $("#pinErr").textContent = "Checking…";
  const ok = await DB.unlock(pin);
  if (ok) { pinFails = 0; afterUnlock(); return; }
  pinFails++;
  if (pinFails >= 5) { pinBusyUntil = Date.now() + 30000; pinFails = 0; showPin("unlock", "Too many tries. Wait 30 seconds."); }
  else showPin("unlock", "Wrong PIN");
}
function afterUnlock() {
  settings = { ...DEFAULTS, ...(DB.get("settings") || {}) };
  lastActive = Date.now();
  go("home");
}
function lock() {
  DB.lock(); pinBuf = ""; pinFirst = null;
  $("#app").innerHTML = "";
  showPin("unlock");
}
["pointerdown", "keydown"].forEach(ev => document.addEventListener(ev, () => { lastActive = Date.now(); }, true));
setInterval(() => {
  if (DB.isUnlocked() && Date.now() - lastActive > settings.autoLockMin * 60000) lock();
}, 10000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && DB.isUnlocked() && Date.now() - lastActive > settings.autoLockMin * 60000) lock();
});

/* ---------- Home ---------- */
screens.home = {
  html: () => `${bar()}
    <div class="grid">
      <button class="tile primary" data-go="clientForm">NEW CLIENT<small>Register a new client</small></button>
      <button class="tile" data-go="returning">RETURNING CLIENT<small>Search name, phone or email</small></button>
      <button class="tile" data-go="clients">CLIENTS<small>${clients().length} on file</small></button>
      <button class="tile soon">TODAY / QUEUE<small>Coming in a later phase</small></button>
      <button class="tile soon">APPOINTMENTS<small>Coming in a later phase</small></button>
      <button class="tile soon">FLASH<small>Coming in a later phase</small></button>
      <button class="tile soon">DOCUMENTS<small>Coming in a later phase</small></button>
      <button class="tile" data-go="settings">SETTINGS<small>Business, age, auto-lock</small></button>
    </div>`
};

/* ---------- Search (returning) and list ---------- */
function resultRows(list) {
  if (!list.length) return `<div class="mute" style="padding:14px 4px">No matches.</div>`;
  return list.slice(0, 100).map(c => `<div class="row" data-go="profile" data-id="${esc(c.id)}">
    <div class="grow"><div>${esc(nameOf(c))}</div>
    <div class="sub">${[c.phone, c.email].filter(Boolean).map(esc).join(" · ") || "No contact info"}</div></div>
    <div class="mute">›</div></div>`).join("");
}
function searchScreen(title, back, autofocus) {
  return {
    html: () => `${bar(title, { back })}
      <input id="q" type="search" placeholder="Name, phone number or email" autocomplete="off" ${autofocus ? "autofocus" : ""}>
      <div class="card" id="results" style="margin-top:16px">${resultRows(searchClients(""))}</div>`,
    bind(root) {
      const q = $("#q", root);
      q.oninput = () => { $("#results", root).innerHTML = resultRows(searchClients(q.value)); };
      q.focus();
    }
  };
}
screens.returning = searchScreen("Returning client", "home", true);
screens.clients = searchScreen("Clients", "home", false);

/* ---------- Client form (new / edit) ---------- */
screens.clientForm = {
  html({ id }) {
    const c = (id && DB.get(id)) || {};
    const f = (k, label, attrs = "") => `<label for="${k}">${label}</label><input id="${k}" value="${esc(c[k])}" ${attrs}>`;
    return `${bar(id ? "Review client info" : "New client", { back: id ? "profile" : "home", backId: id })}
      <div class="cols">
        <div>${f("legalName", "Full legal name *", 'autocomplete="off" autocapitalize="words"')}
          ${f("preferredName", "Preferred name", 'autocapitalize="words"')}
          <label for="dob">Date of birth *</label><input id="dob" type="date" value="${esc(c.dob)}">
          <div id="ageLine"></div></div>
        <div>${f("phone", "Phone number", 'type="tel" inputmode="tel"')}
          ${f("email", "Email address", 'type="email" inputmode="email" autocapitalize="off"')}
          ${f("address", "Address", 'autocapitalize="words"')}</div>
        <div>${f("emergencyName", "Emergency contact name")}
          ${f("emergencyPhone", "Emergency contact phone", 'type="tel" inputmode="tel"')}</div>
      </div>
      <div id="dupBox"></div>
      <div class="actions"><button class="primary" id="saveClient">${id ? "Save changes" : "Save client"}</button>
        <button class="ghost" data-go="${id ? "profile" : "home"}" ${id ? `data-id="${esc(id)}"` : ""}>Cancel</button></div>`;
  },
  bind(root, { id }) {
    const v = k => $("#" + k, root).value.trim();
    const ageLine = $("#ageLine", root), save = $("#saveClient", root);
    const refreshAge = () => {
      const a = ageOn($("#dob", root).value);
      if (a === null) { ageLine.innerHTML = ""; save.disabled = false; return; }
      const ok = a >= settings.minAge;
      ageLine.innerHTML = ok
        ? `<div class="banner ok">Age ${a}. Meets the minimum age of ${settings.minAge}.</div>`
        : `<div class="banner bad">Age ${a}. Under the minimum age of ${settings.minAge}. Intake cannot be completed.</div>`;
      save.disabled = !ok;
    };
    $("#dob", root).oninput = refreshAge; refreshAge();
    const gather = () => ({
      legalName: v("legalName"), preferredName: v("preferredName"), dob: $("#dob", root).value,
      phone: v("phone"), email: v("email"), address: v("address"),
      emergencyName: v("emergencyName"), emergencyPhone: v("emergencyPhone")
    });
    const doSave = async data => {
      const now = new Date().toISOString();
      const rec = id ? { ...DB.get(id), ...data, updatedAt: now }
        : { type: "client", ...data, notes: "", visits: [now], createdAt: now, updatedAt: now };
      await DB.put(rec);
      go("profile", { id: rec.id });
    };
    save.onclick = async () => {
      const d = gather();
      const age = ageOn(d.dob);
      const msgs = [];
      if (!d.legalName) msgs.push("Full legal name is required.");
      if (age === null) msgs.push("Enter a valid date of birth.");
      else if (age >= 130) msgs.push("Check the date of birth.");
      else if (age < settings.minAge) msgs.push(`Client is under the minimum age of ${settings.minAge}.`);
      if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) msgs.push("Email address looks invalid.");
      const box = $("#dupBox", root);
      if (msgs.length) { box.innerHTML = `<div class="banner bad">${msgs.map(esc).join("<br>")}</div>`; return; }
      const dup = findDuplicate(d, id);
      if (dup && !box.dataset.confirmed) {
        box.innerHTML = `<div class="banner warn">Possible existing client: ${esc(nameOf(dup))}.
          <div class="actions"><button class="small" data-go="profile" data-id="${esc(dup.id)}">Open existing</button>
          <button class="small" id="saveAnyway">Save as separate client</button></div></div>`;
        $("#saveAnyway", root).onclick = () => { box.dataset.confirmed = "1"; doSave(d); };
        return;
      }
      await doSave(d);
    };
  }
};

/* ---------- Client profile ---------- */
screens.profile = {
  html({ id }) {
    const c = DB.get(id);
    if (!c) return `${bar("Client", { back: "home" })}<div class="banner bad">Client not found.</div>`;
    const a = ageOn(c.dob);
    const row = (k, v) => v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : "";
    const visits = (c.visits || []).slice().reverse().map(v => `<div class="sub">${esc(fmtDate(v))}</div>`).join("");
    return `${bar(esc(nameOf(c)), { back: "clients" })}
      ${a !== null && a < settings.minAge ? `<div class="banner bad">Under the minimum age of ${settings.minAge}.</div>` : ""}
      <div class="card"><dl class="kv">
        ${row("Legal name", c.legalName)}${row("Preferred name", c.preferredName)}
        ${row("Date of birth", c.dob ? `${c.dob} (age ${a})` : "")}${row("Phone", c.phone)}${row("Email", c.email)}
        ${row("Address", c.address)}${row("Emergency contact", [c.emergencyName, c.emergencyPhone].filter(Boolean).join(" · "))}
        ${row("First registered", fmtDate(c.createdAt))}</dl>
        <div class="actions"><button data-go="clientForm" data-id="${esc(c.id)}">Review / edit info</button>
        <button id="addVisit">Record visit today</button></div></div>
      <div class="card"><strong>Visits</strong><div style="margin-top:8px">${visits || '<span class="mute">None</span>'}</div></div>
      <div class="card"><label for="notes" style="margin-top:0">Notes</label>
        <textarea id="notes" rows="4">${esc(c.notes)}</textarea>
        <div class="actions"><button id="saveNotes">Save notes</button><span id="noteMsg" class="mute" style="align-self:center"></span></div></div>
      <div class="card mute">Tattoo sessions and signed consent forms will appear here in the next phases.</div>`;
  },
  bind(root, { id }) {
    if (!DB.get(id)) return;
    $("#saveNotes", root).onclick = async () => {
      await DB.put({ ...DB.get(id), notes: $("#notes", root).value, updatedAt: new Date().toISOString() });
      $("#noteMsg", root).textContent = "Saved";
    };
    $("#addVisit", root).onclick = async () => {
      const c = DB.get(id);
      await DB.put({ ...c, visits: [...(c.visits || []), new Date().toISOString()], updatedAt: new Date().toISOString() });
      go("profile", { id });
    };
  }
};

/* ---------- Settings ---------- */
screens.settings = {
  html: () => `${bar("Settings", { back: "home" })}
    <div class="card"><label for="biz" style="margin-top:0">Business name</label><input id="biz" value="${esc(settings.business)}">
      <label for="minAge">Minimum client age</label><input id="minAge" type="number" inputmode="numeric" min="0" max="99" value="${settings.minAge}">
      <label for="autoLock">Auto-lock after (minutes of no activity)</label><input id="autoLock" type="number" inputmode="numeric" min="1" max="120" value="${settings.autoLockMin}">
      <div class="actions"><button class="primary" id="saveSettings">Save settings</button><span id="setMsg" class="mute" style="align-self:center"></span></div></div>
    <div class="card mute">Backups, consent form editing, and Gmail settings are coming in later phases.</div>`,
  bind(root) {
    $("#saveSettings", root).onclick = async () => {
      const minAge = Math.max(0, Math.min(99, parseInt($("#minAge", root).value, 10) || 18));
      const autoLockMin = Math.max(1, Math.min(120, parseInt($("#autoLock", root).value, 10) || 5));
      settings = { ...settings, business: $("#biz", root).value.trim() || "Dirtpickle", minAge, autoLockMin };
      await DB.put(settings);
      $("#setMsg", root).textContent = "Saved";
    };
  }
};

/* ---------- boot ---------- */
(async () => {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_) {}
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  await DB.open();
  showPin((await DB.hasPin()) ? "unlock" : "setup1");
})();
