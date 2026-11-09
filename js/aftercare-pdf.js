"use strict";

const AftercarePdf = (() => {
  const b64 = bytes => { let text = ""; for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(text); };
  const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(b => b.toString(16).padStart(2, "0")).join("");

  function lines(text, max) {
    const out = [];
    for (const paragraph of text.split(/\n\s*\n/)) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      let line = "";
      for (const word of words) {
        if ((line + " " + word).trim().length > max && line) { out.push(line); line = word; }
        else line = (line + " " + word).trim();
      }
      if (line) out.push(line);
      out.push("");
    }
    return out;
  }

  async function build(data) {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    page.drawText("Dirtpickle", { x: 54, y: 738, size: 20, font: bold, color: rgb(0, 0, 0) });
    page.drawText(data.title, { x: 54, y: 700, size: 16, font: bold });
    page.drawText(`Version ${data.version} | ${data.clientName} | ${data.createdAt.slice(0, 10)}`, { x: 54, y: 678, size: 9, font, color: rgb(.4, .4, .4) });
    let y = 642;
    for (const line of lines(data.body, 82)) {
      if (y < 60) { y = 738; pdf.addPage([612, 792]); }
      const current = pdf.getPages().slice(-1)[0];
      if (line) current.drawText(line, { x: 54, y, size: 12, font });
      y -= line ? 18 : 10;
    }
    return pdf.save();
  }

  return { build, toB64: b64, hash };
})();
