"use strict";

/* Profile > More > "Email signed contract": re-sends a client's newest signed contract PDF to an address the artist confirms. */
const ProfileEmail = (() => {
  const latest = clientId => DB.all("consent").filter(d => d.clientId === clientId && d.signedAt)
    .sort((a, b) => String(b.signedAt).localeCompare(String(a.signedAt)))[0] || null;

  function panelHtml(doc, email) {
    const when = fmtDate(doc.signedAt);
    return `<div class="card" id="emailContractBox" style="margin:14px 0 0"><strong>Email signed contract</strong>
      <p class="mute" style="font-size:16px">${esc(doc.template && doc.template.title || "Signed contract")} signed ${esc(when)}${doc.template ? ", form v" + esc(doc.template.version) : ""}. Last emailed: ${esc(doc.emailStatus || "not-sent")}.</p>
      <label for="ecTo">Send to</label><input id="ecTo" type="email" autocomplete="off" value="${esc(email || "")}">
      <div class="actions"><button class="primary" id="ecSend">Send contract</button></div><div id="ecMsg"></div></div>`;
  }

  async function send(root, clientId) {
    const doc = latest(clientId), msg = $("#ecMsg", root);
    const show = (kind, text) => { msg.innerHTML = `<div class="banner ${kind}">${esc(text)}</div>`; };
    try {
      const result = await Mailer.send(doc, $("#ecTo", root).value);
      show(result.queued ? "warn" : "ok", result.queued ? "Offline. It is queued and will send when you are back online." : "Sent.");
    } catch (e) { show("bad", e.message); }
  }

  function bind(root, clientId) {
    const button = $("#emailContract", root);
    if (!button) return;
    button.onclick = () => {
      const old = $("#emailContractBox", root); if (old) { old.remove(); return; }
      const doc = latest(clientId);
      if (!doc) { button.insertAdjacentHTML("afterend", `<div class="banner warn" id="emailContractBox">No signed contract on file for this client yet.</div>`); return; }
      $("#profileMoreActions", root).insertAdjacentHTML("beforeend", panelHtml(doc, (DB.get(clientId) || {}).email));
      $("#ecSend", root).onclick = () => send(root, clientId);
    };
  }

  return { bind, latest };
})();
