"use strict";
/* Parser for the AAMVA PDF417 data found on US/Canadian driver licenses and IDs.
   Reading this data is NOT proof the card is genuine. It only extracts what the barcode says. */
const AAMVA = (() => {
  function field(text, code) {
    const m = new RegExp("(?:^|[\\n\\r\\x1e])" + code + "([^\\n\\r]*)").exec(text);
    return m ? m[1].trim() : "";
  }
  const cap = s => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
  const pad = (n, w) => String(n).padStart(w, "0");

  function parseDate(raw) {
    const s = (raw || "").replace(/\D/g, "");
    if (s.length !== 8) return "";
    const valid = (y, m, d) => y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
    // US: MMDDCCYY. Canada: CCYYMMDD. Decide by which reading is plausible.
    let y = +s.slice(4), m = +s.slice(0, 2), d = +s.slice(2, 4);
    if (valid(y, m, d)) return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
    y = +s.slice(0, 4); m = +s.slice(4, 6); d = +s.slice(6);
    if (valid(y, m, d)) return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
    return "";
  }

  /** Returns null if the text does not look like AAMVA data. */
  function parse(text) {
    if (!text || !/ANSI |AAMVA/.test(text.slice(0, 40)) && !/\nDCS|\nDAC|\nDBB/.test(text)) return null;
    let first = field(text, "DAC") || field(text, "DCT");
    let last = field(text, "DCS") || field(text, "DAB");
    let middle = field(text, "DAD");
    const full = field(text, "DAA"); // older versions: LAST,FIRST,MIDDLE
    if ((!first || !last) && full) {
      const parts = full.split(/[,$]/).map(s => s.trim());
      last = last || parts[0] || ""; first = first || parts[1] || ""; middle = middle || parts[2] || "";
    }
    const dob = parseDate(field(text, "DBB"));
    const idNumber = field(text, "DAQ");
    const expiry = parseDate(field(text, "DBA"));
    const street = field(text, "DAG") || field(text, "DAG");
    const city = field(text, "DAI"), state = field(text, "DAJ");
    const zip = field(text, "DAK").replace(/\D/g, "").slice(0, 5);
    if (!last && !first && !dob) return null;
    const legalName = [first, middle && middle.toUpperCase() !== "NONE" ? middle : "", last].filter(Boolean).map(cap).join(" ");
    const address = [cap(street), [cap(city), state.toUpperCase(), zip].filter(Boolean).join(" ").replace(/^(.*?) ([A-Z]{2})/, "$1, $2")]
      .filter(Boolean).join(", ");
    const today = new Date().toISOString().slice(0, 10);
    return {
      legalName, dob, address,
      idNumber, idState: state.toUpperCase(), idExpiry: expiry, idExpired: expiry ? expiry < today : null
    };
  }
  return { parse, parseDate };
})();
if (typeof module !== "undefined") module.exports = AAMVA;
