"use strict";

/* Lets a physical keyboard drive any on-screen PIN pad (lock screen and PIN prompts): digits, Backspace, Escape to cancel. */
(() => {
  document.addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
    const pads = document.querySelectorAll(".keys");
    const pad = pads[pads.length - 1];
    if (!pad) return;
    const code = /^[0-9]$/.test(e.key) ? e.key : e.key === "Backspace" ? "del" : e.key === "Escape" ? "cancel" : "";
    const button = code && (pad.querySelector(`button[data-k="${code}"]`) || pad.parentElement.querySelector(`button[data-k="${code}"]`));
    if (!button || button.disabled) return;
    e.preventDefault();
    button.click();
  });
})();
