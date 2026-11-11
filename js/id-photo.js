"use strict";

/* Shared front-of-license photo capture, crop, and soft warning UI. */
const IdPhoto = (() => {
  function shrinkCanvas(file, max = 1200) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        const scale = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
      image.src = url;
    });
  }

  function warning(check) {
    if (!check || !check.warnings.length) return "";
    return `<div class="banner warn" style="margin-top:10px">This doesn't look like a license photo yet: ${check.warnings.map(esc).join("; ")}. You can retake it, or continue.</div>`;
  }

  function preview(photo, check) {
    if (!photo) return "";
    return `<img src="${photo}" alt="" style="max-width:320px;width:100%;border-radius:10px;margin-top:10px">${warning(check)}`;
  }

  function block({ photo, check, inputId, title }) {
    return `<div class="card"><strong>${title}</strong>
      <div class="actions" style="margin-top:10px"><label class="btn" style="display:inline-flex;align-items:center">${photo ? "Retake photo" : "Take photo"}
        <input id="${inputId}" type="file" accept="image/*" capture="environment" hidden></label></div>
      <div id="idPhotoPreview">${preview(photo, check)}</div></div>`;
  }

  function attach(root, { inputId, onPhoto, onError }) {
    const input = $("#" + inputId, root);
    if (!input) return;
    input.onchange = async event => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const source = await shrinkCanvas(file);
        const choice = await IdCropUI.open(source, IdCrop.autoCrop(source));
        if (choice.action === "retake") return;
        const image = choice.canvas.toDataURL("image/jpeg", 0.8);
        const check = IdCheck.analyze(choice.canvas);
        const previewRoot = $("#idPhotoPreview", root);
        if (previewRoot) previewRoot.innerHTML = preview(image, check);
        onPhoto({ image, check });
      } catch (error) {
        onError(error);
      }
    };
  }

  return { block, attach, shrinkCanvas };
})();
