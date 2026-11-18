"use strict";

const BackupMerge = (() => {
  const LOCKED_TYPES = new Set(["consent", "countersign", "aftercare", "photo"]);
  const MAX_AGE = 180 * 86400000;
  const locked = r => !!r.locked || LOCKED_TYPES.has(r.type);
  const stamp = r => [r.updatedAt, r.createdAt, r.signedAt].find(v => v != null && v !== "");
  const time = v => v ? new Date(v).getTime() : 0;
  const newer = (a, b) => time(stamp(a)) > time(stamp(b));
  const fields = c => ({ license: c.licenseNumber || "", name: (c.legalName || "").trim().toLowerCase(), dob: c.dob || "", phone: String(c.phone || "").replace(/\D/g, "") });
  const candidates = (client, clients) => { const f = fields(client); if (f.license) return clients.filter(c => c.licenseNumber === f.license);
    return clients.filter(c => { const x = fields(c); return (f.name && f.dob && x.name === f.name && x.dob === f.dob) || (f.name && x.name === f.name && f.phone.length >= 7 && x.phone === f.phone); }); };
  const union = (a, b, key, limit) => [...new Map([...(a[key] || []), ...(b[key] || [])].map(v => [JSON.stringify(v), v])).values()]
    .sort((x, y) => time(y.at || y.createdAt) - time(x.at || x.createdAt)).slice(0, limit);
  const mergeClient = (local, incoming) => { const base = newer(incoming, local) ? { ...local, ...incoming } : { ...incoming, ...local };
    return { ...base, id: local.id, visits: union(local, incoming, "visits", Infinity), idChecks: union(local, incoming, "idChecks", Infinity), idPhotos: union(local, incoming, "idPhotos", 3) }; };
  function counts(result) { const byType = {}; const add = (kind, r) => { const t = r.type || "unknown"; byType[t] ||= { add: 0, update: 0, skip: 0, conflicts: 0 }; byType[t][kind]++; };
    result.add.forEach(r => add("add", r)); result.update.forEach(r => add("update", r)); result.skip.forEach(r => add("skip", r));
    result.conflictTypes.forEach(t => { byType[t] ||= { add: 0, update: 0, skip: 0, conflicts: 0 }; byType[t].conflicts++; });
    result.counts = { add: result.add.length, update: result.update.length, skip: result.skip.length, conflicts: result.conflicts, byType }; return result; }
  function planTombstones(local, incoming, result) { const now = Date.now(); const map = new Map(local.filter(r => r.type === "tombstone").map(r => [r.targetId, r]));
    for (const old of local.filter(r => r.type === "tombstone" && now - time(r.deletedAt) > MAX_AGE)) result.remove.push({ id: old.id, force: true });
    for (const t of incoming.filter(r => r.type === "tombstone")) { if (!t.targetId || now - time(t.deletedAt) > MAX_AGE) continue;
      const current = local.find(r => r.id === t.targetId); if (current && current.type !== "tombstone" && (!locked(current) || t.force) && time(stamp(current)) <= time(t.deletedAt)) result.remove.push({ id: current.id, force: !!t.force });
      const old = map.get(t.targetId); if (!old || time(t.deletedAt) > time(old.deletedAt)) result.tombstones.push(t); map.set(t.targetId, t); }
    return map; }
  function merge(localRecords = [], incomingRecords = []) { const local = new Map(localRecords.filter(r => r.type !== "settings").map(r => [r.id, r]));
    const result = { add: [], update: [], skip: [], remove: [], tombstones: [], merged: 0, ambiguous: 0, conflicts: 0, conflictTypes: [] }; const tombstones = planTombstones([...local.values()], incomingRecords, result);
    const clients = [...local.values()].filter(r => r.type === "client"); const aliases = new Map();
    for (const incoming of incomingRecords.filter(r => r && r.type === "client" && !local.has(r.id))) {
      const found = candidates(incoming, clients); if (found.length === 1) aliases.set(incoming.id, found[0].id);
    }
    for (const incoming of incomingRecords) { if (!incoming || incoming.type === "settings" || incoming.type === "tombstone" || !incoming.id) continue; let current = local.get(incoming.id);
      if (!current && incoming.type === "client") { const found = candidates(incoming, clients); if (found.length === 1) { result.update.push(mergeClient(found[0], incoming)); result.merged++; continue; } if (found.length > 1) result.ambiguous++; }
      const record = incoming.clientId && aliases.has(incoming.clientId) ? { ...incoming, clientId: aliases.get(incoming.clientId) } : incoming; const blocked = tombstones.get(record.id);
      if (blocked && time(stamp(record)) <= time(blocked.deletedAt)) { result.skip.push(record); continue; } current = local.get(record.id);
      if (!current) result.add.push(record); else if (locked(record) || locked(current)) { result.skip.push(record); if (record.sha256 && current.sha256 && record.sha256 !== current.sha256) { result.conflicts++; result.conflictTypes.push(record.type || "unknown"); } }
      else if (newer(record, current)) result.update.push(record); else result.skip.push(record); }
    for (const record of result.add.concat(result.update)) if (record.clientId && aliases.has(record.clientId)) record.clientId = aliases.get(record.clientId);
    return counts(result); }
  return { merge };
})();
