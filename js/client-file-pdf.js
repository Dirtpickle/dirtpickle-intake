"use strict";

/* Async client-file PDF builder. Generated pages precede the locked signed PDFs. */
const ClientFilePdf = (() => {
  const clean = s => String(s ?? "").replace(/[^\x20-\x7e\xa0-\xff\u2022]/g, "?");
  const b64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
  const stamp = value => value ? new Date(value).toLocaleDateString() : "";

  async function image(pdf, data) {
    if (!data) return null;
    try { return data.startsWith("data:image/png") ? await pdf.embedPng(data) : await pdf.embedJpg(data); } catch (_) { return null; }
  }
  function drawImage(layout, img, maxW = 220, maxH = 130) {
    if (!img) return;
    const ratio = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * ratio, h = img.height * ratio, { page, y } = layout.current();
    page.drawImage(img, { x: layout.M, y: y - h, width: w, height: h });
    layout.text("", { size: h, gap: 0 });
  }
  function addKeyValues(layout, pairs) { for (const [k, v] of pairs) if (v !== undefined && v !== null && v !== "") layout.text(`${k}: ${v}`); }

  async function build(data, opts = {}) {
    const pdf = await PDFLib.PDFDocument.create(), layout = PdfLayout.create(pdf);
    const fonts = await layout.fontPromise; layout.setFonts(fonts); layout.start();
    const c = data.client, business = opts.business || (typeof settings !== "undefined" ? settings.business : "Dirtpickle");
    layout.text(business.toUpperCase(), { bold: true, size: 20, gap: 5 });
    layout.text("Client File", { bold: true, size: 15, gap: 3 });
    layout.text(`${c.legalName || "Client"} · Generated ${new Date().toLocaleDateString()}`, { size: 9, color: PDFLib.rgb(0.4, 0.4, 0.4) });
    layout.heading("Client details");
    addKeyValues(layout, [["Legal name", c.legalName], ["Preferred name", c.preferredName], ["Date of birth", c.dob], ["Phone", c.phone], ["Email", c.email], ["Address", c.address], ["Emergency contact", [c.emergencyName, c.emergencyPhone].filter(Boolean).join(" · ")], ["ID on file", c.licenseNumber ? "yes (license), last 4 not shown" : "no"], ["First registered", stamp(c.createdAt)], ["Visit dates", (c.visits || []).map(stamp).join(", ")], ["Notes", c.notes]]);
    layout.heading("ID & verification");
    layout.text(`ID photo on file: ${data.idPhotos.length ? "yes" : "no"}`);
    for (const check of data.idChecks) layout.text(`${stamp(check.at)} · ${check.method || "unknown method"} · ${check.result || "unknown result"} · visually matched: ${check.visuallyMatched ? "yes" : "no"}${check.overrideReason ? ` · override: ${check.overrideReason}` : ""}${check.who ? ` · ${check.who}` : ""}`);
    if (!data.idChecks.length) layout.text("No ID checks recorded.");
    if (opts.includeIdPhoto && data.idPhotos[0]) { layout.text("ID photo (included by artist choice):", { bold: true }); drawImage(layout, await image(pdf, data.idPhotos[0].image)); }
    layout.heading("Sessions");
    const wanted = opts.sessionFilter ? data.sessions.filter(s => s.createdAt >= opts.sessionFilter.from && s.createdAt <= opts.sessionFilter.to) : data.sessions;
    for (const s of wanted) {
      const t = s.tattoo || {}, r = s.record || {};
      layout.text(`${stamp(s.createdAt)}${s.status ? ` · ${s.status}` : ""}`, { bold: true });
      addKeyValues(layout, [["Flash", s.flashName || s.flashCode], ["Tattoo", t.description], ["Location", t.location], ["Size", t.size], ["Price", s.price === "" ? "" : `$${s.price}`], ["Deposit", s.deposit === "" ? "" : `$${s.deposit}`], ["Paid", s.paid === "" ? "" : `$${s.paid}${s.payMethod ? ` (${s.payMethod})` : ""}`], ["Tattoo time", typeof SessionTime === "undefined" ? "" : SessionTime.format(SessionTime.duration(s))], ["Procedure", [r.needleType, r.needleLot, r.barrier, r.inkBrand, r.pigment, r.inkLot, r.inkExp].filter(Boolean).join(" · ")], ["Aftercare given", r.aftercareProvided ? "yes" : "no"], ["Notes", s.notes], ["Consent", s.consentId ? "signed" : "none"], ["Photo count", data.photos.filter(p => p.sessionId === s.id).length]]);
      layout.rule();
    }
    layout.heading("Photos");
    const photos = opts.includeTattooPhotos === false ? [] : data.photos;
    layout.text(`Photo count included: ${photos.length}`);
    for (const p of photos) { layout.text(`${p.kind || "Photo"} · ${stamp(p.createdAt)}${p.note ? ` · ${p.note}` : ""}`, { bold: true }); drawImage(layout, await image(pdf, p.image), 180, 105); }
    const generatedPages = layout.pages.slice();
    const contracts = opts.includeContracts === false ? [] : data.consents.filter(d => d.pdf);
    for (const contract of contracts) { const source = await PDFLib.PDFDocument.load(b64(contract.pdf)); const copied = await pdf.copyPages(source, source.getPageIndices()); copied.forEach(page => pdf.addPage(page)); }
    const total = pdf.getPageCount();
    generatedPages.forEach((page, i) => page.drawText(clean(`${business} | Confidential - contains personal information | Page ${i + 1} of ${total}`), { x: layout.M, y: 28, size: 8, font: fonts[0], color: PDFLib.rgb(0.4, 0.4, 0.4) }));
    return { bytes: await pdf.save(), generatedPages: generatedPages.length, appendedPages: total - generatedPages.length, includedIdPhoto: !!opts.includeIdPhoto && !!data.idPhotos[0], includedTattooPhotos: photos.length };
  }
  return { build, buildPdf: build };
})();
