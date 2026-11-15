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
    return data.entries;
  };
  const codeFor = s => FlashCode.normalize(s.flashCode || "");
  const rank = (entry, sessions) => sessions
    .filter(s => !(s.timerEntryIds || []).includes(entry.id))
    .map((s, index) => ({ session: s, index, code: codeFor(s), sameCode: codeFor(s) === FlashCode.normalize(entry.code), active: ["inprogress", "completed"].includes(s.status) }))
    .sort((a, b) => Number(b.sameCode) - Number(a.sameCode) || Number(b.active) - Number(a.active) || (b.session.createdAt || "").localeCompare(a.session.createdAt || "") || a.index - b.index)
    .map(x => x.session);
  const suggest = (entry, sessions) => rank(entry, sessions);
  const apply = (session, entry) => ({
    durationMs: Number(entry.activeMs), segments: entry.segments, timeSource: "timer-app",
    timerEntryIds: [...(session.timerEntryIds || []), entry.id]
  });
  const importedIds = sessions => new Set(sessions.flatMap(s => s.timerEntryIds || []));
  return { parse, suggest, apply, importedIds };
})();
