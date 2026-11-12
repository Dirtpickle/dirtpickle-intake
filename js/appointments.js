"use strict";

/* Appointment records and rules. UI lives in appointments-ui.js. */
const Appointments = (() => {
  const STATUSES = ["scheduled", "completed", "cancelled", "no-show"];

  const now = () => new Date().toISOString();
  const records = () => DB.all("appointment");
  const validStatus = status => STATUSES.includes(status) ? status : "scheduled";
  const overlaps = (a, b) => {
    if (a.status !== "scheduled" || b.status !== "scheduled") return false;
    const startA = new Date(a.start).getTime();
    const endA = startA + Number(a.durationMin || 0) * 60000;
    const startB = new Date(b.start).getTime();
    const endB = startB + Number(b.durationMin || 0) * 60000;
    return startA < endB && startB < endA;
  };

  function normalize(input, current = {}) {
    const stamp = now();
    return {
      ...current,
      ...input,
      type: "appointment",
      id: current.id || input.id || crypto.randomUUID(),
      durationMin: Math.max(1, Number(input.durationMin || current.durationMin || settings.appointmentDurationMin || 120)),
      title: String(input.title || current.title || "").trim(),
      status: validStatus(input.status || current.status),
      calendarStatus: input.calendarStatus || current.calendarStatus || "off",
      calendarEventId: input.calendarEventId || current.calendarEventId || null,
      calendarError: input.calendarError || null,
      createdAt: current.createdAt || stamp,
      updatedAt: stamp
    };
  }

  async function create(input) {
    const appointment = normalize(input);
    if (!appointment.clientId || !appointment.start) throw new Error("Client and start time are required");
    await DB.put(appointment);
    await CalendarSync.queue(appointment);
    return DB.get(appointment.id);
  }

  async function update(id, patch) {
    const current = DB.get(id);
    if (!current) throw new Error("Appointment not found");
    const appointment = normalize(patch, current);
    await DB.put(appointment);
    await CalendarSync.queue(appointment);
    return DB.get(id);
  }

  async function setStatus(id, status) {
    return update(id, { status, calendarStatus: status === "cancelled" ? "queued" : undefined });
  }

  async function cancel(id) { return setStatus(id, "cancelled"); }

  function upcoming() {
    const t = Date.now();
    return records().filter(a => a.status === "scheduled" && new Date(a.start).getTime() >= t)
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  function byDay(day) {
    return records().filter(a => new Date(a.start).toLocaleDateString() === new Date(day).toLocaleDateString())
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  function history() {
    return records().filter(a => a.status !== "scheduled" || new Date(a.start).getTime() < Date.now())
      .sort((a, b) => b.start.localeCompare(a.start));
  }

  function conflicts(candidate, exceptId = "") {
    return records().filter(a => a.id !== exceptId && overlaps(candidate, a));
  }

  function conflictWarning(candidate, exceptId = "") {
    const count = conflicts(candidate, exceptId).length;
    return count ? `${count} appointment${count === 1 ? "" : "s"} overlap this time.` : "";
  }

  async function convertToSession(id) {
    const appointment = DB.get(id);
    if (!appointment) throw new Error("Appointment not found");
    const session = await Sessions.createSession(appointment.clientId, appointment.flashId);
    await update(id, { status: "completed", sessionId: session.id });
    return session;
  }

  return { create, update, cancel, setStatus, upcoming, byDay, history, conflicts, conflictWarning, convertToSession, records };
})();
