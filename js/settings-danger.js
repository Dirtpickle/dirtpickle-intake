"use strict";

// Legacy route kept for old links; the erase action now lives on Backup & security.
screens.settingsDanger = {
  html: (...args) => screens.backup.html(...args),
  bind: (...args) => screens.backup.bind(...args)
};
