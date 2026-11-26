"use strict";

/* Small pill at the top of the screen that shows website publishing: working, done, or failed. */
(() => {
  let pill = null, timer = null;
  const TEXT = { working: "Publishing to website…", done: "Website updated ✓", failed: "Website not updated. It will retry." };
  function show(phase) {
    if (!pill) { pill = document.createElement("div"); pill.id = "publishNote"; pill.setAttribute("role", "status"); document.body.appendChild(pill); }
    clearTimeout(timer);
    pill.className = `publish-note ${phase}`;
    pill.textContent = TEXT[phase];
    pill.hidden = false;
    if (phase !== "working") timer = setTimeout(() => { pill.hidden = true; }, phase === "done" ? 4000 : 8000);
  }
  document.addEventListener("flashpublish", e => show(e.detail.phase));
})();
