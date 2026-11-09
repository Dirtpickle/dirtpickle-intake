"use strict";

const Mailer = (() => {
  const relayFromSettings = () => {
    const s = DB.get("settings") || {};
    return { url: (s.emailRelayUrl || "").trim(), secret: s.relaySecret || "" };
  };
  const configured = relay => !!(relay && relay.url && relay.secret);
  const addressFor = doc => doc.to || (doc.clientSnapshot || {}).email || (doc.clientId && (DB.get(doc.clientId) || {}).email) || "";
  const fileNameFor = doc => doc.type === "aftercare" ? `${(doc.clientSnapshot.legalName || "client").replace(/[^a-z0-9]+/gi, "-")}-aftercare-${doc.createdAt.slice(0, 10)}.pdf` : Consent.fileName(doc);
  const bytesToB64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  let retrying = false;

  async function sendDocument(doc, relay) {
    if (!configured(relay)) throw new Error("Email relay is not configured");
    const response = await fetch(relay.url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ secret: relay.secret, to: addressFor(doc), subject: doc.type === "aftercare" ? MAILER_CONFIG.aftercareSubject : MAILER_CONFIG.subject,
        body: doc.type === "aftercare" ? MAILER_CONFIG.aftercareBody : MAILER_CONFIG.body, filename: fileNameFor(doc), pdfBase64: doc.pdf })
    });
    let reply;
    try { reply = await response.json(); } catch (_) { throw new Error("Email relay returned an invalid response"); }
    if (!response.ok || !reply.ok) throw new Error(reply.error || `Email relay failed (${response.status})`);
    return reply;
  }

  async function update(doc, status, error = "") {
    return DB.updateEmailStatus(doc.id, { emailStatus: status, emailError: error || null,
      emailedAt: status === "sent" ? new Date().toISOString() : null });
  }

  async function send(doc, to) {
    const relay = relayFromSettings();
    const recipient = (to || addressFor(doc)).trim();
    if (!recipient) throw new Error("Enter an email address first");
    if (!configured(relay)) throw new Error("Save the email relay URL and secret in Settings first");
    await update(doc, "queued");
    if (!navigator.onLine) return { queued: true };
    try {
      await sendDocument({ ...doc, to: recipient }, relay);
      await update(doc, "sent");
      return { sent: true };
    } catch (e) {
      await update(doc, "failed", e.message);
      throw e;
    }
  }

  async function retryAll() {
    if (retrying || !DB.isUnlocked() || !navigator.onLine || !configured(relayFromSettings())) return;
    retrying = true;
    try {
      for (const doc of [...DB.all("consent"), ...DB.all("countersign"), ...DB.all("aftercare")]) {
        if (!["queued", "failed"].includes(doc.emailStatus)) continue;
        try { await send(doc); } catch (_) { /* status is retained for the next retry */ }
      }
    } finally { retrying = false; }
  }

  async function sendTest(to) {
    const pdf = await PDFLib.PDFDocument.create();
    const page = pdf.addPage([240, 120]);
    page.drawText("Dirtpickle email relay test", { x: 24, y: 70, size: 12 });
    const bytes = await pdf.save();
    return sendDocument({ pdf: bytesToB64(bytes), signedAt: new Date().toISOString(),
      clientSnapshot: { legalName: "relay-test", email: to } }, relayFromSettings());
  }

  function settingsHtml() {
    const s = DB.get("settings") || {};
    return `<label for="relayUrl">Email relay URL</label><input id="relayUrl" type="url" value="${esc(s.emailRelayUrl || "")}" placeholder="Apps Script /exec URL">
      <label for="relaySecret">Relay secret</label><input id="relaySecret" type="password" value="" placeholder="${s.relaySecret ? "Saved; leave blank to keep" : "Enter the Apps Script secret"}" autocomplete="new-password">
      <label for="testEmail">Test email address</label><input id="testEmail" type="email" placeholder="you@example.com" autocomplete="off">
      <button id="sendTestEmail" type="button">Send test email</button><span id="relayMsg" class="mute" style="margin-left:8px"></span>`;
  }

  function readSettings(root, current) {
    const secret = $("#relaySecret", root).value;
    return { ...current, emailRelayUrl: $("#relayUrl", root).value.trim(), ...(secret ? { relaySecret: secret } : {}) };
  }

  function bindSettings(root) {
    $("#sendTestEmail", root).onclick = async () => {
      const to = $("#testEmail", root).value.trim();
      const msg = $("#relayMsg", root);
      if (!to) { msg.textContent = "Enter an address first."; return; }
      try { await sendTest(to); msg.textContent = "Test sent."; }
      catch (e) { msg.textContent = e.message; }
    };
  }

  addEventListener("online", () => retryAll().catch(() => {}));
  return { sendDocument, send, retryAll, sendTest, settingsHtml, readSettings, bindSettings, configured, relayFromSettings };
})();
