"use strict";
/* INTAKE SIDE (clients and assistants). Opens with no PIN and has no way to read stored records.
   It reads only the "public" data (form wording, business name, minimum age, available flash) and ADDS sealed
   submissions to the inbox. The pro side opens the inbox after PIN entry. */
const Intake = (() => {
  let P = null;          // public data
  let idleTimer = null, lastTouch = Date.now();
  let notice = "";       // one-time message shown on the pro home screen after an import

  const available = async () => (await DB.hasPin()) && (await DB.hasKeys()) && !!(await DB.getPublic());
  async function enter() {
    P = await DB.getPublic();
    settings = { ...DEFAULTS, business: (P && P.business) || "Dirtpickle", artistName: (P && P.artistName) || DEFAULTS.artistName, minAge: (P && P.minAge) || 18 };
    startIdle();
    go("iWelcome", {}, { replace: true });
  }
  function startIdle() {
    clearInterval(idleTimer);
    idleTimer = setInterval(() => {
      // Wipe a half-finished form after 3 idle minutes so the next person never sees it.
      if (DB.isUnlocked()) { clearInterval(idleTimer); return; }
      if (cur.name !== "iWelcome" && cur.name !== "pin" && Date.now() - lastTouch > 180000) { Consent.K() && Consent.startIntake(P); go("iWelcome"); }
    }, 10000);
  }
  ["pointerdown", "keydown"].forEach(ev => document.addEventListener(ev, () => { lastTouch = Date.now(); }, true));

  const head = () => `<header class="bar"><h1>${esc((settings.business || "Dirtpickle").toUpperCase())}</h1><button class="small ghost" id="kStaff">Artist sign-in</button></header>`;

  screens.iWelcome = {
    html: () => `${head()}<div class="pin" style="max-width:720px;margin-top:2vh"><h1>Welcome</h1>
      <p class="mute" style="font-size:22px">Please check in for your tattoo.</p>
      <div class="grid" style="margin-top:28px"><button class="tile primary" id="iNew">NEW CLIENT<small>First time here</small></button>
      <button class="tile" id="iRet">BEEN HERE BEFORE<small>Quick check-in</small></button></div></div>`,
    bind(root) {
      const begin = returning => () => { const r = Consent.startIntake(P, returning); if (r.error) { alert(r.error); return; } go("iStaffId"); };
      $("#iNew", root).onclick = begin(false); $("#iRet", root).onclick = begin(true);
    }
  };

  /* ----- your information ----- */
  function addressSuggestion(K) {
    if (!K.scannedAddress || K.scannedAddress === K.client.address) return "";
    return `<button type="button" class="small ghost" id="useScanAddress">Use address on license</button>`;
  }
  const dkeys = ["legalName", "preferredName", "dob", "phone", "email", "address", "emergencyName", "emergencyPhone"];
  const fld = (k, label, K, a = "") => `<label for="i_${k}">${label}</label><input id="i_${k}" value="${esc(K.client[k] || "")}" ${a}>`;
  const phoneFld = (k, label, K) => `${fld(k, label, K, 'type="tel" inputmode="tel"')}<div class="sub" data-phone-error="${k}"></div>`;
  const wirePhoneFields = root => {
    ["phone", "emergencyPhone"].forEach(k => {
      const input = $("#i_" + k, root);
      input.oninput = () => { input.value = Phone.format(input.value); };
    });
  };
  const validatePhoneFields = root => {
    const messages = [];
    ["phone", "emergencyPhone"].forEach(k => {
      const value = $("#i_" + k, root).value.trim();
      const error = root.querySelector(`[data-phone-error="${k}"]`);
      const invalid = value && !Phone.isValid(value);
      if (error) error.textContent = invalid ? "Enter a 10-digit phone number." : "";
      if (invalid) messages.push(`${k === "phone" ? "Phone" : "Emergency contact phone"} must have 10 digits.`);
    });
    return messages;
  };
  screens.iInfo = {
    html() {
      const K = Consent.K();
      if (!K.frontPhoto) return "";
      const age = ageOn(K.client.dob), under = age !== null && age < settings.minAge;
      return `${head()}<h2 style="margin:0 0 12px">${K.returning ? "Welcome back! Please re-enter your details." : "Your information"}</h2>
        ${K.returning ? `<div class="mute" style="margin-bottom:8px">Use the same phone number or email as last time so we can find your record.</div>` : ""}
        ${K.scan ? `<div class="banner ok" style="margin:12px 0">Details filled from your license, please check them.</div>` : ""}
        <div class="cols"><div>${fld("legalName", "Full legal name *", K, K.scan ? "readonly" : 'autocapitalize="words"')}${fld("preferredName", "Preferred name", K, 'autocapitalize="words"')}
          <label for="i_dob">Date of birth *</label><input id="i_dob" type="date" value="${esc(K.client.dob || "")}" ${K.scan ? "readonly" : ""}>
          ${age !== null ? `<div class="banner ${under ? "bad" : "ok"}">${under ? `You must be at least ${settings.minAge} to get a tattoo here. Please see the artist.` : `Age ${age}`}</div>` : ""}</div>
          <div>${phoneFld("phone", "Phone", K)}${fld("email", "Email * (your signed contract and aftercare instructions are emailed here)", K, 'type="email" inputmode="email" autocapitalize="off"')}<label for="i_address">Address</label><input id="i_address" value="${esc(K.client.address || "")}" autocapitalize="words">${addressSuggestion(K)}</div>
          <div>${fld("emergencyName", "Emergency contact name", K)}${phoneFld("emergencyPhone", "Emergency contact phone", K)}</div></div>
        <div id="iErr"></div><div class="actions"><button class="ghost" data-go="kPrivacy">‹ Back</button><button class="primary" id="iNext" ${under ? "disabled" : ""}>Continue</button></div>`;
    },
    bind(root) {
      const K = Consent.K();
      if (!K.frontPhoto) { go("iStaffId", {}, { replace: true }); return; }
      wirePhoneFields(root);
      const collect = () => { for (const k of dkeys) K.client[k] = $("#i_" + k, root).value.trim(); };
      const useAddress = $("#useScanAddress", root);
      if (useAddress) useAddress.onclick = () => { $("#i_address", root).value = K.scannedAddress; collect(); go("iInfo"); };
      $("#i_dob", root).onchange = () => { collect(); go("iInfo"); };
      $("#iNext", root).onclick = () => {
        collect();
        const c = K.client, age = ageOn(c.dob), m = [];
        if (!c.legalName) m.push("Please enter your full legal name.");
        if (age === null || age > 125) m.push("Please enter a valid date of birth.");
        else if (age < settings.minAge) m.push(`You must be at least ${settings.minAge}.`);
        if (!c.phone) m.push("Please give a phone number.");
        if (!c.email) m.push("Please give an email address: your signed contract is emailed to you.");
        m.push(...validatePhoneFields(root));
        if (c.email && !/^\S+@\S+\.\S+$/.test(c.email)) m.push("That email address looks wrong.");
        if (m.length) { $("#iErr", root).innerHTML = `<div class="banner bad">${m.map(esc).join("<br>")}</div>`; return; }
        go(P.flash && P.flash.length ? "iFlash" : "kQuestions");
      };
    }
  };

  screens.iFlash = {
    html() {
      const items = (P.flash || []).slice().sort((a, b) => (a.sheet || "").localeCompare(b.sheet || "") || a.name.localeCompare(b.name));
      const m = n => n || n === 0 ? "$" + n : "";
      return `${head()}<h2 style="margin:0 0 12px">Pick a flash design (optional)</h2>
        <div class="actions" style="margin:0 0 16px"><button class="primary" data-pick="">I haven't chosen yet</button><button class="ghost" data-go="iInfo">‹ Back</button></div>
        <div class="fgrid">${items.map(f => `<div class="fitem" data-pick="${esc(f.id)}"><img src="${f.image}" alt=""><div>${esc(f.name)}</div><div class="sub">${m(f.price)}</div></div>`).join("")}</div>`;
    },
    bind(root) {
      const K = Consent.K();
      root.onclick = e => {
        const t = e.target.closest("[data-pick]"); if (!t) return;
        const f = (P.flash || []).find(x => x.id === t.dataset.pick);
        K.flashId = f ? f.id : null; K.flashName = f ? f.name : "";
        go("kQuestions");
      };
    }
  };

  /* ----- pro side: open the inbox and import it (runs after the PIN) ----- */
  async function importAll() {
    const { items, failed } = await DB.inboxOpen();
    let added = 0, merged = 0, already = 0, unmatchedFlash = 0;
    items.sort((x, y) => x.createdAt.localeCompare(y.createdAt)); // oldest check-in first
    for (const it of items) {
      try {
        const p = it.payload, d = p.client, now = new Date().toISOString();
        let c = findDuplicate(d, null);
        if (c) {
          merged++;
          c = { ...c, phone: d.phone || c.phone, email: d.email || c.email, address: d.address || c.address, preferredName: d.preferredName || c.preferredName,
            emergencyName: d.emergencyName || c.emergencyName, emergencyPhone: d.emergencyPhone || c.emergencyPhone,
            visits: [...(c.visits || []), p.submittedAt], updatedAt: now };
        } else c = { type: "client", ...d, notes: "", visits: [p.submittedAt], createdAt: p.submittedAt, updatedAt: now };
        if (p.client.licenseNumber) c.licenseNumber = p.client.licenseNumber;
        if (p.idCheck) c.idChecks = [...(c.idChecks || []), p.idCheck];
        if (p.idPhoto) c.idPhotos = [...(c.idPhotos || []), { at: p.submittedAt, image: p.idPhoto }].slice(-3);
        await DB.put(c);
        const f = p.session.flashId && DB.get(p.session.flashId);
        const conflict = !!(f && f.status !== "available");
        if (conflict) unmatchedFlash++;
        const sess = { type: "session", id: p.session.id, clientId: c.id, createdAt: p.submittedAt, status: "ready", tattoo: {}, segments: [],
          flashId: f ? f.id : null, flashName: f ? f.name : (p.session.flashName || ""), price: f ? (f.price ?? "") : "", deposit: "", paid: "", payMethod: "", notes: "",
          consentId: p.consent.id, flashConflict: conflict, source: "intake" };
        try { await DB.put(sess); } catch (_) { /* already imported */ }
        if (f && !conflict) await Sessions.claim(f.id);
        const k = p.consent;
        try {
          await DB.put({ type: "consent", id: k.id, locked: true, clientId: c.id, sessionId: p.session.id, signedAt: k.signedAt,
            clientSnapshot: { id: c.id, legalName: c.legalName, dob: c.dob, phone: c.phone, email: c.email, address: c.address },
            template: k.template, answers: k.answers, signature: k.signature, idCheck: k.idCheck, ageAtSigning: k.ageAtSigning, privacy: k.privacy,
            pdf: k.pdf, sha256: k.sha256, copyTo: k.copyTo || "", emailStatus: k.copyTo && Mailer.configured(Mailer.relayFromSettings()) ? "queued" : "not-sent" });
          added++;
        } catch (e) { if (/locked/.test(e.message)) already++; else throw e; }
        await DB.inboxRemove(it.id);
      } catch (e) { /* leave it in the inbox to retry next unlock */ }
    }
    const parts = [];
    if (added) parts.push(`${added} new check-in${added === 1 ? "" : "s"} imported${merged ? ` (${merged} matched an existing client)` : ""}`);
    if (unmatchedFlash) parts.push(`${unmatchedFlash} picked a design that was already taken`);
    if (failed) parts.push(`${failed} could not be opened`);
    notice = parts.join(". ");
    return { added, merged, failed };
  }
  const takeNotice = () => { const n = notice; notice = ""; return n; };

  return { available, enter, importAll, takeNotice };
})();
