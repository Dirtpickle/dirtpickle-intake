"use strict";

const TimesImportUI = (() => {
  const label = s => `${clientName(s.clientId)} · ${s.flashCode || "no flash code"} · ${s.status}`;
  const sessions = () => DB.all("session").map(s => ({ ...s, flashCode: s.flashCode || ((s.flashId && DB.get(s.flashId)) || {}).code || "" }));
  const entryRow = (entry, all) => {
    const choices = TimesImport.suggest(entry, all);
    const match = TimesImport.classify(entry, all);
    const disabled = match.kind === "same";
    const update = match.kind === "update";
    const oldTime = update ? SessionTime.format(SessionTime.duration(match.session)) : "";
    const updateText = update ? `<div class="banner ok">Update · Updates time on ${esc(clientName(match.session.clientId))} from ${esc(oldTime)} to ${esc(SessionTime.format(entry.activeMs))}</div>` : "";
    return `<div class="card time-entry" data-entry-id="${esc(entry.id)}"><strong>${esc(entry.code)}</strong>
      <div class="sub">${esc(entry.label || "No note")} · ${esc(new Date(entry.startedAt).toLocaleDateString())} · ${SessionTime.format(entry.activeMs)}</div>
      ${disabled ? `<div class="banner ok">Already imported</div>` : `${updateText}<label>Attach to <select class="time-target"><option value="">Don't attach</option>${update ? `<option value="${esc(match.session.id)}" selected>${esc(label(match.session))}</option>` : choices.map(s => `<option value="${esc(s.id)}">${esc(label(s))}</option>`).join("")}</select></label>`}</div>`;
  };
  screens.timesImport = {
    html: () => `${bar("Import tattoo times", { back: "backup" })}
      <div class="card"><label for="timesFile">Choose a Tattoo Timer .json file</label><input id="timesFile" type="file" accept=".json,application/json">
      <label for="timesText">Or paste the file contents</label><textarea id="timesText" rows="7" placeholder='{"format":"tattoo-timer-1","entries":[]}'></textarea>
      <div class="actions"><button class="primary" id="timesRead">Read times</button></div><div id="timesErr"></div></div>
      <div id="timesEntries"></div><div class="actions" id="timesApplyArea" hidden><button class="primary" id="timesApply">Apply selected times</button></div>` ,
    bind(root) {
      let entries = [];
      const all = sessions();
      const err = message => { $("#timesErr", root).innerHTML = message ? `<div class="banner bad">${esc(message)}</div>` : ""; };
      $("#timesFile", root).onchange = async e => { const file = e.target.files[0]; if (file) $("#timesText", root).value = await file.text(); };
      $("#timesRead", root).onclick = () => {
        try { entries = TimesImport.parse($("#timesText", root).value); $("#timesEntries", root).innerHTML = entries.map(e => entryRow(e, all)).join("") || '<div class="mute">No time entries.</div>'; $("#timesApplyArea", root).hidden = !entries.some(e => TimesImport.classify(e, all).kind !== "same"); err(""); }
        catch (e) { entries = []; $("#timesEntries", root).innerHTML = ""; $("#timesApplyArea", root).hidden = true; err(e.message); }
      };
      $("#timesApply", root).onclick = async () => {
        let count = 0, skipped = 0;
        for (const entry of entries) {
          const row = root.querySelector(`[data-entry-id="${CSS.escape(entry.id)}"]`), target = row && $(".time-target", row)?.value;
          if (!target) continue;
          const current = DB.get(target);
          const match = TimesImport.classify(entry, all);
          if (!current || match.kind === "same" || (match.kind === "update" && current.id !== match.session.id)) { skipped++; continue; }
          await DB.put({ ...current, ...TimesImport.apply(current, entry), updatedAt: new Date().toISOString() }); count++;
        }
        alert(`${count} tattoo time${count === 1 ? "" : "s"} imported${skipped ? `; ${skipped} already imported` : ""}.`); go("queue");
      };
    }
  };
  return {};
})();
