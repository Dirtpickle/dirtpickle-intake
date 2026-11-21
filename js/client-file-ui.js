"use strict";

/* Read-only client file screen and print options. */
const ClientFileUI = (() => {
  const masked = value => `••••${String(value || "").slice(-4)}`;
  const money = value => value === "" || value == null ? "" : `$${value}`;
  const thumb = p => `<button type="button" class="photo-thumb" data-file-photo="${esc(p.id)}"><img src="${p.image}" alt="${esc(p.kind || "Photo")}"><span>${esc(p.kind || "Photo")}</span></button>`;
  const kv = (label, value) => value ? `<dt>${label}</dt><dd>${esc(value)}</dd>` : "";

  function clientDetails(c) {
    const age = typeof ageOn === "function" ? ageOn(c.dob) : null;
    return `<dl class="kv">${kv("Legal name", c.legalName)}${kv("Preferred name", c.preferredName)}${kv("Date of birth", c.dob ? `${c.dob}${age == null ? "" : ` (age ${age})`}` : "")}${kv("Phone", c.phone)}${kv("Email", c.email)}${kv("Address", c.address)}${kv("Emergency contact", [c.emergencyName, c.emergencyPhone].filter(Boolean).join(" · "))}${c.licenseNumber ? `<dt>License number</dt><dd><span id="fileLicense">${masked(c.licenseNumber)}</span> <button class="small ghost" id="fileLicenseToggle">Show</button></dd>` : "<dt>ID</dt><dd>No license on file</dd>"}${kv("First registered", c.createdAt && fmtDate(c.createdAt))}${kv("Visit dates", (c.visits || []).map(fmtDate).join(", "))}</dl>${c.notes ? `<div class="sub" style="white-space:pre-wrap;margin-top:10px">${esc(c.notes)}</div>` : ""}`;
  }
  function verification(data) {
    const id = data.idPhotos[0];
    return `<div class="sub">${id ? "Latest ID photo on file" : "No ID photo on file"}</div>${id ? `<button type="button" class="photo-thumb" id="fileIdPhoto"><img src="${id.image}" alt="ID photo"><span>${esc(fmtDate(id.at))}</span></button><div class="actions"><button type="button" class="small" id="fileCropId">Crop ID photo</button></div>` : ""}<div style="margin-top:12px">${data.idChecks.map(x => `<div class="row" style="cursor:default"><div class="grow">${esc(fmtDate(x.at))} · ${esc(x.method || "Unknown method")} · ${esc(x.result || "Unknown result")}<div class="sub">Visually matched: ${x.visuallyMatched ? "Yes" : "No"}${x.overrideReason ? ` · Override: ${esc(x.overrideReason)}` : ""}${x.who ? ` · ${esc(x.who)}` : ""}</div></div></div>`).join("") || '<span class="mute">No ID checks recorded.</span>'}</div>`;
  }
  function sessionList(data) {
    return data.sessions.map(s => { const t = s.tattoo || {}, r = s.record || {}, photos = data.photos.filter(p => p.sessionId === s.id).length; return `<div class="card"><strong>${esc(fmtDate(s.createdAt))}${s.status ? ` · ${esc(s.status)}` : ""}</strong><dl class="kv" style="margin-top:8px">${kv("Flash", s.flashName || s.flashCode || "—")}${kv("Tattoo", t.description || "—")}${kv("Location / size", [t.location, t.size].filter(Boolean).join(" · ") || "—")}${kv("Price / deposit / paid", [money(s.price), money(s.deposit), money(s.paid), s.payMethod].filter(Boolean).join(" · ") || "—")}${kv("Tattoo time", typeof SessionTime === "undefined" ? "" : SessionTime.format(SessionTime.duration(s)))}${kv("Procedure", [r.needleType, r.needleLot, r.barrier, r.inkBrand, r.pigment, r.inkLot, r.inkExp].filter(Boolean).join(" · ") || "—")}${kv("Aftercare given", r.aftercareProvided ? "Yes" : "No")}${kv("Notes", s.notes || "—")}<dt>Consent</dt><dd>${s.consentId ? `<button class="small" data-go="doc" data-id="${esc(s.consentId)}">Open contract</button>` : "None"}</dd>${kv("Photos", photos)}</dl></div>`; }).join("") || '<div class="mute">No sessions yet.</div>';
  }
  function contractList(data) { return data.consents.map(d => `<div class="row"><div class="grow">${esc(d.template && d.template.title || "Signed contract")}<div class="sub">${esc(fmtDate(d.signedAt))} · Form v${esc(d.template?.version || "?")} · ${d.short ? "Short returning-client" : "Full form"} · Countersigned: ${DB.get("cs-" + d.id) ? "yes" : "no"} · SHA-256: ${esc((d.sha256 || "").slice(0, 12))} · Emailed: ${esc(d.emailStatus || "not-sent")}</div></div><button class="small" data-go="doc" data-id="${esc(d.id)}">Open</button></div>`).join("") || '<span class="mute">No signed contracts.</span>'; }
  function printOptions() { return `<div class="card" id="filePrintOptions"><strong>Print / save PDF</strong><label style="display:block;margin-top:12px"><input id="includeId" type="checkbox"> Include ID photo (shows the license number)</label><label style="display:block"><input id="includeTattoo" type="checkbox" checked> Include tattoo photos</label><label style="display:block"><input id="includeContracts" type="checkbox" checked> Include signed contracts</label><label for="sessionRange" style="display:block;margin-top:12px">Sessions to include</label><select id="sessionRange"><option value="all">All sessions</option><option value="range">Pick a date range</option></select><div id="fileDates" hidden><input id="fileFrom" type="date"><input id="fileTo" type="date"></div><div class="actions"><button class="primary" id="buildFilePdf">Build PDF</button><span id="filePdfMsg" class="mute" style="align-self:center"></span></div></div>`; }
  function html({ id }) {
    const data = ClientFile.collect(id);
    if (!data) return `${bar("Client file", { back: "clients" })}<div class="banner bad">Client not found.</div>`;
    return `${bar("Client file", { back: "profile", backId: id })}<div class="actions"><button class="primary" data-open-print>Print / save PDF</button></div><section class="card"><h2>Client details</h2>${clientDetails(data.client)}</section><section class="card"><h2>ID & verification</h2>${verification(data)}</section><section><h2>Sessions</h2>${sessionList(data)}</section><section class="card"><h2>Signed contracts</h2>${contractList(data)}</section><section class="card"><h2>Photos</h2><div class="photo-grid">${data.photos.map(thumb).join("") || '<span class="mute">No tattoo photos.</span>'}</div></section><div id="fileOptions">${printOptions()}</div>`;
  }
  function bind(root, { id }) {
    const data = ClientFile.collect(id); if (!data) return;
    const toggle = $("#fileLicenseToggle", root);
    if (toggle) toggle.onclick = () => { const shown = toggle.textContent === "Hide"; $("#fileLicense", root).textContent = shown ? masked(data.client.licenseNumber) : data.client.licenseNumber; toggle.textContent = shown ? "Show" : "Hide"; };
    const show = p => { const box = document.createElement("div"); box.className = "photo-viewer"; box.innerHTML = `<div class="photo-viewer-card"><img src="${p.image}" alt="Photo"><button id="closeFilePhoto">Close</button></div>`; box.onclick = e => { if (e.target === box || e.target.id === "closeFilePhoto") box.remove(); }; document.body.appendChild(box); };
    root.querySelectorAll("[data-file-photo]").forEach(b => b.onclick = () => show(DB.get(b.dataset.filePhoto)));
    $("#fileIdPhoto", root)?.addEventListener("click", () => show(data.idPhotos[0]));
    $("#fileCropId", root)?.addEventListener("click", async () => { if (await IdRecrop.run(id, data.idPhotos[0].at)) go("clientFile", { id }, { replace: true }); });
    $("[data-open-print]", root).onclick = () => $("#filePrintOptions", root).scrollIntoView({ behavior: "smooth" });
    const includeId = $("#includeId", root); includeId.checked = localStorage.getItem("dp-include-client-id-photo") === "yes";
    $("#sessionRange", root).onchange = e => { $("#fileDates", root).hidden = e.target.value !== "range"; };
    $("#buildFilePdf", root).onclick = async () => {
      const msg = $("#filePdfMsg", root); msg.textContent = "Building…";
      includeId.checked ? localStorage.setItem("dp-include-client-id-photo", "yes") : localStorage.removeItem("dp-include-client-id-photo");
      const range = $("#sessionRange", root).value === "range" ? { from: $("#fileFrom", root).value || "0000", to: `${$("#fileTo", root).value || "9999"}T23:59:59.999Z` } : null;
      try { const out = await ClientFilePdf.build(data, { includeIdPhoto: includeId.checked, includeTattooPhotos: $("#includeTattoo", root).checked, includeContracts: $("#includeContracts", root).checked, sessionFilter: range, business: settings.business }); window.open(URL.createObjectURL(new Blob([out.bytes], { type: "application/pdf" })), "_blank"); msg.textContent = "PDF opened."; } catch (e) { msg.textContent = `Could not build PDF: ${e.message}`; }
    };
  }
  screens.clientFile = { html, bind };
  return { html, bind };
})();
