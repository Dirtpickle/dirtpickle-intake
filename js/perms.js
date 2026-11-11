
"use strict";

const Perms = (() => ({
  can(action) {
    return DB.isUnlocked() && action === "overrideId";
  }
}))();
