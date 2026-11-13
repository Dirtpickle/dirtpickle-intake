# Dirtpickle Intake - agent guide

Offline-first tattoo intake/management PWA (artist: Mike Peterson, "Dirtpickle"). Plain HTML/JS/CSS, no build step,
no backend, no cloud. IndexedDB storage. Runs on iPad (main), Windows, Android via Add to Home Screen.
Keep replies short.

## Architecture (do not break)
- INTAKE side (no PIN): can only ADD sealed submissions (RSA-encrypted inbox). Cannot read stored records.
  Reads only public data (form wording, business name, min age, available flash).
- PRO side (6-digit PIN -> PBKDF2 -> AES-GCM key): imports inbox, merges returning clients, creates sessions/consents.
- Signed consents are write-once and store the exact wording, PDF and SHA-256. Forgotten PIN = unrecoverable data.
- Backups (.dpbackup) are encrypted; restore needs the original PIN. No sync between devices.
- Saved-data changes need a migration plus an old-format test. Never store license numbers.

## Layout (js/)
db.js store/crypto/backup-import | app.js boot/router/PIN/home/client/settings | consent.js contract UI, signature, PDFs, kiosk
contract.js contract template data | intake.js intake side + inbox import | sessions.js queue/flash/session/timer
appointments.js appointment data/rules | appointments-ui.js appointment screens | calendar-sync.js relay queue | calendar-settings.js settings
intake-staff.js intake staff license screens/scanner
backup.js | formeditor.js | aamva.js license barcode parser | scan.js camera/photo scan | sw.js service worker
vendor/ = pdf-lib, zxing-wasm (do not edit). email-test/ = scratch, ignore.

## Rules
- A license number may be stored in the encrypted client record; never in PDFs, emails, flash/public data or logs.
- Bump the cache name in sw.js on every release.
- No new dependencies or network calls (offline-first) without approval.
- Do not claim legal compliance. Contract wording is a draft; do not rewrite it unasked.
- Never display an ink as "safe"; allergy matching is a soft highlight only. Do not invent ink ingredients.
- Monolith watch: app.js (~460) and consent.js (~536) exceed 300 lines. Split what you touch before adding to it.

## Verify
`npm install && npx playwright install chromium && npm test`

## Adding a shop later
Use the local `FlashStore` seam in `js/flash-store.js` for shop reservations, order imports, and redemption. Keep payment, network, and buyer credentials out of the app until an explicit offline/security design is approved; `redeem` and `importOrders` are intentionally documented stubs.

## Protected / not Codex's job
- vendor/, manifest.json icons. Pushing to GitHub, deploying, G:\My Drive. Real-device (iPad) testing.
