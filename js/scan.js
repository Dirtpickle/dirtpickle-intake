"use strict";
/* Camera + PDF417 reading. All processing happens on this device; frames and photos are never saved. */
const Scan = (() => {
  let zx = null, stream = null, timer = null, running = false;

  async function lib() {
    if (zx) return zx;
    zx = await import("../vendor/zxing/reader/index.js");
    zx.prepareZXingModule({ overrides: { locateFile: p => "vendor/zxing/" + p }, fireImmediately: true });
    return zx;
  }
  const OPTS = { formats: ["PDF417"], tryHarder: true, tryRotate: true, tryInvert: true, maxNumberOfSymbols: 1, textMode: "Plain" };

  async function decodeBlob(blob) {
    const z = await lib();
    const r = await z.readBarcodes(blob, OPTS);
    return r.length ? r[0].text : null;
  }

  async function start(video, onText, onMsg) {
    const z = await lib();
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false
    });
    video.srcObject = stream;
    await video.play();
    // Ask for continuous autofocus where the browser allows it (ignored otherwise).
    try { await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch (_) {}
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    running = true;
    const tick = async () => {
      if (!running) return;
      if (video.videoWidth) {
        const scale = Math.min(1, 1600 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
          const r = await z.readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), OPTS);
          if (r.length && running) { stop(); onText(r[0].text); return; }
        } catch (e) { onMsg && onMsg("Read error: " + e.message); }
      }
      timer = setTimeout(tick, 150);
    };
    tick();
  }
  function stop() {
    running = false; clearTimeout(timer);
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }
  return { start, stop, decodeBlob };
})();
