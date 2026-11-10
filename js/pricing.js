"use strict";

const Pricing = (() => {
  const defaults = { rate: 120, round: 5 };

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function suggest(durationMs, rate, options = {}) {
    const duration = Math.max(0, numberOr(durationMs, 0));
    const hourlyRate = Math.max(0, numberOr(rate, 0));
    const round = Math.max(0, numberOr(options.round, defaults.round));
    const price = duration / 3600000 * hourlyRate;
    return round ? Math.round(price / round) * round : price;
  }

  function settingsHtml(settings = {}) {
    const pricing = { ...defaults, ...(settings.pricing || {}) };
    return `<label for="hourlyRate">Hourly rate ($)</label><input id="hourlyRate" type="number" inputmode="decimal" min="0" step="0.01" value="${pricing.rate}">
      <label for="priceRound">Round suggested price to nearest ($)</label><input id="priceRound" type="number" inputmode="decimal" min="0" step="1" value="${pricing.round}">`;
  }

  function readSettings(root, current = {}) {
    const rate = Math.max(0, numberOr($("#hourlyRate", root).value, defaults.rate));
    const round = Math.max(0, numberOr($("#priceRound", root).value, defaults.round));
    return { ...current, pricing: { rate, round } };
  }

  return { defaults, suggest, settingsHtml, readSettings };
})();
