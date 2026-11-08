"use strict";
const C = window.CONFIG;
const $ = s => document.querySelector(s);
const log = m => { $("#log").textContent = `${new Date().toLocaleTimeString()}  ${m}\n` + $("#log").textContent; };

/* ---------- tiny IndexedDB wrapper ---------- */
const dbp = new Promise((res, rej) => {
  const r = indexedDB.open("dp-intake", 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore("kv");
    r.result.createObjectStore("outbox", { keyPath: "id" });
  };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function tx(store, mode, fn) {
  const db = await dbp;
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => res(out && out.result !== undefined ? out.result : undefined);
    t.onerror = () => rej(t.error);
  });
}
const kvGet = k => tx("kv", "readonly", s => s.get(k));
const kvSet = (k, v) => tx("kv", "readwrite", s => s.put(v, k));
const kvDel = k => tx("kv", "readwrite", s => s.delete(k));
const boxAll = () => tx("outbox", "readonly", s => s.getAll());
const boxPut = o => tx("outbox", "readwrite", s => s.put(o));

/* ---------- encryption of the refresh token at rest ----------
   A non-extractable AES-GCM key is kept in IndexedDB. This protects against casual
   inspection of stored data; it is NOT equal to iOS Keychain. */
async function getKey() {
  let k = await kvGet("aesKey");
  if (!k) {
    k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await kvSet("aesKey", k);
  }
  return k;
}
async function encrypt(text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await getKey(), new TextEncoder().encode(text));
  return { iv, data };
}
async function decrypt(box) {
  const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: box.iv }, await getKey(), box.data);
  return new TextDecoder().decode(buf);
}

/* ---------- helpers ---------- */
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randStr = n => b64url(crypto.getRandomValues(new Uint8Array(n)));
const utf8b64 = str => btoa(unescape(encodeURIComponent(str)));
const wrap76 = s => s.replace(/(.{76})/g, "$1\r\n");

/* ---------- OAuth 2.0 (authorization code + PKCE) ---------- */
async function startAuth() {
  const verifier = randStr(48);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = randStr(16);
  await kvSet("pkce", { verifier, state });
  const p = new URLSearchParams({
    client_id: C.CLIENT_ID, redirect_uri: C.REDIRECT_URI, response_type: "code",
    scope: C.SCOPE, access_type: "offline", prompt: "consent",
    code_challenge: challenge, code_challenge_method: "S256", state
  });
  location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + p;
}

async function handleRedirect() {
  const q = new URLSearchParams(location.search);
  if (!q.has("code") && !q.has("error")) return;
  history.replaceState(null, "", location.pathname);
  if (q.has("error")) { log("Google sign-in error: " + q.get("error")); return; }
  const saved = await kvGet("pkce");
  if (!saved || saved.state !== q.get("state")) { log("Sign-in state mismatch; try again."); return; }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: C.CLIENT_ID, client_secret: C.CLIENT_SECRET, code: q.get("code"),
      code_verifier: saved.verifier, redirect_uri: C.REDIRECT_URI, grant_type: "authorization_code"
    })
  });
  const j = await r.json();
  await kvDel("pkce");
  if (!r.ok) { log("Token exchange failed: " + JSON.stringify(j)); return; }
  if (!j.refresh_token) { log("No refresh token returned. Remove the app at myaccount.google.com/permissions and reconnect."); return; }
  await kvSet("refresh", await encrypt(j.refresh_token));
  accessToken = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  log("Gmail connected. Refresh token stored.");
}

let accessToken = null;
class AuthError extends Error {}
async function getAccessToken() {
  if (accessToken && accessToken.exp > Date.now()) return accessToken.token;
  const box = await kvGet("refresh");
  if (!box) throw new AuthError("Not connected");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: C.CLIENT_ID, client_secret: C.CLIENT_SECRET,
      refresh_token: await decrypt(box), grant_type: "refresh_token"
    })
  });
  const j = await r.json();
  if (!r.ok) {
    if (j.error === "invalid_grant") throw new AuthError("Authorization expired or revoked");
    throw new Error("Token refresh failed: " + JSON.stringify(j));
  }
  accessToken = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return accessToken.token;
}

/* ---------- minimal offline PDF (text only, no libraries) ---------- */
function makePdf(lines) {
  const esc = s => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7e]/g, "?");
  let y = 740, content = "BT /F1 12 Tf 54 " + y + " Td 16 TL\n";
  for (const l of lines) content += `(${esc(l)}) Tj T*\n`;
  content += "ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let pdf = "%PDF-1.4\n", offsets = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(o => { pdf += String(o).padStart(10, "0") + " 00000 n \n"; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return btoa(pdf); // pure ASCII, so btoa is safe
}

