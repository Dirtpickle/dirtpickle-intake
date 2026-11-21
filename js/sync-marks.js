"use strict";

/* Carries the artist's signature and initials (stored in settings) through sync as one extra package item. */
const SyncMarks = (() => {
  const TYPE = "artistmarks";
  const time = v => (v ? new Date(v).getTime() : 0);

  function record() {
    const s = DB.get("settings") || {};
    if (!s.artistSignature && !s.artistInitials) return null;
    return { id: TYPE, type: TYPE, signature: s.artistSignature || null, initials: s.artistInitials || null, updatedAt: s.artistMarksAt || null };
  }

  function split(incoming) {
    const list = incoming || [];
    return { marks: list.find(r => r && r.type === TYPE) || null, rest: list.filter(r => !r || r.type !== TYPE) };
  }

  async function apply(marks) {
    if (!marks) return false;
    const s = DB.get("settings") || {};
    if (time(marks.updatedAt) <= time(s.artistMarksAt) && (s.artistSignature || s.artistInitials)) return false;
    await DB.put({ ...s, artistSignature: marks.signature || s.artistSignature, artistInitials: marks.initials || s.artistInitials, artistMarksAt: marks.updatedAt });
    return true;
  }

  return { record, split, apply };
})();
