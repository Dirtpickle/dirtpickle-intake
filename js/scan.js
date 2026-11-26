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
  const diag = () => `camera:${navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? "ok" : "NO"} wasm:${typeof WebAssembly === "object" ? "ok" : "NO"} secure:${window.isSecureContext ? "ok" : "NO"}`;
  const OPTS = { formats: ["PDF417"], tryHarder: true, tryRotate: true, tryInvert: true, maxNumberOfSymbols: 1, textMode: "Plain" };

  async function decodeBlob(blob) {
    const z = await lib();
    const r = await z.readBarcodes(blob, OPTS);
    return r.length ? r[0].text : null;
  }

  async function start(video, onText, onMsg) {
    const say = m => { if (onMsg) onMsg(m); };
    stop(); // never hold two camera streams: a second request can hang forever on iPad
    say("Starting camera… tap Allow if asked.");
    const waiting = setTimeout(() => say("Still waiting for the camera. If there is no Allow question, open iPad Settings > Safari > Camera (or this app) and allow it, then come back. Or tap Take a photo."), 8000);
    try {
      // Ask for the camera first, straight from the screen opening, then load the scanner while it starts.
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    } finally { clearTimeout(waiting); }
    say(`Loading scanner… (${diag()})`);
    let z; try { z = await lib(); } catch (e) { stop(); throw e; }
    video.muted = true; video.setAttribute("playsinline", "");
    video.srcObject = stream;
    try { await video.play(); } catch (e) { if (e.name !== "AbortError") throw e; }
    setTimeout(() => { if (running && !video.videoWidth) say("Camera is on but sent no picture. Close other apps using the camera, then try again, or tap Take a photo."); }, 3000);
    // Only ask for autofocus where supported: on Firefox applyConstraints silently drops the camera to 640x480.
    try { const tr = stream.getVideoTracks()[0], caps = tr.getCapabilities ? tr.getCapabilities() : {}; if (caps.focusMode && caps.focusMode.includes("continuous")) await tr.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch (_) {}
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    running = true;
    const t0 = Date.now(); let tries = 0;
    const tick = async () => {
      if (!running) return;
      if (video.videoWidth) {
        tries++;
        if (tries === 1 || tries % 3 === 0) {
          const secs = Math.round((Date.now() - t0) / 1000);
          say(`Camera on (${video.videoWidth}×${video.videoHeight}). Scanning… ${tries} tries. ` + (secs > 10 ? "Still looking: move the card closer or farther until the barcode is sharp, avoid glare, or tap Take a photo instead." : "Hold the BACK of the license flat, about 6 to 8 inches away."));
        }
        const scale = Math.min(1, 1280 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
          const r = await z.readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), OPTS);
          if (r.length && running) { stop(); onText(r[0].text); return; }
        } catch (e) { say(`Scanner error: ${e.message} (${diag()})`); }
      }
      timer = setTimeout(tick, 150);
    };
    tick();
  }
  function stop() {
    running = false; clearTimeout(timer);
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }
  return { start, stop, decodeBlob, diag };
})();
