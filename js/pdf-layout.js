"use strict";

/* Small PDF layout primitives shared by the client-file PDF. */
const PdfLayout = (() => {
  const W = 612, H = 792, M = 54;
  function create(pdf) {
    const fontPromise = Promise.all([pdf.embedFont(PDFLib.StandardFonts.Helvetica), pdf.embedFont(PDFLib.StandardFonts.HelveticaBold)]);
    let page, y, font, bold;
    const pages = [];
    const start = () => { page = pdf.addPage([W, H]); pages.push(page); y = H - M; };
    const wrap = (text, f, size, width) => {
      const out = [];
      for (const paragraph of String(text ?? "").split("\n")) {
        let line = "";
        for (const word of paragraph.split(/\s+/)) {
          const candidate = line ? `${line} ${word}` : word;
          if (line && f.widthOfTextAtSize(candidate, size) > width) { out.push(line); line = word; } else line = candidate;
        }
        out.push(line);
      }
      return out;
    };
    const ensure = height => { if (y - height < M + 34) start(); };
    const text = (raw, opts = {}) => {
      const f = opts.bold ? bold : font, size = opts.size || 10, gap = opts.gap ?? 3;
      for (const line of wrap(raw, f, size, W - 2 * M - (opts.indent || 0))) { ensure(size + gap); page.drawText(line, { x: M + (opts.indent || 0), y: y - size, size, font: f, color: opts.color || PDFLib.rgb(0, 0, 0) }); y -= size + gap; }
    };
    const heading = title => { ensure(34); y -= 6; text(title.toUpperCase(), { bold: true, size: 11, color: PDFLib.rgb(0.72, 0.05, 0.3), gap: 3 }); page.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 0.6, color: PDFLib.rgb(0.72, 0.05, 0.3) }); y -= 5; };
    const rule = () => { ensure(12); page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.35, color: PDFLib.rgb(0.75, 0.75, 0.75) }); y -= 8; };
    return { W, H, M, pages, fontPromise, start, text, heading, rule, current: () => ({ page, y }), setFonts: values => { [font, bold] = values; } };
  }
  return { create };
})();
