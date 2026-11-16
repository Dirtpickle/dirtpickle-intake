"use strict";

/* Pure parsing, ranking, and application for Tattoo Timer exports. */
const TimesImport = (() => {
  const parse = text => {
    let data;
    try { data = JSON.parse(text); } catch (_) { throw new Error("Tattoo times file is not valid JSON."); }
    if (!data || data.format !== "tattoo-timer-1") throw new Error("Unsupported tattoo times format; expected tattoo-timer-1.");
    if (!Array.isArray(data.entries)) throw new Error("Tattoo times file must contain an entries array.");
    for (const entry of data.entries) {
      if (!entry || !entry.id || !entry.code || !Number.isFinite(Number(entry.activeMs)) || !Array.isArray(entry.segments)) {
        throw new Error("Each tattoo time entry needs an id, code, activeMs, and segments.");
      }
    }
    return data.entries.map(entry => ({ ...entry, revision: Number.isInteger(entry.revision) && entry.revision >= 0 ? entry.revision : 0 }));
  };
  const codeFor = s => FlashCode.normalize(s.flashCode || "");
  const revisionFor = entry => Number.isInteger(entry.revision) && entry.revision >= 0 ? entry.revision : 0;
  const appliedRevision = (session, id) => Number.isInteger(session.timerEntryRevisions?.[id]) && session.timerEntryRevisions[id] >= 0 ? session.timerEntryRevisions[id] : 0;
  const classify = (entry, sessions) => {
    const session = sessions.find(s => (s.timerEntryIds || []).includes(entry.id));
    if (!session) return { entry, kind: "new", session: null };
    return { entry, session, kind: revisionFor(entry) > appliedRevision(session, entry.id) ? "update" : "same", appliedRevision: appliedRevision(session, entry.id) };
  };
  const rank = (entry, sessions) => sessions
    .filter(s => !(s.timerEntryIds || []).includes(entry.id))
    .map((s, index) => ({ session: s, index, code: codeFor(s), sameCode: codeFor(s) === FlashCode.normalize(entry.code), active: ["inprogress", "completed"].includes(s.status) }))
    .sort((a, b) => Number(b.sameCode) - Number(a.sameCode) || Number(b.active) - Number(a.active) || (b.session.createdAt || "").localeCompare(a.session.createdAt || "") || a.index - b.index)
    .map(x => x.session);
  const suggest = (entry, sessions) => rank(entry, sessions);
  const apply = (session, entry) => ({
    durationMs: Number(entry.activeMs), segments: entry.segments, timeSource: "timer-app",
    timerEntryIds: (session.timerEntryIds || []).includes(entry.id) ? [...session.timerEntryIds] : [...(session.timerEntryIds || []), entry.id],
    timerEntryRevisions: { ...(session.timerEntryRevisions || {}), [entry.id]: revisionFor(entry) }
  });
  const importedIds = sessions => new Set(sessions.flatMap(s => s.timerEntryIds || []));
  return { parse, suggest, apply, classify, importedIds };
})();
