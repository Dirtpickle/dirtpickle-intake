"use strict";

/* Small, offline heuristics for catching obviously wrong ID photos. This is not OCR. */
const IdCheck = (() => {
  const CONFIG = {
    sampleSize: 160,
    minSharpness: 18,
    minBrightness: 35,
    maxBrightness: 225,
    minCardContrast: 24,
    cardRatio: 1.586,
    cardRatioTolerance: 0.15,
    minCardCoverage: 0.15,
    maxCardCoverage: 0.9,
    minTextureDensity: 0.025,
    minScore: 0.75
  };

  function makeSample(image) {
    const width = image.width || image.naturalWidth;
    const height = image.height || image.naturalHeight;
    if (!width || !height) throw new Error("Image has no dimensions");
    const scale = Math.min(1, CONFIG.sampleSize / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, pixels: toGray(context.getImageData(0, 0, canvas.width, canvas.height)) };
  }

  function toGray(data) {
    const gray = new Uint8Array(data.data.length / 4);
    for (let i = 0, p = 0; i < data.data.length; i += 4, p++) {
      gray[p] = Math.round(data.data[i] * 0.299 + data.data[i + 1] * 0.587 + data.data[i + 2] * 0.114);
    }
    return gray;
  }

  function average(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function brightness(sample) {
    const mean = average(Array.from(sample.pixels));
    return {
      ok: mean >= CONFIG.minBrightness && mean <= CONFIG.maxBrightness,
      note: mean < CONFIG.minBrightness ? "the photo is too dark" : "the photo is too bright"
    };
  }

  function sharpness(sample) {
    const values = [];
    const { pixels, width, height } = sample;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        values.push(pixels[i - width] + pixels[i - 1] + pixels[i + 1] + pixels[i + width] - pixels[i] * 4);
      }
    }
    const mean = average(values);
    const variance = average(values.map(value => (value - mean) ** 2));
    return { ok: variance >= CONFIG.minSharpness, note: "the photo looks blurry" };
  }

  function borderAverage(sample) {
    const values = [];
    const { pixels, width, height } = sample;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (x < width * 0.08 || x >= width * 0.92 || y < height * 0.08 || y >= height * 0.92) values.push(pixels[y * width + x]);
      }
    }
    return average(values);
  }

  function cardBounds(sample) {
    const background = borderAverage(sample);
    const threshold = CONFIG.minCardContrast;
    const points = [];
    for (let y = 0; y < sample.height; y++) {
      for (let x = 0; x < sample.width; x++) {
        if (Math.abs(sample.pixels[y * sample.width + x] - background) >= threshold) points.push({ x, y });
      }
    }
    if (!points.length) return null;
    return {
      left: Math.min(...points.map(point => point.x)),
      right: Math.max(...points.map(point => point.x)),
      top: Math.min(...points.map(point => point.y)),
      bottom: Math.max(...points.map(point => point.y))
    };
  }

  function cardShape(sample) {
    const bounds = cardBounds(sample);
    if (!bounds) return { ok: false, note: "the photo does not show a card-shaped region" };
    const width = bounds.right - bounds.left + 1;
    const height = bounds.bottom - bounds.top + 1;
    const ratio = Math.max(width / height, height / width);
    const expected = CONFIG.cardRatio;
    const ratioOk = Math.abs(ratio - expected) / expected <= CONFIG.cardRatioTolerance;
    const coverage = width * height / (sample.width * sample.height);
    const coverageOk = coverage >= CONFIG.minCardCoverage && coverage <= CONFIG.maxCardCoverage;
    return { ok: ratioOk && coverageOk, note: "the card shape does not look like a driver's license" };
  }

  function texture(sample) {
    const bounds = cardBounds(sample);
    if (!bounds) return { ok: false, note: "there is not enough text-like detail" };
    const width = bounds.right - bounds.left + 1;
    const height = bounds.bottom - bounds.top + 1;
    let edges = 0;
    let total = 0;
    for (let y = bounds.top + 1; y < bounds.bottom; y++) {
      for (let x = bounds.left + 1; x < bounds.right; x++) {
        const i = y * sample.width + x;
        const edge = Math.abs(sample.pixels[i] - sample.pixels[i - 1]) + Math.abs(sample.pixels[i] - sample.pixels[i - sample.width]);
        if (edge > 28) edges++;
        total++;
      }
    }
    const density = total ? edges / total : 0;
    return { ok: density >= CONFIG.minTextureDensity, note: "there is not enough text-like detail" };
  }

  const checks = [sharpness, brightness, cardShape, texture];

  function analyze(imageOrCanvas) {
    const sample = makeSample(imageOrCanvas);
    const results = checks.map(check => check(sample));
    const passed = results.filter(result => result.ok).length;
    const score = passed / results.length;
    const shapePassed = results[2].ok;
    return { probablyLicense: shapePassed && score >= CONFIG.minScore, score, warnings: results.filter(result => !result.ok).map(result => result.note) };
  }

  return { analyze };
})();
