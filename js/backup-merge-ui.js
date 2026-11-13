"use strict";

const BackupMergeUI = (() => {
  const readFile = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

  const html = () => `<div class="card"><strong>Merge a backup into this device</strong>
    <p class="mute" style="font-size:16px">Adds records this device does not have and updates newer mutable records. It does not replace anything, copy settings, or copy the PIN. Deleted items on the other device may come back. Make a backup first if you want a safety copy.</p>
    <label class="btn" style="display:flex;align-items:center;justify-content:center;margin-top:12px">Choose backup file<input id="bkMergeFile" type="file" hidden></label>
    <div id="bkMergePicked" class="mute" style="margin-top:8px"></div>
    <label for="bkMergePin">PIN used when that backup was made</label><input id="bkMergePin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off">
    <div class="actions"><button id="bkMerge">Merge</button></div><div id="bkMergeOut"></div></div>`;

  function bind(root) {
    let fileText = null;
    const out = (cls, text) => { $("#bkMergeOut", root).innerHTML = text ? `<div class="banner ${cls}">${esc(text)}</div>` : ""; };
    $("#bkMergeFile", root).onchange = async event => {
      const file = event.target.files[0];
      if (!file) return;
      try { fileText = await readFile(file); $("#bkMergePicked", root).textContent = file.name; out("", ""); }
      catch (error) { out("bad", "Could not read that file: " + error.message); }
    };
    $("#bkMerge", root).onclick = async () => {
      if (!DB.isUnlocked()) { out("bad", "Unlock the pro side before merging a backup."); return; }
      if (!fileText) { out("warn", "Choose a backup file first."); return; }
      try {
        const result = await Backup.merge(fileText, $("#bkMergePin", root).value);
        out(result.conflicts ? "warn" : "ok", `Added ${result.added}, updated ${result.updated}, skipped ${result.skipped} (conflicts ${result.conflicts}, unreadable ${result.unreadable}).`);
      } catch (error) { out("bad", error.message); }
    };
  }

  return { html, bind };
})();
