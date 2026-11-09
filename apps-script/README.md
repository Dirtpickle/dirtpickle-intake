# Email relay setup

1. Open [script.google.com](https://script.google.com) and create a new project.
2. Paste the contents of `Code.gs` into the editor.
3. Replace `CHANGE-ME-TO-A-LONG-RANDOM-STRING` with a long random secret.
4. Deploy it as a **Web app**, execute as **Me**, and allow access to **Anyone**.
5. Copy the deployed `/exec` URL into the app's Settings as **Email relay URL**.
6. Enter the same secret in **Relay secret**, save Settings, then send a test email.

The relay sends through the Google account that owns the script. Gmail daily quotas can limit delivery.
