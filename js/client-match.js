"use strict";

/* Pro-only returning-client matching. Never called by the public intake UI. */
const ClientMatch = (() => {
  const clients = () => DB.all("client");
  const byLicense = client => client.licenseNumber
    ? clients().find(existing => existing.licenseNumber === client.licenseNumber) || null : null;
  const returning = client => byLicense(client) || findDuplicate(client, null);
  return { returning };
})();
