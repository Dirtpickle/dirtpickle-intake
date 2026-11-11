
"use strict";

const IdVerifyUI = (() => {
  const escText = value => esc(value || "");

  function licenseField(client) {
    return `<label for="licenseNumber">License number (optional)</label><input id="licenseNumber" value="${escText(client.licenseNumber)}" autocomplete="off">`;
  }

  function matchBanner(scanned, client) {
    if (!scanned) return "";
    const result = IdMatch.compare(scanned, client);
    if (result.matched) return `<div class="banner ok" id="idMatchBanner">✓ Barcode name and birth date match.</div>`;
    return `<div class="banner warn" id="idMatchBanner">The license barcode says ${escText(scanned.legalName)} / DOB ${escText(scanned.dob)}; this differs from what was entered</div>`;
  }

  function status(client) {
    const checks = client.idChecks || [];
    const latest = checks.slice().reverse().find(check => check.type === "artist-override" || check.method === "pdf417-barcode");
    if (latest && latest.type === "artist-override") return "artist verified in person";
    if (latest) return latest.matched === false ? "barcode read, mismatch" : "barcode read & matched";
    return (client.idPhotos || []).length ? "photo only" : "not verified";
  }

  function profileCard(client, canOverride) {
    const allowed = canOverride && Perms.can("overrideId");
    return `<div class="card"><strong>ID verification</strong><div style="margin-top:8px">Status: <b>${escText(status(client))}</b></div>
      ${allowed ? `<div class="actions" style="margin-top:10px"><button id="artistOverride">Artist override: I verified this ID in person</button></div>` : ""}
      <div id="overrideMsg"></div></div>`;
  }

  return { licenseField, matchBanner, profileCard, status };
})();
