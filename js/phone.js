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

  /* Format as the user types; returns a checker that shows an error under each field. */
  function wire(root, ids) {
    ids.forEach(id => { const el = root.querySelector("#" + id); if (el) { el.value = format(el.value); el.addEventListener("input", () => { el.value = format(el.value); }); } });
    return () => ids.filter(id => { const el = root.querySelector("#" + id); const bad = el && el.value.trim() && !isValid(el.value); const note = root.querySelector(`[data-phone-error="${id}"]`); if (note) note.textContent = bad ? "Enter a 10-digit phone number." : ""; return bad; });
  }

  return { format, digits, isValid, wire };
})();
