"use strict";

/* Shows a plain, visible warning when something fails to save (for example a full device), instead of failing silently. */
const ErrorBanner = (() => {
  const full = error => !!error && (error.name === "QuotaExceededError" || /quota|full/i.test(String(error.message || error)));
  const message = error => full(error)
    ? "Could not save: this device is out of storage space. Tell the artist before continuing."
    : "Something did not save. Tell the artist before continuing.";

  function show(error) {
    try {
      let bar = document.getElementById("errorBanner");
      if (!bar) {
        bar = document.createElement("div"); bar.id = "errorBanner"; bar.setAttribute("role", "alert");
        bar.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;padding:14px 16px;background:#b00020;color:#fff;font:600 18px system-ui,sans-serif;text-align:center";
        bar.onclick = () => bar.remove();
        document.body.appendChild(bar);
      }
      bar.textContent = message(error);
    } catch (_) { /* nothing more we can do */ }
  }

  window.addEventListener("unhandledrejection", event => show(event.reason));
  return { show, message };
})();
