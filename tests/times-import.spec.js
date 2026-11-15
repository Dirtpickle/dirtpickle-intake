const { test, expect } = require("@playwright/test");

const entry = (id = "time-1", code = "1-BF 26") => ({ id, code, label: "Linework", startedAt: "2026-11-14T10:00:00Z", endedAt: "2026-11-14T11:30:00Z", activeMs: 5400000, segments: [{ s: "2026-11-14T10:00:00Z", e: "2026-11-14T11:30:00Z" }] });

test("parses Tattoo Timer format and rejects other formats", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => typeof TimesImport?.parse)).toBe("function");
  await expect(page.evaluate(() => TimesImport.parse(JSON.stringify({ format: "tattoo-timer-1", entries: [] })))).resolves.toEqual([]);
  await expect(page.evaluate(() => { try { TimesImport.parse(JSON.stringify({ format: "other", entries: [] })); return "no error"; } catch (e) { return e.message; } })).resolves.toContain("tattoo-timer-1");
});

test("ranks matching unused sessions and applies a timer entry once", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(e => {
    const sessions = [
      { id: "old-match", flashCode: "1BF26", status: "ready", createdAt: "2026-11-01" },
      { id: "new-match", flashCode: "1-BF-26", status: "completed", createdAt: "2026-11-10" },
      { id: "other", flashCode: "2AA", status: "inprogress", createdAt: "2026-11-12" },
      { id: "used", flashCode: "1BF26", status: "completed", createdAt: "2026-11-13", timerEntryIds: [e.id] }
    ];
    const ranked = TimesImport.suggest(e, sessions).map(s => s.id);
    return { ranked, changes: TimesImport.apply(sessions[1], e) };
  }, entry());
  expect(result.ranked).toEqual(["new-match", "old-match", "other"]);
  expect(result.changes.durationMs).toBe(5400000);
  expect(result.changes.timeSource).toBe("timer-app");
  expect(result.changes.timerEntryIds).toEqual(["time-1"]);
});

test("manual minutes edit stores typed time and legacy time remains visible", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(() => {
    const old = { segments: [{ s: "2026-11-14T10:00:00Z", e: "2026-11-14T11:32:00Z" }] };
    return { display: SessionTime.format(SessionTime.duration(old)), suggestion: Pricing.suggest(SessionTime.duration({ ...old, durationMs: 5520000 }), 120) };
  });
  expect(result.display).toBe("1h 32m");
  expect(result.suggestion).toBe(185);
});
