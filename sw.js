const CACHE = "dp-app-v22";
const SHELL = ["./", "index.html", "manifest.json", "css/style.css", "js/db.js", "js/mailer-config.js", "js/mailer.js", "js/aamva.js", "js/scan.js", "js/app.js", "js/contract.js", "js/consent.js", "js/aftercare-pdf.js", "js/aftercare.js", "js/aftercare-ui.js", "js/backup.js", "js/sessions.js", "js/formeditor.js", "js/intake.js",
  "js/initials-pad.js", "vendor/zxing/reader/index.js", "vendor/zxing/share.js", "vendor/zxing/zxing_reader.wasm", "vendor/pdf-lib/pdf-lib.min.js"];

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
