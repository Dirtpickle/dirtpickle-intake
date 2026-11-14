"use strict";

const ClientContact = (() => {
  const warning = client => client.needsContact ? '<div class="banner warn">Contact details missing</div>' : "";
  const clearIfProvided = (client, data) => ({ ...client, ...(data.phone || data.email ? { needsContact: false } : {}) });
  return { warning, clearIfProvided };
})();
