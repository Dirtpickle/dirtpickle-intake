"use strict";

/* Small transparent drawing pads for section initials. */
const InitialsPad = (() => {
  function create(canvas, onChange) {
    return Consent.sigPad(canvas, onChange, { transparent: true });
  }

  return { create };
})();
