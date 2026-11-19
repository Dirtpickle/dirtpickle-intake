"use strict";

/* Tap feedback for every button, plus a guard against the tap that unlocks the PIN also pressing the screen underneath. */
const PressFeedback = (() => {
  let holdUntil = 0, holdStart = 0, lastDown = 0;
  const hold = (ms = 450) => { holdStart = performance.now(); holdUntil = Date.now() + ms; };

  document.addEventListener("pointerdown", e => {
    lastDown = performance.now();
    const b = e.target.closest && e.target.closest("button, .btn");
    if (!b || b.disabled) return;
    b.classList.add("pressed");
    setTimeout(() => b.classList.remove("pressed"), 180);
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (_) {}
  }, true);

  /* After the last PIN digit the dashboard appears under the finger; swallow the click that follows. */
  document.addEventListener("click", e => {
    if (Date.now() < holdUntil && lastDown <= holdStart) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  return { hold };
})();
