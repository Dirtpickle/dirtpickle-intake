const { test, expect } = require("@playwright/test");
const { setup, lock } = require("./helpers/app");

function relay(page, state) {
  return page.route("**/relay.test/**", async route => {
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
    await DB.put({ ...DB.get("settings"), emailRelayUrl: "https://relay.test/exec", relaySecret: "test-secret", syncSalt: value, syncEnabled: true });
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
  await page.evaluate(async () => DB.put({ ...DB.get("settings"), syncSalt: null }));
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
  expect(got).toEqual({ s: "data:image/png;base64,SIG", i: "data:image/png;base64,INI", relay: "https://relay.test/exec" });
});
