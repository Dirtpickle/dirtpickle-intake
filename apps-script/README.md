# Email relay setup

1. Open [script.google.com](https://script.google.com) and create a new project.
2. Paste the contents of `Code.gs` into the editor.
3. Replace `CHANGE-ME-TO-A-LONG-RANDOM-STRING` with a long random secret.
4. Deploy it as a **Web app**, execute as **Me**, and allow access to **Anyone**.
5. Copy the deployed `/exec` URL into the app's Settings as **Email relay URL**.
6. Enter the same secret in **Relay secret**, save Settings, then send a test email.

The relay sends through the Google account that owns the script. Gmail daily quotas can limit delivery.
## Calendar sync

Calendar actions use the same web-app relay and secret as email. The owner must redeploy the Apps Script for calendar sync to work:

1. Re-paste the current `Code.gs` into the Apps Script project.
2. Choose **Deploy > Manage deployments > New version** and deploy the web app.
3. Approve the new Calendar permission prompt.

The app sends only the client's first name, tattoo summary, start/end times, duration, and the text `Dirtpickle intake app` to Calendar.
