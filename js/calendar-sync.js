"use strict";

const CalendarSync = (() => {
  let working = false;

  const enabled = () => {
    const s = DB.get("settings") || {};
    return s.calendarSync === true && Mailer.configured(Mailer.relayFromSettings());
  };

  function titleFor(appointment) {
    const client = DB.get(appointment.clientId) || {};
    const first = String(client.legalName || "Client").trim().split(/\s+/)[0];
    return appointment.title ? `${first} – ${appointment.title}` : first;
  }

  function bodyFor(appointment) {
    return `${appointment.durationMin} minutes\nDirtpickle intake app`;
  }

  async function saveStatus(appointment, fields) {
    const current = DB.get(appointment.id);
    if (!current) return;
    await DB.put({ ...current, ...fields, updatedAt: new Date().toISOString() });
  }

  async function send(appointment) {
    const relay = Mailer.relayFromSettings();
    const action = appointment.status === "cancelled" ? "calendar.delete" : "calendar.upsert";
    const start = appointment.start;
    const end = new Date(new Date(start).getTime() + appointment.durationMin * 60000).toISOString();
    const payload = action === "calendar.delete"
      ? { action, secret: relay.secret, calendarEventId: appointment.calendarEventId }
      : { action, secret: relay.secret, calendarName: (DB.get("settings") || {}).calendarName || "", title: titleFor(appointment), start, end,
        description: bodyFor(appointment), calendarEventId: appointment.calendarEventId || undefined };
    const response = await fetch(relay.url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(payload) });
    let reply;
    try { reply = await response.json(); } catch (_) { throw new Error("Calendar relay returned an invalid response"); }
    if (!response.ok || !reply.ok) throw new Error(reply.error || `Calendar relay failed (${response.status})`);
    if (action === "calendar.delete") await saveStatus(appointment, { calendarStatus: "off", calendarEventId: null, calendarError: null });
    else await saveStatus(appointment, { calendarStatus: "synced", calendarEventId: reply.calendarEventId, calendarError: null });
  }

  async function queue(appointment) {
    if (!enabled()) return saveStatus(appointment, { calendarStatus: "off" });
    await saveStatus(appointment, { calendarStatus: "queued", calendarError: null });
    if (!navigator.onLine) return;
    try { await send(DB.get(appointment.id)); }
    catch (e) { await saveStatus(appointment, { calendarStatus: "failed", calendarError: e.message }); }
  }

  async function retryAll() {
    if (working || !DB.isUnlocked() || !navigator.onLine || !enabled()) return;
    working = true;
    try {
      for (const appointment of Appointments.records()) {
        if (!["queued", "failed"].includes(appointment.calendarStatus)) continue;
        try { await send(appointment); }
        catch (e) { await saveStatus(appointment, { calendarStatus: "failed", calendarError: e.message }); }
      }
    } finally { working = false; }
  }

  addEventListener("online", () => retryAll().catch(() => {}));
  return { queue, retryAll, titleFor };
})();
