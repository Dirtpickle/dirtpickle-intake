"use strict";
/* Printable wet-ink contract. Digital consent data is optional and never fills wet-ink signatures. */
const ConsentPaper = (() => {
  const clean = value => String(value ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7e\xa0-\xff\u2022]/g, "?");
  const layout = (pdf, font, bold) => {
    const { rgb } = PDFLib;
    const W = 612, H = 792, M = 54, CW = W - 2 * M;
    let page, y;
    const colors = { ink: rgb(0, 0, 0), pink: rgb(1, 0.176, 0.561), grey: rgb(0.4, 0.4, 0.4) };
    const wrap = (value, f, size, width) => {
      const lines = [];
      for (const para of clean(value).split("\n")) {
        let line = "";
        for (const word of para.split(/\s+/)) {
          const next = line ? `${line} ${word}` : word;
          if (f.widthOfTextAtSize(next, size) > width && line) { lines.push(line); line = word; } else line = next;
        }
        lines.push(line);
      }
      return lines;
    };
    const newPage = () => { page = pdf.addPage([W, H]); y = H - M; };
    const need = height => { if (y - height < M + 30) newPage(); };
    const text = (value, opts = {}) => {
      const f = opts.f || font, size = opts.size || 10, color = opts.color || colors.ink;
      for (const line of wrap(value, f, size, CW - (opts.indent || 0))) {
        need(size + (opts.gap ?? 3));
        page.drawText(line, { x: M + (opts.indent || 0), y: y - size, size, font: f, color });
        y -= size + (opts.gap ?? 3);
      }
    };
    const heading = value => { need(40); y -= 10; text(value.toUpperCase(), { f: bold, size: 11, color: colors.pink }); page.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 0.6, color: colors.pink }); y -= 6; };
    const line = (label = "", value = "", short = false, image = null) => {
      need(24);
      const labelWidth = bold.widthOfTextAtSize(label, 10), x = M + labelWidth + 6;
      page.drawText(clean(label), { x: M, y: y - 10, size: 10, font: bold });
      page.drawLine({ start: { x, y: y - 12 }, end: { x: short ? x + 90 : W - M, y: y - 12 }, thickness: 0.5, color: colors.grey });
      if (value) page.drawText(clean(value), { x: x + 4, y: y - 9, size: 10, font });
      if (image) page.drawImage(image, { x: x + 4, y: y - 5, width: Math.min(86, image.width), height: Math.min(18, image.height) });
      y -= 22;
    };
    const box = (x, top, marked = false) => {
      page.drawRectangle({ x, y: top - 9, width: 9, height: 9, borderColor: colors.ink, borderWidth: 0.8 });
      if (marked) { page.drawLine({ start: { x: x + 1, y: top - 5 }, end: { x: x + 4, y: top - 8 }, thickness: 1.2, color: colors.ink }); page.drawLine({ start: { x: x + 4, y: top - 8 }, end: { x: x + 8, y: top - 1 }, thickness: 1.2, color: colors.ink }); }
    };
    const checkLine = (label, indent = 0, marked = false) => {
      const lines = wrap(label, font, 9.5, CW - indent - 16); need(lines.length * 12 + 4); box(M + indent, y, marked);
      lines.forEach((item, index) => page.drawText(item, { x: M + indent + 16, y: y - 9 - index * 12, size: 9.5, font })); y -= lines.length * 12 + 4;
    };
    const yesNo = (label, value) => {
      const lines = wrap(label, font, 9.5, CW - 120); need(lines.length * 12 + 6);
      lines.forEach((item, index) => page.drawText(item, { x: M, y: y - 9 - index * 12, size: 9.5, font }));
      const x = W - M - 100; box(x, y, value === "yes"); page.drawText("Yes", { x: x + 13, y: y - 9, size: 9.5, font });
      box(x + 52, y, value === "no"); page.drawText("No", { x: x + 65, y: y - 9, size: 9.5, font }); y -= lines.length * 12 + 6;
    };
    return { pdf, W, H, M, font, bold, colors, newPage, need, text, heading, line, box, checkLine, yesNo, wrap, page: () => page, y: () => y, setY: value => { y = value; } };
  };

  const answer = (d, id) => (d.prefill && d.prefill.answers && d.prefill.answers[id]) || {};
  const drawHeader = (ui, d) => {
    const { page, H, W, M, colors, bold } = ui;
    page().drawRectangle({ x: 0, y: H - 14, width: W, height: 14, color: colors.ink });
    page().drawRectangle({ x: 0, y: H - 18, width: W, height: 4, color: colors.pink });
    ui.setY(ui.y() - 12); ui.text(d.business.toUpperCase(), { f: bold, size: 22, gap: 6 }); ui.text(d.tpl.title, { f: bold, size: 14, gap: 4 });
    if (d.tpl.intro) ui.text(d.tpl.intro, { size: 9.5, color: colors.grey, gap: 4 });
    if (d.prefill) ui.text(`Pre-filled from digital consent signed ${d.prefill.signedAtText}`, { size: 8.5, color: colors.grey, gap: 4 });
  };
  const drawClient = (ui, d) => {
    ui.heading("1. Client information"); const c = d.client || {};
    ui.line("Full legal name:", c.legalName); ui.line("Date of birth:", c.dob); ui.line("Phone number:", c.phone); ui.line("Email address:", c.email); ui.line("Address:", c.address);
    ui.line("City / State / ZIP:"); ui.line("Government ID type:"); ui.line("Issuing state:"); ui.line("ID expiration date:"); ui.yesNo("Age verified by artist");
    ui.line("Tattoo artist:", d.artist || d.business); ui.line("Procedure location:"); ui.line("Date of procedure:");
  };
  const drawQuestion = (ui, d, q) => {
    const a = answer(d, q.id);
    if (q.type === "check") return ui.checkLine(q.label, 4, !!a.v);
    if (q.type === "yesno") return ui.yesNo(q.label, a.v);
    if (q.type === "choice") { ui.text(q.label, { f: ui.bold, size: 9.5, gap: 2 }); return q.options.forEach(option => ui.checkLine(option, 10, a.v === option)); }
    ui.line(`${q.label}:`, a.v || "");
  };
  const drawSections = async (ui, d) => { for (const [si, section] of d.tpl.sections.entries()) {
    if (si === 0) return;
    ui.heading(section.heading);
    (section.body || []).forEach(line => { if (line.startsWith("- ")) ui.text("• " + line.slice(2), { size: 9.5, indent: 10, gap: 2 }); else if (line.startsWith("# ")) ui.text(line.slice(2), { f: ui.bold, size: 10, gap: 2 }); else ui.text(line, { size: 9.5, gap: 3 }); });
    section.questions.forEach(q => drawQuestion(ui, d, q));
    if (section.initials) {
      const initials = answer(d, "init:" + si);
      const image = initials.img ? await ui.pdf.embedPng(initials.img) : null;
      ui.line("Client initials:", initials.v || "", true, image);
    }
  } };
  const drawArtistBlocks = (ui, d, artistSig, artistInit) => {
    ui.heading("Tattoo artist acknowledgment");
    ui.text("I acknowledge that I reviewed the required client information, verified the client's age, addressed relevant safety concerns, obtained consent, and provided or arranged for appropriate aftercare instructions.", { size: 9.5, gap: 6 });
    ui.line("Artist signature:"); if (artistSig) ui.page().drawImage(artistSig, { x: ui.M + 100, y: ui.y() + 11, width: Math.min(170, artistSig.width), height: Math.min(34, artistSig.height) }); ui.line("Date:");
    ui.heading("Artist use only - procedure record");
    ["Stencil / design reference:", "Tattoo location:", "Procedure start time:", "Procedure end time:", "Needle / cartridge type:", "Needle / cartridge lot:", "Ink brand(s):", "Pigment / color(s):", "Ink lot / batch number(s):", "Ink expiration date(s):", "Barrier / dressing used:"].forEach(label => ui.line(label));
    ui.yesNo("Aftercare instructions provided"); ui.yesNo("Final procedure photograph taken"); ui.text("Additional notes / complications:", { f: ui.bold, size: 10, gap: 4 }); ui.line(); ui.line(); ui.line("Final payment collected: $"); ui.line("Artist initials:", "");
    if (artistInit) ui.page().drawImage(artistInit, { x: ui.M + 100, y: ui.y() + 11, width: Math.min(70, artistInit.width), height: Math.min(30, artistInit.height) });
  };
  const drawFooter = (ui, d, pdf) => { const pages = pdf.getPages(); pages.forEach((p, i) => p.drawText(clean(`${d.business} | ${d.tpl.docVersion ? d.tpl.docVersion + " | " : ""}Page ${i + 1} of ${pages.length}`), { x: ui.M, y: 28, size: 8, font: ui.font, color: ui.colors.grey })); };

  async function buildPaperPdf(d) {
    const { PDFDocument, StandardFonts } = PDFLib; const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold); const ui = layout(pdf, font, bold);
    const artistSig = d.artistSig ? await pdf.embedPng(d.artistSig) : null, artistInit = d.artistInit ? await pdf.embedPng(d.artistInit) : null;
    ui.newPage(); drawHeader(ui, d); drawClient(ui, d); await drawSections(ui, d);
    ui.heading("Client signature"); ui.text(d.tpl.agreement.join(" "), { f: bold, size: 9.5, gap: 6 }); const c = d.client || {};
    ui.line("Signature:"); ui.line("Printed name:", c.legalName); ui.line("Date:"); ui.line("Time:"); drawArtistBlocks(ui, d, artistSig, artistInit);
    drawFooter(ui, d, pdf); pdf.setTitle(`${d.business} contract (print)${d.prefill && d.client.legalName ? " - " + d.client.legalName : ""}`); pdf.setSubject(d.prefill ? "Pre-filled from digital consent" : "Blank wet-ink contract"); return pdf.save();
  }
  return { buildPaperPdf };
})();
