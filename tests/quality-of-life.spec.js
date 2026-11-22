const { test, expect } = require("@playwright/test");
const { setup } = require("./helpers/app");

test("URL has a Clear button and the secret has a Show/Hide eye", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { go("settingsGoogle"); });
  await page.locator("#relayUrl").fill("https://script.google.com/macros/s/x/exec");
  await page.locator("#relayUrlClear").click();
  await expect(page.locator("#relayUrl")).toHaveValue("");
  await page.locator("#relaySecret").fill("abc123");
  await expect(page.locator("#relaySecret")).toHaveAttribute("type", "password");
  await page.locator("#relaySecretEye").click();
  await expect(page.locator("#relaySecret")).toHaveAttribute("type", "text");
  await page.locator("#relaySecretEye").click();
  await expect(page.locator("#relaySecret")).toHaveAttribute("type", "password");
});

test("test email uses the values typed on screen, not only the saved ones", async ({ page }) => {
  await setup(page);
  let hit = "";
  await page.route("**/script.google.com/**", async r => { hit = JSON.parse(r.request().postData()).secret; await r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ok: true }) }); });
  await page.evaluate(() => go("settingsGoogle"));
  await page.locator("#relayUrl").fill("https://script.google.com/macros/s/typed/exec");
  await page.locator("#relaySecret").fill("typed-secret");
  await page.locator("#testEmail").fill("a@example.com");
  await page.locator("#sendTestEmail").click();
  await expect(page.locator("#relayMsg")).toContainText("Test sent");
  expect(hit).toBe("typed-secret");
});

test("the tap that finishes the PIN does not press the screen underneath", async ({ page }) => {
  await setup(page);
  const hits = await page.evaluate(async () => {
    document.body.insertAdjacentHTML("beforeend", '<button id="ghost" style="position:fixed;top:0;left:0">g</button>');
    let n = 0; const g = document.getElementById("ghost"); g.addEventListener("click", () => n++);
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); // the PIN tap
    PressFeedback.hold(450);
    g.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); // the follow-up click
    const swallowed = n === 0;
    await new Promise(r => setTimeout(r, 20));
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); // a deliberate new tap
    g.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return { swallowed, later: n };
  });
  expect(hits).toEqual({ swallowed: true, later: 1 });
});
