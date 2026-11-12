"use strict";

/* The patron's own choice, on the last screen, to be emailed a copy of the signed contract.
   Pure form logic: it builds the block, reads it back and describes the result. It sends nothing. */
const ConsentCopy = (() => {
  const validEmail = value => /^\S+@\S+\.\S+$/.test(value);

  function html(defaultEmail, relayOk) {
    if (!relayOk) return `<div class="banner warn" style="font-weight:400">Email is not set up on this device. Ask the artist for a copy.</div>`;
    return `<div class="card"><label class="chk" style="display:flex;gap:10px;align-items:center;font-size:18px">
        <input type="checkbox" id="copyWant" ${defaultEmail ? "checked" : ""} style="width:26px;height:26px"> Email me a copy of this signed contract</label>
      <div id="copyBox" ${defaultEmail ? "" : 'hidden'}><label for="copyTo">My email address</label>
        <input id="copyTo" type="email" inputmode="email" autocapitalize="off" autocomplete="email" value="${esc(defaultEmail || "")}">
        <p class="mute" style="font-size:15px;margin:6px 0 0">It may land in junk or spam. Your address is used only to send this copy.</p></div></div>`;
  }

  function bind(root) {
    const want = $("#copyWant", root);
    if (want) want.onchange = () => { $("#copyBox", root).hidden = !want.checked; };
  }

  /* -> { wants, to } or { error } when a copy is wanted but the address is missing/wrong. No block (no relay) means no copy. */
  function read(root) {
    const want = $("#copyWant", root);
    if (!want || !want.checked) return { wants: false, to: "" };
    const to = $("#copyTo", root).value.trim();
    return validEmail(to) ? { wants: true, to } : { error: "Enter a valid email address, or untick the email box." };
  }

  function notice(copy, relayOk) {
    if (copy && copy.wants) return `<div class="banner ok" style="font-weight:400">A copy of this signed agreement will be emailed to <b>${esc(copy.to)}</b>. If you do not see it soon, please check your junk or spam folder.</div>`;
    return `<div class="banner warn" style="font-weight:400">${relayOk ? "No copy will be emailed." : "Ask the artist for a copy."} Please ask the artist if you would like a copy.</div>`;
  }

  return { html, bind, read, notice };
})();
