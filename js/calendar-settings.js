"use strict";

const CalendarSettings = (() => {
  function settingsHtml() {
    const s = DB.get("settings") || {};
    return `<label style="display:flex;gap:12px;align-items:center;color:var(--fg)"><input id="calendarOn" type="checkbox" style="width:26px;height:26px" ${s.calendarSync ? "checked" : ""}> Sync appointments to Google Calendar</label>
      <label for="calendarName">Calendar name</label><input id="calendarName" value="${esc(s.calendarName || "")}" placeholder="Blank = default calendar">
      <label for="appointmentDuration">Default appointment duration (minutes)</label><input id="appointmentDuration" type="number" min="1" value="${s.appointmentDurationMin || 120}">
      <button id="sendCalendarTest" type="button">Send test event</button><span id="calendarMsg" class="mute" style="margin-left:8px"></span>`;
  }

  function readSettings(root, current) {
    return { ...current, calendarSync: $("#calendarOn", root).checked, calendarName: $("#calendarName", root).value.trim(),
      appointmentDurationMin: Math.max(1, parseInt($("#appointmentDuration", root).value, 10) || 120) };
  }

  function bindSettings(root) {
    $("#sendCalendarTest", root).onclick = async () => {
      const msg = $("#calendarMsg", root);
      const relay = Mailer.relayFromSettings();
      if (!Mailer.configured(relay)) { msg.textContent = "Save the email relay URL and secret first."; return; }
      try {
        const response = await fetch(relay.url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ action: "calendar.test", secret: relay.secret, calendarName: $("#calendarName", root).value.trim() }) });
        const reply = await response.json();
        if (!response.ok || !reply.ok) throw new Error(reply.error || "Calendar test failed");
        msg.textContent = "Test event sent.";
      } catch (e) { msg.textContent = e.message; }
    };
  }

  return { settingsHtml, readSettings, bindSettings };
})();
