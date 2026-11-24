"use strict";
/* Dirtpickle intake app: Phase 1 (shell, PIN, local encrypted DB, client intake + search). */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DEFAULTS = { type: "settings", id: "settings", business: "Dirtpickle", minAge: 18, autoLockMin: 5, backupDays: 7, lastBackupAt: null, artistName: "Dirtpickle (Mike Peterson)", appointmentDurationMin: 120, calendarSync: false, calendarName: "", syncEnabled: false, syncSalt: null, lastSyncAt: null, allowShortReturning: false, pricing: { rate: 120, round: 5 } };
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
function go(name, params = {}, { fromPopstate = false, replace = false } = {}) {
  if (!DB.isUnlocked() && !INTAKE_SCREEN.test(name)) return; // second gate: locked means intake screens only
  if (name !== "scan" && name !== "clientForm") pendingScan = null;
  if (cur.name === "scan") Scan.stop();
  if (fromPopstate) {
    Nav.replace(name, params);
  } else if (replace) {
    Nav.replace(name, params);
  } else {
    Nav.push(name, params);
  }
  cur = { name, params };
  const s = screens[name];
  const root = $("#app");
  root.innerHTML = s.html(params);
  if (s.bind) s.bind(root, params);
  window.scrollTo(0, 0);
}
/* Back/forward: never render a pro screen unless the pro side is unlocked (intake kiosk must not reach saved data). */
const INTAKE_SCREEN = /^[ik][A-Z]/;
Nav.start((name, params) => {
  if (!DB.isUnlocked() && !INTAKE_SCREEN.test(name)) return;
  /* Kiosk: after a check-in ends there is no form state, so Back goes to the welcome screen, never a half-empty step. */
  if (!DB.isUnlocked() && name !== "iWelcome" && !Consent.K()) { go("iWelcome", {}, { replace: true }); return; }
  go(name, params, { fromPopstate: true });
});
function bar(title, { back, backId } = {}) {
  return `<header class="bar">
    ${back ? `<button class="small ghost" data-go="${back}"${backId ? ` data-id="${esc(backId)}"` : ""}>‹ Back</button>` : ""}
    <h1>${title || `DIRT<b>PICKLE</b>`}</h1>
    <button class="small ghost" id="lockNow">Lock</button></header>`;
}
document.addEventListener("click", e => {
  const g = e.target.closest("[data-go]");
  if (g && !g.disabled) {
    if (g.dataset.go === "iWelcome" && cur.name === "pin") Nav.unlock();
    go(g.dataset.go, g.dataset.id ? { id: g.dataset.id } : g.dataset.clientId ? { clientId: g.dataset.clientId } : {});
    return;
  }
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
  Nav.lock();
  cur = { name: "pin", params: {} };
  const title = mode === "setup1" ? "Create a 6-digit admin PIN" : mode === "setup2" ? "Enter the PIN again to confirm" : "Enter PIN";
  const hint = mode === "unlock" ? "" : "This PIN encrypts your records. If you forget it, the data cannot be recovered.";
  $("#app").innerHTML = pinHtml(title, hint, err);
  const keys = $("#app").querySelector(".keys");
  const press = async e => {
    const btn = e.target.closest("button[data-k]");
    if (!btn || Date.now() < pinBusyUntil) return;
    const k = btn.dataset.k;
    if (k === "del") pinBuf = pinBuf.slice(0, -1);
    else if (pinBuf.length < PIN_LEN) pinBuf += k;
    $("#app").querySelectorAll(".dots i").forEach((dot, i) => dot.classList.toggle("on", i < pinBuf.length));
    if (pinBuf.length < PIN_LEN) return;
    const entered = pinBuf; pinBuf = "";
    PressFeedback.hold(450);
    await submitPin(mode, entered);
  };
  /* Act on touch-down so quick taps are never lost; click only handles keyboard activation. */
  keys.onpointerdown = e => { e.preventDefault(); press(e); };
  keys.onclick = e => { if (e.detail === 0) press(e); };
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
  if (ok) { pinFails = 0; afterUnlock(pin); return; }
  pinFails++;
  if (pinFails >= 5) { pinBusyUntil = Date.now() + 30000; pinFails = 0; showPin("unlock", "Too many tries. Wait 30 seconds."); }
  else showPin("unlock", "Wrong PIN");
}
/* The intake side may only read this non-private data: form wording, business name, minimum age, available flash. */
async function publishPublic() {
  const flash = Flash.list().filter(f => f.status === "available").map(({ id, code, name, sheet, price, minutes, kind }) => ({ id, code, name, sheet, price, minutes, kind }));
  await DB.setPublic({ business: settings.business, artistName: settings.artistName, minAge: settings.minAge, template: Consent.activeTemplate(),
    relayConfigured: Mailer.configured(Mailer.relayFromSettings()), flash, at: new Date().toISOString() });
}
let intakeReady = false;
let syncModulesLoaded = false;
async function loadSyncModules() {
  if (syncModulesLoaded) return;
  for (const src of ["js/sync-relay.js", "js/sync-marks.js", "js/sync-engine.js", "js/sync-auto.js", "js/sync-ui.js"]) await new Promise((resolve, reject) => {
    const script = document.createElement("script"); script.src = src; script.onload = resolve; script.onerror = reject; document.body.appendChild(script);
  });
  syncModulesLoaded = true;
}
async function afterUnlock(pin) {
  Nav.unlock();
  await loadTextCopyModule();
  await Flash.migrateAll();
  const saved = DB.get("settings") || {};
  settings = { ...DEFAULTS, ...saved, pricing: { ...DEFAULTS.pricing, ...(saved.pricing || {}) } };
  settings = await Events.migrateLegacy(settings);
  await loadSyncModules();
  await loadProReturningModules();
  await Consent.init();
  await Aftercare.init();
  await publishPublic(); intakeReady = true;
  try { await Intake.importAll(); } catch (e) { /* inbox stays for next time */ }
  try { await Mailer.retryAll(); } catch (_) {}
  try { await CalendarSync.retryAll(); } catch (_) {}
  lastActive = Date.now();
  go("home", {}, { replace: true });
  if (pin && typeof SyncAuto !== "undefined") SyncAuto.run(pin);
}
let textCopyModuleLoaded = false;
async function loadTextCopyModule() {
  if (textCopyModuleLoaded) return;
  await new Promise((resolve, reject) => { const script = document.createElement("script"); script.src = "js/text-copy.js"; script.onload = resolve; script.onerror = reject; document.body.appendChild(script); });
  textCopyModuleLoaded = true;
}
let proReturningModulesLoaded = false;
async function loadProReturningModules() {
  if (proReturningModulesLoaded) return;
  for (const src of ["js/client-match.js", "js/returning-consent.js"]) await new Promise((resolve, reject) => {
    const script = document.createElement("script"); script.src = src; script.onload = resolve; script.onerror = reject; document.body.appendChild(script);
  });
  proReturningModulesLoaded = true;
}
async function lock() {
  try { if (DB.isUnlocked()) await publishPublic(); } catch (_) {}
  DB.lock(); pinBuf = ""; pinFirst = null;
  $("#app").innerHTML = "";
  if (await Intake.available()) { Nav.unlock(); intakeReady = true; Intake.enter(); } else showPin("unlock");
}
["pointerdown", "keydown"].forEach(ev => document.addEventListener(ev, () => { lastActive = Date.now(); }, true));
setInterval(() => {
  if (DB.isUnlocked() && Date.now() - lastActive > settings.autoLockMin * 60000) lock();
}, 10000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && DB.isUnlocked() && Date.now() - lastActive > settings.autoLockMin * 60000) lock();
});


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
screens.clients = searchScreen("Clients", "home", true);
screens.returning = screens.clients;

