"use strict";

const FlashPicture = (() => {
  const MAX_BYTES = 300 * 1024;
  function read(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read that picture."));
      reader.readAsDataURL(file);
    });
  }

  async function jpeg(file, longest = 800, quality = .8) {
    if (!file || !String(file.type || "").startsWith("image/")) throw new Error("Choose an image file.");
    const url = await read(file);
    const image = await new Promise((resolve, reject) => {
      const el = new Image(); el.onload = () => resolve(el); el.onerror = () => reject(new Error("Could not decode that picture.")); el.src = url;
    });
    const scale = Math.min(1, longest / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    // Keep each public picture under ~300 KB (phones load them all): lower quality until it fits.
    let out = canvas.toDataURL("image/jpeg", quality);
    for (let q = quality - .1; out.length * .75 > MAX_BYTES && q >= .4; q -= .1) out = canvas.toDataURL("image/jpeg", q);
    return out;
  }

  return { jpeg };
})();
