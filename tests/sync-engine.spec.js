const { test, expect } = require("@playwright/test");
const { setup, lock } = require("./helpers/app");

function relay(page, state) {
  return page.route("**/script.google.com/**", async route => {
    const body = JSON.parse(route.request().postData() || "{}");
    let reply;
    if (body.action === "sync.get") reply = { ok: true, data: state.data, version: state.version };
    else if (body.action === "sync.put") {
      if (state.conflict) { state.conflict = false; reply = { ok: false, error: "conflict" }; }
      else { state.data = body.sealed; state.version++; reply = { ok: true, version: state.version }; }
    } else reply = { ok: false, error: "unknown action" };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(reply) });
  });
}

async function configure(page, salt) {
  await page.evaluate(async value => {
    await DB.put({ ...DB.get("settings"), emailRelayUrl: "https://script.google.com/macros/s/x/exec", relaySecret: "test-secret", syncSalt: value, syncEnabled: true });
  }, salt);
}

test("sync uploads encrypted records, pulls, propagates deletes, and retries conflicts", async ({ browser }) => {
  const state = { data: null, version: 0, conflict: false };
  const a = await browser.newPage(); const b = await browser.newPage();
  await relay(a, state); await relay(b, state);
  await setup(a); const kit = await a.evaluate(() => SyncSeal.newKit());
  await configure(a, kit.salt);
  await a.evaluate(async () => DB.put({ type: "client", id: "client-sync", legalName: "Secret Name", licenseNumber: "LICENSE-123" }));
  const first = await a.evaluate(() => SyncEngine.run("123456"));
  expect(first.uploaded).toBeGreaterThan(0);
  expect(state.data).not.toContain("Secret Name");
  expect(state.data).not.toContain("LICENSE-123");

  await setup(b); await configure(b, kit.salt);
  expect(await b.evaluate(() => SyncEngine.run("123456").then(() => DB.get("client-sync").legalName))).toBe("Secret Name");
  await a.evaluate(() => DB.remove("client-sync"));
  await a.evaluate(() => SyncEngine.run("123456"));
  expect(await b.evaluate(() => SyncEngine.run("123456").then(() => DB.get("client-sync")))).toBeUndefined();

  state.conflict = true;
  await a.evaluate(() => SyncEngine.run("123456"));
  await a.close(); await b.close();
});

test("sync reports wrong PIN and relay configuration errors", async ({ page }) => {
  await setup(page);
  const salt = await page.evaluate(() => SyncSeal.newKit().salt);
  const sealed = await page.evaluate(async value => SyncSeal.seal([{ type: "client", id: "remote", legalName: "Remote Name" }], "123456", value), salt);
  const state = { data: sealed, version: 1 };
  await relay(page, state);
  await configure(page, salt);
  await expect(page.evaluate(() => SyncEngine.run("000000"))).rejects.toThrow("Could not open sync package");
  await page.evaluate(async () => DB.put({ ...DB.get("settings"), syncEnabled: false }));
  await expect(page.evaluate(() => SyncEngine.run("123456"))).rejects.toThrow("Sync is not turned on");
});

test("the intake boot path does not load SyncEngine", async ({ page }) => {
  await setup(page); await lock(page);
  const intake = await page.context().newPage(); await intake.goto("/");
  await expect(intake.getByRole("button", { name: "Artist sign-in" })).toBeVisible();
  expect(await intake.evaluate(() => typeof SyncEngine)).toBe("undefined");
  await intake.close();
});

test("sync carries the artist signature and initials to the other device", async ({ browser }) => {
  const state = { data: null, version: 0, conflict: false };
  const a = await browser.newPage(); const b = await browser.newPage();
  await relay(a, state); await relay(b, state);
  await setup(a); const kit = await a.evaluate(() => SyncSeal.newKit());
  await configure(a, kit.salt);
  await a.evaluate(async () => DB.put({ ...DB.get("settings"), artistSignature: "data:image/png;base64,SIG", artistInitials: "data:image/png;base64,INI", artistMarksAt: new Date().toISOString() }));
  await a.evaluate(() => SyncEngine.run("123456"));
  expect(state.data).not.toContain("SIG");
  await setup(b); await configure(b, kit.salt);
  await b.evaluate(() => SyncEngine.run("123456"));
  const got = await b.evaluate(() => ({ s: DB.get("settings").artistSignature, i: DB.get("settings").artistInitials, relay: DB.get("settings").emailRelayUrl }));
  expect(got).toEqual({ s: "data:image/png;base64,SIG", i: "data:image/png;base64,INI", relay: "https://script.google.com/macros/s/x/exec" });
});

