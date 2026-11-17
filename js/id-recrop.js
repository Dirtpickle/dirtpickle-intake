"use strict";

/* Re-crop a client's saved ID photo from the client file. Replaces only that photo's image. */
const IdRecrop = (() => {
  function loadCanvas(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        resolve(c);
      };
      img.onerror = () => reject(new Error("bad image"));
      img.src = dataUrl;
    });
  }

  /* Returns true if the photo was replaced. */
  async function run(clientId, photoAt) {
    const client = DB.get(clientId), photo = (client.idPhotos || []).find(p => p.at === photoAt);
    if (!photo) return false;
    const source = await loadCanvas(photo.image);
    const choice = await IdCropUI.open(source, IdCrop.autoCrop(source));
    if (choice.action !== "use" && choice.action !== "full") return false;
    const image = choice.canvas.toDataURL("image/jpeg", 0.8);
    const idPhotos = client.idPhotos.map(p => p.at === photoAt ? { ...p, image } : p);
    await DB.put({ ...client, idPhotos, updatedAt: new Date().toISOString() });
    return true;
  }

  return { run };
})();
