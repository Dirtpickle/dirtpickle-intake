"use strict";

const Aftercare = (() => {
  const STARTER = {
    key: "starter",
    title: "Aftercare (DRAFT - edit before use)",
    body: "Replace this text with your own aftercare instructions."
  };

  const now = () => new Date().toISOString();
  const versions = key => DB.all("aftercare-template").filter(t => t.key === key).sort((a, b) => a.version - b.version);
  const latest = key => versions(key).slice(-1)[0];
  const templates = () => DB.all("aftercare-template").filter(t => t.version === latest(t.key)?.version)
    .sort((a, b) => a.title.localeCompare(b.title));

  async function init() {
    if (!DB.all("aftercare-template").length) {
      await DB.put({ type: "aftercare-template", id: "aftercare-starter-v1", ...STARTER, version: 1, updatedAt: now() });
    }
  }

  async function save(template) {
    const key = template.key || crypto.randomUUID();
    const next = (latest(key)?.version || 0) + 1;
    return DB.put({ type: "aftercare-template", id: `aftercare-${key}-v${next}`, key,
      title: template.title.trim(), body: template.body.trim(), version: next, updatedAt: now() });
  }

  async function remove(key) {
    for (const t of versions(key)) await DB.remove(t.id);
  }

  async function give(sessionId, templateKey) {
    const session = DB.get(sessionId);
    const template = latest(templateKey);
    if (!session || !template) throw new Error("Session or aftercare template not found");
    const client = DB.get(session.clientId) || {};
    const createdAt = now();
    const pdf = await AftercarePdf.build({ title: template.title, version: template.version, body: template.body,
      clientName: client.legalName || "Client", sessionId, createdAt });
    const record = { type: "aftercare", id: crypto.randomUUID(), locked: true, sessionId,
      clientId: session.clientId, templateId: template.key, templateVersion: template.version,
      snapshotText: template.body, pdf: AftercarePdf.toB64(pdf), sha256: await AftercarePdf.hash(pdf),
      createdAt, clientSnapshot: { legalName: client.legalName || "Client", email: client.email || "" }, emailStatus: "not-sent" };
    await DB.put(record);
    return record;
  }

  const forSession = id => DB.all("aftercare").filter(d => d.sessionId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const documents = () => DB.all("aftercare").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const history = key => versions(key);
  return { init, templates, latest, versions: history, save, remove, give, forSession, documents };
})();
