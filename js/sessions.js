"use strict";
/* Tattoo sessions, walk-in queue / event overview, flash gallery, and the tattoo timer. */
const Sessions = (() => {
  const LABEL = { waiting: "Waiting", paperwork: "Completing paperwork", ready: "Ready", inprogress: "Tattoo in progress", completed: "Completed", cancelled: "Cancelled" };
  const ACTIVE = ["waiting", "paperwork", "ready", "inprogress"];
  const localDay = iso => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const isToday = iso => iso && localDay(iso) === localDay(new Date().toISOString());
  const money = n => (n || n === 0) && n !== "" ? "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "";
  const ev = () => Events.pricing();
  const clientName = id => (DB.get(id) || {}).legalName || "Unknown";
  const sessions = () => DB.all("session");
  const save = async (s, patch) => { const n = { ...s, ...patch, updatedAt: new Date().toISOString() }; await DB.put(n); return n; };

  /* ----- timer (segments so you can pause for breaks) ----- */
  const segs = s => s.segments || [];
  const running = s => segs(s).some(x => !x.e);
  const elapsed = s => segs(s).reduce((t, x) => t + ((x.e ? new Date(x.e) : new Date()) - new Date(x.s)), 0);
  const fmt = ms => { const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`; };
  const shortDuration = ms => { const t = Math.floor(ms / 60000), h = Math.floor(t / 60), m = t % 60; return `${h}:${String(m).padStart(2, "0")}`; };
  const hourlyApplies = s => (s.flashId ? ev().hourlyApplies === true : ev().hourlyApplies !== false);
  const suggestion = s => s.status === "completed" && hourlyApplies(s) && s.durationMs >= 0
    ? Pricing.suggest(s.durationMs, (settings.pricing || {}).rate, { round: (settings.pricing || {}).round }) : null;

  /* The client's queue entry that is still waiting for paperwork, so paperwork never makes a second entry. */
  function openForPaperwork(clientId) {
    return DB.all("session").filter(s => s.clientId === clientId && ["waiting", "paperwork"].includes(s.status) && !s.consentId)
      .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")).pop() || null;
  }

  /* ----- flash availability ----- */
  async function createSession(clientId, flashId) {
    const f = flashId ? DB.get(flashId) : null;
    const active = Events.getActive();
    const s = { type: "session", clientId, createdAt: new Date().toISOString(), status: "waiting", tattoo: {}, segments: [],
      eventId: active ? active.id : null, flashId: f ? f.id : null, flashName: f ? f.name : "", price: f ? (f.price ?? ev().flashMin) : "", deposit: "", paid: "", payMethod: "", notes: "" };
    await DB.put(s); await Flash.claim(flashId, s.id);
    return s;
  }

  /* ----- queue + event overview ----- */
  const statTile = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
  screens.queue = {
    html() {
      const all = sessions().filter(s => ACTIVE.includes(s.status) || isToday(s.createdAt)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const todays = all.filter(s => s.status !== "cancelled");
      const cur = all.find(s => s.status === "inprogress");
      const sales = todays.reduce((t, s) => t + (parseFloat(s.price) || 0), 0);
      const forms = DB.all("consent").filter(d => isToday(d.signedAt)).length;
      const pendingMail = DB.all("consent").filter(d => d.emailStatus !== "sent").length;
      const row = s => `<div class="row" style="cursor:default"><div class="grow" data-go="session" data-id="${esc(s.id)}" style="cursor:pointer">
          <div>${esc(clientName(s.clientId))} ${s.flashName ? `<span class="mute">· ${esc(s.flashName)}</span>` : ""}</div>
          <div class="sub">${LABEL[s.status]}${s.price !== "" && s.price != null ? " · " + money(s.price) : ""}</div></div>${actions(s)}</div>`;
      return `${bar(esc(ev().name) + " · Today", { back: "home" })}
        <div class="stats">${statTile(todays.filter(s => s.status === "waiting" || s.status === "paperwork").length, "waiting")}${statTile(todays.filter(s => s.status === "ready").length, "ready")}
          ${statTile(todays.filter(s => s.status === "completed").length, "completed")}${statTile(money(sales) || "$0", "est. sales")}${statTile(forms, "forms done")}${statTile(pendingMail, "emails pending")}</div>
        ${cur ? `<div class="banner ok">Now tattooing: ${esc(clientName(cur.clientId))} · ${running(cur) ? "timer running" : "timer paused"} ${fmt(elapsed(cur))}</div>` : ""}
        <div class="actions" style="margin:0 0 16px"><button class="primary" data-go="walkin">+ Add walk-in</button><button data-go="flash">Flash gallery</button></div>
        <div class="card">${all.map(row).join("") || '<span class="mute">Nobody in the queue yet.</span>'}</div>`;
    }
  };
  function actions(s) {
    const b = (a, t, cls = "") => `<button class="small ${cls}" data-act="${a}" data-id="${esc(s.id)}">${t}</button>`;
    const cl = DB.get(s.clientId), lastId = cl && (cl.idChecks || []).slice(-1)[0], needId = lastId && !lastId.visuallyMatched;
    const idBtn = needId ? b("confirmid", "Confirm ID", "") : "";
    if (s.status === "waiting" || s.status === "paperwork") return idBtn + b("paper", "Paperwork", "primary") + b("cancel", "Cancel", "danger");
    if (s.status === "ready") return idBtn + b("start", "Start tattoo", "primary") + b("cancel", "Cancel", "danger");
    if (s.status === "inprogress") return b("open", "Open timer", "primary");
    return "";
  }
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const s = DB.get(b.dataset.id); if (!s) return;
    if (b.dataset.act === "confirmid") {
      const cl = DB.get(s.clientId); const ids = (cl.idChecks || []).slice();
      ids[ids.length - 1] = { ...ids[ids.length - 1], visuallyMatched: true, visuallyConfirmedAt: new Date().toISOString() };
      await DB.put({ ...cl, idChecks: ids, updatedAt: new Date().toISOString() }); go("queue"); return;
    }
    if (b.dataset.act === "paper") {
      const r = Consent.start(s.clientId, s.id);
      if (r.error) { alert(r.error); return; }
      await save(s, { status: "paperwork" }); go("kPrivacy");
    } else if (b.dataset.act === "start") { await startTimer(s); go("session", { id: s.id }); }
    else if (b.dataset.act === "open") go("session", { id: s.id });
    else if (b.dataset.act === "cancel") { if (confirm("Cancel this person's place in the queue?")) { await Flash.release(s.flashId); await save(s, { status: "cancelled" }); go("queue"); } }
  });
  async function startTimer(s) {
    const n = { ...DB.get(s.id) };
    n.segments = [...segs(n).filter(x => x.e), { s: new Date().toISOString(), e: null }]; if (segs(n).length === 1 && !n.startedAt) n.startedAt = n.segments[0].s;
    n.status = "inprogress"; await DB.put({ ...n, updatedAt: new Date().toISOString() });
  }

  /* ----- walk-in: pick a client, then (optionally) a flash design ----- */
  screens.walkin = {
    html: () => `${bar("Add walk-in", { back: "queue" })}
      <input id="q" type="search" placeholder="Search returning client by name, phone or email" autocomplete="off">
      <div class="card" id="results" style="margin-top:16px"></div>
      <div class="actions"><button class="primary" data-go="clientForm">New client</button></div>`,
    bind(root) {
      const draw = () => {
        const list = searchClients($("#q", root).value);
        $("#results", root).innerHTML = list.slice(0, 50).map(c => `<div class="row" data-pick="${esc(c.id)}"><div class="grow">${esc(nameOf(c))}<div class="sub">${[c.phone, c.email].filter(Boolean).map(esc).join(" · ")}</div></div><div class="mute">›</div></div>`).join("") || '<span class="mute">No matches. Use New client.</span>';
      };
      $("#q", root).oninput = draw; draw();
      $("#results", root).onclick = e => { const r = e.target.closest("[data-pick]"); if (r) go("flashPick", { id: r.dataset.pick }); };
    }
  };
  /* ----- session detail (tattoo record + timer) ----- */
  let tick = null;
  screens.session = {
    html({ id }) {
      const s = DB.get(id);
      if (!s) return `${bar("Session", { back: "queue" })}<div class="banner bad">Not found.</div>`;
      const t = s.tattoo || {};
      const f = (k, l, v, a = "") => `<label for="s_${k}">${l}</label><input id="s_${k}" value="${esc(v)}" ${a}>`;
      const suggested = suggestion(s);
      const pricing = { ...Pricing.defaults, ...(settings.pricing || {}) };
      return `${bar(esc(clientName(s.clientId)), { back: "queue" })}
        <div class="card"><div class="mute">${LABEL[s.status]}${s.flashName ? " · Flash: " + esc(s.flashName) : ""}</div>
          <div class="timer" id="timer">${fmt(elapsed(s))}</div>
          ${s.consentId ? `<div class="actions" style="margin-top:0"><button data-go="doc" data-id="${esc(s.consentId)}">Signed contract / countersign</button></div>` : ""}
          <div class="actions" style="margin-top:0">
            ${s.status === "inprogress" ? (running(s) ? `<button id="tPause">Pause (break)</button>` : `<button class="primary" id="tResume">Resume</button>`) : ""}
            ${["ready", "waiting", "paperwork"].includes(s.status) ? `<button class="primary" id="tStart">Start tattoo</button>` : ""}
            ${s.status === "inprogress" ? `<button class="primary" id="tDone">Finish tattoo</button>` : ""}</div></div>
        <div class="cols"><div>${f("description", "Tattoo description", t.description)}${f("location", "Body location", t.location)}${f("size", "Approximate size", t.size)}</div>
          <div>${f("price", "Price", s.price, 'inputmode="decimal"')}${suggested !== null ? `<div class="mute" id="priceSuggestion">Suggested: $${suggested} (${shortDuration(s.durationMs)} at $${pricing.rate}/hr) <button type="button" class="small" id="useSuggested">Use suggested</button></div>` : ""}${f("deposit", "Deposit", s.deposit, 'inputmode="decimal"')}${f("paid", "Amount paid", s.paid, 'inputmode="decimal"')}
            <label for="s_payMethod">Payment method</label><select id="s_payMethod">${["", "Cash", "Card", "Venmo / Cash App", "Other"].map(o => `<option ${o === (s.payMethod || "") ? "selected" : ""}>${o}</option>`).join("")}</select></div></div>
        <div class="card" style="margin-top:16px"><strong>Procedure record (artist use)</strong>
          <div class="cols"><div>${f("needleType", "Needle / cartridge type", (s.record || {}).needleType)}${f("needleLot", "Needle / cartridge lot", (s.record || {}).needleLot)}${f("barrier", "Barrier / dressing used", (s.record || {}).barrier)}</div>
          <div>${f("inkBrand", "Ink brand(s)", (s.record || {}).inkBrand)}${f("pigment", "Pigment / color(s)", (s.record || {}).pigment)}${f("inkLot", "Ink lot / batch number(s)", (s.record || {}).inkLot)}${f("inkExp", "Ink expiration date(s)", (s.record || {}).inkExp)}</div></div>
          <label style="display:flex;gap:10px;align-items:center;color:var(--fg)"><input type="checkbox" id="s_aftercare" style="width:26px;height:26px" ${(s.record || {}).aftercareProvided ? "checked" : ""}> Aftercare instructions provided</label>
          <label style="display:flex;gap:10px;align-items:center;color:var(--fg)"><input type="checkbox" id="s_photo" style="width:26px;height:26px" ${(s.record || {}).finalPhoto ? "checked" : ""}> Final procedure photograph taken</label>
          <label for="s_compl">Additional notes / complications</label><textarea id="s_compl" rows="2">${esc((s.record || {}).complications)}</textarea>
          <label style="display:flex;gap:10px;align-items:center;color:var(--fg);margin-top:14px"><input type="checkbox" id="s_ack" style="width:26px;height:26px" ${(s.record || {}).artistAck ? "checked" : ""}> Artist acknowledgment: I reviewed the client information, verified the client's age, addressed safety concerns, obtained consent, and provided or arranged aftercare instructions.</label></div>
        <label for="s_notes">Artist notes</label><textarea id="s_notes" rows="3">${esc(s.notes)}</textarea>
        <div class="actions"><button class="primary" id="sSave">Save</button><span id="sMsg" class="mute" style="align-self:center"></span></div>
        ${AftercareUI.sessionSection(s)}
        ${PhotosUI.sessionSection(s)} `;
    },
    bind(root, { id }) {
      clearInterval(tick);
      const s0 = DB.get(id); if (!s0) return;
      PhotosUI.bindSession(root, id);
      tick = setInterval(() => { const el = $("#timer"); if (!el || cur.name !== "session") { clearInterval(tick); return; } el.textContent = fmt(elapsed(DB.get(id))); }, 1000);
      const v = k => $("#s_" + k, root).value.trim();
      const saveFields = async () => save(DB.get(id), { tattoo: { description: v("description"), location: v("location"), size: v("size") },
        record: { needleType: v("needleType"), needleLot: v("needleLot"), barrier: v("barrier"), inkBrand: v("inkBrand"), pigment: v("pigment"), inkLot: v("inkLot"), inkExp: v("inkExp"),
          aftercareProvided: $("#s_aftercare", root).checked, finalPhoto: $("#s_photo", root).checked, complications: $("#s_compl", root).value,
          artistAck: $("#s_ack", root).checked, artistAckAt: $("#s_ack", root).checked ? (((DB.get(id) || {}).record || {}).artistAckAt || new Date().toISOString()) : null },
        price: v("price"), deposit: v("deposit"), paid: v("paid"), payMethod: $("#s_payMethod", root).value, notes: $("#s_notes", root).value });
      $("#sSave", root).onclick = async () => { await saveFields(); $("#sMsg", root).textContent = "Saved"; };
      $("#useSuggested", root)?.addEventListener("click", () => { $("#s_price", root).value = suggestion(DB.get(id)); });
      $("#acGive", root).onclick = async () => {
        try { await saveFields(); await Aftercare.give(id, $("#acPick", root).value); go("session", { id }); }
        catch (e) { alert(e.message); }
      };
      const wire = (sel, fn) => { const el = $(sel, root); if (el) el.onclick = async () => { await saveFields(); await fn(DB.get(id)); go("session", { id }); }; };
      wire("#tStart", s => startTimer(s));
      wire("#tResume", s => save(s, { segments: [...segs(s), { s: new Date().toISOString(), e: null }] }));
      wire("#tPause", s => save(s, { segments: segs(s).map(x => x.e ? x : { ...x, e: new Date().toISOString() }) }));
      wire("#tDone", async s => { const done = await save(s, { segments: segs(s).map(x => x.e ? x : { ...x, e: new Date().toISOString() }), status: "completed", endedAt: new Date().toISOString(),
        durationMs: elapsed({ segments: segs(s).map(x => x.e ? x : { ...x, e: new Date().toISOString() }) }) }); await Flash.complete(done.flashId); });
    }
  };

  /* ----- tattoo history for a client profile ----- */
  function historyHtml(clientId) {
    const list = sessions().filter(s => s.clientId === clientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list.map(s => `<div class="row" data-go="session" data-id="${esc(s.id)}"><div class="grow">${esc((s.tattoo && s.tattoo.description) || s.flashName || "Tattoo session")}
      <div class="sub">${esc(new Date(s.createdAt).toLocaleDateString())} · ${LABEL[s.status]}${s.eventId && DB.get(s.eventId) ? " · " + esc(DB.get(s.eventId).name) : ""}${s.tattoo && s.tattoo.location ? " · " + esc(s.tattoo.location) : ""}${s.price !== "" && s.price != null ? " · " + money(s.price) : ""}${s.durationMs ? " · " + fmt(s.durationMs) : ""}</div></div><div class="mute">›</div></div>`).join("")
      || '<span class="mute">No sessions yet.</span>';
  }
  return { historyHtml, createSession, openForPaperwork, claim: id => Flash.claim(id, null) };
})();
