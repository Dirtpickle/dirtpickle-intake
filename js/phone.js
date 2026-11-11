"use strict";

const Phone = (() => {
  function digits(value) {
    const raw = String(value ?? "").trim();
    const number = raw.replace(/\D/g, "");
    if (raw.startsWith("+1")) return number.slice(1, 11);
    return number.length > 10 && number.startsWith("1") ? number.slice(1, 11) : number.slice(0, 10);
  }

  function format(value) {
    const d = digits(value);
    if (d.length <= 3) return d ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }

  function isValid(value) {
    return digits(value).length === 10;
  }

  return { format, digits, isValid };
})();
