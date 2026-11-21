"use strict";

/* Artist-side rules for deciding whether a returning client may use the short flow. */
const ReturningConsent = (() => {
  const reasons = { setting: "setting-off", none: "no-prior", version: "form-changed", id: "no-id-check", hash: "hash-mismatch" };
  const bytes = value => Uint8Array.from(atob(value || ""), c => c.charCodeAt(0));
  const sha256 = async value => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes(value)))].map(b => b.toString(16).padStart(2, "0")).join("");
  const consents = id => DB.all("consent").filter(d => d.locked && d.signedAt && d.clientId === id).sort((a, b) => String(b.signedAt).localeCompare(String(a.signedAt)));

  async function status(clientId) {
    const prior = consents(clientId)[0] || null;
    if (settings.allowShortReturning !== true) return { mode: "full", reason: reasons.setting, prior };
    if (!prior) return { mode: "full", reason: reasons.none, prior: null };
    const active = Consent.activeTemplate();
    if (!active || prior.template?.key !== "default" || prior.template.version !== active.version) return { mode: "full", reason: reasons.version, prior };
    if (!(DB.get(clientId)?.idChecks || []).length) return { mode: "full", reason: reasons.id, prior };
    if (!prior.pdf || !prior.sha256) return { mode: "full", reason: reasons.hash, prior };
    try {
      const hash = await sha256(prior.pdf);
      if (hash !== prior.sha256) return { mode: "full", reason: reasons.hash, prior };
    } catch (_) { return { mode: "full", reason: reasons.hash, prior }; }
    return { mode: "short", reason: "eligible", prior, active };
  }

  function banner(result) {
    if (!result?.prior) return "No signed agreement is on file. Full form will run.";
    const v = result.prior.template?.version || "?", current = result.active?.version || Consent.activeTemplate()?.version || "?";
    return `Signed form v${v} on file (${fmtDate(result.prior.signedAt)}). Current form is v${current}. ${result.mode === "short" ? "Short returning-client form will run." : "Full form will run."}`;
  }

  return { status, banner };
})();
