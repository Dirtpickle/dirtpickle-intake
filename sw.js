const CACHE = "dp-app-v96";
const SHELL = ["./", "index.html", "manifest.json", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "css/style.css", "js/error-banner.js", "js/db.js", "js/mailer-config.js", "js/mailer-attachments.js", "js/mailer.js", "assets/Tattoo-Aftercare.pdf", "js/pricing.js", "js/aamva.js", "js/id-match.js", "js/perms.js", "js/id-verify-ui.js", "js/scan.js", "js/idcheck.js", "js/id-card-detect.js", "js/id-crop.js", "js/id-crop-ui.js", "js/id-photo.js", "js/id-confirm.js", "js/events.js", "js/press-feedback.js", "js/nav.js", "js/app.js", "js/home.js", "js/profile.js", "js/profile-email.js", "js/events-ui.js", "js/contract.js", "js/consent.js", "js/aftercare-pdf.js", "js/aftercare.js", "js/aftercare-ui.js", "js/photos.js", "js/photos-ui.js", "js/backup.js", "js/session-time.js", "js/times-import.js", "js/times-import-ui.js", "js/sessions.js", "js/formeditor.js", "js/intake-staff.js", "js/intake.js",
  "js/initials-pad.js", "js/phone.js", "js/consent-paper.js", "js/consent-copy.js", "js/text-copy.js", "js/client-contact.js", "js/flash.js", "js/flash-code.js", "js/flash-picture.js", "js/flash-feed.js", "js/flash-import.js", "js/flash-store.js", "js/pin-keyboard.js", "js/flash-order.js", "js/flash-settings.js", "js/flash-bulk.js", "js/flash-select-ui.js", "js/flash-ui.js", "js/flash-settings-ui.js", "js/flash-order-ui.js", "js/calendar-sync.js", "js/appointments.js", "js/calendar-settings.js", "js/appointments-ui.js", "js/backup-merge.js", "js/backup-merge-ui.js", "js/client-file.js", "js/pdf-layout.js", "js/client-file-pdf.js", "js/id-recrop.js", "js/client-file-ui.js", "js/settings.js", "js/settings-business.js", "js/settings-contracts.js", "js/settings-google.js", "js/settings-danger.js", "js/returning-consent.js", "js/client-match.js", "vendor/zxing/reader/index.js", "vendor/zxing/share.js", "vendor/zxing/zxing_reader.wasm", "vendor/pdf-lib/pdf-lib.min.js"];

SHELL.push("js/sync-seal.js");
SHELL.push("js/sync-relay.js", "js/sync-engine.js", "js/sync-auto.js", "js/sync-marks.js", "js/pin-prompt.js", "js/app-version.js", "js/sync-ui.js", "js/flash-publish.js");
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network-first so updates arrive; cache fallback keeps the app working offline.
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
