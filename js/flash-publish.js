"use strict";

const FlashPublish = (() => {
  let working = false;

  async function run() {
    if (working) return null;
    working = true;
    try {
      const all = Flash.list();
      const active = Events.getActive();
      const feed = await FlashFeed.build(all, { event: active ? active.name : "" });
      const images = await FlashFeed.images(all);
      // 1) ask what the repo already has, 2) send only new pictures one at a time, 3) send the feed last so it never points at a missing picture.
      const have = new Set((await SyncRelay.publish({ action: "flash.list" })).have || []);
      for (const image of images) if (!have.has(image.path)) await SyncRelay.publish({ action: "flash.image", path: image.path, base64: image.base64 });
      const reply = await SyncRelay.publish({ action: "flash.publish", feed });
      await DB.put({ ...(DB.get("settings") || {}), flashPublishPending: false, flashPublishedAt: new Date().toISOString() });
      return reply;
    } catch (e) {
      const s = DB.get("settings") || {};
      await DB.put({ ...s, flashPublishPending: true });
      throw e;
    } finally { working = false; }
  }

  function status() {
    const s = DB.get("settings") || {};
    return s.flashPublishedAt && !s.flashPublishPending ? "Website: up to date" : "Website: not published yet";
  }
  return { run, status };
})();
