
"use strict";

/* Comparers for barcode facts against the client's typed information. */
const IdMatch = (() => {
  const comparers = new Map();

  function words(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9, ]/g, " ").split(/\s+/).filter(Boolean);
  }

  function nameParts(value) {
    const raw = String(value || "").trim();
    if (!raw) return { first: "", last: "" };
    const comma = raw.indexOf(",");
    if (comma >= 0) return { last: words(raw.slice(0, comma))[0] || "", first: words(raw.slice(comma + 1))[0] || "" };
    const parts = words(raw);
    return { first: parts[0] || "", last: parts[parts.length - 1] || "" };
  }

  comparers.set("name", (scanned, typed) => {
    const a = nameParts(scanned), b = nameParts(typed);
    return !!a.first && !!a.last && a.first === b.first && a.last === b.last;
  });
  comparers.set("dob", (scanned, typed) => !!scanned && !!typed && String(scanned) === String(typed));

  function compare(scanned, typed) {
    const nameMatched = comparers.get("name")(scanned && scanned.legalName, typed && typed.legalName);
    const dobMatched = comparers.get("dob")(scanned && scanned.dob, typed && typed.dob);
    return { nameMatched, dobMatched, matched: nameMatched && dobMatched };
  }

  function register(name, comparer) {
    if (!name || typeof comparer !== "function") throw new Error("Invalid ID comparer");
    comparers.set(name, comparer);
  }

  return { compare, register };
})();
if (typeof module !== "undefined") module.exports = IdMatch;
