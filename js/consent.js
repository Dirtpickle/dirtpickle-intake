"use strict";
/* Consent forms, signature, PDF generation, client check-in (kiosk) mode, and the Documents list.
   Signed consent records are write-once: they hold a full snapshot of the wording the client saw. */
const Consent = (() => {
  const DEFAULT_PRIVACY = "Your privacy. This app works completely offline. Everything you enter, including your ID details and a photo of your ID, health answers and signature, is saved only on this device and is encrypted. It is not uploaded to any cloud or shared with anyone, and only the artist can open it. A copy of your signed agreement will be emailed to the email address you give us. That is the only information that leaves this device.";
  const privacyText = () => {
    const text = (K && K.tpl && K.tpl.privacy) || DEFAULT_PRIVACY;
    const relay = K && (K.mode === "intake" ? K.relayConfigured : Mailer.configured(Mailer.relayFromSettings()));
    return relay ? text : text.replace("A copy of your signed agreement will be emailed to the email address you give us.", "Ask the artist for a copy.");
  };

  async function init() {
    const tpls = DB.all("template");
    if (!tpls.some(t => t.source === CONTRACT.source)) {
      const v = Math.max(0, ...tpls.filter(t => t.key === "default").map(t => t.version)) + 1;
      await DB.put({ ...CONTRACT, id: `tpl-default-v${v}`, version: v });
    }
  }
  const activeTemplate = () => DB.all("template").filter(t => t.key === "default").sort((a, b) => b.version - a.version)[0];

  /* ---------- helpers ---------- */
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  const b64ToBytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const bytesToB64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const clean = s => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7e\xa0-\xff\u2022]/g, "?");
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
    if (d.tpl.intro) text(d.tpl.intro, { size: 9.5, color: GREY, gap: 4 });
    if (d.artist) text(`Tattoo artist: ${d.artist}`, { f: bold, size: 10 });
    text(`Signed ${stamp(d.signedAt)}${d.counter ? `   |   Countersigned ${stamp(d.counter.at)}` : ""}   |   Template: ${d.tpl.name} (v${d.tpl.version})`, { size: 9, color: GREY });

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
      text(`Calculated age ${d.idCheck.calculatedAge}; minimum age ${d.idCheck.minAge}. ${d.idCheck.visuallyMatched ? "The artist confirmed in person that the ID matched the client." : "In-person comparison of the ID to the client is recorded separately by the artist."}`);
      if (d.idCheck.idExpired) text("Note: the ID showed an expiry date in the past.");
      text("Authenticity of the physical document was not verified by this software.", { color: GREY, size: 9.5 });
    } else {
      text(`Date of birth entered manually. Calculated age ${d.ageAtSigning}; minimum age ${d.minAge}.`);
    }

    if (d.privacy) { heading("Privacy notice shown and acknowledged"); text(d.privacy.text, { size: 9.5 }); text(`Acknowledged ${stamp(d.privacy.at)}`, { size: 9, color: GREY }); }

    heading("Session");
    kv("Session ID", d.session.id); kv("Date", stamp(d.session.createdAt)); kv("Flash design", d.session.flashName);

    d.tpl.sections.forEach((sec, si) => {
      heading(sec.heading);
      for (const l of (sec.body || [])) {
        if (l.startsWith("- ")) text("\u2022 " + l.slice(2), { size: 9.5, indent: 10, gap: 2 });
        else if (l.startsWith("# ")) text(l.slice(2), { f: bold, size: 10, gap: 2 });
        else text(l, { size: 9.5, gap: 3 });
      }
      for (const q of sec.questions) {
        const a = d.answers[q.id] || {};
        if (q.type === "check") { text(`${a.v ? "[X]" : "[  ]"} ${q.label}`, { size: 9.5, indent: 4, gap: 2 }); continue; }
        let ans = q.type === "yesno" ? (a.v === "yes" ? "YES" : a.v === "no" ? "No" : "-") : (a.v || "-");
        if (a.d) ans += ` (${a.d})`;
        text(q.label, { f: bold, size: 9.5, gap: 2 }); text(ans, { indent: 12, gap: 4, size: 9.5 });
      }
      if (sec.initials) text(`Client initials: ${(d.answers["init:" + si] || {}).v || "-"}`, { f: bold, size: 10 });
    });

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

    if (d.counter) {
      const cs = d.counter, rec = cs.record || {}, ses = cs.session || {}, tat = ses.tattoo || {};
      heading("Tattoo artist acknowledgment");
      text("I acknowledge that I reviewed the required client information, verified the client's age, addressed relevant safety concerns, obtained consent, and provided or arranged for appropriate aftercare instructions.", { size: 9.5, gap: 6 });
      const aimg = await pdf.embedPng(cs.signature), aw = 200, ah = Math.min(70, aw * aimg.height / aimg.width);
      need(ah + 36); page.drawImage(aimg, { x: M, y: y - ah, width: aw, height: ah });
      page.drawLine({ start: { x: M, y: y - ah - 2 }, end: { x: M + 260, y: y - ah - 2 }, thickness: 0.6, color: GREY }); y -= ah + 6;
      text(`${d.artist || d.business}   |   ${stamp(cs.at)}`, { size: 10 });
      heading("Artist use only - procedure record");
      const times = (ses.segments || []).filter(x => x.s);
      kv("Stencil / design reference", ses.flashName || tat.description);
      kv("Tattoo location", tat.location); kv("Approximate size", tat.size);
      kv("Procedure start", times.length ? stamp(times[0].s) : ""); kv("Procedure end", ses.endedAt ? stamp(ses.endedAt) : "");
      kv("Needle / cartridge type", rec.needleType); kv("Needle / cartridge lot", rec.needleLot);
      kv("Ink brand(s)", rec.inkBrand); kv("Pigment / color(s)", rec.pigment); kv("Ink lot / batch", rec.inkLot); kv("Ink expiration", rec.inkExp);
      kv("Barrier / dressing used", rec.barrier);
      kv("Aftercare instructions provided", rec.aftercareProvided ? "Yes" : "No"); kv("Final procedure photograph taken", rec.finalPhoto ? "Yes" : "No");
      kv("Notes / complications", rec.complications);
      kv("Final payment collected", ses.paid !== "" && ses.paid != null ? `$${ses.paid}${ses.payMethod ? " (" + ses.payMethod + ")" : ""}` : "");
      if (cs.initials) {
        const iimg = await pdf.embedPng(cs.initials), iw = 70, ih = Math.min(34, iw * iimg.height / iimg.width);
        need(ih + 30); y -= 6; text("Artist initials:", { f: bold, size: 10, gap: 4 }); page.drawImage(iimg, { x: M, y: y - ih, width: iw, height: ih }); y -= ih + 4;
      }
    }

    const pages = pdf.getPages();
    pages.forEach((p, i) => p.drawText(clean(`${d.business} | ${d.tpl.docVersion ? d.tpl.docVersion + " | " : ""}Document ${d.docId} | Page ${i + 1} of ${pages.length}`),
      { x: M, y: 28, size: 8, font, color: GREY }));
    pdf.setTitle(`${d.business} consent - ${c.legalName}`); pdf.setProducer(d.business); pdf.setCreator(d.business);
    return pdf.save();
  }

  /* ---------- printable (wet-ink) contract: same wording, blank or pre-filled, with artist sections ---------- */
  async function buildPaperPdf(d) {
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
        let ln = "";
        for (const w of para.split(/\s+/)) { const t = ln ? ln + " " + w : w; if (f.widthOfTextAtSize(t, size) > width && ln) { out.push(ln); ln = w; } else ln = t; }
        out.push(ln);
      }
      return out;
    };
    const text = (txt, { f = font, size = 10, color = INK, indent = 0, gap = 3 } = {}) => {
      for (const l of wrap(txt, f, size, CW - indent)) { need(size + gap); page.drawText(l, { x: M + indent, y: y - size, size, font: f, color }); y -= size + gap; }
    };
    const heading = t => { need(40); y -= 10; text(t.toUpperCase(), { f: bold, size: 11, color: PINK }); page.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 0.6, color: PINK }); y -= 6; };
    const line = (label, value, short) => {
      need(24); const lw = bold.widthOfTextAtSize(clean(label), 10), x0 = M + lw + 6;
      page.drawText(clean(label), { x: M, y: y - 10, size: 10, font: bold });
      page.drawLine({ start: { x: x0, y: y - 12 }, end: { x: short ? x0 + 90 : W - M, y: y - 12 }, thickness: 0.5, color: GREY });
      if (value) page.drawText(clean(value), { x: x0 + 4, y: y - 9, size: 10, font });
      y -= 22;
    };
    const box = (x, top) => page.drawRectangle({ x, y: top - 9, width: 9, height: 9, borderColor: INK, borderWidth: 0.8 });
    const checkLine = (label, indent = 0) => {
      const ls = wrap(label, font, 9.5, CW - indent - 16); need(ls.length * 12 + 4); box(M + indent, y);
      ls.forEach((l, i) => page.drawText(l, { x: M + indent + 16, y: y - 9 - i * 12, size: 9.5, font })); y -= ls.length * 12 + 4;
    };
    const yesNo = label => {
      const ls = wrap(label, font, 9.5, CW - 120); need(ls.length * 12 + 6);
      ls.forEach((l, i) => page.drawText(l, { x: M, y: y - 9 - i * 12, size: 9.5, font }));
      const bx = W - M - 100; box(bx, y); page.drawText("Yes", { x: bx + 13, y: y - 9, size: 9.5, font }); box(bx + 52, y); page.drawText("No", { x: bx + 65, y: y - 9, size: 9.5, font });
      y -= ls.length * 12 + 6;
    };

    const sigImg = d.artistSig ? await pdf.embedPng(d.artistSig) : null, initImg = d.artistInit ? await pdf.embedPng(d.artistInit) : null;
    const stamp_ = (img, label, maxW, maxH, short) => {
      if (!img) return;
      const lw = bold.widthOfTextAtSize(clean(label), 10), x0 = M + lw + 10, k = Math.min(maxW / img.width, maxH / img.height);
      page.drawImage(img, { x: x0, y: y + 11, width: img.width * k, height: img.height * k });
    };
    newPage();
    page.drawRectangle({ x: 0, y: H - 14, width: W, height: 14, color: INK });
    page.drawRectangle({ x: 0, y: H - 18, width: W, height: 4, color: PINK });
    y -= 12;
    text(d.business.toUpperCase(), { f: bold, size: 22, gap: 6 });
    text(d.tpl.title, { f: bold, size: 14, gap: 4 });
    if (d.tpl.intro) text(d.tpl.intro, { size: 9.5, color: GREY, gap: 4 });
    heading("1. Client information");
    const c = d.client || {};
    line("Full legal name:", c.legalName); line("Date of birth:", c.dob); line("Phone number:", c.phone); line("Email address:", c.email); line("Address:", c.address);
    line("City / State / ZIP:", ""); line("Government ID type:", ""); line("Issuing state:", ""); line("ID expiration date:", "");
    yesNo("Age verified by artist");
    line("Tattoo artist:", d.artist || d.business); line("Procedure location:", ""); line("Date of procedure:", "");

    d.tpl.sections.forEach((sec, si) => {
      if (si === 0) return; // client information is drawn above
      heading(sec.heading);
      for (const l of (sec.body || [])) {
        if (l.startsWith("- ")) text("• " + l.slice(2), { size: 9.5, indent: 10, gap: 2 });
        else if (l.startsWith("# ")) text(l.slice(2), { f: bold, size: 10, gap: 2 });
        else text(l, { size: 9.5, gap: 3 });
      }
      for (const q of sec.questions) {
        if (q.type === "check") checkLine(q.label, 4);
        else if (q.type === "yesno") yesNo(q.label);
        else if (q.type === "choice") { text(q.label, { f: bold, size: 9.5, gap: 2 }); q.options.forEach(o => checkLine(o, 10)); }
        else line(q.label + ":", "");
      }
      if (sec.initials) line("Client initials:", "", true);
    });

    heading("Client signature");
    text(d.tpl.agreement.join(" "), { f: bold, size: 9.5, gap: 6 });
    line("Signature:", ""); line("Printed name:", c.legalName); line("Date:", ""); line("Time:", "");
    heading("Tattoo artist acknowledgment");
    text("I acknowledge that I reviewed the required client information, verified the client's age, addressed relevant safety concerns, obtained consent, and provided or arranged for appropriate aftercare instructions.", { size: 9.5, gap: 6 });
    line("Artist signature:", ""); stamp_(sigImg, "Artist signature:", 170, 34); line("Date:", "");
    heading("Artist use only - procedure record");
    for (const l of ["Stencil / design reference:", "Tattoo location:", "Procedure start time:", "Procedure end time:", "Needle / cartridge type:", "Needle / cartridge lot:",
      "Ink brand(s):", "Pigment / color(s):", "Ink lot / batch number(s):", "Ink expiration date(s):", "Barrier / dressing used:"]) line(l, "");
    yesNo("Aftercare instructions provided"); yesNo("Final procedure photograph taken");
    text("Additional notes / complications:", { f: bold, size: 10, gap: 4 }); line("", ""); line("", "");
    line("Final payment collected: $", ""); line("Artist initials:", "", true); stamp_(initImg, "Artist initials:", 70, 30, true);

    const pages = pdf.getPages();
    pages.forEach((p, i) => p.drawText(clean(`${d.business} | ${d.tpl.docVersion ? d.tpl.docVersion + " | " : ""}Page ${i + 1} of ${pages.length}`), { x: M, y: 28, size: 8, font, color: GREY }));
    pdf.setTitle(`${d.business} contract (print)`);
    return pdf.save();
  }
  async function printPaper(clientId) {
    const tpl = activeTemplate();
    const withSig = settings.printWithSignature !== false;
    const bytes = await buildPaperPdf({ business: settings.business, artist: settings.artistName, tpl, client: clientId ? DB.get(clientId) : null,
      artistSig: withSig ? settings.artistSignature : null, artistInit: withSig ? settings.artistInitials : null });
    window.open(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), "_blank");
  }

  /* ---------- signature pad ---------- */
  function sigPad(canvas, onChange, opts = {}) {
    const ctx = canvas.getContext("2d");
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    ctx.scale(dpr, dpr);
    const blank = () => { if (opts.transparent) ctx.clearRect(0, 0, r.width, r.height); else { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, r.width, r.height); } ctx.strokeStyle = "#000"; ctx.lineWidth = 3.2; ctx.lineCap = ctx.lineJoin = "round"; };
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
    <button class="small ghost" id="kStaff">Artist sign-in</button></header>${title ? `<h2 style="margin:0 0 12px">${esc(title)}</h2>` : ""}`;

  function start(clientId, sessionId) {
    const c = DB.get(clientId), tpl = activeTemplate();
    const age = ageOn(c.dob);
    if (age === null || age < settings.minAge) return { error: `Client is under the minimum age of ${settings.minAge} (or has no valid birth date).` };
    if (!tpl) return { error: "No consent template found." };
    K = { clientId, sessionId: sessionId || null, tpl, answers: {}, contact: { phone: c.phone || "", email: c.email || "", address: c.address || "", emergencyName: c.emergencyName || "", emergencyPhone: c.emergencyPhone || "" } };
    return {};
  }

  function startIntake(P, returning) {
    if (!P || !P.template) return { error: "The check-in form is not ready. Please ask staff." };
    K = { mode: "intake", client: {}, scan: null, frontPhoto: null, flashId: null, flashName: "", returning: !!returning, tpl: P.template, relayConfigured: !!P.relayConfigured, answers: {}, contact: {}, privacyAt: null };
    return {};
  }
  screens.kPrivacy = {
    html: () => `${kbar("Before you start")}
      <div class="card agree" style="max-height:none;font-size:22px"><p>${esc(privacyText())}</p></div>
      <label class="qrow check" style="border:0"><input type="checkbox" id="privOk"><span>I have read this privacy notice.</span></label>
      <div class="actions"><button class="primary" id="kNext" disabled>Continue</button></div>`,
    bind(root) {
      const b = $("#kNext", root);
      $("#privOk", root).onchange = e => { b.disabled = !e.target.checked; };
      b.onclick = () => { K.privacyAt = new Date().toISOString(); go(K.mode === "intake" ? "iInfo" : "kReview"); };
    }
  };

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

  const bodyHtml = lines => {
    let out = "", ul = false;
    for (const l of lines) {
      if (l.startsWith("- ")) { if (!ul) { out += "<ul>"; ul = true; } out += `<li>${esc(l.slice(2))}</li>`; continue; }
      if (ul) { out += "</ul>"; ul = false; }
      out += l.startsWith("# ") ? `<h4>${esc(l.slice(2))}</h4>` : `<p>${esc(l)}</p>`;
    }
    return out + (ul ? "</ul>" : "");
  };
  const qHtml = q => {
    const a = K.answers[q.id] || {};
    if (q.type === "check") return `<label class="qrow check"><input type="checkbox" data-q="${q.id}" ${a.v ? "checked" : ""}><span>${esc(q.label)}</span></label>`;
    if (q.type === "yesno") return `<div class="qrow"><div class="ql">${esc(q.label)}${q.required ? " *" : ""}</div>
      <div class="yn" data-q="${q.id}"><button data-v="yes" class="${a.v === "yes" ? "primary" : ""}">Yes</button><button data-v="no" class="${a.v === "no" ? "primary" : ""}">No</button></div>
      ${q.detail ? `<input data-d="${q.id}" placeholder="${esc(q.detail)}" value="${esc(a.d)}" style="margin-top:10px;${a.v === "yes" ? "" : "display:none"}">` : ""}</div>`;
    if (q.type === "choice") return `<div class="qrow"><div class="ql">${esc(q.label)}${q.required ? " *" : ""}</div><div class="choice" data-c="${q.id}">
      ${q.options.map((o, i) => `<button data-opt="${i}" class="${a.v === o ? "primary" : ""}">${esc(o)}</button>`).join("")}</div></div>`;
    return `<div class="qrow"><div class="ql">${esc(q.label)}</div><input data-t="${q.id}" value="${esc(a.v)}"></div>`;
  };
  screens.kQuestions = {
    html: () => `${kbar(K.tpl.title)}${K.tpl.intro ? `<p class="mute">${esc(K.tpl.intro)}</p>` : ""}
      ${K.tpl.sections.map((s, si) => `<div class="card sec" data-si="${si}"><strong>${esc(s.heading)}</strong>
        ${si === 0 ? `<div class="secbody"><p><b>Tattoo artist:</b> ${esc(settings.artistName)}</p></div>` : ""}
        ${s.body && s.body.length ? `<div class="secbody">${bodyHtml(s.body)}</div>` : ""}
        ${s.questions.map(qHtml).join("")}
        ${s.questions.filter(q => q.type === "check").length > 1 ? `<button class="small ghost" data-all="${si}" style="margin-top:8px">Tick all in this section</button>` : ""}
        ${s.initials ? `<div class="qrow"><div class="ql">Your initials *</div><input data-i="${si}" maxlength="4" autocapitalize="characters" value="${esc((K.answers["init:" + si] || {}).v)}" style="width:180px;text-transform:uppercase"></div>` : ""}</div>`).join("")}
      <div id="kErr"></div><div class="actions"><button class="ghost" data-go="${K.mode === "intake" ? "iInfo" : "kReview"}">‹ Back</button><button class="primary" id="kNext">Continue</button></div>`,
    bind(root) {
      root.addEventListener("click", e => {
        const b = e.target.closest(".yn button");
        if (b) {
          const id = b.parentElement.dataset.q; K.answers[id] = { ...(K.answers[id] || {}), v: b.dataset.v };
          b.parentElement.querySelectorAll("button").forEach(x => x.classList.toggle("primary", x === b));
          const d = root.querySelector(`[data-d="${id}"]`); if (d) d.style.display = b.dataset.v === "yes" ? "" : "none";
          return;
        }
        const o = e.target.closest(".choice button");
        if (o) {
          const id = o.parentElement.dataset.c, q = K.tpl.sections.flatMap(s => s.questions).find(x => x.id === id);
          K.answers[id] = { v: q.options[+o.dataset.opt] };
          o.parentElement.querySelectorAll("button").forEach(x => x.classList.toggle("primary", x === o));
          return;
        }
        const all = e.target.closest("[data-all]");
        if (all) root.querySelectorAll(`.sec[data-si="${all.dataset.all}"] input[type=checkbox]`).forEach(c => { c.checked = true; K.answers[c.dataset.q] = { v: true }; });
      });
      root.addEventListener("change", e => { const q = e.target.dataset.q; if (q && e.target.type === "checkbox") K.answers[q] = { v: e.target.checked }; });
      root.addEventListener("input", e => {
        if (e.target.dataset.d) K.answers[e.target.dataset.d] = { ...(K.answers[e.target.dataset.d] || {}), d: e.target.value };
        if (e.target.dataset.t) K.answers[e.target.dataset.t] = { v: e.target.value };
        if (e.target.dataset.i) K.answers["init:" + e.target.dataset.i] = { v: e.target.value.toUpperCase().trim() };
      });
      $("#kNext", root).onclick = () => {
        const errs = new Set();
        K.tpl.sections.forEach((s, si) => {
          for (const q of s.questions) {
            const a = K.answers[q.id] || {};
            if (q.required && !a.v) errs.add(q.type === "check" ? "Please tick every box in every section." : "Please answer every required question.");
            if (q.mustBe && a.v && a.v !== q.mustBe) errs.add("Please speak with the artist before continuing.");
            if (q.detail && a.v === "yes" && !(a.d || "").trim()) errs.add("Please add details where you answered Yes.");
          }
          if (s.initials && !((K.answers["init:" + si] || {}).v || "").trim()) errs.add("Please add your initials in each section that asks for them.");
        });
        if (errs.size) { $("#kErr", root).innerHTML = `<div class="banner bad">${[...errs].map(esc).join("<br>")}</div>`; return; }
        go("kSign");
      };
    }
  };

  const emailNotice = () => {
    const em = K.mode === "intake" ? (K.client || {}).email : (K.contact || {}).email;
    const relay = K.mode === "intake" ? K.relayConfigured : Mailer.configured(Mailer.relayFromSettings());
    return em && relay ? `<div class="banner ok" style="font-weight:400">A copy of this signed agreement will be emailed to <b>${esc(em)}</b>. If you do not see it soon, please check your junk or spam folder.</div>`
      : `<div class="banner warn" style="font-weight:400">${em && !relay ? "Ask the artist for a copy." : "You did not give an email address, so no copy will be emailed. Please ask the artist for a copy."}</div>`;
  };
  screens.kSign = {
    html: () => `${kbar("Read and sign")}
      <div class="card agree">${K.tpl.agreement.map(p => `<p>${esc(p)}</p>`).join("")}</div>
      ${emailNotice()}
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
        try { const docId = K.mode === "intake" ? await finishIntake(pad.data()) : await finish(pad.data()); go("kDone", { id: docId }); }
        catch (e) { $("#kErr", root).innerHTML = `<div class="banner bad">Could not save: ${esc(e.message)}. Please tell the artist.</div>`; submit.disabled = false; submit.textContent = "Agree and submit"; }
      };
    }
  };

  /* Intake side: build the PDF and consent entirely from what the client typed, then SEAL it. Nothing is read from the store. */
  async function finishIntake(signature) {
    const now = new Date().toISOString(), c = K.client, docId = crypto.randomUUID(), sessId = crypto.randomUUID();
    const ageAtSigning = ageOn(c.dob);
    const idCheck = K.scan ? { at: now, method: "pdf417-barcode", idState: K.scan.idState, idExpiry: K.scan.idExpiry, idExpired: K.scan.idExpired,
      calculatedAge: ageAtSigning, minAge: settings.minAge, visuallyMatched: false, authenticityChecked: false } : null;
    const privacy = { text: privacyText(), at: K.privacyAt || now };
    const session = { id: sessId, createdAt: now, flashId: K.flashId, flashName: K.flashName };
    const bytes = await buildPdf({ business: settings.business, minAge: settings.minAge, client: c, session, tpl: K.tpl, answers: K.answers,
      signature, signedAt: now, docId, ageAtSigning, idCheck, privacy, artist: settings.artistName });
    const sha256 = hex(await crypto.subtle.digest("SHA-256", bytes));
    await DB.seal({ v: 1, submittedAt: now, returning: K.returning, client: c, idCheck, idPhoto: K.frontPhoto, session,
      consent: { id: docId, signedAt: now, template: K.tpl, answers: K.answers, signature, idCheck, ageAtSigning, privacy, pdf: bytesToB64(bytes), sha256 } });
    return docId;
  }

  async function finish(signature) {
    const now = new Date().toISOString();
    const base = DB.get(K.clientId);
    const client = { ...base, ...K.contact, updatedAt: now, visits: [...(base.visits || []), now] };
    const existing = K.sessionId && DB.get(K.sessionId);
    const session = existing ? { ...existing } : { type: "session", id: crypto.randomUUID(), clientId: client.id, createdAt: now, tattoo: {}, segments: [], price: "", deposit: "", paid: "", payMethod: "", notes: "", flashId: null, flashName: "" };
    if (!["inprogress", "completed"].includes(session.status)) session.status = "ready";
    const docId = crypto.randomUUID();
    const ageAtSigning = ageOn(client.dob);
    const idCheck = (client.idChecks || []).slice(-1)[0] || null;
    const bytes = await buildPdf({ business: settings.business, minAge: settings.minAge, client, session, tpl: K.tpl, answers: K.answers,
      signature, signedAt: now, docId, ageAtSigning, idCheck, privacy: { text: privacyText(), at: K.privacyAt || now }, artist: settings.artistName });
    const hash = hex(await crypto.subtle.digest("SHA-256", bytes));
    const record = {
      type: "consent", id: docId, locked: true, clientId: client.id, sessionId: session.id, signedAt: now,
      clientSnapshot: { id: client.id, legalName: client.legalName, dob: client.dob, phone: client.phone, email: client.email, address: client.address },
      template: K.tpl, answers: K.answers, signature, idCheck, ageAtSigning, privacy: { text: privacyText(), at: K.privacyAt || now },
      pdf: bytesToB64(bytes), sha256: hash, emailStatus: "not-sent"
    };
    session.consentId = docId; session.updatedAt = now;
    await DB.put(session); await DB.put(record); await DB.put(client);
    if (client.email && Mailer.configured(Mailer.relayFromSettings())) Mailer.send(record).catch(() => {});
    return docId;
  }

  screens.kDone = {
    html: () => `${kbar("")}<div class="pin" style="max-width:520px"><h1>Thank you!</h1>
      <p class="mute">Your paperwork is complete. Please hand the iPad back to your artist.</p>
      ${K ? emailNotice() : ""}</div>`,
    bind() { const intake = K && K.mode === "intake"; K = null; setTimeout(() => { if (cur.name === "kDone") (intake ? go("iWelcome") : lock()); }, 6000); }
  };

  /* ---------- documents (admin) ---------- */
  const docs = () => DB.all("consent").sort((a, b) => b.signedAt.localeCompare(a.signedAt));
  const statusText = d => d.emailStatus || "not-sent";
  const statusRows = () => docs().map(d => `<div>${esc(d.clientSnapshot.legalName)}: ${esc(statusText(d))}</div>`).join("");
  const docRow = d => `<div class="row" data-go="doc" data-id="${esc(d.id)}"><div class="grow"><div>${esc(d.clientSnapshot.legalName)}</div>
    <div class="sub">${esc(stamp(d.signedAt))} · ${esc(d.template.title)} v${d.template.version}</div></div><div class="mute">›</div></div>`;
  const blobUrl = d => URL.createObjectURL(new Blob([b64ToBytes(d.pdf)], { type: "application/pdf" }));
  const fileName = d => `${(d.clientSnapshot.legalName || "client").replace(/[^a-z0-9]+/gi, "-")}-consent-${d.signedAt.slice(0, 10)}.pdf`;

  screens.documents = {
    html: () => `${bar("Documents", { back: "home" })}<div class="card">${docs().map(docRow).join("") || '<span class="mute">No signed documents yet.</span>'}</div>
      <div class="card"><strong>Email status</strong>${statusRows()}</div>
      <div class="card mute">Open a document to view, print, share, or send its PDF.</div>`
  };
  async function countersign(consentId) {
    const d = DB.get(consentId);
    if (!d) throw new Error("Contract not found");
    if (DB.get("cs-" + consentId)) throw new Error("This contract is already countersigned");
    if (!settings.artistSignature) throw new Error("Save your signature in Settings first");
    const session = DB.get(d.sessionId) || {}, cl = DB.get(d.clientId) || {};
    const now = new Date().toISOString();
    const idCheck = (cl.idChecks || []).slice(-1)[0] || d.idCheck;
    const bytes = await buildPdf({ business: settings.business, minAge: settings.minAge, client: { ...d.clientSnapshot },
      session: { id: d.sessionId, createdAt: session.createdAt || d.signedAt, flashName: session.flashName || "" }, tpl: d.template, answers: d.answers,
      signature: d.signature, signedAt: d.signedAt, docId: d.id, ageAtSigning: d.ageAtSigning, idCheck, privacy: d.privacy, artist: settings.artistName,
      counter: { signature: settings.artistSignature, initials: settings.artistInitials, at: now, record: session.record, session } });
    const sha256 = hex(await crypto.subtle.digest("SHA-256", bytes));
    const record = { type: "countersign", id: "cs-" + consentId, locked: true, consentId, clientId: d.clientId, sessionId: d.sessionId, signedAt: now,
      clientSnapshot: { ...d.clientSnapshot, email: cl.email || d.clientSnapshot.email }, pdf: bytesToB64(bytes), sha256, emailStatus: "not-sent" };
    await DB.put(record);
    if (cl.email && Mailer.configured(Mailer.relayFromSettings())) Mailer.send(record).catch(() => {});
  }

  function wirePdf(root, rec, ids, name) {
    $(ids.view, root).onclick = () => { window.open(blobUrl(rec), "_blank"); };
    $(ids.save, root).onclick = async () => {
      const file = new File([b64ToBytes(rec.pdf)], name, { type: "application/pdf" });
      try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; } } catch (_) { return; }
      const a = document.createElement("a"); a.href = blobUrl(rec); a.download = name; a.click();
    };
    $(ids.verify, root).onclick = async () => {
      const h = hex(await crypto.subtle.digest("SHA-256", b64ToBytes(rec.pdf)));
      $(ids.msg, root).innerHTML = h === rec.sha256 ? `<div class="banner ok">Intact. The PDF matches the fingerprint recorded when it was signed.</div>`
        : `<div class="banner bad">Mismatch. This PDF does not match its recorded fingerprint.</div>`;
    };
  }

  screens.doc = {
    html({ id }) {
      const d = DB.get(id);
      if (!d) return `${bar("Document", { back: "documents" })}<div class="banner bad">Not found.</div>`;
      const cs = DB.get("cs-" + id);
      return `${bar(esc(d.clientSnapshot.legalName), { back: "documents" })}<div class="card"><strong>Signed by the client</strong><dl class="kv" style="margin-top:8px">
        <dt>Signed</dt><dd>${esc(stamp(d.signedAt))}</dd><dt>Form</dt><dd>${esc(d.template.title)} v${d.template.version}</dd>
        <dt>Document ID</dt><dd>${esc(d.id)}</dd><dt>SHA-256</dt><dd style="font-size:13px">${esc(d.sha256)}</dd><dt>Email</dt><dd>${esc(statusText(d))}${d.emailError ? " — " + esc(d.emailError) : ""}</dd></dl>
        <label for="emailTo">Send to</label><input id="emailTo" type="email" value="${esc(d.clientSnapshot.email || "")}" autocomplete="off">
        <div class="actions"><button class="primary" id="sendEmail">Send / Resend</button></div><div id="emailMsg"></div>
        <div class="actions"><button class="primary" id="dView">View / Print</button><button id="dSave">Download / Share</button><button id="dVerify">Verify integrity</button></div>
        <div id="dMsg" style="margin-top:12px"></div></div>
        <div class="card"><strong>Artist countersignature</strong>
        ${cs ? `<dl class="kv" style="margin-top:8px"><dt>Countersigned</dt><dd>${esc(stamp(cs.signedAt))}</dd><dt>SHA-256</dt><dd style="font-size:13px">${esc(cs.sha256)}</dd></dl>
          <div class="actions"><button class="primary" id="cView">View / Print final contract</button><button id="cSave">Download / Share</button><button id="cVerify">Verify integrity</button></div><div id="cMsg" style="margin-top:12px"></div>`
        : `<p class="mute" style="font-size:16px">Adds your saved signature and initials, plus the procedure record from the session, to a final copy of this contract. The client's signed original stays unchanged.</p>
          <div class="actions"><button class="primary" id="cSign">Countersign this contract</button></div><div id="cMsg" style="margin-top:12px"></div>`}</div>
        <div class="card mute">These are locked records. They cannot be edited. If something was wrong, have the client sign a new form.</div>`;
    },
    bind(root, { id }) {
      const d = DB.get(id); if (!d) return;
      $("#sendEmail", root).onclick = async () => {
        const msg = $("#emailMsg", root);
        try { await Mailer.send(d, $("#emailTo", root).value); go("doc", { id }); }
        catch (e) { msg.innerHTML = `<div class="banner warn">${esc(e.message)}${!navigator.onLine ? " It will retry when this device is online." : ""}</div>`; }
      };
      wirePdf(root, d, { view: "#dView", save: "#dSave", verify: "#dVerify", msg: "#dMsg" }, fileName(d));
      const cs = DB.get("cs-" + id);
      if (cs) wirePdf(root, cs, { view: "#cView", save: "#cSave", verify: "#cVerify", msg: "#cMsg" }, fileName(d).replace(".pdf", "-countersigned.pdf"));
      else $("#cSign", root).onclick = async () => {
        if (!settings.artistSignature) { $("#cMsg", root).innerHTML = `<div class="banner warn">Save your signature first: Settings, then Artist signature and initials.</div>`; return; }
        if (!confirm("Countersign this contract with your saved signature? It confirms you reviewed the client information, verified age, addressed safety concerns, obtained consent, and provided aftercare.")) return;
        try { await countersign(id); go("doc", { id }); } catch (e) { $("#cMsg", root).innerHTML = `<div class="banner bad">${esc(e.message)}</div>`; }
      };
    }
  };

  document.addEventListener("click", e => { if (e.target.closest("#kStaff")) { K = null; DB.isUnlocked() ? lock() : showPin("unlock"); } });
  return { sigPad, countersign, printPaper, K: () => K, startIntake, buildPdf, privacyText, init, start, docs, fileName, blobUrl, stamp, activeTemplate, defaultPrivacy: DEFAULT_PRIVACY };
})();
