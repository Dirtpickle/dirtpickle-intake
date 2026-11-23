"use strict";

screens.settingsGoogle = {
  html: () => `${bar("Google connection", { back: "settings" })}<div class="card">
    <p class="mute" style="font-size:16px">Email, calendar and Drive sync use the same encrypted Apps Script relay.</p>
    <strong>Email</strong>${Mailer.settingsHtml()}<div class="sub" id="emailStatus">${Mailer.configured(Mailer.relayFromSettings()) ? "Details saved (use Send test email to check them)" : "Not set up"}</div>
    <hr><strong>Calendar sync</strong><p class="mute">Appointments use the shared relay. Calendar events contain only the client's first name and tattoo summary.</p>${CalendarSettings.settingsHtml()}
    <div class="sub" id="calendarStatus">${settings.calendarSync && Mailer.configured(Mailer.relayFromSettings()) ? "Details saved (use Send test email to check them)" : "Not set up"}</div>
    <hr>${SyncUI.settingsHtml()}<div class="sub" id="driveStatus">${settings.syncSalt && Mailer.configured(Mailer.relayFromSettings()) ? "Details saved (use Send test email to check them)" : "Not set up"}</div>
    <div class="actions"><button class="primary" id="saveGoogle">Save settings</button><span id="googleMsg" class="mute" style="align-self:center"></span></div></div>`,
  bind(root) {
    Mailer.bindSettings(root); CalendarSettings.bindSettings(root); SyncUI.bindSettings(root);
    $("#saveGoogle", root).onclick = async () => {
      settings = CalendarSettings.readSettings(root, Mailer.readSettings(root, settings));
      await DB.put(settings); await publishPublic(); $("#googleMsg", root).textContent = "Saved.";
      $("#emailStatus", root).textContent = Mailer.configured(Mailer.relayFromSettings()) ? "Details saved (use Send test email to check them)" : "Not set up";
    };
  }
};
