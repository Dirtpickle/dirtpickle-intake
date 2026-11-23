"use strict";

const SyncSeal = (() => {
  const VERSION = 1, ITERATIONS = 600000, encoder = new TextEncoder(), decoder = new TextDecoder();
  const b64 = bytes => { let text = ""; for (const byte of bytes) text += String.fromCharCode(byte); return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const raw = text => { const value = text.replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(value + "=".repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0)); };
  const checksum = text => { let value = 2166136261; for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619); return (value >>> 0).toString(36); };
  async function derive(pin, salt) { const base = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); }
  async function seal(records, pin, saltB64) { const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await derive(pin, raw(saltB64)), encoder.encode(JSON.stringify(records)));
    return JSON.stringify({ version: VERSION, iv: b64(iv), data: b64(new Uint8Array(data)) }); }
  async function open(sealed, pin, saltB64) { try { const box = JSON.parse(sealed); if (box.version !== VERSION) throw new Error();
      const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw(box.iv) }, await derive(pin, raw(saltB64)), raw(box.data)); return JSON.parse(decoder.decode(data));
    } catch (_) { throw new Error("Could not open sync package: check the PIN, pairing code, and package."); } }
  function newKit() { return { salt: b64(crypto.getRandomValues(new Uint8Array(16))) }; }
  function pairingCode(kit) { const body = `v${VERSION}.${kit.salt}`; return `${body}.${checksum(body)}`; }
  function fromPairingCode(code) { const parts = String(code).split("."); const body = parts.slice(0, 2).join(".");
    if (parts.length !== 3 || parts[0] !== `v${VERSION}` || parts[2] !== checksum(body) || raw(parts[1]).length !== 16) throw new Error("Invalid pairing code."); return { salt: parts[1] }; }
  /* Short typed pairing code (no look-alike letters). The sync salt is derived from it, so typing the code on the second device is all that is needed. */
  const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  async function saltFromCode(code) {
    const clean = String(code).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (clean.length !== 8) throw new Error("The pairing code is 8 letters and numbers, like K7M-4QX9.");
    const hash = await crypto.subtle.digest("SHA-256", encoder.encode("dirtpickle-sync-v1:" + clean));
    return b64(new Uint8Array(hash).slice(0, 16));
  }
  async function newPairing() {
    const picks = crypto.getRandomValues(new Uint8Array(8)), raw8 = Array.from(picks, n => ALPHABET[n % ALPHABET.length]).join("");
    const code = raw8.slice(0, 4) + "-" + raw8.slice(4);
    return { code, salt: await saltFromCode(code) };
  }
  return { newKit, seal, open, pairingCode, fromPairingCode, newPairing, saltFromCode };
})();
