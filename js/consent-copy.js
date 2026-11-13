"use strict";

/* The patron's own choice, on the last screen, to be emailed a copy of the signed contract.
   Pure form logic: it builds the block, reads it back and describes the result. It sends nothing. */
const ConsentCopy = (() => {
  const validEmail = value => /^\S+@\S+\.\S+$/.test(value);

  function html(defaultEmail, relayOk) {
    if (!relayOk) return `<div class="banner warn" style="font-weight:400">Email is not set up on this device. Ask the artist for a copy.</div>`;
    return `<div class="card"><strong>Your copy</strong>
      <p class="mute" style="font-size:16px;margin:6px 0 0">Your signed contract and aftercare instructions will be emailed to this address. Check it is right. It may land in junk or spam.</p>
      <label for="copyTo">My email address</label>
      <input id="copyTo" type="email" inputmode="email" autocapitalize="off" autocomplete="email" value="${esc(defaultEmail || "")}"></div>`;
  }

  function bind() { /* the copy is always sent; nothing to toggle */ }

  /* -> { wants, to } or { error } when the address is missing/wrong. No block (no relay) means no copy. */
  function read(root) {
    const input = $("#copyTo", root);
    if (!input) return { wants: false, to: "" };
    const to = input.value.trim();
    return validEmail(to) ? { wants: true, to } : { error: "Enter a valid email address: your signed contract is emailed to you." };
  }

  function notice(copy, relayOk) {
    if (copy && copy.wants) return `<div class="banner ok" style="font-weight:400">A copy of this signed agreement will be emailed to <b>${esc(copy.to)}</b>. If you do not see it soon, please check your junk or spam folder.</div>`;
    return `<div class="banner warn" style="font-weight:400">${relayOk ? "No copy will be emailed." : "Ask the artist for a copy."} Please ask the artist if you would like a copy.</div>`;
  }

  return { html, bind, read, notice };
})();
