const { test, expect } = require("@playwright/test");

async function analyze(page, kind) {
  return page.evaluate(kind => {
    const canvas = document.createElement("canvas");
    canvas.width = kind === "square" ? 300 : 480;
    canvas.height = kind === "square" ? 300 : 300;
    const context = canvas.getContext("2d");
    context.fillStyle = kind === "solid" ? "#999" : "#202020";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (kind === "card") {
      context.fillStyle = "#e8e8e8";
      context.fillRect(55, 45, 370, 210);
      context.strokeStyle = "#555";
      context.lineWidth = 2;
      for (let x = 85; x < 390; x += 18) context.strokeRect(x, 95, 10, 80);
      for (let y = 65; y < 230; y += 22) context.fillRect(85, y, 300, 2);
    }
    if (kind === "square") {
      context.fillStyle = "#e8e8e8";
      context.fillRect(20, 20, 260, 260);
      context.strokeStyle = "#555";
      for (let x = 45; x < 260; x += 16) context.strokeRect(x, 80, 8, 120);
    }
    if (kind === "blurry") {
      const image = context.createImageData(canvas.width, canvas.height);
      for (let i = 0; i < image.data.length; i += 4) {
        const value = 80 + Math.floor(Math.random() * 90);
        image.data[i] = value;
        image.data[i + 1] = value;
        image.data[i + 2] = value;
        image.data[i + 3] = 255;
      }
      context.putImageData(image, 0, 0);
      context.filter = "blur(8px)";
      context.drawImage(canvas, 0, 0);
    }
    return IdCheck.analyze(canvas);
  }, kind);
}

test("a textured card-shaped photo passes the heuristic", async ({ page }) => {
  await page.goto("/");
  const result = await analyze(page, "card");
  expect(result.probablyLicense).toBe(true);
  expect(result.warnings).toEqual([]);
});

test("solid, blurry, and square images warn", async ({ page }) => {
  await page.goto("/");
  for (const kind of ["solid", "blurry", "square"]) {
    const result = await analyze(page, kind);
    expect(result.probablyLicense, kind).toBe(false);
    expect(result.warnings.length, kind).toBeGreaterThan(0);
  }
});
