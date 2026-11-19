"use strict";

screens.settingsDanger = {
  html: () => `${bar("Danger zone", { back: "settings" })}<div class="card"><strong>Erase test data</strong>
    <p class="mute" style="font-size:16px">Deletes every client, appointment, session, signed contract and countersigned copy on this device. Your settings, form wording, flash designs and saved signature are kept.</p>
    <button class="danger" id="eraseAll">Erase all client data…</button></div>`,
  bind(root) {
    $("#eraseAll", root).onclick = async () => {
      const n = DB.all("client").length;
      if (!n) { alert("There are no clients to erase."); return; }
      const appointments = DB.all("appointment").length;
      const answer = prompt(`This permanently deletes ${n} client(s), ${appointments} appointment(s), and ALL their paperwork. Type ERASE to confirm.`);
      if (answer !== "ERASE") return;
      await eraseAllClientData(); go("settings");
    };
  }
};
