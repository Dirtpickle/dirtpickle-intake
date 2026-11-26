"use strict";

/* "Assign codes" screen: numbers every design's code from its place in the Flash list. */
screens.flashCodes = {
  html() {
    const count = Flash.list().length, locked = FlashOrder.locked();
    const warn = locked ? `<div class="banner warn">Your codes are already on the website. Renumbering changes them there too.</div><label><input id="codesSure" type="checkbox"> I'm sure, renumber</label>` : "";
    return `${bar("Assign codes", { back: "flash" })}<div class="card"><p class="mute">Gives all ${count} designs a code in their current order, like BLK1, BLK2, BLK3. Move designs up or down in the Flash list first.</p><label for="codesPrefix">Prefix</label><input id="codesPrefix" value="${esc(FlashSettings.get().prefix)}" autocapitalize="characters">${warn}<div id="codesMsg"></div><button class="primary" id="codesGo">Assign codes</button></div>`;
  },
  bind(root) {
    $("#codesGo", root).onclick = async () => {
      const msg = $("#codesMsg", root);
      if (FlashOrder.locked() && !$("#codesSure", root).checked) { msg.innerHTML = `<div class="banner bad">Tick "I'm sure, renumber" first.</div>`; return; }
      try { const n = await FlashOrder.assignCodes($("#codesPrefix", root).value); if (typeof FlashPublish !== "undefined") FlashPublish.soon(); go("flash"); }
      catch (e) { msg.innerHTML = `<div class="banner bad">${esc(e.message)}</div>`; }
    };
  }
};
