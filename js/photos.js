"use strict";

/* Session photos are encrypted DB records. This module owns their data rules and image preparation. */
const Photos = (() => {
  const KINDS = Object.freeze({
    finished: "Finished",
    healed: "Healed follow-up",
    reference: "Reference / stencil"
  });
  const kindValues = () => Object.keys(KINDS);
  const validKind = kind => kindValues().includes(kind) ? kind : "finished";

  function resize(file, max = 1600, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read " + file.name));
      };
      image.src = url;
    });
  }

  async function add(session, file, kind, note = "") {
    if (!session || session.type !== "session") throw new Error("Session not found");
    if (!file || !file.type.startsWith("image/")) throw new Error("Choose an image file.");
    const photo = {
      type: "photo",
      id: crypto.randomUUID(),
      sessionId: session.id,
      clientId: session.clientId,
      kind: validKind(kind),
      image: await resize(file),
      note: String(note || "").trim(),
      createdAt: new Date().toISOString()
    };
    await DB.put(photo);
    if (photo.kind === "finished" && !(session.record || {}).finalPhoto) {
      await DB.put({ ...session, record: { ...(session.record || {}), finalPhoto: true }, updatedAt: new Date().toISOString() });
    }
    return photo;
  }

  function bySession(sessionId) {
    return DB.all("photo").filter(photo => photo.sessionId === sessionId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function byClient(clientId) {
    return DB.all("photo").filter(photo => photo.clientId === clientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async function update(photo, note) {
    const current = DB.get(photo.id);
    if (!current || current.type !== "photo") throw new Error("Photo not found");
    return DB.put({ ...current, note: String(note || "").trim() });
  }

  async function remove(id) {
    const photo = DB.get(id);
    if (!photo || photo.type !== "photo") throw new Error("Photo not found");
    await DB.remove(id);
  }

  return { KINDS, kindValues, resize, add, bySession, byClient, update, remove };
})();
