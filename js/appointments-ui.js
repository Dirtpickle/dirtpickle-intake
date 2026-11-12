"use strict";

const AppointmentUI = (() => {
  const localValue = iso => {
    const d = new Date(iso || Date.now());
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  function isoValue(value) {
    const d = new Date(value);
    const offset = -d.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
    const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
    const local = value.length === 16 ? `${value}:00` : value;
    return `${local}${sign}${hours}:${minutes}`;
  }
  function dayLabel(iso) {
    const date = new Date(iso);
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 86400000);
    if (date.toLocaleDateString() === today.toLocaleDateString()) return "Today";
    if (date.toLocaleDateString() === tomorrow.toLocaleDateString()) return "Tomorrow";
    return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  }
  const timeLabel = iso => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const clientLabel = id => nameOf(DB.get(id) || { legalName: "Unknown client" });

  function row(a) {
    return `<div class="row" style="cursor:default"><div class="grow"><strong>${esc(timeLabel(a.start))} · ${esc(clientLabel(a.clientId))}</strong><div class="sub">${esc(a.title || "Tattoo appointment")} · ${a.durationMin} min${a.calendarStatus === "failed" ? " · calendar sync failed" : ""}</div></div>
      ${a.status === "scheduled" ? `<button class="small primary" data-appt="start" data-id="${esc(a.id)}">Start session</button><button class="small" data-appt="no-show" data-id="${esc(a.id)}">No-show</button><button class="small danger" data-appt="cancel" data-id="${esc(a.id)}">Cancel</button>` : ""}<button class="small" data-appt="edit" data-id="${esc(a.id)}">Edit</button></div>`;
  }

  function grouped(list) {
    const groups = [];
    for (const a of list) { const label = dayLabel(a.start); let g = groups.find(x => x.label === label); if (!g) groups.push(g = { label, rows: [] }); g.rows.push(a); }
    return groups.map(g => `<h3>${esc(g.label)}</h3><div class="card">${g.rows.map(row).join("")}</div>`).join("");
  }

  screens.appointments = { html() {
    return `${bar("Appointments", { back: "home" })}<div class="actions"><button class="primary" data-appt="new">+ New appointment</button></div>
      ${grouped(Appointments.upcoming()) || '<div class="card mute">No upcoming appointments.</div>'}
      <details style="margin-top:20px"><summary>History (${Appointments.history().length})</summary><div class="card">${Appointments.history().map(row).join("") || '<span class="mute">No past appointments.</span>'}</div></details>`;
  }};

  screens.appointmentForm = { html({ id, clientId }) {
    const a = id ? DB.get(id) : { clientId, start: new Date(Date.now() + 3600000).toISOString(), durationMin: settings.appointmentDurationMin || 120 };
    const selected = a.clientId ? DB.get(a.clientId) : null;
    return `${bar(id ? "Edit appointment" : "New appointment", { back: "appointments" })}<div class="card">
      <label for="apptClientSearch">Client</label><input id="apptClientSearch" value="${esc(selected ? nameOf(selected) : "")}" placeholder="Search client by name, phone or email" autocomplete="off"><input id="apptClientId" type="hidden" value="${esc(a.clientId || "")}"><div id="apptClientResults"></div>
      <label for="apptStart">Date and time</label><input id="apptStart" type="datetime-local" value="${localValue(a.start)}">
      <label for="apptDuration">Duration (minutes)</label><input id="apptDuration" type="number" min="1" value="${a.durationMin || 120}">
      <label for="apptTitle">Tattoo or flash summary</label><input id="apptTitle" value="${esc(a.title || "")}" maxlength="120">
      <label for="apptFlash">Flash design (optional)</label><select id="apptFlash"><option value="">No flash design</option>${DB.all("flash").filter(f => f.status === "available" || f.id === a.flashId).map(f => `<option value="${esc(f.id)}" ${f.id === a.flashId ? "selected" : ""}>${esc(f.name)}</option>`).join("")}</select>
      <label for="apptDeposit">Deposit note</label><input id="apptDeposit" value="${esc(a.depositNote || "")}">
      <label for="apptNotes">Notes</label><textarea id="apptNotes" rows="3">${esc(a.notes || "")}</textarea><div id="apptMsg"></div>
      <div class="actions"><button class="primary" id="saveAppointment">Save appointment</button><button data-go="appointments">Cancel</button></div></div>`;
  }, bind(root, { id }) {
    const q = $("#apptClientSearch", root), results = $("#apptClientResults", root);
    const draw = () => { results.innerHTML = searchClients(q.value).slice(0, 10).map(c => `<button type="button" class="row" data-client="${esc(c.id)}">${esc(nameOf(c))}</button>`).join(""); };
    q.oninput = draw; results.onclick = e => { const b = e.target.closest("[data-client]"); if (!b) return; $("#apptClientId", root).value = b.dataset.client; q.value = nameOf(DB.get(b.dataset.client)); results.innerHTML = ""; };
    $("#saveAppointment", root).onclick = async () => {
      const data = { clientId: $("#apptClientId", root).value, start: isoValue($("#apptStart", root).value), durationMin: $("#apptDuration", root).value, title: $("#apptTitle", root).value, flashId: $("#apptFlash", root).value || null, depositNote: $("#apptDeposit", root).value, notes: $("#apptNotes", root).value };
      const msg = $("#apptMsg", root); const candidate = { ...data, status: "scheduled" }; const conflicts = Appointments.conflicts(candidate, id);
      if (!data.clientId) { msg.innerHTML = '<div class="banner bad">Choose a client.</div>'; return; }
      if (conflicts.length && !msg.dataset.confirmed) { msg.innerHTML = `<div class="banner warn">This overlaps ${conflicts.length} existing appointment(s). <button id="confirmAppointment" class="small">Book anyway</button></div>`; msg.dataset.confirmed = "1"; $("#confirmAppointment", root).onclick = () => $("#saveAppointment", root).click(); return; }
      try { if (id) await Appointments.update(id, data); else await Appointments.create(data); go("appointments"); } catch (e) { msg.innerHTML = `<div class="banner bad">${esc(e.message)}</div>`; }
    };
  }};

  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-appt]"); if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.appt === "new") return go("appointmentForm");
    if (b.dataset.appt === "edit") return go("appointmentForm", { id });
    if (b.dataset.appt === "start") { const session = await Appointments.convertToSession(id); return go("session", { id: session.id }); }
    if (b.dataset.appt === "no-show" && confirm("Mark this appointment as a no-show?")) { await Appointments.setStatus(id, "no-show"); go("appointments"); }
    if (b.dataset.appt === "cancel" && confirm("Cancel this appointment and remove it from the calendar?")) { await Appointments.cancel(id); go("appointments"); }
  });
  return {};
})();
