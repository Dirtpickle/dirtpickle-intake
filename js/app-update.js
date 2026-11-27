"use strict";

/* Finds out when a newer version of the app has been installed and offers a one-tap reload.
   The service worker swaps itself in on its own; this just makes the open page notice. */
const AppUpdate = (() => {
  const CHECK_EVERY = 10 * 60 * 1000;

  function offer() {
    if (cur && cur.name === "iWelcome") { location.reload(); return; } // idle kiosk screen: nothing to lose
    if (document.getElementById("updateNote")) return;
    const box = document.createElement("div");
    box.id = "updateNote"; box.className = "update-note"; box.setAttribute("role", "status");
    box.innerHTML = `<span>New version ready.</span> <button class="small primary" id="updateNow">Update now</button> <button class="small ghost" id="updateLater">Later</button>`;
    document.body.appendChild(box);
    box.querySelector("#updateNow").onclick = () => location.reload();
    box.querySelector("#updateLater").onclick = () => box.remove();
  }

  const check = () => navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {});

  function start() {
    if (!("serviceWorker" in navigator)) return;
    const hadWorker = !!navigator.serviceWorker.controller; // first install is not an update
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadWorker) offer(); });
    setInterval(check, CHECK_EVERY);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  }

  return { start };
})();
