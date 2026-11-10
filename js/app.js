"use strict";
/* Dirtpickle intake app: Phase 1 (shell, PIN, local encrypted DB, client intake + search). */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DEFAULTS = { type: "settings", id: "settings", business: "Dirtpickle", minAge: 18, autoLockMin: 5, backupDays: 7, lastBackupAt: null, artistName: "Dirtpickle (Mike Peterson)", pricing: { rate: 120, round: 5 } };
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
let pendingScan = null;
function go(name, params = {}) {
  if (name !== "scan" && name !== "clientForm") pendingScan = null;
  if (cur.name === "scan") Scan.stop();
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
    <p class="mute" style="font-size:15px;margin-top:22px">${esc(hint)}</p>${intakeReady && DB && !DB.isUnlocked() ? `<button class="ghost small" data-go="iWelcome" style="margin-top:10px">‹ Back to check-in</button>` : ""}</div>`;
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
/* The intake side may only read this non-private data: form wording, business name, minimum age, available flash. */
async function publishPublic() {
  const flash = DB.all("flash").filter(f => f.status === "available").map(({ id, name, sheet, price, minutes, image }) => ({ id, name, sheet, price, minutes, image }));
  await DB.setPublic({ business: settings.business, artistName: settings.artistName, minAge: settings.minAge, template: Consent.activeTemplate(),
    relayConfigured: Mailer.configured(Mailer.relayFromSettings()), flash, at: new Date().toISOString() });
}
let intakeReady = false;
async function afterUnlock() {
  const saved = DB.get("settings") || {};
  settings = { ...DEFAULTS, ...saved, pricing: { ...DEFAULTS.pricing, ...(saved.pricing || {}) } };
  settings = await Events.migrateLegacy(settings);
  await Consent.init();
  await Aftercare.init();
  await publishPublic(); intakeReady = true;
  try { await Intake.importAll(); } catch (e) { /* inbox stays for next time */ }
  try { await Mailer.retryAll(); } catch (_) {}
  lastActive = Date.now();
  go("home");
}
async function lock() {
  try { if (DB.isUnlocked()) await publishPublic(); } catch (_) {}
  DB.lock(); pinBuf = ""; pinFirst = null;
  $("#app").innerHTML = "";
  if (await Intake.available()) { intakeReady = true; Intake.enter(); } else showPin("unlock");
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
    ${(() => { const n = Intake.takeNotice(); return n ? `<div class="banner ok">${esc(n)}.</div>` : ""; })()}
    ${Backup.overdue() ? `<div class="banner warn" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span style="flex:1">${esc(Backup.overdue())} Make a backup.</span><button class="small" data-go="backup">Back up now</button></div>` : ""}
    <div class="grid">
      <button class="tile primary" data-go="clientForm">NEW CLIENT<small>Register a new client</small></button>
      <button class="tile" data-go="returning">RETURNING CLIENT<small>Search name, phone or email</small></button>
      <button class="tile" data-go="clients">CLIENTS<small>${clients().length} on file</small></button>
      <button class="tile" data-go="queue">TODAY / QUEUE<small>${DB.all("session").filter(s => ["waiting", "paperwork", "ready", "inprogress"].includes(s.status)).length} active</small></button>
      <button class="tile" data-go="events">EVENTS<small>${esc((Events.getActive() || {}).name || "No active event")}</small></button>
      <button class="tile soon">APPOINTMENTS<small>Coming in a later phase</small></button>
      <button class="tile" data-go="flash">FLASH<small>${DB.all("flash").length} designs</small></button>
      <button class="tile" data-go="documents">DOCUMENTS<small>${DB.all("consent").length} signed</small></button>
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

/* ---------- ID scan ---------- */
function idPanel(sc) {
  const age = ageOn(sc.fields.dob);
  const meets = age !== null && age >= settings.minAge;
  return `<div style="margin-top:14px">
    <div class="banner ok" style="margin:8px 0">✓ ID barcode read. Name, birth date and address filled in below.</div>
    <div class="banner ${meets ? "ok" : "bad"}" style="margin:8px 0">${meets ? "✓" : "✗"} Calculated age: ${age === null ? "unknown" : age}
      (${meets ? "meets" : "below"} the minimum of ${settings.minAge}).</div>
    ${sc.idExpired ? `<div class="banner bad" style="margin:8px 0">This ID shows an expiry date in the past (${esc(sc.idExpiry)}).</div>` : ""}
    <label style="display:flex;gap:12px;align-items:center;color:var(--fg);font-size:18px">
      <input id="visualOk" type="checkbox" style="width:28px;height:28px"> I compared the ID photo to the client in person.</label>
    <div class="banner warn" style="margin:8px 0;font-weight:400;font-size:16px">This app reads what the barcode says.
      It does not confirm the card is genuine. The license image and number are not saved.</div></div>`;
}
screens.scan = {
  html: ({ id }) => `${bar("Scan driver's license", { back: "clientForm", backId: id })}
    <div class="card" style="padding:0;overflow:hidden;position:relative">
      <video id="cam" playsinline muted style="width:100%;display:block;background:#000;min-height:260px"></video></div>
    <div id="scanMsg" class="banner warn">Hold the BACK of the license (the barcode) flat in view, close, in good light.</div>
    <div class="actions"><label class="btn" style="display:inline-flex;align-items:center">Take a photo instead
      <input id="photo" type="file" accept="image/*" capture="environment" hidden></label>
      <button class="ghost" data-go="clientForm"${id ? ` data-id="${esc(id)}"` : ""}>Enter manually</button></div>`,
  async bind(root, { id }) {
    const msg = t => { const m = $("#scanMsg", root); if (m) m.textContent = t; };
    const done = text => {
      const parsed = AAMVA.parse(text);
      if (!parsed) { msg("A barcode was read, but it is not a driver's license barcode. Try the back of the card."); return false; }
      pendingScan = { fields: { legalName: parsed.legalName, dob: parsed.dob, address: parsed.address },
        idState: parsed.idState, idExpiry: parsed.idExpiry, idExpired: parsed.idExpired };
      go("clientForm", id ? { id } : {});
      return true;
    };
    $("#photo", root).onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      msg("Reading photo…");
      try {
        const text = await Scan.decodeBlob(f);
        if (!text) msg("No barcode found in that photo. Retake it closer, with the barcode sharp and filling the frame.");
        else done(text);
      } catch (err) { msg("Could not read photo: " + err.message); }
    };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg("Camera is not available here. Use Take a photo, or enter manually."); return; }
    try { await Scan.start($("#cam", root), t => { done(t); }, msg); }
    catch (err) { msg(err.name === "NotAllowedError" ? "Camera access is blocked. Allow it in the browser or iPad Settings, or use Take a photo." : "Camera or scanner could not start (" + (err.name || err.message) + "). Use Take a photo, or enter manually."); }
  }
};

/* ---------- Client form (new / edit) ---------- */
screens.clientForm = {
  html({ id }) {
    const c = { ...((id && DB.get(id)) || {}), ...((pendingScan && pendingScan.fields) || {}) };
    const f = (k, label, attrs = "") => `<label for="${k}">${label}</label><input id="${k}" value="${esc(c[k])}" ${attrs}>`;
    return `${bar(id ? "Review client info" : "New client", { back: id ? "profile" : "home", backId: id })}
      <div class="card"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <button class="primary" data-go="scan"${id ? ` data-id="${esc(id)}"` : ""}>Scan driver's license</button>
        <span class="mute" style="font-size:16px">Or type the details in below.</span></div>
        ${pendingScan ? idPanel(pendingScan) : ""}</div>
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
      if (pendingScan) {
        // Verification record only. The license image and license number are never stored.
        const sc = pendingScan;
        rec.idChecks = [...(rec.idChecks || []), {
          at: now, method: "pdf417-barcode", idState: sc.idState, idExpiry: sc.idExpiry, idExpired: sc.idExpired,
          calculatedAge: ageOn(data.dob), minAge: settings.minAge, visuallyMatched: true,
          authenticityChecked: false
        }];
      }
      await DB.put(rec);
      pendingScan = null;
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
      if (pendingScan && !($("#visualOk", root) || {}).checked) msgs.push("Confirm that you compared the ID to the client.");
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

/* ---------- Deleting (explicit, confirmed; also removes the client's signed paperwork) ---------- */
const CLIENT_TYPES = ["session", "consent", "countersign", "aftercare"];
function clientFootprint(id) {
  const rows = [];
  for (const t of CLIENT_TYPES) for (const r of DB.all(t)) if (r.clientId === id) rows.push(r);
  return rows;
}
async function freeFlashFor(sessions) {
  for (const s of sessions) { const f = s.flashId && DB.get(s.flashId); if (f && f.status === "taken") await DB.put({ ...f, status: "available" }); }
}
async function deleteClient(id) {
  const rows = clientFootprint(id);
  await freeFlashFor(rows.filter(r => r.type === "session"));
  for (const r of rows) await DB.remove(r.id, { force: true });
  await DB.remove(id, { force: true });
}
async function eraseAllClientData() {
  await freeFlashFor(DB.all("session"));
  for (const t of ["client", ...CLIENT_TYPES]) for (const r of DB.all(t)) await DB.remove(r.id, { force: true });
}

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
        <button id="addVisit">Record visit today</button>
        <button data-go="flashPick" data-id="${esc(c.id)}">Add to today's queue</button>
        <button id="printPaper">Print contract (wet ink)</button></div></div>
      ${(c.idPhotos || []).length ? `<div class="card"><strong>ID photo (front)</strong><div class="sub mute">${esc(fmtDate(c.idPhotos[c.idPhotos.length - 1].at))}</div><img src="${c.idPhotos[c.idPhotos.length - 1].image}" alt="" style="max-width:420px;width:100%;border-radius:10px;margin-top:8px"></div>` : ""}
      <div class="card"><strong>Consent paperwork</strong>
        <div class="actions" style="margin-top:10px"><button class="primary" id="startPaper">Start paperwork (hand iPad to client)</button></div>
        <div id="paperErr"></div>
        <div style="margin-top:10px">${DB.all("consent").filter(d => d.clientId === c.id).sort((a, b) => b.signedAt.localeCompare(a.signedAt))
          .map(d => `<div class="row" data-go="doc" data-id="${esc(d.id)}"><div class="grow">${esc(d.template.title)}<div class="sub">${esc(Consent.stamp(d.signedAt))}</div></div><div class="mute">›</div></div>`).join("")
          || '<span class="mute">No signed forms yet. Each tattoo needs its own signed form.</span>'}</div></div>
      <div class="card"><strong>Visits</strong><div style="margin-top:8px">${visits || '<span class="mute">None</span>'}</div></div>
      <div class="card"><label for="notes" style="margin-top:0">Notes</label>
        <textarea id="notes" rows="4">${esc(c.notes)}</textarea>
        <div class="actions"><button id="saveNotes">Save notes</button><span id="noteMsg" class="mute" style="align-self:center"></span></div></div>
      <div class="card"><strong>Delete this client</strong>
        <p class="mute" style="font-size:16px">Permanently removes this client and all of their sessions, signed contracts and countersigned copies from this device. It cannot be undone, so make a backup first if you might need them.</p>
        <button class="danger" id="delClient">Delete client…</button></div>
      <div class="card"><strong>Tattoo history</strong><div style="margin-top:8px">${Sessions.historyHtml(c.id)}</div></div>`;
  },
  bind(root, { id }) {
    if (!DB.get(id)) return;
    $("#saveNotes", root).onclick = async () => {
      await DB.put({ ...DB.get(id), notes: $("#notes", root).value, updatedAt: new Date().toISOString() });
      $("#noteMsg", root).textContent = "Saved";
    };
    $("#printPaper", root).onclick = () => Consent.printPaper(id);
    $("#delClient", root).onclick = async () => {
      const n = clientFootprint(id);
      const msg = `Permanently delete ${DB.get(id).legalName}, ${n.filter(r => r.type === "session").length} session(s) and ${n.filter(r => r.type !== "session").length} signed document(s)? This cannot be undone.`;
      if (!confirm(msg)) return;
      await deleteClient(id); go("clients");
    };
    $("#startPaper", root).onclick = () => {
      const r = Consent.start(id);
      if (r.error) { $("#paperErr", root).innerHTML = `<div class="banner bad">${esc(r.error)}</div>`; return; }
      go("kPrivacy");
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
      <label for="artist">Tattoo artist legal name / business entity (printed on contracts)</label><input id="artist" value="${esc(settings.artistName)}">
      <label for="minAge">Minimum client age</label><input id="minAge" type="number" inputmode="numeric" min="0" max="99" value="${settings.minAge}">
      <hr><strong>Pricing</strong>
      ${Pricing.settingsHtml(settings)}
      <label for="autoLock">Auto-lock after (minutes of no activity)</label><input id="autoLock" type="number" inputmode="numeric" min="1" max="120" value="${settings.autoLockMin}">
      <hr><strong>Email relay</strong><p class="mute" style="font-size:16px">The relay URL and secret are encrypted with your PIN and never available during client check-in.</p>
      ${Mailer.settingsHtml()}
      <div class="actions"><button class="primary" id="saveSettings">Save settings</button><span id="setMsg" class="mute" style="align-self:center"></span></div></div>
    <div class="card"><strong>Artist signature and initials</strong>
      <p class="mute" style="font-size:16px">Used on contracts you print and when you countersign a signed contract. Stored encrypted. Never available to the intake side.</p>
      <label>Signature ${settings.artistSignature ? "(saved. Draw again to replace it)" : "(not saved yet)"}</label>
      ${settings.artistSignature ? `<img src="${settings.artistSignature}" alt="" style="background:#fff;border-radius:10px;max-width:320px;width:100%;display:block;margin-bottom:8px">` : ""}
      <canvas id="aSig" class="sig" style="height:150px"></canvas>
      <div class="actions" style="margin-top:8px"><button class="small ghost" id="aSigClear">Clear</button><button class="small primary" id="aSigSave" disabled>Save signature</button></div>
      <label>Initials ${settings.artistInitials ? "(saved. Draw again to replace them)" : "(not saved yet)"}</label>
      ${settings.artistInitials ? `<img src="${settings.artistInitials}" alt="" style="background:#fff;border-radius:10px;max-width:200px;width:100%;display:block;margin-bottom:8px">` : ""}
      <canvas id="aInit" class="sig" style="height:110px;max-width:340px"></canvas>
      <div class="actions" style="margin-top:8px"><button class="small ghost" id="aInitClear">Clear</button><button class="small primary" id="aInitSave" disabled>Save initials</button></div>
      <label style="display:flex;gap:12px;align-items:center;color:var(--fg)"><input id="printSigned" type="checkbox" style="width:26px;height:26px" ${settings.printWithSignature === false ? "" : "checked"}> Put my signature and initials on contracts I print</label>
      <div id="aMsg"></div></div>
    <div class="card"><button data-go="formEditor" style="width:100%">Edit consent form</button>
      <button id="printBlank" style="width:100%;margin-top:12px">Print blank contract (wet ink)</button></div>
    <div class="card"><button data-go="backup" style="width:100%">Backup, restore and change PIN</button></div>
    <div class="card"><strong>Erase test data</strong>
      <p class="mute" style="font-size:16px">Deletes every client, session, signed contract and countersigned copy on this device. Your settings, form wording, flash designs and saved signature are kept.</p>
      <button class="danger" id="eraseAll">Erase all client data…</button></div>
    <div class="card"><button data-go="aftercare" style="width:100%">Manage aftercare templates</button></div>`,
  bind(root) {
    $("#printBlank", root).onclick = () => Consent.printPaper();
    Mailer.bindSettings(root);
    $("#eraseAll", root).onclick = async () => {
      const n = DB.all("client").length;
      if (!n) { alert("There are no clients to erase."); return; }
      const t = prompt(`This permanently deletes ${n} client(s) and ALL their paperwork. Type ERASE to confirm.`);
      if (t !== "ERASE") return;
      await eraseAllClientData(); go("settings");
    };
    const wirePad = (canvasId, saveId, clearId, key, label) => {
      const btn = $(saveId, root), pad = Consent.sigPad($(canvasId, root), ok => { btn.disabled = !ok; }, { transparent: true });
      $(clearId, root).onclick = () => pad.clear();
      btn.onclick = async () => { settings = { ...settings, [key]: pad.data() }; await DB.put(settings); go("settings"); };
    };
    wirePad("#aSig", "#aSigSave", "#aSigClear", "artistSignature"); wirePad("#aInit", "#aInitSave", "#aInitClear", "artistInitials");
    $("#printSigned", root).onchange = async e => { settings = { ...settings, printWithSignature: e.target.checked }; await DB.put(settings); };
    $("#saveSettings", root).onclick = async () => {
      const minAge = Math.max(0, Math.min(99, parseInt($("#minAge", root).value, 10) || 18));
      const autoLockMin = Math.max(1, Math.min(120, parseInt($("#autoLock", root).value, 10) || 5));
      settings = { ...Pricing.readSettings(root, Mailer.readSettings(root, settings)), business: $("#biz", root).value.trim() || "Dirtpickle", artistName: $("#artist", root).value.trim() || DEFAULTS.artistName, minAge, autoLockMin };
      await DB.put(settings);
      await publishPublic();
      $("#setMsg", root).textContent = "Saved";
    };
  }
};

/* ---------- boot ---------- */
(async () => {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_) {}
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  await DB.open();
  if (!(await DB.hasPin())) { showPin("setup1"); return; }
  if (await Intake.available()) { intakeReady = true; Intake.enter(); } else showPin("unlock");
})();
