"use strict";
/* Consent forms, signature, PDF generation, client check-in (kiosk) mode, and the Documents list.
   Signed consent records are write-once: they hold a full snapshot of the wording the client saw. */
const Consent = (() => {
  /* ---------- starter template (data, not code: editable in a later phase) ---------- */
  const STARTER = {
    type: "template", id: "tpl-default-v1", key: "default", version: 1,
    name: "Starter consent (review and edit before relying on it)",
    title: "Tattoo Consent and Release",
    sections: [
      { heading: "Health and safety", questions: [
        { id: "h1", type: "yesno", label: "Are you under the influence of alcohol or drugs today?", required: true, mustBe: "no" },
        { id: "h2", type: "yesno", label: "Have you eaten today?", required: true },
        { id: "h3", type: "yesno", label: "Do you have diabetes, a heart condition, epilepsy, or a blood-clotting disorder?", required: true, detail: "Please explain" },
        { id: "h4", type: "yesno", label: "Do you take blood thinners or other medication that affects bleeding or healing?", required: true, detail: "Please list" },
        { id: "h5", type: "yesno", label: "Do you have a condition that affects your immune system, or an infectious disease?", required: true, detail: "Please explain" },
        { id: "h6", type: "yesno", label: "Are you pregnant or nursing?", required: true },
        { id: "h7", type: "yesno", label: "Do you have a history of keloid or raised scarring?", required: true },
        { id: "h8", type: "yesno", label: "Do you have a skin condition, sunburn, rash, or open wound where the tattoo will go?", required: true, detail: "Please explain" },
        { id: "h9", type: "yesno", label: "Are you allergic to latex, metals, ink, antibiotics, numbing products, or anything else?", required: true, detail: "Please list" },
        { id: "h10", type: "text", label: "Anything else the artist should know about your health?", required: false }
      ] },
      { heading: "Declarations", questions: [
        { id: "d1", type: "check", label: "I confirm I am at least the minimum legal age and the ID I showed is mine.", required: true },
        { id: "d2", type: "check", label: "The answers I gave above are true and complete.", required: true },
        { id: "d3", type: "check", label: "I understand a tattoo is permanent. The final result can differ from the drawing and from my expectations.", required: true },
        { id: "d4", type: "check", label: "I understand the risks, including infection, allergic reaction, scarring, and color or line changes over time.", required: true },
        { id: "d5", type: "check", label: "I received written aftercare instructions, or will, and I agree to follow them.", required: true },
        { id: "d6", type: "check", label: "I choose this tattoo, its design, and its placement freely.", required: true }
      ] }
    ],
    agreement: [
      "I am giving my consent to be tattooed by the artist named on this form. I have had the chance to ask questions and they were answered.",
      "I understand that a tattoo is a permanent change to my body and that healing depends on how I care for it. I release the artist and the business from claims arising from the ordinary risks of tattooing that I have been told about, to the extent the law allows.",
      "I agree that this electronic signature has the same effect as my handwritten signature."
    ]
  };

  async function init() {
    if (!DB.all("template").length) await DB.put({ ...STARTER });
  }
  const activeTemplate = () => DB.all("template").filter(t => t.key === "default").sort((a, b) => b.version - a.version)[0];

  /* ---------- helpers ---------- */
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  const b64ToBytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const bytesToB64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const clean = s => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
  const stamp = iso => new Date(iso).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });

  /* ---------- PDF ---------- */
  async function buildPdf(d) {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const W = 612, H = 792, M = 54, CW = W - 2 * M, PINK = rgb(1, 0.176, 0.561), INK = rgb(0, 0, 0), GREY = rgb(0.4, 0.4, 0.4);
    let page, y;
    const newPage = () => { page = pdf.addPage([W, H]); y = H - M; };
    const need = h => { if (y - h < M + 30) newPage(); };
    const wrap = (txt, f, size, width) => {
      const out = [];
      for (const para of clean(txt).split("\n")) {
        let line = "";
        for (const w of para.split(/\s+/)) {
          const t = line ? line + " " + w : w;
          if (f.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = w; } else line = t;
        }
        out.push(line);
      }
      return out;
    };
    const text = (txt, { f = font, size = 10.5, color = INK, indent = 0, gap = 3 } = {}) => {
      for (const l of wrap(txt, f, size, CW - indent)) { need(size + gap); page.drawText(l, { x: M + indent, y: y - size, size, font: f, color }); y -= size + gap; }
    };
    const heading = t => { need(40); y -= 10; text(t.toUpperCase(), { f: bold, size: 11, color: PINK }); page.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 0.6, color: PINK }); y -= 6; };

    newPage();
    page.drawRectangle({ x: 0, y: H - 14, width: W, height: 14, color: INK });
    page.drawRectangle({ x: 0, y: H - 18, width: W, height: 4, color: PINK });
    y -= 12;
    text(d.business.toUpperCase(), { f: bold, size: 22, gap: 6 });
    text(d.tpl.title, { f: bold, size: 14, gap: 4 });
    text(`Signed ${stamp(d.signedAt)}   |   Template: ${d.tpl.name} (v${d.tpl.version})`, { size: 9, color: GREY });

    heading("Client");
    const c = d.client;
    const kv = (k, v) => { if (v) text(`${k}: ${v}`); };
    kv("Legal name", c.legalName); kv("Preferred name", c.preferredName); kv("Date of birth", c.dob ? `${c.dob} (age ${d.ageAtSigning} at signing)` : "");
    kv("Phone", c.phone); kv("Email", c.email); kv("Address", c.address);
    kv("Emergency contact", [c.emergencyName, c.emergencyPhone].filter(Boolean).join(", "));
    kv("Client ID", c.id);

    heading("Identification and age");
    if (d.idCheck) {
      text(`ID barcode read on ${stamp(d.idCheck.at)}${d.idCheck.idState ? ` (state: ${d.idCheck.idState})` : ""}.`);
      text(`Calculated age ${d.idCheck.calculatedAge}; minimum age ${d.idCheck.minAge}. Staff confirmed in person that the ID matched the client.`);
      if (d.idCheck.idExpired) text("Note: the ID showed an expiry date in the past.");
      text("Authenticity of the physical document was not verified by this software.", { color: GREY, size: 9.5 });
    } else {
      text(`Date of birth entered manually. Calculated age ${d.ageAtSigning}; minimum age ${d.minAge}.`);
    }

    heading("Session");
    kv("Session ID", d.session.id); kv("Date", stamp(d.session.createdAt));

    for (const sec of d.tpl.sections) {
      heading(sec.heading);
      for (const q of sec.questions) {
        const a = d.answers[q.id] || {};
        let ans = q.type === "check" ? (a.v ? "Agreed" : "Not agreed") : q.type === "yesno" ? (a.v === "yes" ? "YES" : a.v === "no" ? "No" : "-") : (a.v || "-");
        if (a.d) ans += ` (${a.d})`;
        text(q.label, { f: bold, size: 10 }); text(ans, { indent: 12, gap: 5 });
      }
    }

    heading("Agreement");
    for (const p of d.tpl.agreement) { text(p, { gap: 4 }); y -= 3; }

    need(150); y -= 12;
    text("Client signature", { f: bold, size: 10, gap: 10 });
    const img = await pdf.embedPng(d.signature);
    const sw = 240, sh = Math.min(100, sw * img.height / img.width);
    need(sh + 40);
    page.drawRectangle({ x: M, y: y - sh - 4, width: sw + 8, height: sh + 8, borderColor: GREY, borderWidth: 0.6 });
    page.drawImage(img, { x: M + 4, y: y - sh, width: sw, height: sh });
    y -= sh + 16;
    text(`${c.legalName}   |   ${stamp(d.signedAt)}`, { size: 10 });

    const pages = pdf.getPages();
    pages.forEach((p, i) => p.drawText(clean(`${d.business} | Document ${d.docId} | Page ${i + 1} of ${pages.length}`),
      { x: M, y: 28, size: 8, font, color: GREY }));
    pdf.setTitle(`${d.business} consent - ${c.legalName}`); pdf.setProducer(d.business); pdf.setCreator(d.business);
    return pdf.save();
  }

  /* ---------- signature pad ---------- */
  function sigPad(canvas, onChange) {
    const ctx = canvas.getContext("2d");
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    ctx.scale(dpr, dpr);
    const blank = () => { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, r.width, r.height); ctx.strokeStyle = "#000"; ctx.lineWidth = 3.2; ctx.lineCap = ctx.lineJoin = "round"; };
    blank();
    let down = false, last = null, len = 0;
    const pos = e => { const b = canvas.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    canvas.addEventListener("pointerdown", e => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); down = true; last = pos(e); ctx.beginPath(); ctx.arc(last.x, last.y, 1.4, 0, 7); ctx.stroke(); });
    canvas.addEventListener("pointermove", e => {
      if (!down) return; e.preventDefault();
      for (const ev of (e.getCoalescedEvents ? e.getCoalescedEvents() : [e])) {
        const p = pos(ev); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        len += Math.hypot(p.x - last.x, p.y - last.y); last = p;
      }
      onChange(len > 80);
    });
    const up = () => { down = false; onChange(len > 80); };
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
    return { clear() { blank(); len = 0; onChange(false); }, data: () => canvas.toDataURL("image/png") };
  }

  /* ---------- check-in (kiosk) flow ---------- */
  let K = null; // current check-in: { clientId, tpl, contact, answers }
  const kbar = title => `<header class="bar"><h1>${esc(settings.business.toUpperCase())}</h1>
    <button class="small ghost" id="kStaff">Staff</button></header>${title ? `<h2 style="margin:0 0 12px">${esc(title)}</h2>` : ""}`;

  function start(clientId) {
    const c = DB.get(clientId), tpl = activeTemplate();
    const age = ageOn(c.dob);
    if (age === null || age < settings.minAge) return { error: `Client is under the minimum age of ${settings.minAge} (or has no valid birth date).` };
    if (!tpl) return { error: "No consent template found." };
    K = { clientId, tpl, answers: {}, contact: { phone: c.phone || "", email: c.email || "", address: c.address || "", emergencyName: c.emergencyName || "", emergencyPhone: c.emergencyPhone || "" } };
    return {};
  }

  screens.kReview = {
    html() {
      const c = DB.get(K.clientId);
      const f = (k, l, a = "") => `<label for="k_${k}">${l}</label><input id="k_${k}" value="${esc(K.contact[k])}" ${a}>`;
      return `${kbar("Welcome. Please check your information.")}
        <div class="card"><dl class="kv"><dt>Name</dt><dd>${esc(c.legalName)}</dd><dt>Date of birth</dt><dd>${esc(c.dob)}</dd></dl>
        <div class="mute" style="font-size:15px">If your name or birth date is wrong, please tell the artist.</div></div>
        <div class="cols"><div>${f("phone", "Phone", 'type="tel" inputmode="tel"')}${f("email", "Email", 'type="email" inputmode="email" autocapitalize="off"')}</div>
        <div>${f("address", "Address")}</div><div>${f("emergencyName", "Emergency contact name")}${f("emergencyPhone", "Emergency contact phone", 'type="tel" inputmode="tel"')}</div></div>
        <div class="actions"><button class="primary" id="kNext">Continue</button></div>`;
    },
    bind(root) {
      $("#kNext", root).onclick = () => { for (const k of Object.keys(K.contact)) K.contact[k] = $("#k_" + k, root).value.trim(); go("kQuestions"); };
    }
  };

  const qHtml = q => {
    const a = K.answers[q.id] || {};
    if (q.type === "check") return `<label class="qrow check"><input type="checkbox" data-q="${q.id}" ${a.v ? "checked" : ""}><span>${esc(q.label)}</span></label>`;
    if (q.type === "yesno") return `<div class="qrow"><div class="ql">${esc(q.label)}${q.required ? " *" : ""}</div>
      <div class="yn" data-q="${q.id}"><button data-v="yes" class="${a.v === "yes" ? "primary" : ""}">Yes</button><button data-v="no" class="${a.v === "no" ? "primary" : ""}">No</button></div>
      ${q.detail ? `<input data-d="${q.id}" placeholder="${esc(q.detail)}" value="${esc(a.d)}" style="margin-top:10px;${a.v === "yes" ? "" : "display:none"}">` : ""}</div>`;
    return `<div class="qrow"><div class="ql">${esc(q.label)}</div><input data-t="${q.id}" value="${esc(a.v)}"></div>`;
  };
  screens.kQuestions = {
    html: () => `${kbar(K.tpl.title)}${K.tpl.sections.map(s => `<div class="card"><strong>${esc(s.heading)}</strong>${s.questions.map(qHtml).join("")}</div>`).join("")}
      <div id="kErr"></div><div class="actions"><button class="ghost" data-go="kReview">‹ Back</button><button class="primary" id="kNext">Continue</button></div>`,
    bind(root) {
      root.addEventListener("click", e => {
        const b = e.target.closest(".yn button"); if (!b) return;
        const id = b.parentElement.dataset.q; K.answers[id] = { ...(K.answers[id] || {}), v: b.dataset.v };
        b.parentElement.querySelectorAll("button").forEach(x => x.classList.toggle("primary", x === b));
        const d = root.querySelector(`[data-d="${id}"]`); if (d) d.style.display = b.dataset.v === "yes" ? "" : "none";
      });
      root.addEventListener("change", e => { const q = e.target.dataset.q; if (q && e.target.type === "checkbox") K.answers[q] = { v: e.target.checked }; });
      root.addEventListener("input", e => {
        if (e.target.dataset.d) K.answers[e.target.dataset.d] = { ...(K.answers[e.target.dataset.d] || {}), d: e.target.value };
        if (e.target.dataset.t) K.answers[e.target.dataset.t] = { v: e.target.value };
      });
      $("#kNext", root).onclick = () => {
        const errs = [];
        for (const s of K.tpl.sections) for (const q of s.questions) {
          const a = K.answers[q.id] || {};
          if (q.required && (q.type === "check" ? !a.v : !a.v)) { errs.push(q.type === "check" ? "Please agree to every declaration." : "Please answer every required question."); break; }
          if (q.mustBe && a.v && a.v !== q.mustBe) errs.push("Please speak with the artist before continuing.");
          if (q.detail && a.v === "yes" && !(a.d || "").trim()) errs.push("Please add details where you answered Yes.");
        }
        if (errs.length) { $("#kErr", root).innerHTML = `<div class="banner bad">${[...new Set(errs)].map(esc).join("<br>")}</div>`; return; }
        go("kSign");
      };
    }
  };

  screens.kSign = {
    html: () => `${kbar("Read and sign")}
      <div class="card agree">${K.tpl.agreement.map(p => `<p>${esc(p)}</p>`).join("")}</div>
      <label>Sign below with your finger or Apple Pencil</label>
      <canvas id="sig" class="sig"></canvas>
      <div class="actions"><button class="ghost" id="sigClear">Clear</button><button class="ghost" data-go="kQuestions">‹ Back</button>
        <button class="primary" id="kSubmit" disabled>Agree and submit</button></div><div id="kErr"></div>`,
    bind(root) {
      const submit = $("#kSubmit", root);
      const pad = sigPad($("#sig", root), ok => { submit.disabled = !ok; });
      $("#sigClear", root).onclick = () => pad.clear();
      submit.onclick = async () => {
        submit.disabled = true; submit.textContent = "Saving…";
        try { const docId = await finish(pad.data()); go("kDone", { id: docId }); }
        catch (e) { $("#kErr", root).innerHTML = `<div class="banner bad">Could not save: ${esc(e.message)}. Please tell the artist.</div>`; submit.disabled = false; submit.textContent = "Agree and submit"; }
      };
    }
  };

  async function finish(signature) {
    const now = new Date().toISOString();
    const base = DB.get(K.clientId);
    const client = { ...base, ...K.contact, updatedAt: now, visits: [...(base.visits || []), now] };
    const session = { type: "session", id: crypto.randomUUID(), clientId: client.id, createdAt: now, status: "paperwork-complete", tattoo: {} };
    const docId = crypto.randomUUID();
    const ageAtSigning = ageOn(client.dob);
    const idCheck = (client.idChecks || []).slice(-1)[0] || null;
    const bytes = await buildPdf({ business: settings.business, minAge: settings.minAge, client, session, tpl: K.tpl, answers: K.answers,
      signature, signedAt: now, docId, ageAtSigning, idCheck });
    const hash = hex(await crypto.subtle.digest("SHA-256", bytes));
    const record = {
      type: "consent", id: docId, locked: true, clientId: client.id, sessionId: session.id, signedAt: now,
      clientSnapshot: { id: client.id, legalName: client.legalName, dob: client.dob, phone: client.phone, email: client.email, address: client.address },
      template: K.tpl, answers: K.answers, signature, idCheck, ageAtSigning,
      pdf: bytesToB64(bytes), sha256: hash, emailStatus: "not-sent"
    };
    await DB.put(session); await DB.put(record); await DB.put(client);
    return docId;
  }

  screens.kDone = {
    html: () => `${kbar("")}<div class="pin" style="max-width:520px"><h1>Thank you!</h1>
      <p class="mute">Your paperwork is complete. Please hand the iPad back to your artist.</p></div>`,
    bind() { K = null; setTimeout(() => { if (cur.name === "kDone") lock(); }, 6000); }
  };

  /* ---------- documents (admin) ---------- */
  const docs = () => DB.all("consent").sort((a, b) => b.signedAt.localeCompare(a.signedAt));
  const docRow = d => `<div class="row" data-go="doc" data-id="${esc(d.id)}"><div class="grow"><div>${esc(d.clientSnapshot.legalName)}</div>
    <div class="sub">${esc(stamp(d.signedAt))} · ${esc(d.template.title)} v${d.template.version}</div></div><div class="mute">›</div></div>`;
  const blobUrl = d => URL.createObjectURL(new Blob([b64ToBytes(d.pdf)], { type: "application/pdf" }));
  const fileName = d => `${(d.clientSnapshot.legalName || "client").replace(/[^a-z0-9]+/gi, "-")}-consent-${d.signedAt.slice(0, 10)}.pdf`;

  screens.documents = {
    html: () => `${bar("Documents", { back: "home" })}<div class="card">${docs().map(docRow).join("") || '<span class="mute">No signed documents yet.</span>'}</div>
      <div class="card mute">Email sending is not set up yet. Open a document to view, print, or share its PDF.</div>`
  };
  screens.doc = {
    html({ id }) {
      const d = DB.get(id);
      if (!d) return `${bar("Document", { back: "documents" })}<div class="banner bad">Not found.</div>`;
      return `${bar(esc(d.clientSnapshot.legalName), { back: "documents" })}<div class="card"><dl class="kv">
        <dt>Signed</dt><dd>${esc(stamp(d.signedAt))}</dd><dt>Form</dt><dd>${esc(d.template.title)} v${d.template.version}</dd>
        <dt>Document ID</dt><dd>${esc(d.id)}</dd><dt>SHA-256</dt><dd style="font-size:13px">${esc(d.sha256)}</dd><dt>Email</dt><dd>${esc(d.emailStatus)}</dd></dl>
        <div class="actions"><button class="primary" id="dView">View / Print</button><button id="dSave">Download / Share</button><button id="dVerify">Verify integrity</button></div>
        <div id="dMsg" style="margin-top:12px"></div></div>
        <div class="card mute">This is a locked record. It cannot be edited. If something was wrong, have the client sign a new form.</div>`;
    },
    bind(root, { id }) {
      const d = DB.get(id); if (!d) return;
      $("#dView", root).onclick = () => { window.open(blobUrl(d), "_blank"); };
      $("#dSave", root).onclick = async () => {
        const file = new File([b64ToBytes(d.pdf)], fileName(d), { type: "application/pdf" });
        try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: fileName(d) }); return; } } catch (_) { return; }
        const a = document.createElement("a"); a.href = blobUrl(d); a.download = fileName(d); a.click();
      };
      $("#dVerify", root).onclick = async () => {
        const h = hex(await crypto.subtle.digest("SHA-256", b64ToBytes(d.pdf)));
        $("#dMsg", root).innerHTML = h === d.sha256 ? `<div class="banner ok">Intact. The PDF matches the fingerprint recorded when it was signed.</div>`
          : `<div class="banner bad">Mismatch. This PDF does not match its recorded fingerprint.</div>`;
      };
    }
  };

  document.addEventListener("click", e => { if (e.target.closest("#kStaff")) lock(); });
  return { init, start, docs, fileName, blobUrl, stamp };
})();
