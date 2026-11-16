const { test, expect } = require("@playwright/test");

const entry = (id = "time-1", code = "1-BF 26", overrides = {}) => ({ id, code, label: "Linework", startedAt: "2026-11-14T10:00:00Z", endedAt: "2026-11-14T11:30:00Z", activeMs: 5400000, segments: [{ s: "2026-11-14T10:00:00Z", e: "2026-11-14T11:30:00Z" }], ...overrides });

test("parses Tattoo Timer format and rejects other formats", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => typeof TimesImport?.parse)).toBe("function");
  await expect(page.evaluate(() => TimesImport.parse(JSON.stringify({ format: "tattoo-timer-1", entries: [] })))).resolves.toEqual([]);
  await expect(page.evaluate(e => TimesImport.parse(JSON.stringify({ format: "tattoo-timer-1", entries: [e] })), entry())).resolves.toEqual([entry("time-1", "1-BF 26", { revision: 0 })]);
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
  expect(result.changes.timerEntryRevisions).toEqual({ "time-1": 0 });
});

test("classifies same revisions as already imported", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(e => TimesImport.classify(e, [{ id: "session-1", timerEntryIds: [e.id], timerEntryRevisions: { [e.id]: 2 } }]), entry("time-1", "1-BF 26", { revision: 2 }));
  expect(result.kind).toBe("same");
});

test("updates replace timer time and segments instead of adding", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(e => {
    const session = { id: "session-1", durationMs: 3600000, segments: [{ s: "old", e: "old" }], timerEntryIds: [e.id], timerEntryRevisions: { [e.id]: 0 } };
    return { kind: TimesImport.classify(e, [session]).kind, changes: TimesImport.apply(session, e) };
  }, entry("time-1", "1-BF 26", { revision: 1, activeMs: 6300000, segments: [{ s: "new", e: "new" }] }));
  expect(result.kind).toBe("update");
  expect(result.changes.durationMs).toBe(6300000);
  expect(result.changes.segments).toEqual([{ s: "new", e: "new" }]);
  expect(result.changes.timerEntryIds).toEqual(["time-1"]);
  expect(result.changes.timerEntryRevisions).toEqual({ "time-1": 1 });
});

test("updates still replace a session manually edited after import", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(e => TimesImport.apply({ id: "session-1", durationMs: 7200000, segments: [{ s: "manual", e: "manual" }], timerEntryIds: [e.id], timerEntryRevisions: { [e.id]: 0 } }, e), entry("time-1", "1-BF 26", { revision: 1, activeMs: 5400000 }));
  expect(result.durationMs).toBe(5400000);
  expect(result.segments).toEqual(entry().segments);
});

test("old sessions without revisions treat an update as revision one", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(e => TimesImport.classify(e, [{ id: "session-1", timerEntryIds: [e.id] }]), entry("time-1", "1-BF 26", { revision: 1 }));
  expect(result.kind).toBe("update");
  expect(result.appliedRevision).toBe(0);
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
