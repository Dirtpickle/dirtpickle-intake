"use strict";

const SyncRelay = (() => {
  function relay() {
    const value = Mailer.relayFromSettings();
    if (!Mailer.configured(value)) throw new Error("Sync relay is not configured. Save the relay URL and secret in Settings.");
    if (!navigator.onLine) throw new Error("Sync needs an internet connection.");
    return value;
  }

  async function request(body) {
    const value = relay();
    let response;
    try {
      response = await fetch(value.url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ ...body, secret: value.secret }) });
    } catch (_) { throw new Error("Could not reach the sync relay. Check the connection."); }
    let reply;
    try { reply = await response.json(); } catch (_) { throw new Error("Sync relay returned an invalid response."); }
    if (!response.ok || !reply.ok) throw new Error(reply.error === "conflict" ? "Sync conflict: another device changed the copy. Please sync again." : (reply.error || `Sync relay failed (${response.status}).`));
    return reply;
  }

  return { get: () => request({ action: "sync.get" }), put: (sealed, baseVersion) => request({ action: "sync.put", sealed, baseVersion: baseVersion ?? null }) };
})();
