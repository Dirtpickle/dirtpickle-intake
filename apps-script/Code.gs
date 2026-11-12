/**
 * Dirtpickle Intake - email relay. Runs on the artist's own Gmail (no billing, no OAuth setup).
 * Deploy: script.google.com > New project > paste this > set SECRET below >
 * Deploy > New deployment > Web app > Execute as: Me, Access: Anyone > copy the /exec URL into app Settings.
 * Request (POST, text/plain JSON): { secret, to, subject, body, filename, pdfBase64 }
 */
const SECRET = "CHANGE-ME-TO-A-LONG-RANDOM-STRING";
const FROM_NAME = "Dirtpickle";
const MAX_PER_DAY = 50;

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRET) return out({ ok: false, error: "unauthorized" });
    if (d.action) return calendarAction(d);
    if (!/^\S+@\S+\.\S+$/.test(d.to || "")) return out({ ok: false, error: "bad address" });
    if (!d.pdfBase64) return out({ ok: false, error: "no pdf" });
    if (MailApp.getRemainingDailyQuota() < 1) return out({ ok: false, error: "daily quota" });
    const pdf = Utilities.newBlob(Utilities.base64Decode(d.pdfBase64), "application/pdf", d.filename || "document.pdf");
    MailApp.sendEmail({ to: d.to, subject: d.subject || "Your signed agreement", body: d.body || "", name: FROM_NAME, attachments: [pdf] });
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function calendarAction(d) {
  if (!["calendar.upsert", "calendar.delete", "calendar.test"].includes(d.action)) return out({ ok: false, error: "unknown action" });
  if (d.action === "calendar.delete") {
    if (!d.calendarEventId) return out({ ok: false, error: "no calendar event id" });
    const event = CalendarApp.getEventById(d.calendarEventId);
    if (event) event.deleteEvent();
    return out({ ok: true, calendarEventId: d.calendarEventId });
  }
  if (d.action !== "calendar.test" && (!d.title || !d.start || !d.end)) return out({ ok: false, error: "missing calendar fields" });
  const calendar = (d.calendarName && CalendarApp.getCalendarsByName(d.calendarName)[0]) || CalendarApp.getDefaultCalendar();
  if (!calendar) return out({ ok: false, error: "calendar not found" });
  const title = d.title || "Dirtpickle calendar test";
  const start = d.start ? new Date(d.start) : new Date();
  const end = d.end ? new Date(d.end) : new Date(start.getTime() + 30 * 60000);
  let event = d.calendarEventId ? CalendarApp.getEventById(d.calendarEventId) : null;
  if (event) {
    event.setTitle(title).setTime(start, end).setDescription(d.description || "Dirtpickle intake app");
  } else {
    event = calendar.createEvent(title, start, end, { description: d.description || "Dirtpickle intake app" });
  }
  return out({ ok: true, calendarEventId: event.getId() });
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
