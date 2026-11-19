"use strict";

/* Full-screen PIN pad that looks and works like the lock screen. Resolves to the digits, or null if cancelled. */
const PinPrompt = (() => {
  function ask(title, hint = "") {
    return new Promise(resolve => {
      const len = (typeof PIN_LEN === "number" ? PIN_LEN : 6);
      let buf = "";
      const box = document.createElement("div");
      box.className = "id-crop-screen";
      box.style.background = "var(--bg, #111)";
      box.innerHTML = `<div class="pin"><h1>DIRT<b>PICKLE</b></h1><div class="mute">${esc(title)}</div>
        <div class="dots">${Array.from({ length: len }, () => "<i></i>").join("")}</div>
        <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join("")}
          <button class="blank" disabled>.</button><button data-k="0">0</button><button data-k="del" aria-label="Delete">⌫</button></div>
        <p class="mute" style="font-size:15px;margin-top:18px">${esc(hint)}</p>
        <button class="ghost small" data-k="cancel" style="margin-top:10px">Cancel</button></div>`;
      document.body.appendChild(box);
      const done = value => { box.remove(); resolve(value); };
      box.onclick = e => {
        const k = e.target.closest("button[data-k]")?.dataset.k;
        if (!k) return;
        if (k === "cancel") return done(null);
        if (k === "del") buf = buf.slice(0, -1); else if (buf.length < len) buf += k;
        box.querySelectorAll(".dots i").forEach((d, i) => d.classList.toggle("on", i < buf.length));
        if (buf.length === len) done(buf);
      };
    });
  }
  return { ask };
})();
