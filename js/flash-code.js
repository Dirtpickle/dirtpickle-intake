"use strict";

/* Flash codes are human-entered references, so matching ignores case, spaces, and dashes. */
const FlashCode = (() => {
  const normalize = code => String(code || "").toUpperCase().replace(/[\s-]/g, "");
  const find = (list, typed) => {
    const wanted = normalize(typed);
    return wanted ? list.find(item => normalize(item.code) === wanted) || null : null;
  };
  return { normalize, find };
})();
