"use strict";

/* Small transparent drawing pads for section initials. */
const InitialsPad = (() => {
  function create(canvas, onChange) {
    const hint = canvas.parentElement?.querySelector(".initials-hint");
    canvas.addEventListener("pointerdown", () => { if (hint) hint.hidden = true; }, { once: true });
    const pad = Consent.sigPad(canvas, valid => { if (hint && valid) hint.hidden = true; onChange(valid); }, { transparent: true });
    return { clear() { if (hint) hint.hidden = false; pad.clear(); }, data: pad.data };
  }

  return { create };
})();
