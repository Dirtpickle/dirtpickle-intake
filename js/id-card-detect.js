"use strict";

/* Finds a card by its long straight edges (rows and columns of strong gradient).
   Pure image maths: no UI, no storage. Returns a rect in source pixels or null. */
const IdCardDetect = (() => {
  const CONFIG = { sampleSize: 360, minRunShare: 0.3, refineShare: 0.5, gap: 2, cardRatio: 1.586, ratioTolerance: 0.2, minCoverage: 0.12 };

  function sampleOf(image) {
    const w0 = image.width || image.naturalWidth, h0 = image.height || image.naturalHeight;
    const scale = Math.min(1, CONFIG.sampleSize / Math.max(w0, h0));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(8, Math.round(w0 * scale)); canvas.height = Math.max(8, Math.round(h0 * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.filter = "blur(1px)";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const gray = new Float32Array(canvas.width * canvas.height);
    for (let i = 0; i < gray.length; i++) gray[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
    return { w: canvas.width, h: canvas.height, gray, scaleX: w0 / canvas.width, scaleY: h0 / canvas.height };
  }

  /* Edge maps: horizontal[i] = strong up/down change (top/bottom card edges), vertical[i] = strong left/right change. */
  function edgeMaps(s) {
    const horizontal = new Float32Array(s.w * s.h), vertical = new Float32Array(s.w * s.h);
    const mags = [];
    for (let y = 1; y < s.h - 1; y++) for (let x = 1; x < s.w - 1; x++) {
      const i = y * s.w + x;
      horizontal[i] = Math.abs(s.gray[i + s.w] - s.gray[i - s.w]);
      vertical[i] = Math.abs(s.gray[i + 1] - s.gray[i - 1]);
      mags.push(Math.max(horizontal[i], vertical[i]));
    }
    mags.sort((a, b) => a - b);
    const limit = Math.max(14, mags[Math.floor(mags.length * 0.85)] || 0);
    return { horizontal, vertical, limit };
  }

  function longestRun(isEdge, count) {
    let best = 0, run = 0, misses = 0;
    for (let k = 0; k < count; k++) {
      if (isEdge(k)) { run += 1 + misses; misses = 0; if (run > best) best = run; }
      else if (run && ++misses > CONFIG.gap) { run = 0; misses = 0; }
    }
    return best;
  }

  /* Outermost row/column whose longest edge run reaches `share` of the span, or null. */
  function outerLines(count, runAt, need) {
    let first = -1, last = -1;
    for (let k = 0; k < count; k++) if (runAt(k) >= need) { if (first < 0) first = k; last = k; }
    return first < 0 ? null : { first, last };
  }

  function findRect(s, share) {
    const maps = edgeMaps(s), at = (map, x, y) => map[y * s.w + x] > maps.limit;
    const rowRun = (y, x0, x1) => longestRun(k => at(maps.horizontal, x0 + k, y), x1 - x0);
    const colRun = (x, y0, y1) => longestRun(k => at(maps.vertical, x, y0 + k), y1 - y0);
    let rows = outerLines(s.h, y => rowRun(y, 0, s.w), s.w * share);
    if (!rows || rows.last - rows.first < s.h * 0.2) return null;
    let cols = outerLines(s.w, x => colRun(x, rows.first, rows.last + 1), (rows.last - rows.first) * share);
    if (!cols || cols.last - cols.first < s.w * 0.2) return null;
    rows = outerLines(s.h, y => rowRun(y, cols.first, cols.last + 1), (cols.last - cols.first) * CONFIG.refineShare) || rows;
    return { left: cols.first, right: cols.last + 1, top: rows.first, bottom: rows.last + 1 };
  }

  function isCardShaped(r, s) {
    const w = r.right - r.left, h = r.bottom - r.top, ratio = Math.max(w / h, h / w);
    return Math.abs(ratio - CONFIG.cardRatio) / CONFIG.cardRatio <= CONFIG.ratioTolerance && (w * h) / (s.w * s.h) >= CONFIG.minCoverage;
  }

  function find(image) {
    const s = sampleOf(image), r = findRect(s, CONFIG.minRunShare);
    if (!r || !isCardShaped(r, s)) return null;
    return { x: r.left * s.scaleX, y: r.top * s.scaleY, w: (r.right - r.left) * s.scaleX, h: (r.bottom - r.top) * s.scaleY };
  }

  return { find };
})();