/* ---------- MIME + Gmail send ---------- */
function buildRaw(item) {
  const bnd = "dp_" + randStr(12);
  const msg = [
    `To: ${item.to}`,
    `Subject: =?UTF-8?B?${utf8b64(item.subject)}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${bnd}"`,
    "",
    `--${bnd}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(utf8b64(item.body)),
    `--${bnd}`,
    `Content-Type: application/pdf; name="${item.filename}"`,
    `Content-Disposition: attachment; filename="${item.filename}"`,
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(item.pdf),
    `--${bnd}--`
  ].join("\r\n");
  return b64url(new TextEncoder().encode(msg));
}

/* ---------- outbox / queue ---------- */
let flushing = false;
async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    for (const item of (await boxAll()).filter(i => i.status === "pending" || i.status === "auth_required")) {
      if (!navigator.onLine) { log("Offline; leaving queue pending."); break; }
      item.status = "sending"; item.error = ""; item.attempts = (item.attempts || 0) + 1;
      await boxPut(item); await render();           // persisted BEFORE the network call
      try {
        const token = await getAccessToken();
        const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ raw: buildRaw(item) })
        });
        if (r.ok) {
          const j = await r.json();
          item.status = "sent"; item.gmailId = j.id; item.sentAt = new Date().toISOString();
          item.pdf = null; // free space once Gmail has accepted it
          log("Sent to " + item.to + " (Gmail id " + j.id + ")");
        } else if (r.status === 401) {
          accessToken = null; item.status = "auth_required"; item.error = "Gmail rejected credentials";
        } else if (r.status === 429 || r.status >= 500) {
          item.status = item.attempts >= 5 ? "failed" : "pending"; item.error = "Gmail HTTP " + r.status;
        } else {
          item.status = "failed"; item.error = "Gmail HTTP " + r.status + ": " + (await r.text()).slice(0, 200);
        }
      } catch (e) {
        if (e instanceof AuthError) { item.status = "auth_required"; item.error = e.message; }
        else { item.status = item.attempts >= 5 ? "failed" : "pending"; item.error = String(e.message || e); }
      }
      await boxPut(item); await render();
      if (item.status === "auth_required") break;
    }
  } finally { flushing = false; }
}

async function queueTest() {
  const to = $("#to").value.trim(), name = $("#name").value.trim() || "Client";
  if (!/^\S+@\S+\.\S+$/.test(to)) { log("Enter a valid email address."); return; }
  const now = new Date();
  const pdf = makePdf([
    C.BUSINESS_NAME.toUpperCase() + " - TEST DOCUMENT", "",
    "Client: " + name, "Generated: " + now.toLocaleString(), "",
    "This is a test PDF created entirely on the device, offline.",
    "If you can read this in your inbox, the email pipeline works."
  ]);
  await boxPut({
    id: crypto.randomUUID(), to, status: "pending", attempts: 0, createdAt: now.toISOString(),
    subject: C.BUSINESS_NAME + " test paperwork",
    body: `Hello ${name},\r\n\r\nThank you for visiting ${C.BUSINESS_NAME}.\r\n\r\nAttached is a copy of your paperwork for your records.\r\n\r\n${C.BUSINESS_NAME}`,
    filename: "test-paperwork.pdf", pdf
  });
  log("Queued. " + (navigator.onLine ? "Sending…" : "Offline; it will send when you're back online."));
  await render();
  flush();
}

/* ---------- UI ---------- */
async function render() {
  const connected = !!(await kvGet("refresh"));
  $("#authStatus").innerHTML = connected
    ? '<span class="pill sent">Connected</span> Gmail send access stored on this device'
    : '<span class="pill failed">Not connected</span> Tap Connect Gmail';
  $("#btnConnect").hidden = connected;
  $("#btnDisconnect").hidden = !connected;
  $("#net").textContent = navigator.onLine ? "Online" : "Offline: items will wait in the queue";
  const items = (await boxAll()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  $("#outbox").innerHTML = items.length ? "" : "Empty";
  for (const i of items) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<span class="pill ${i.status}">${i.status.replace("_", " ")}</span> ${i.to}
      <div class="mute">${new Date(i.createdAt).toLocaleString()} · tries ${i.attempts || 0}${i.error ? " · " + i.error : ""}</div>`;
    $("#outbox").appendChild(row);
  }
}

async function recoverInterrupted() {
  // If the app died mid-send we cannot know whether Gmail accepted it. Don't auto-resend.
  for (const i of (await boxAll()).filter(i => i.status === "sending")) {
    i.status = "failed"; i.error = "Interrupted mid-send. Check Gmail Sent folder before retrying.";
    await boxPut(i);
  }
}

$("#btnConnect").onclick = () => startAuth().catch(e => log("Could not start sign-in: " + e.message));
$("#btnDisconnect").onclick = async () => { await kvDel("refresh"); accessToken = null; log("Disconnected locally."); render(); };
$("#btnQueue").onclick = queueTest;
$("#btnFlush").onclick = async () => {
  for (const i of (await boxAll()).filter(i => i.status === "failed")) { i.status = "pending"; i.attempts = 0; await boxPut(i); }
  flush();
};
window.addEventListener("online", () => { render(); flush(); });
window.addEventListener("offline", render);
document.addEventListener("visibilitychange", () => { if (!document.hidden) flush(); });

(async () => {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(e => log("SW: " + e.message));
  if (navigator.storage && navigator.storage.persist) {
    try { log("Persistent storage granted: " + (await navigator.storage.persist())); } catch (_) {}
  }
  await recoverInterrupted();
  try { await handleRedirect(); } catch (e) { log("Sign-in error: " + e.message); }
  await render();
  flush();
})();
