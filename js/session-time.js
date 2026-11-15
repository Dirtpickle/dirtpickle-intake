"use strict";

/* Legacy session time display and pricing. New elapsed time comes from the timer app. */
const SessionTime = (() => {
  const closedDuration = s => (s.segments || []).reduce((total, segment) => {
    if (!segment.e) return total;
    return total + Math.max(0, new Date(segment.e) - new Date(segment.s));
  }, 0);
  const duration = s => Number.isFinite(Number(s.durationMs)) ? Number(s.durationMs) : closedDuration(s);
  const format = ms => {
    const minutes = Math.floor(Math.max(0, ms) / 60000);
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };
  const short = ms => {
    const minutes = Math.floor(Math.max(0, ms) / 60000);
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
  };
  const hourlyApplies = s => s.flashId ? Events.pricing().hourlyApplies === true : Events.pricing().hourlyApplies !== false;
  const suggestion = s => {
    const ms = duration(s);
    return s.status === "completed" && hourlyApplies(s) && ms >= 0
      ? Pricing.suggest(ms, (settings.pricing || {}).rate, { round: (settings.pricing || {}).round }) : null;
  };
  return { closedDuration, duration, format, short, suggestion };
})();
