"use strict";

/* Artist-only "Confirm ID" review: shows the saved ID photo next to what was entered, then records the artist's call. */
const IdConfirm = (() => {
  const latestCheck = client => (client.idChecks || []).slice(-1)[0] || null;

  function details(client, check) {
    const age = ageOn(client.dob), rows = [["Name", client.legalName], ["Date of birth", client.dob ? `${client.dob}${age !== null ? ` (age ${age})` : ""}` : ""],
      ["ID state", check && check.idState], ["ID expires", check && check.idExpiry]];
    const expired = check && check.idExpired ? `<div class="banner warn">The barcode says this ID is expired.</div>` : "";
    const match = check && check.matched === false ? `<div class="banner warn">The barcode did not match what was typed. Look closely.</div>` : "";
    return `<dl class="kv">${rows.filter(r => r[1]).map(r => `<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`).join("")}</dl>${expired}${match}`;
  }

  function open(clientId) {
    return new Promise(resolve => {
      const client = DB.get(clientId), check = latestCheck(client || {}), photo = ((client || {}).idPhotos || []).slice(-1)[0];
      if (!client || !check) { resolve(false); return; }
      const screen = document.createElement("div");
      screen.className = "id-crop-screen";
      screen.innerHTML = `<div class="id-crop-panel"><h2>Confirm ID: ${esc(client.legalName)}</h2>
        <p class="mute">Compare the saved ID photo with the person and the details below.</p>
        ${photo ? `<img src="${photo.image}" alt="Saved photo of the ID" style="width:100%;max-height:62vh;object-fit:contain;background:#222;border-radius:12px">`
          : `<div class="banner warn">No ID photo is saved for this client. Only confirm if you checked the ID in person.</div>`}
        ${details(client, check)}
        <div class="actions"><button class="primary" data-confirm="yes">It matches: confirm</button><button class="danger" data-confirm="no">Does not match</button><button class="ghost" data-confirm="close">Close</button></div></div>`;
      document.body.appendChild(screen);
      screen.onclick = async event => {
        const act = event.target.dataset.confirm;
        if (!act) return;
        if (act !== "close") await record(client, act === "yes");
        screen.remove();
        resolve(act !== "close");
      };
    });
  }

  async function record(client, matched) {
    const checks = (client.idChecks || []).slice(), now = new Date().toISOString();
    checks[checks.length - 1] = { ...checks[checks.length - 1], visuallyMatched: matched,
      ...(matched ? { visuallyConfirmedAt: now } : { visuallyRejectedAt: now }) };
    await DB.put({ ...client, idChecks: checks, updatedAt: now });
  }

  return { open };
})();
