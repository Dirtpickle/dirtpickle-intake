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

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
