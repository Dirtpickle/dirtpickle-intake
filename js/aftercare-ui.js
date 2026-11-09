"use strict";

const AftercareUI = (() => {
  const edit = template => template ? template : { key: "", title: "", body: "" };
  const form = t => `${bar(t.key ? "Edit aftercare template" : "New aftercare template", { back: "aftercare" })}
    <div class="card"><label for="acTitle">Title</label><input id="acTitle" value="${esc(t.title)}">
    <label for="acBody">Body text (blank lines separate paragraphs)</label><textarea id="acBody" rows="12">${esc(t.body)}</textarea><div id="acMsg"></div>
    <div class="actions"><button class="primary" id="acSave">Save as version ${Math.max(1, (Aftercare.latest(t.key)?.version || 0) + 1)}</button><button class="ghost" data-go="aftercare">Cancel</button></div></div>
    ${t.key ? `<div class="card"><strong>Read-only history</strong>${Aftercare.versions(t.key).map(v => `<div class="sub" style="margin-top:8px">Version ${v.version} · ${esc(fmtDate(v.updatedAt))}<br>${esc(v.body)}</div>`).join("")}</div>` : ""}`;

  screens.aftercare = { html: () => `${bar("Aftercare templates", { back: "settings" })}
    <div class="card"><div class="actions"><button class="primary" data-go="aftercareEdit">+ New template</button></div>
    ${Aftercare.templates().map(t => `<div class="row"><div class="grow"><strong>${esc(t.title)}</strong><div class="sub">Version ${t.version} · ${esc(fmtDate(t.updatedAt))}</div></div><button class="small" data-ac-edit="${esc(t.key)}">Edit</button><button class="small danger" data-ac-delete="${esc(t.key)}">Delete</button></div>`).join("")}</div>` ,
    bind(root) { root.onclick = async e => { const editKey = e.target.closest("[data-ac-edit]")?.dataset.acEdit; if (editKey) return go("aftercareEdit", { key: editKey });
      const del = e.target.closest("[data-ac-delete]")?.dataset.acDelete; if (del && confirm("Delete this template and its saved versions?")) { await Aftercare.remove(del); go("aftercare"); } }; } };

  screens.aftercareEdit = { html: ({ key }) => form(edit(key ? Aftercare.latest(key) : null)), bind(root, { key }) {
    $("#acSave", root).onclick = async () => { const title = $("#acTitle", root).value.trim(), body = $("#acBody", root).value.trim();
      if (!title || !body) { $("#acMsg", root).innerHTML = `<div class="banner bad">Add a title and body.</div>`; return; }
      await Aftercare.save({ key, title, body }); go("aftercare"); } } };

  function sessionSection(session) {
    const docs = Aftercare.forSession(session.id);
    return `<div class="card"><strong>Aftercare</strong><p class="mute">Create a locked PDF from the selected template. The saved version and wording cannot be changed later.</p>
      <div class="actions"><select id="acPick">${Aftercare.templates().map(t => `<option value="${esc(t.key)}">${esc(t.title)} v${t.version}</option>`).join("")}</select><button class="primary" id="acGive">Give aftercare</button></div>
      ${docs.map(d => `<div class="row" data-go="doc" data-id="${esc(d.id)}"><div class="grow">Aftercare · version ${d.templateVersion}<div class="sub">${esc(fmtDate(d.createdAt))} · ${esc(d.emailStatus || "not-sent")}</div></div><div class="mute">›</div></div>`).join("") || '<span class="mute">No aftercare documents for this session.</span>'}</div>`;
  }

  const aftercareDoc = {
    html(d) { return `${bar(esc(d.clientSnapshot.legalName), { back: "documents" })}<div class="card"><strong>Aftercare</strong><dl class="kv" style="margin-top:8px">
      <dt>Given</dt><dd>${esc(fmtDate(d.createdAt))}</dd><dt>Template</dt><dd>Version ${d.templateVersion}</dd><dt>SHA-256</dt><dd style="font-size:13px">${esc(d.sha256)}</dd><dt>Email</dt><dd>${esc(d.emailStatus || "not-sent")}${d.emailError ? " — " + esc(d.emailError) : ""}</dd></dl>
      <label for="emailTo">Send to</label><input id="emailTo" type="email" value="${esc(d.clientSnapshot.email || "")}" autocomplete="off"><div class="actions"><button class="primary" id="sendEmail">Send / Resend</button></div><div id="emailMsg"></div>
      <div class="actions"><button class="primary" id="dView">View / Print</button><button id="dSave">Download / Share</button><button id="dVerify">Verify integrity</button></div><div id="dMsg"></div></div>
      <div class="card mute">This is a locked record. The template can change later without changing this document.</div>`; },
    bind(root, d) {
      $("#sendEmail", root).onclick = async () => { try { await Mailer.send(d, $("#emailTo", root).value); go("doc", { id: d.id }); }
        catch (e) { $("#emailMsg", root).innerHTML = `<div class="banner warn">${esc(e.message)}</div>`; } };
      $("#dView", root).onclick = () => window.open(URL.createObjectURL(new Blob([Uint8Array.from(atob(d.pdf), c => c.charCodeAt(0))], { type: "application/pdf" })), "_blank");
      $("#dSave", root).onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([Uint8Array.from(atob(d.pdf), c => c.charCodeAt(0))], { type: "application/pdf" })); a.download = "aftercare.pdf"; a.click(); };
      $("#dVerify", root).onclick = async () => { const h = await AftercarePdf.hash(Uint8Array.from(atob(d.pdf), c => c.charCodeAt(0))); $("#dMsg", root).innerHTML = h === d.sha256 ? `<div class="banner ok">Intact. The PDF matches the fingerprint recorded when it was created.</div>` : `<div class="banner bad">Mismatch. This PDF does not match its recorded fingerprint.</div>`; };
    }
  };

  const originalDocuments = screens.documents;
  screens.documents = { html() {
    const base = originalDocuments.html();
    const rows = Aftercare.documents().map(d => `<div class="row" data-go="doc" data-id="${esc(d.id)}"><div class="grow"><div>${esc(d.clientSnapshot.legalName)}</div><div class="sub">Aftercare · version ${d.templateVersion} · ${esc(fmtDate(d.createdAt))}</div></div><div class="mute">›</div></div>`).join("");
    return base.replace('<div class="card"><strong>Email status</strong>', `${rows ? `<div class="card"><strong>Aftercare documents</strong>${rows}</div>` : ""}<div class="card"><strong>Email status</strong>`);
  }, bind: originalDocuments.bind };
  const originalDoc = screens.doc;
  screens.doc = { html({ id }) { const d = DB.get(id); return d?.type === "aftercare" ? aftercareDoc.html(d) : originalDoc.html({ id }); }, bind(root, { id }) { const d = DB.get(id); return d?.type === "aftercare" ? aftercareDoc.bind(root, d) : originalDoc.bind(root, { id }); } };

  return { form, sessionSection };
})();
