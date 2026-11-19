"use strict";

screens.home = {
  html: () => `${bar()}
    ${(() => { const n = Intake.takeNotice(); return n ? `<div class="banner ok">${esc(n)}.</div>` : ""; })()}
    ${Backup.overdue() ? `<div class="banner warn" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span style="flex:1">${esc(Backup.overdue())} Make a backup.</span><button class="small" data-go="backup">Back up now</button></div>` : ""}
    <div class="grid">
      <button class="tile primary" data-go="clientForm">NEW CLIENT<small>Register a new client</small></button>
      <button class="tile" data-go="returning">RETURNING CLIENT<small>Search name, phone or email</small></button>
      <button class="tile" data-go="clients">CLIENTS<small>${clients().length} on file</small></button>
      <button class="tile" data-go="queue">TODAY / QUEUE<small>${DB.all("session").filter(s => ["waiting", "paperwork", "ready", "inprogress"].includes(s.status)).length} active</small></button>
      <button class="tile" data-go="appointments">APPOINTMENTS<small>${Appointments.upcoming().length} upcoming</small></button>
      <button class="tile" data-go="more">MORE<small>Flash, events, documents, settings</small></button>
    </div>`
};

screens.more = {
  html: () => `${bar("More", { back: "home" })}
    <div class="grid">
      <button class="tile" data-go="flash">FLASH<small>${DB.all("flash").length} designs</small></button>
      <button class="tile" data-go="events">EVENTS<small>${esc((Events.getActive() || {}).name || "No active event")}</small></button>
      <button class="tile" data-go="documents">DOCUMENTS<small>${DB.all("consent").length} signed</small></button>
      <button class="tile" data-go="settings">SETTINGS<small>Business, age, auto-lock</small></button>
    </div>`
};
