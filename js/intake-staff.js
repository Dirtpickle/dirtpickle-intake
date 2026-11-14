"use strict";

/* Staff-only identity check in the public intake flow. */
(() => {
  const staffHead = () => `<header class="bar"><h1>${esc((settings.business || "Dirtpickle").toUpperCase())}</h1><button class="small ghost" id="kStaff">Artist sign-in</button></header>`;
  const summary = (K, under) => K.scan ? `<div class="card"><strong>Barcode summary</strong><dl class="kv">
    <dt>Name</dt><dd>${esc(K.scan.scanned.legalName)}</dd><dt>Date of birth</dt><dd>${esc(K.scan.scanned.dob)}</dd>
    <dt>Age</dt><dd>${ageOn(K.scan.scanned.dob) ?? "Unknown"}</dd><dt>ID state</dt><dd>${esc(K.scan.idState || "Unknown")}</dd>
    <dt>Expiry</dt><dd>${esc(K.scan.idExpiry || "Unknown")}</dd></dl>
    ${K.scan.idExpired ? `<div class="banner warn">This ID is expired.</div>` : ""}${under ? `<div class="banner bad">This person is under the minimum age of ${settings.minAge}. Continue is blocked.</div>` : ""}</div>` : "";

  screens.iStaffId = {
    html() {
      const K = Consent.K(), age = K.scan && ageOn(K.scan.scanned.dob), under = age !== null && age < settings.minAge;
      return `${staffHead()}<h2 style="margin:0 0 12px">Staff: check the license</h2><p class="mute">Take the license from the client. The client does not use this screen.</p>
        ${IdPhoto.block({ photo: K.frontPhoto, check: K.idPhotoCheck, inputId: "iFront", title: K.returning ? "Photo of the FRONT of the license (optional for returning clients)" : "Photo of the FRONT of the license *" })}
        <div class="actions"><button class="primary" id="iScanBtn">Scan the back barcode</button><button class="ghost" id="iNoScan" ${under || K.scan ? "disabled" : ""}>Barcode will not scan - continue with photo only</button></div>
        ${summary(K, under)}<div id="iStaffErr"></div><div class="actions"><button class="ghost" data-go="iWelcome">‹ Cancel</button><button class="primary" id="iStaffNext" ${(!K.frontPhoto && (!K.returning || !K.scan)) || (!K.scan && !K.noScan) || under ? "disabled" : ""}>Continue</button></div>`;
    },
    bind(root) {
      const K = Consent.K();
      IdPhoto.attach(root, { inputId: "iFront", onPhoto: result => { K.frontPhoto = result.image; K.idPhotoCheck = result.check; go("iStaffId"); }, onError: () => { $("#iStaffErr", root).innerHTML = `<div class="banner bad">Could not read that photo. Please try again.</div>`; } });
      $("#iScanBtn", root).onclick = () => go("iScan");
      $("#iNoScan", root).onclick = () => { K.noScan = true; go("iStaffId"); };
      $("#iStaffNext", root).onclick = () => go("iHandoff");
    }
  };

  screens.iHandoff = {
    html: () => `${staffHead()}<div class="pin" style="max-width:720px"><h1>License checked.</h1><p style="font-size:28px">Hand the license and this iPad back to the client.</p><button class="primary" id="iClientHas">Client has the iPad</button></div>`,
    bind() { $("#iClientHas").onclick = () => go("kPrivacy"); }
  };

  screens.iScan = {
    html: () => `${staffHead()}<h2 style="margin:0 0 12px">Scan the back barcode</h2><div class="card" style="padding:0;overflow:hidden"><video id="cam" playsinline muted style="width:100%;display:block;background:#000;min-height:260px"></video></div><div id="scanMsg" class="banner warn">Hold the BACK of the license (the barcode) flat in view, close, in good light.</div><div class="actions"><label class="btn" style="display:inline-flex;align-items:center">Take a photo instead<input id="photo" type="file" accept="image/*" capture="environment" hidden></label><button class="ghost" id="iBack">Back</button></div>`,
    async bind(root) {
      const K = Consent.K(), msg = t => { const m = $("#scanMsg", root); if (m) m.textContent = t; };
      const done = text => { const r = AAMVA.parse(text); if (!r) { msg("That was not a driver's license barcode. Try the back of the card."); return false; } Object.assign(K.client, { legalName: r.legalName, dob: r.dob, licenseNumber: r.idNumber, ...(r.address ? { address: r.address } : {}) }); K.scannedAddress = r.address || ""; K.scan = { idNumber: r.idNumber, idState: r.idState, idExpiry: r.idExpiry, idExpired: r.idExpired, scanned: { legalName: r.legalName, dob: r.dob } }; K.noScan = false; K.scanOnly = !!K.returning; Scan.stop(); go("iStaffId"); return true; };
      $("#iBack", root).onclick = () => { Scan.stop(); go("iStaffId"); };
      $("#photo", root).onchange = async e => { const f = e.target.files[0]; if (!f) return; msg("Reading photo…"); try { const t = await Scan.decodeBlob(f); t ? done(t) : msg("No barcode found. Retake it closer, sharp, filling the frame."); } catch (err) { msg("Could not read photo: " + err.message); } };
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg("Camera is not available. Use Take a photo, or go back."); return; }
      try { await Scan.start($("#cam", root), t => { done(t); }, msg); } catch (err) { msg(err.name === "NotAllowedError" ? "Camera access is blocked. Allow it in the browser or iPad Settings, or use Take a photo." : "Camera or scanner could not start (" + (err.name || err.message) + "). Use Take a photo."); }
    }
  };
})();
