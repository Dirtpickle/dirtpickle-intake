"use strict";

/* Card detection and canvas cropping. This module has no UI or stored state. */
const IdCrop = (() => {
  function fullImage(image) {
    return { x: 0, y: 0, w: image.width, h: image.height };
  }

  function withMargin(rect, image) {
    const margin = Math.min(rect.w, rect.h) * 0.03;
    const x = Math.max(0, Math.floor(rect.x - margin)), y = Math.max(0, Math.floor(rect.y - margin));
    const right = Math.min(image.width, Math.ceil(rect.x + rect.w + margin)), bottom = Math.min(image.height, Math.ceil(rect.y + rect.h + margin));
    return { x, y, w: right - x, h: bottom - y };
  }

  function autoCrop(image) {
    const edges = IdCardDetect.find(image);
    if (edges) return withMargin(edges, image);
    const detected = IdCheck.cardBounds(image);
    if (!detected || !detected.confident) return fullImage(image);
    const margin = Math.min(detected.right - detected.left, detected.bottom - detected.top) * 0.04;
    const x = Math.max(0, Math.floor(detected.left - margin));
    const y = Math.max(0, Math.floor(detected.top - margin));
    const right = Math.min(image.width, Math.ceil(detected.right + margin));
    const bottom = Math.min(image.height, Math.ceil(detected.bottom + margin));
    return { x, y, w: right - x, h: bottom - y };
  }

  function cropCanvas(source, rect) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(rect.w));
    canvas.height = Math.max(1, Math.round(rect.h));
    canvas.getContext("2d").drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  return { autoCrop, cropCanvas };
})();
