"use strict";

/* The patron's own choice, on the last screen, to receive a copy of the signed contract.
   Pure form logic: it builds the block, reads it back and describes the result. It sends nothing. */
const ConsentCopy = (() => {
  const validEmail = value => /^\S+@\S+\.\S+$/.test(value);

  function textBlock(defaultPhone) {
    return `<div class="card" data-text-copy><label class="qrow check" style="border:0;padding:12px 0;min-height:54px"><input type="checkbox" id="textCopy" style="width:26px;height:26px"><span>Also text me a copy</span></label>
      <div id="textCopyFields" style="display:none"><label for="textPhone">Phone for text copy</label><input id="textPhone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(Phone.format(defaultPhone || ""))}"><div class="sub" data-text-phone-error></div></div></div>`;
  }

  function html(defaultEmail, relayOk, options = {}) {
    const email = !relayOk ? `<div class="banner warn" style="font-weight:400">Email is not set up on this device. Ask the artist for a copy.</div>`
      : options.onFile ? `<div class="card" data-copy-on-file="1"><strong>Your copy</strong><p class="mute" style="font-size:16px;margin:6px 0 0">A copy will be emailed to the address we have on file.</p></div>`
      : `<div class="card"><strong>Your copy</strong>
      <p class="mute" style="font-size:16px;margin:6px 0 0">Your signed contract and aftercare instructions will be emailed to this address. Check it is right. It may land in junk or spam.</p>
      <label for="copyTo">My email address</label>
      <input id="copyTo" type="email" inputmode="email" autocapitalize="off" autocomplete="email" value="${esc(defaultEmail || "")}"></div>`;
    return email + (Object.prototype.hasOwnProperty.call(options, "phone") ? textBlock(options.phone) : "");
  }

  function bind(root) {
    const check = $("#textCopy", root), fields = $("#textCopyFields", root), phone = $("#textPhone", root);
    if (!check) return;
    check.onchange = () => { fields.style.display = check.checked ? "" : "none"; };
    phone.oninput = () => { phone.value = Phone.format(phone.value); };
  }

  /* -> { wants, to } or { error } when the address is missing/wrong. No block (no relay) means no copy. */
  function read(root) {
    const input = $("#copyTo", root);
    const textInput = $("#textCopy", root), text = textInput ? textInput.checked : false;
    const phone = $("#textPhone", root)?.value.trim() || "";
    if (text && !Phone.isValid(phone)) return { error: "Enter a valid 10-digit phone number for the text copy." };
    const textFields = textInput ? { text, phone: text ? Phone.format(phone) : "" } : {};
    if (!input) return { wants: root.querySelector("[data-copy-on-file]") ? true : false, to: "", ...(root.querySelector("[data-copy-on-file]") ? { onFile: true } : {}), ...textFields };
    const to = input.value.trim();
    return validEmail(to) ? { wants: true, to, ...textFields } : { error: "Enter a valid email address: your signed contract is emailed to you." };
  }

  function notice(copy, relayOk) {
    const email = copy && copy.onFile ? "A copy of this signed agreement will be emailed to the address we have on file." : copy && copy.wants ? `A copy of this signed agreement will be emailed to <b>${esc(copy.to)}</b>. If you do not see it soon, please check your junk or spam folder.` : `${relayOk ? "No copy will be emailed." : "Ask the artist for a copy."}`;
    const text = copy && copy.text ? ` The artist will text a copy to <b>${esc(copy.phone)}</b>.` : "";
    return `<div class="banner ${copy && (copy.wants || copy.text) ? "ok" : "warn"}" style="font-weight:400">${email}${text}</div>`;
  }

  return { html, bind, read, notice };
})();
