"use strict";

/* Pure backup merge rules. It only compares already-decrypted records. */
const BackupMerge = (() => {
  const LOCKED_TYPES = new Set(["consent", "countersign", "aftercare", "photo"]);

  const locked = record => !!record.locked || LOCKED_TYPES.has(record.type);
  const stamp = record => [record.updatedAt, record.createdAt, record.signedAt]
    .find(value => value !== undefined && value !== null && value !== "");
  const newer = (incoming, local) => {
    const a = stamp(incoming), b = stamp(local);
    if (!a && !b) return false;
    if (!a) return false;
    if (!b) return true;
    return new Date(a).getTime() > new Date(b).getTime();
  };

  function typeCounts(result) {
    const byType = {};
    const add = (kind, record) => {
      const type = record.type || "unknown";
      byType[type] ||= { add: 0, update: 0, skip: 0, conflicts: 0 };
      byType[type][kind]++;
    };
    result.add.forEach(record => add("add", record));
    result.update.forEach(record => add("update", record));
    result.skip.forEach(record => add("skip", record));
    (result.conflictTypes || []).forEach(type => {
      byType[type] ||= { add: 0, update: 0, skip: 0, conflicts: 0 };
      byType[type].conflicts++;
    });
    result.counts = { add: result.add.length, update: result.update.length, skip: result.skip.length,
      conflicts: result.conflicts, byType };
    return result;
  }

  function merge(localRecords = [], incomingRecords = []) {
    const local = new Map(localRecords.filter(record => record.type !== "settings").map(record => [record.id, record]));
    const result = { add: [], update: [], skip: [], conflicts: 0, conflictTypes: [] };
    for (const incoming of incomingRecords) {
      if (!incoming || incoming.type === "settings" || !incoming.id) continue;
      const current = local.get(incoming.id);
      if (!current) { result.add.push(incoming); continue; }
      if (locked(incoming) || locked(current)) {
        result.skip.push(incoming);
        if (incoming.sha256 && current.sha256 && incoming.sha256 !== current.sha256) {
          result.conflicts++; result.conflictTypes.push(incoming.type || "unknown");
        }
      } else if (newer(incoming, current)) result.update.push(incoming);
      else result.skip.push(incoming);
    }
    return typeCounts(result);
  }

  return { merge };
})();
