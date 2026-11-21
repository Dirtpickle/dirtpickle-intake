"use strict";

const SettingsContracts = (() => {
  function signatureHtml() {
    const saved = (key, label, size) => `${settings[key] ? `<img src="${settings[key]}" alt="" style="background:#fff;border-radius:10px;max-width:${size}px;width:100%;display:block;margin-bottom:8px">` : ""}
      <canvas id="${key === "artistSignature" ? "aSig" : "aInit"}" class="sig" style="height:${key === "artistSignature" ? 150 : 110}px;max-width:${key === "artistSignature" ? "none" : "340px"}"></canvas>
      <div class="actions" style="margin-top:8px"><button class="small ghost" id="${key === "artistSignature" ? "aSigClear" : "aInitClear"}">Clear</button><button class="small primary" id="${key === "artistSignature" ? "aSigSave" : "aInitSave"}" disabled>Save ${label.toLowerCase()}</button></div>`;
    return `<div class="card"><strong>Artist signature and initials</strong><p class="mute" style="font-size:16px">Used on contracts you print and when you countersign a signed contract. Stored encrypted.</p>
      <label>Signature ${settings.artistSignature ? "(saved. Draw again to replace it)" : "(not saved yet)"}</label>${saved("artistSignature", "signature", 320)}
      <label>Initials ${settings.artistInitials ? "(saved. Draw again to replace them)" : "(not saved yet)"}</label>${saved("artistInitials", "initials", 200)}
      <label style="display:flex;gap:12px;align-items:center;color:var(--fg)"><input id="printSigned" type="checkbox" style="width:26px;height:26px" ${settings.printWithSignature === false ? "" : "checked"}> Put my signature and initials on contracts I print</label><div id="aMsg"></div></div>`;
  }

  function wirePad(root, canvasId, saveId, clearId, key) {
    const button = $(saveId, root), pad = Consent.sigPad($(canvasId, root), ok => { button.disabled = !ok; }, { transparent: true });
    $(clearId, root).onclick = () => pad.clear();
    button.onclick = async () => { settings = { ...settings, [key]: pad.data(), artistMarksAt: new Date().toISOString() }; await DB.put(settings); go("settingsContracts"); };
  }

  function returningHtml() {
    return `<div class="card"><strong>Returning-client short form</strong>
      <p class="mute" style="font-size:16px">${esc("Only turn this on after you have confirmed with Arizona / Yavapai County that a prior signed agreement may cover a new tattoo. This app cannot tell you.")}</p>
      <label style="display:flex;gap:12px;align-items:center;color:var(--fg)"><input id="allowShortReturning" type="checkbox" style="width:26px;height:26px" ${settings.allowShortReturning === true ? "checked" : ""}> Allow eligible returning clients to use the short form</label><div id="returningMsg"></div></div>`;
  }

  screens.settingsContracts = {
    html: () => `${bar("Signature & contracts", { back: "settings" })}${signatureHtml()}${returningHtml()}
      <div class="card"><button data-go="formEditor" style="width:100%">Edit consent form</button><button id="printBlank" style="width:100%;margin-top:12px">Print blank contract (wet ink)</button></div>
      <div class="card"><button data-go="aftercare" style="width:100%">Manage aftercare templates</button></div>`,
    bind(root) {
      wirePad(root, "#aSig", "#aSigSave", "#aSigClear", "artistSignature"); wirePad(root, "#aInit", "#aInitSave", "#aInitClear", "artistInitials");
      $("#printSigned", root).onchange = async e => { settings = { ...settings, printWithSignature: e.target.checked }; await DB.put(settings); };
      $("#allowShortReturning", root).onchange = async e => { settings = { ...settings, allowShortReturning: e.target.checked }; await DB.put(settings); };
      $("#printBlank", root).onclick = () => Consent.printPaper();
    }
  };
})();
