const { test, expect } = require("@playwright/test");
const { setup } = require("./helpers/app");

test("text copy is opt-in and validates its phone number", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(() => {
    const root = document.createElement("div"); root.innerHTML = ConsentCopy.html("me@example.com", true, { phone: "9285550100" });
    ConsentCopy.bind(root);
    const off = ConsentCopy.read(root); root.querySelector("#textCopy").checked = true; root.querySelector("#textCopy").dispatchEvent(new Event("change"));
    root.querySelector("#textPhone").value = "555"; const bad = ConsentCopy.read(root); root.querySelector("#textPhone").value = "9285550100";
    return { off, bad, on: ConsentCopy.read(root) };
  });
  expect(result.off).toMatchObject({ text: false, phone: "" });
  expect(result.bad.error).toContain("valid 10-digit");
  expect(result.on).toMatchObject({ text: true, phone: "(928) 555-0100" });
});

test("sharing two PDFs creates a separate text marker and cancellation does not", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const d = { type: "consent", id: "text-doc", clientId: "text-client", signedAt: "2026-01-01T00:00:00.000Z", clientSnapshot: { legalName: "Text Client" }, pdf: "AQID" };
    await DB.put({ type: "client", id: "text-client", legalName: "Text Client", visits: [] });
    let shared;
    navigator.canShare = options => (shared = options.files.length) > 0;
    navigator.share = async options => { shared = options.files.length; };
    await DB.put(d); await TextCopy.send(d, "(928) 555-0100");
    const sent = { files: shared, marker: DB.get("txt-text-doc") };
    await DB.remove("txt-text-doc");
    navigator.share = async () => { const e = new DOMException("cancel", "AbortError"); throw e; };
    await TextCopy.send(d, "(928) 555-0100");
    return { sent, cancelled: DB.get("txt-text-doc") };
  });
  expect(result.sent.files).toBe(2);
  expect(result.sent.marker).toMatchObject({ type: "textcopy", docId: "text-doc", clientId: "text-client" });
  expect(result.cancelled).toBeFalsy();
});

test("intake boot does not load TextCopy", async ({ page }) => {
  await page.goto("/");
  expect(await page.evaluate(() => typeof TextCopy)).toBe("undefined");
});
