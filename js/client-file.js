"use strict";

/* Read-only aggregation for the artist's complete client file. */
const ClientFile = (() => {
  const byDateDesc = (a, b, key) => String(b[key] || "").localeCompare(String(a[key] || ""));
  const sessionsFor = id => DB.all("session").filter(s => s.clientId === id).sort((a, b) => byDateDesc(a, b, "createdAt"));
  const contractsFor = id => DB.all("consent").filter(d => d.clientId === id).sort((a, b) => byDateDesc(a, b, "signedAt"));

  function collect(clientId) {
    const client = DB.get(clientId);
    if (!client) return null;
    const sessions = sessionsFor(clientId);
    const consents = contractsFor(clientId);
    const countersigns = DB.all("countersign").filter(d => d.clientId === clientId);
    const photos = DB.all("photo").filter(p => p.clientId === clientId).sort((a, b) => byDateDesc(a, b, "createdAt"));
    const appointments = DB.all("appointment").filter(a => a.clientId === clientId).sort((a, b) => byDateDesc(a, b, "start"));
    return {
      client: { ...client }, sessions, consents, countersigns, photos,
      idChecks: [...(client.idChecks || [])].sort((a, b) => byDateDesc(a, b, "at")),
      idPhotos: [...(client.idPhotos || [])].sort((a, b) => byDateDesc(a, b, "at")),
      appointments
    };
  }

  const date = value => value ? new Date(value).toLocaleDateString() : "";
  const value = (label, text) => text === undefined || text === null || text === "" ? [] : [`${label}: ${text}`];
  const safeId = client => client.licenseNumber ? `ID on file: yes (${client.idType || "license"}), last 4 not shown` : "ID on file: no";
  const sessionTime = session => typeof SessionTime === "undefined" ? "" : SessionTime.format(SessionTime.duration(session));

  function summaryLines(data, opts = {}) {
    if (!data || !data.client) return [];
    const c = data.client, lines = [];
    lines.push("CLIENT FILE", "", "CLIENT DETAILS");
    lines.push(...value("Legal name", c.legalName), ...value("Preferred name", c.preferredName));
    lines.push(...value("Date of birth", c.dob ? `${c.dob}${typeof ageOn === "function" && ageOn(c.dob) !== null ? ` (age ${ageOn(c.dob)})` : ""}` : ""));
    lines.push(...value("Phone", c.phone), ...value("Email", c.email), ...value("Address", c.address));
    lines.push(...value("Emergency contact", [c.emergencyName, c.emergencyPhone].filter(Boolean).join(" · ")));
    lines.push(safeId(c), ...value("First registered", date(c.createdAt)));
    if (c.visits && c.visits.length) lines.push(`Visit dates: ${c.visits.map(date).join(", ")}`);
    lines.push(...value("Notes", c.notes));
    lines.push("", "ID & VERIFICATION");
    lines.push(`ID photo on file: ${data.idPhotos.length ? "yes" : "no"}`);
    for (const check of data.idChecks) lines.push(`ID check: ${date(check.at)} · ${check.method || "unknown method"} · ${check.result || "unknown result"} · visually matched: ${check.visuallyMatched ? "yes" : "no"}${check.overrideReason ? ` · override: ${check.overrideReason}` : ""}${check.who ? ` · ${check.who}` : ""}`);
    if (!data.idChecks.length) lines.push("No ID checks recorded.");
    lines.push("", "SESSIONS");
    for (const s of data.sessions) {
      const t = s.tattoo || {}, r = s.record || {};
      lines.push(`Session: ${date(s.createdAt)}${s.eventId && DB.get(s.eventId) ? ` · ${DB.get(s.eventId).name}` : ""}`);
      lines.push(...value("Flash", s.flashName || [s.flashCode, s.flashName].filter(Boolean).join(" · ")),
        ...value("Tattoo", t.description), ...value("Location", t.location), ...value("Size", t.size));
      lines.push(...value("Price", s.price === "" ? "" : `$${s.price}`), ...value("Deposit", s.deposit === "" ? "" : `$${s.deposit}`), ...value("Paid", s.paid === "" ? "" : `$${s.paid}${s.payMethod ? ` (${s.payMethod})` : ""}`), ...value("Tattoo time", sessionTime(s)));
      lines.push(...value("Procedure", [r.needleType, r.needleLot, r.barrier, r.inkBrand, r.pigment, r.inkLot, r.inkExp].filter(Boolean).join(" · ")),
        ...value("Aftercare given", r.aftercareProvided ? "yes" : "no"), ...value("Notes", s.notes), ...value("Consent", s.consentId ? "signed" : "none"), `Photo count: ${data.photos.filter(p => p.sessionId === s.id).length}`, "");
    }
    lines.push("PHOTOS", `Photo count: ${data.photos.length}`);
    for (const p of data.photos) lines.push(`${p.kind || "Photo"}: ${date(p.createdAt)}${p.note ? ` · ${p.note}` : ""}`);
    lines.push("", "SIGNED CONTRACTS");
    for (const d of data.consents) lines.push(`${d.template && d.template.title ? d.template.title : "Signed contract"}: ${date(d.signedAt)} · countersigned: ${DB.get("cs-" + d.id) ? "yes" : "no"} · SHA-256: ${(d.sha256 || "").slice(0, 12)} · emailed: ${d.emailStatus || "not-sent"}`);
    if (data.appointments.length) lines.push("", `Appointments on file: ${data.appointments.length}`);
    return lines;
  }

  return { collect, summaryLines };
})();