test("auto sync runs after unlock, can be turned off, and skips quietly when not set up", async ({ browser }) => {
  const state = { data: null, version: 0, conflict: false };
  const a = await browser.newPage(); const b = await browser.newPage();
  await relay(a, state); await relay(b, state);
  await setup(a); const kit = await a.evaluate(() => SyncSeal.newKit());
  await configure(a, kit.salt);
  await a.evaluate(async () => DB.put({ type: "client", id: "client-auto", legalName: "Auto Client" }));
  expect(await a.evaluate(() => SyncAuto.enabled())).toBe(true);
  await a.evaluate(() => SyncAuto.run("123456"));
  expect(state.data).not.toBeNull();
  await setup(b); await configure(b, kit.salt);
  await b.evaluate(() => SyncAuto.run("123456"));
  expect(await b.evaluate(() => DB.get("client-auto").legalName)).toBe("Auto Client");
  await b.evaluate(async () => DB.put({ ...DB.get("settings"), autoSync: false }));
  expect(await b.evaluate(() => SyncAuto.enabled())).toBe(false);
  await b.evaluate(async () => DB.put({ ...DB.get("settings"), autoSync: true, syncEnabled: false }));
  expect(await b.evaluate(() => SyncAuto.run("123456"))).toBeNull();
});

test("any number of devices sync with just the same URL and PIN, and old copies still open", async ({ browser }) => {
  const state = { data: null, version: 0, conflict: false };
  const pages = [await browser.newPage(), await browser.newPage(), await browser.newPage()];
  for (const p of pages) { await relay(p, state); await setup(p); await p.evaluate(async () => DB.put({ ...DB.get("settings"), emailRelayUrl: "https://script.google.com/macros/s/ABC/exec", relaySecret: "any-secret", syncEnabled: true })); }
  await pages[0].evaluate(async () => DB.put({ type: "client", id: "c-one", legalName: "From One" }));
  await pages[1].evaluate(async () => DB.put({ type: "client", id: "c-two", legalName: "From Two" }));
  for (const p of [pages[0], pages[1], pages[2], pages[0]]) await p.evaluate(() => SyncEngine.run("123456"));
  for (const p of pages) expect(await p.evaluate(() => [DB.get("c-one")?.legalName, DB.get("c-two")?.legalName])).toEqual(["From One", "From Two"]);
  // A copy locked with an old pairing-code key still opens on a device that remembers that key.
  const legacy = await pages[0].evaluate(() => SyncSeal.newKit().salt);
  state.data = await pages[0].evaluate(async s => SyncSeal.seal([{ type: "client", id: "c-old", legalName: "Old Copy" }], "123456", s), legacy);
  await pages[1].evaluate(async s => DB.put({ ...DB.get("settings"), syncSalt: s }), legacy);
  await pages[1].evaluate(() => SyncEngine.run("123456"));
  expect(await pages[1].evaluate(() => DB.get("c-old")?.legalName)).toBe("Old Copy");
});

test("start over replaces an unreadable Drive copy with this device", async ({ page }) => {
  await setup(page);
  const state = { data: "{\"version\":1,\"iv\":\"AAAA\",\"data\":\"AAAA\"}", version: 5 };
  await relay(page, state);
  await page.evaluate(async () => DB.put({ ...DB.get("settings"), emailRelayUrl: "https://script.google.com/macros/s/ABC/exec", relaySecret: "s", syncEnabled: true }));
  await page.evaluate(async () => DB.put({ type: "client", id: "keep", legalName: "Keep Me" }));
  await expect(page.evaluate(() => SyncEngine.run("123456"))).rejects.toThrow("Could not open sync package");
  await page.evaluate(() => SyncEngine.startOver("123456"));
  await page.evaluate(() => SyncEngine.run("123456"));
  expect(await page.evaluate(() => DB.get("keep").legalName)).toBe("Keep Me");
});

test("a synced signature shows in the app straight away and survives later settings saves", async ({ browser }) => {
  const state = { data: null, version: 0, conflict: false };
  const a = await browser.newPage(); const b = await browser.newPage();
  await relay(a, state); await relay(b, state);
  await setup(a); const kit = await a.evaluate(() => SyncSeal.newKit());
  await configure(a, kit.salt);
  await a.evaluate(async () => DB.put({ ...DB.get("settings"), artistSignature: "data:image/png;base64,NEWSIG", artistMarksAt: new Date().toISOString() }));
  await a.evaluate(() => SyncEngine.run("123456"));
  await setup(b); await configure(b, kit.salt);
  await b.evaluate(() => SyncEngine.run("123456"));
  expect(await b.evaluate(() => settings.artistSignature)).toBe("data:image/png;base64,NEWSIG");
  await b.evaluate(async () => { settings = { ...settings, business: "Changed Later" }; await DB.put(settings); });
  expect(await b.evaluate(() => DB.get("settings").artistSignature)).toBe("data:image/png;base64,NEWSIG");
});