/* ---------- ID scan ---------- */
function idPanel(sc) {
  const age = ageOn(sc.fields.dob);
  const meets = age !== null && age >= settings.minAge;
  return `<div style="margin-top:14px">
    <div class="banner ok" style="margin:8px 0">✓ ID barcode read. Name and birth date filled in below. Review the address and use the button if you want the license address.</div>
    <div class="banner ${meets ? "ok" : "bad"}" style="margin:8px 0">${meets ? "✓" : "✗"} Calculated age: ${age === null ? "unknown" : age}
      (${meets ? "meets" : "below"} the minimum of ${settings.minAge}).</div>
    ${sc.idExpired ? `<div class="banner bad" style="margin:8px 0">This ID shows an expiry date in the past (${esc(sc.idExpiry)}).</div>` : ""}
    <label style="display:flex;gap:12px;align-items:center;color:var(--fg);font-size:18px">
      <input id="visualOk" type="checkbox" style="width:28px;height:28px"> I compared the ID photo to the client in person.</label>
    <div class="banner warn" style="margin:8px 0;font-weight:400;font-size:16px">This app reads what the barcode says.
      It does not confirm the card is genuine. The license image is not saved.</div></div>`;
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
      pendingScan = { fields: { legalName: parsed.legalName, dob: parsed.dob, licenseNumber: parsed.idNumber }, scannedAddress: parsed.address || "",
        idNumber: parsed.idNumber, idState: parsed.idState, idExpiry: parsed.idExpiry, idExpired: parsed.idExpired,
        scanned: { legalName: parsed.legalName, dob: parsed.dob }, typed: id ? { legalName: DB.get(id).legalName, dob: DB.get(id).dob } : null };
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
    const existing = (id && DB.get(id)) || {};
    const c = { ...existing, ...((pendingScan && pendingScan.fields) || {}) };
    const addressSuggestion = pendingScan && pendingScan.scannedAddress && pendingScan.scannedAddress !== (c.address || "")
      ? `<button type="button" class="small ghost" id="useScanAddress">Use address on license</button>` : "";
    const latestPhoto = (c.idPhotos || []).slice(-1)[0];
    const photoTitle = latestPhoto ? `ID photo on file (${fmtDate(latestPhoto.at)})` : "Photo of the front of your license *";
    const f = (k, label, attrs = "") => `<label for="${k}">${label}</label><input id="${k}" value="${esc(c[k])}" ${attrs}>`;
    return `${bar(id ? "Review client info" : "New client", { back: id ? "profile" : "home", backId: id })}
      <div class="card"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <button class="primary" data-go="scan"${id ? ` data-id="${esc(id)}"` : ""}>Scan driver's license</button>
        <span class="mute" style="font-size:16px">Or type the details in below.</span></div>
        ${pendingScan ? IdVerifyUI.matchBanner(pendingScan.scanned, pendingScan.typed || c) + idPanel(pendingScan) : ""}</div>
      ${IdPhoto.block({ photo: latestPhoto && latestPhoto.image, check: null, inputId: "idFront", title: photoTitle })}
      ${latestPhoto ? "" : `<div class="actions" style="margin-top:-8px"><a href="#" id="skipIdPhoto">Skip photo (artist override)</a></div>
        <div id="photoOverrideBox" hidden><label for="photoOverrideReason">Reason for skipping the photo</label>
          <input id="photoOverrideReason" autocomplete="off"><button class="small" id="confirmPhotoOverride" type="button">Use override</button></div>`}
      <div class="cols">
        <div>${f("legalName", "Full legal name *", 'autocomplete="off" autocapitalize="words"')}
          ${f("preferredName", "Preferred name", 'autocapitalize="words"')}
          <label for="dob">Date of birth *</label><input id="dob" type="date" value="${esc(c.dob)}">
          <div id="ageLine"></div></div>
        <div>${f("phone", "Phone number", 'type="tel" inputmode="tel" autocomplete="tel"')}<div class="sub" data-phone-error="phone"></div>
          ${f("email", "Email address", 'type="email" inputmode="email" autocapitalize="off"')}
          <label for="address">Address</label><input id="address" value="${esc(c.address)}" autocapitalize="words">${addressSuggestion}</div>
        <div>${IdVerifyUI.licenseField(c)}${f("emergencyName", "Emergency contact name")}
          ${f("emergencyPhone", "Emergency contact phone", 'type="tel" inputmode="tel"')}<div class="sub" data-phone-error="emergencyPhone"></div></div>
      </div>
      <div id="dupBox"></div>
      <div class="actions"><button class="primary" id="saveClient">${id ? "Save changes" : "Save client"}</button>
        <button class="ghost" data-go="${id ? "profile" : "home"}" ${id ? `data-id="${esc(id)}"` : ""}>Cancel</button></div>`;
  },
  bind(root, { id }) {
    let newIdPhoto = null;
    let overrideReason = "";
    const existing = (id && DB.get(id)) || {};
    const hasPhoto = (existing.idPhotos || []).length > 0;
    const v = k => $("#" + k, root).value.trim();
    const refreshMatch = () => {
      if (!pendingScan) return;
      const banner = $("#idMatchBanner", root);
      if (banner) banner.outerHTML = IdVerifyUI.matchBanner(pendingScan.scanned, { legalName: v("legalName"), dob: $("#dob", root).value });
    };
    ["legalName", "dob"].forEach(k => $("#" + k, root).addEventListener("input", refreshMatch));
    const useAddress = $("#useScanAddress", root);
    if (useAddress) useAddress.onclick = () => { $("#address", root).value = pendingScan.scannedAddress; };
    IdPhoto.attach(root, {
      inputId: "idFront",
      onPhoto: result => { newIdPhoto = result; },
      onError: () => { $("#dupBox", root).innerHTML = `<div class="banner bad">Could not read that photo. Please try again.</div>`; }
    });
    const skip = $("#skipIdPhoto", root);
    if (skip) skip.onclick = event => {
      event.preventDefault();
      if (!IdVerifyUI.canOverrideId()) return;
      $("#photoOverrideBox", root).hidden = false;
      $("#photoOverrideReason", root).focus();
    };
    const confirmOverride = $("#confirmPhotoOverride", root);
    if (confirmOverride) confirmOverride.onclick = () => {
      const reason = $("#photoOverrideReason", root).value.trim();
      if (!reason) { $("#dupBox", root).innerHTML = `<div class="banner bad">Enter a reason for the artist override.</div>`; return; }
      overrideReason = reason;
      $("#photoOverrideBox", root).innerHTML = `<div class="banner warn">Artist override recorded. Save to continue.</div>`;
    };
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
    const badPhones = Phone.wire(root, ["phone", "emergencyPhone"]);
    const gather = () => ({
      legalName: v("legalName"), preferredName: v("preferredName"), dob: $("#dob", root).value,
      phone: v("phone"), email: v("email"), address: v("address"),
      licenseNumber: v("licenseNumber"), emergencyName: v("emergencyName"), emergencyPhone: v("emergencyPhone")
    });
    const doSave = async data => {
      const now = new Date().toISOString();
      const rec = id ? { ...DB.get(id), ...data, updatedAt: now }
        : { type: "client", ...data, notes: "", visits: [now], createdAt: now, updatedAt: now };
      if (pendingScan) {
        const sc = pendingScan;
        const match = IdMatch.compare(sc.scanned, sc.typed || data);
        rec.idChecks = [...(rec.idChecks || []), {
          at: now, method: "pdf417-barcode", idState: sc.idState, idExpiry: sc.idExpiry, idExpired: sc.idExpired,
          matched: match.matched, calculatedAge: ageOn(data.dob), minAge: settings.minAge, visuallyMatched: true,
          authenticityChecked: false
        }];
      }
      if (newIdPhoto) rec.idPhotos = [...(rec.idPhotos || []), { at: now, image: newIdPhoto.image }].slice(-3);
      const override = IdVerifyUI.overrideEntry(overrideReason);
      if (override) rec.idChecks = [...(rec.idChecks || []), override];
      const saved = ClientContact.clearIfProvided(rec, data);
      await DB.put(saved);
      pendingScan = null;
      go("profile", { id: saved.id });
    };
    save.onclick = async () => {
      const d = gather();
      const age = ageOn(d.dob);
      const msgs = [];
      badPhones().forEach(id => msgs.push(id === "phone" ? "Phone must have 10 digits." : "Emergency contact phone must have 10 digits."));
      if (!d.legalName) msgs.push("Full legal name is required.");
      if (age === null) msgs.push("Enter a valid date of birth.");
      else if (age >= 130) msgs.push("Check the date of birth.");
      else if (age < settings.minAge) msgs.push(`Client is under the minimum age of ${settings.minAge}.`);
      if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) msgs.push("Email address looks invalid.");
      if (pendingScan && !($("#visualOk", root) || {}).checked) msgs.push("Confirm that you compared the ID to the client.");
      if (!hasPhoto && !newIdPhoto && !overrideReason) msgs.push("Take a photo of the front of the license, or use the artist override.");
      const box = $("#dupBox", root);
      if (msgs.length) { box.innerHTML = `<div class="banner bad">${msgs.map(esc).join("<br>")}</div>`; return; }
      // Editing a file: only warn about a conflict the artist just introduced, not one already there.
      const changed = id ? { ...d, ...(d.email === existing.email ? { email: "" } : {}), ...(d.phone === existing.phone ? { phone: "" } : {}),
        ...(d.legalName === existing.legalName && d.dob === existing.dob ? { legalName: "-" } : {}) } : d;
      const dup = findDuplicate(changed, id);
      if (dup && !box.dataset.confirmed) {
        box.innerHTML = id
          ? `<div class="banner warn">Another client file (${esc(nameOf(dup))}) already has this phone, email or name and birthday.
          <div class="actions"><button class="small primary" id="saveAnyway">Update file anyway</button>
          <button class="small" data-go="profile" data-id="${esc(dup.id)}">Open the other file</button></div></div>`
          : `<div class="banner warn">Possible existing client: ${esc(nameOf(dup))}.
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
const CLIENT_TYPES = ["session", "consent", "countersign", "aftercare", "photo", "appointment", "textcopy"];
function clientFootprint(id) {
  const rows = [];
  for (const t of CLIENT_TYPES) for (const r of DB.all(t)) if (r.clientId === id) rows.push(r);
  return rows;
}
async function freeFlashFor(sessions) {
  for (const s of sessions) await Flash.release(s.flashId);
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


/* ---------- Settings ---------- */
SettingsMenu.register(screens);

/* ---------- boot (waits until every script has loaded) ---------- */
const boot = async () => {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_) {}
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  await DB.open();
  if (await DB.hasPin() && DB.isUnlocked()) await Flash.migrateAll();
  if (!(await DB.hasPin())) { showPin("setup1"); return; }
  if (await Intake.available()) { intakeReady = true; Intake.enter(); } else showPin("unlock");
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
