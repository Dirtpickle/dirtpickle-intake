"use strict";

/* Event list and editor. Kept separate so app.js only owns navigation and the home tile. */
(() => {
  const field = (id, label, value, type = "text") =>
    `<label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(value)}">`;

  function formHtml(event) {
    const e = event || Events.DEFAULTS;
    return `${bar(event ? "Edit event" : "New event", { back: "events" })}
      <div class="card">${field("eventName", "Event name", e.name)}
        ${field("eventDate", "Date", e.date, "date")}
        ${field("eventMin", "Flash minimum price ($)", e.flashMin, "number")}
        ${field("eventMax", "Flash maximum price ($)", e.flashMax, "number")}
        <label class="check"><input id="eventTaken" type="checkbox" ${e.markTaken !== false ? "checked" : ""}> Mark a flash design unavailable once someone picks it</label>
        <label class="check"><input id="eventHourly" type="checkbox" ${e.hourlyApplies ? "checked" : ""}> Hourly pricing applies to flash sessions</label>
        <div class="actions"><button class="primary" id="saveEvent">${event ? "Save changes" : "Start event"}</button><button class="ghost" data-go="events">Cancel</button></div>
        ${event && event.active ? `<button class="danger" id="endEvent">End event</button>` : ""}<div id="eventMsg"></div></div>`;
  }

  function read(root) {
    return {
      name: $("#eventName", root).value.trim(), date: $("#eventDate", root).value,
      flashMin: parseFloat($("#eventMin", root).value), flashMax: parseFloat($("#eventMax", root).value),
      markTaken: $("#eventTaken", root).checked, hourlyApplies: $("#eventHourly", root).checked
    };
  }

  screens.events = {
    html() {
      const events = Events.list();
      const row = event => `<div class="row" data-go="eventEdit" data-id="${esc(event.id)}"><div class="grow"><div>${esc(event.name)}</div>
        <div class="sub">${esc(event.date || "No date")} · ${event.active ? "Active" : "Ended"} · $${event.flashMin}–$${event.flashMax}</div></div><div class="mute">›</div></div>`;
      return `${bar("Events", { back: "home" })}<div class="actions"><button class="primary" data-go="eventNew">New event</button></div>
        <div class="card">${events.map(row).join("") || '<span class="mute">No events yet.</span>'}</div>`;
    }
  };

  screens.eventNew = { html: () => formHtml(null), bind: bindForm };
  screens.eventEdit = {
    html: ({ id }) => { const event = DB.get(id); return event ? formHtml(event) : `${bar("Events", { back: "events" })}<div class="banner bad">Event not found.</div>`; },
    bind(root, { id }) { bindForm(root, { id }); }
  };

  async function bindForm(root, { id } = {}) {
    const event = id ? DB.get(id) : null;
    $("#saveEvent", root).onclick = async () => {
      const data = read(root);
      if (!data.name || !data.date || !Number.isFinite(data.flashMin) || !Number.isFinite(data.flashMax) || data.flashMin > data.flashMax) {
        $("#eventMsg", root).innerHTML = '<div class="banner bad">Enter a name, date, and valid price range.</div>';
        return;
      }
      try { if (id) await Events.update(id, data); else await Events.create(data); go("events"); }
      catch (e) { $("#eventMsg", root).innerHTML = `<div class="banner bad">${esc(e.message)}</div>`; }
    };
    $("#endEvent", root)?.addEventListener("click", async () => { await Events.end(id); go("events"); });
  }
})();
