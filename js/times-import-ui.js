"use strict";

const TimesImportUI = (() => {
  const label = s => `${clientName(s.clientId)} · ${s.flashCode || "no flash code"} · ${s.status}`;
  const sessions = () => DB.all("session").map(s => ({ ...s, flashCode: s.flashCode || ((s.flashId && DB.get(s.flashId)) || {}).code || "" }));
  const entryRow = (entry, all, imported) => {
    const choices = TimesImport.suggest(entry, all);
    const disabled = imported.has(entry.id);
    return `<div class="card time-entry" data-entry-id="${esc(entry.id)}"><strong>${esc(entry.code)}</strong>
      <div class="sub">${esc(entry.label || "No note")} · ${esc(new Date(entry.startedAt).toLocaleDateString())} · ${SessionTime.format(entry.activeMs)}</div>
      ${disabled ? `<div class="banner ok">Already imported</div>` : `<label>Attach to <select class="time-target"><option value="">Don't attach</option>${choices.map(s => `<option value="${esc(s.id)}">${esc(label(s))}</option>`).join("")}</select></label>`}</div>`;
  };
  screens.timesImport = {
    html: () => `${bar("Import tattoo times", { back: "queue" })}
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
        try { entries = TimesImport.parse($("#timesText", root).value); const imported = TimesImport.importedIds(all); $("#timesEntries", root).innerHTML = entries.map(e => entryRow(e, all, imported)).join("") || '<div class="mute">No time entries.</div>'; $("#timesApplyArea", root).hidden = !entries.some(e => !imported.has(e.id)); err(""); }
        catch (e) { entries = []; $("#timesEntries", root).innerHTML = ""; $("#timesApplyArea", root).hidden = true; err(e.message); }
      };
      $("#timesApply", root).onclick = async () => {
        let count = 0, skipped = 0;
        for (const entry of entries) {
          const row = root.querySelector(`[data-entry-id="${CSS.escape(entry.id)}"]`), target = row && $(".time-target", row)?.value;
          if (!target) continue;
          const current = DB.get(target);
          if (!current || (current.timerEntryIds || []).includes(entry.id)) { skipped++; continue; }
          await DB.put({ ...current, ...TimesImport.apply(current, entry), updatedAt: new Date().toISOString() }); count++;
        }
        alert(`${count} tattoo time${count === 1 ? "" : "s"} imported${skipped ? `; ${skipped} already imported` : ""}.`); go("queue");
      };
    }
  };
  const button = () => `<button data-go="timesImport">Import tattoo times</button>`;
  const homeHtml = screens.home.html;
  screens.home.html = () => homeHtml().replace(/<\/div>$/, `<div class="actions" style="margin-top:16px">${button()}</div></div>`);
  return { button };
})();
