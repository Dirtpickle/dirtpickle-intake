"use strict";

function profileMoreActions(c) {
  return `<div id="profileMoreActions" hidden><div class="actions">
    <button data-go="clientForm" data-id="${esc(c.id)}">Review / edit info</button>
    <button data-go="appointmentForm" data-client-id="${esc(c.id)}">Book appointment</button>
    <button id="addVisit">Record visit today</button>
    <button id="printPaper">Print contract (wet ink)</button>
  </div><div class="card" style="margin:14px 0 0;border-color:var(--bad)"><strong>Delete this client</strong>
    <p class="mute" style="font-size:16px">Permanently removes this client and all of their sessions, signed contracts and countersigned copies from this device. It cannot be undone, so make a backup first if you might need them.</p>
    <button class="danger" id="delClient">Delete client…</button></div></div>`;
}

function profileHtml(c) {
  const a = ageOn(c.dob);
  const row = (k, v) => v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : "";
  const visits = (c.visits || []).slice().reverse().map(v => `<div class="sub">${esc(fmtDate(v))}</div>`).join("");
  const docs = DB.all("consent").filter(d => d.clientId === c.id).sort((x, y) => y.signedAt.localeCompare(x.signedAt))
    .map(d => `<div class="row" data-go="doc" data-id="${esc(d.id)}"><div class="grow">${esc(d.template.title)}<div class="sub">${esc(Consent.stamp(d.signedAt))}</div></div><div class="mute">›</div></div>`).join("");
  return `${bar(esc(nameOf(c)), { back: "clients" })}
    ${a !== null && a < settings.minAge ? `<div class="banner bad">Under the minimum age of ${settings.minAge}.</div>` : ""}${ClientContact.warning(c)}
    <div class="card"><dl class="kv">${row("Legal name", c.legalName)}${row("Preferred name", c.preferredName)}
      ${row("Date of birth", c.dob ? `${c.dob} (age ${a})` : "")}${row("Phone", c.phone)}${row("Email", c.email)}
      ${row("Address", c.address)}${row("Emergency contact", [c.emergencyName, c.emergencyPhone].filter(Boolean).join(" · "))}
      ${c.licenseNumber ? `<dt>License number</dt><dd><span id="licenseValue">••••${esc(String(c.licenseNumber).slice(-4))}</span> <button class="small ghost" id="toggleLicense">Show</button></dd>` : ""}
      ${row("First registered", fmtDate(c.createdAt))}</dl>
      <div class="actions"><button class="primary" data-go="flashPick" data-id="${esc(c.id)}">Add to today's queue</button><button data-go="clientFile" data-id="${esc(c.id)}">View full file</button></div>
      <button class="ghost small" id="profileMoreToggle" aria-expanded="false" style="margin-top:12px">More</button>${profileMoreActions(c)}</div>
    ${IdVerifyUI.profileCard(c, true)}${PhotosUI.profileStrip(c.id)}
    ${(c.idPhotos || []).length ? `<div class="card"><strong>ID photo (front)</strong><div class="sub mute">${esc(fmtDate(c.idPhotos[c.idPhotos.length - 1].at))}</div><img src="${c.idPhotos[c.idPhotos.length - 1].image}" alt="" style="max-width:420px;width:100%;border-radius:10px;margin-top:8px"></div>` : ""}
    <div class="card"><strong>Consent paperwork</strong><div class="actions" style="margin-top:10px"><button class="primary" id="startPaper">Start paperwork (hand iPad to client)</button></div><div id="paperErr"></div>
      <div style="margin-top:10px">${docs || '<span class="mute">No signed forms yet. Each tattoo needs its own signed form.</span>'}</div></div>
    <div class="card"><strong>Visits</strong><div style="margin-top:8px">${visits || '<span class="mute">None</span>'}</div></div>
    <div class="card"><label for="notes" style="margin-top:0">Notes</label><textarea id="notes" rows="4">${esc(c.notes)}</textarea><div class="actions"><button id="saveNotes">Save notes</button><span id="noteMsg" class="mute" style="align-self:center"></span></div></div>
    <div class="card"><strong>Tattoo history</strong><div style="margin-top:8px">${Sessions.historyHtml(c.id)}</div></div>`;
}

screens.profile = {
  html({ id }) { const c = DB.get(id); return c ? profileHtml(c) : `${bar("Client", { back: "home" })}<div class="banner bad">Client not found.</div>`; },
  bind(root, { id }) {
    if (!DB.get(id)) return;
    const toggleMore = $("#profileMoreToggle", root), more = $("#profileMoreActions", root);
    toggleMore.onclick = () => { const open = more.hidden; more.hidden = !open; toggleMore.setAttribute("aria-expanded", String(open)); };
    const toggleLicense = $("#toggleLicense", root);
    if (toggleLicense) toggleLicense.onclick = () => { const shown = toggleLicense.textContent === "Hide"; $("#licenseValue", root).textContent = shown ? `••••${String(DB.get(id).licenseNumber).slice(-4)}` : DB.get(id).licenseNumber; toggleLicense.textContent = shown ? "Show" : "Hide"; };
    const override = $("#artistOverride", root);
    if (override) override.onclick = async () => { const entry = IdVerifyUI.overrideEntry(prompt("Why did you verify this ID in person?")); if (!entry) return; const c = DB.get(id); await DB.put({ ...c, idChecks: [...(c.idChecks || []), entry], updatedAt: new Date().toISOString() }); go("profile", { id }); };
    $("#saveNotes", root).onclick = async () => { await DB.put({ ...DB.get(id), notes: $("#notes", root).value, updatedAt: new Date().toISOString() }); $("#noteMsg", root).textContent = "Saved"; };
    $("#printPaper", root).onclick = () => Consent.printPaper(id);
    $("#delClient", root).onclick = async () => { const n = clientFootprint(id); const msg = `Permanently delete ${DB.get(id).legalName}, ${n.filter(r => r.type === "session").length} session(s), ${n.filter(r => r.type === "photo").length} photo(s), ${n.filter(r => r.type === "appointment").length} appointment(s) and ${n.filter(r => !["session", "photo", "appointment"].includes(r.type)).length} signed document(s)? This cannot be undone.`; if (!confirm(msg)) return; await deleteClient(id); go("clients"); };
    $("#startPaper", root).onclick = async () => { const waiting = Sessions.openForPaperwork(id), r = await Consent.start(id, waiting && waiting.id); if (r.error) { $("#paperErr", root).innerHTML = `<div class="banner bad">${esc(r.error)}</div>`; return; } go("kPrivacy"); };
    $("#addVisit", root).onclick = async () => { const c = DB.get(id); await DB.put({ ...c, visits: [...(c.visits || []), new Date().toISOString()], updatedAt: new Date().toISOString() }); go("profile", { id }); };
  }
};
