"use strict";

/* Small pointer-driven crop screen. It returns a choice and leaves image processing to IdCrop. */
const IdCropUI = (() => {
  const MIN_SIZE = 40;

  function clampRect(rect, width, height) {
    const x = Math.max(0, Math.min(rect.x, width - MIN_SIZE));
    const y = Math.max(0, Math.min(rect.y, height - MIN_SIZE));
    const w = Math.max(MIN_SIZE, Math.min(rect.w, width - x));
    const h = Math.max(MIN_SIZE, Math.min(rect.h, height - y));
    return { x, y, w, h };
  }

  function open(source, auto) {
    return new Promise(resolve => {
      const screen = document.createElement("div");
      screen.className = "id-crop-screen";
      screen.innerHTML = `<div class="id-crop-panel"><h2>Adjust your license photo</h2>
        <p class="mute">Move the box or drag its edges and corners to include the whole card.</p>
        <canvas class="id-crop-canvas"></canvas><div class="actions">
          <button class="primary" data-action="use">Use crop</button><button data-action="reset">Reset to auto</button>
          <button data-action="full">Use full photo</button><button class="ghost" data-action="retake">Retake</button>
        </div></div>`;
      document.body.appendChild(screen);
      const canvas = screen.querySelector("canvas");
      const context = canvas.getContext("2d");
      canvas.width = source.width; canvas.height = source.height;
      let rect = { ...auto };
      let pointer = null;

      const finish = action => {
        screen.remove();
        resolve(action === "use" ? { action, canvas: IdCrop.cropCanvas(source, rect) } : { action, canvas: action === "full" ? source : null });
      };
      const draw = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(source, 0, 0);
        context.fillStyle = "rgba(0, 0, 0, .52)";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.clearRect(rect.x, rect.y, rect.w, rect.h);
        context.drawImage(source, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
        context.strokeStyle = "#ff2d8f"; context.lineWidth = Math.max(3, canvas.width / 300); context.strokeRect(rect.x, rect.y, rect.w, rect.h);
        context.fillStyle = "#fff";
        for (const point of handles(rect)) { context.beginPath(); context.arc(point.x, point.y, Math.max(8, canvas.width / 70), 0, Math.PI * 2); context.fill(); }
      };
      const handles = r => [
        { x: r.x, y: r.y, name: "nw" }, { x: r.x + r.w / 2, y: r.y, name: "n" }, { x: r.x + r.w, y: r.y, name: "ne" },
        { x: r.x + r.w, y: r.y + r.h / 2, name: "e" }, { x: r.x + r.w, y: r.y + r.h, name: "se" },
        { x: r.x + r.w / 2, y: r.y + r.h, name: "s" }, { x: r.x, y: r.y + r.h, name: "sw" }, { x: r.x, y: r.y + r.h / 2, name: "w" }
      ];
      const imagePoint = event => { const box = canvas.getBoundingClientRect(); return { x: (event.clientX - box.left) * canvas.width / box.width, y: (event.clientY - box.top) * canvas.height / box.height }; };
      const hit = point => {
        const tolerance = canvas.width / Math.max(12, canvas.clientWidth / 26);
        const handle = handles(rect).find(h => Math.hypot(h.x - point.x, h.y - point.y) < tolerance);
        if (handle) return { type: handle.name, x: point.x, y: point.y, rect: { ...rect } };
        if (point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h) return { type: "move", x: point.x, y: point.y, rect: { ...rect } };
        return null;
      };
      canvas.onpointerdown = event => { pointer = hit(imagePoint(event)); if (pointer) canvas.setPointerCapture(event.pointerId); };
      canvas.onpointermove = event => {
        if (!pointer) return;
        const point = imagePoint(event), dx = point.x - pointer.x, dy = point.y - pointer.y, base = pointer.rect;
        if (pointer.type === "move") rect = clampRect({ x: base.x + dx, y: base.y + dy, w: base.w, h: base.h }, source.width, source.height);
        else {
          let left = base.x, top = base.y, right = base.x + base.w, bottom = base.y + base.h;
          if (pointer.type.includes("w")) left += dx; if (pointer.type.includes("e")) right += dx;
          if (pointer.type.includes("n")) top += dy; if (pointer.type.includes("s")) bottom += dy;
          rect = clampRect({ x: left, y: top, w: right - left, h: bottom - top }, source.width, source.height);
        }
        draw();
      };
      canvas.onpointerup = () => { pointer = null; };
      screen.onclick = event => { const action = event.target.dataset.action; if (!action) return; if (action === "reset") rect = { ...auto }; else finish(action); draw(); };
      draw();
    });
  }

  return { open };
})();
