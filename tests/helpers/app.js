const { expect } = require("@playwright/test");

async function enterPin(page, pin) {
  for (const digit of pin) await page.locator(`[data-k="${digit}"]`).click();
}

async function setup(page, pin = "123456") {
  await page.goto("/");
  await enterPin(page, pin);
  await expect(page.locator(".mute").filter({ hasText: "Enter the PIN again" })).toBeVisible();
  await enterPin(page, pin);
  await expect(page.locator("#lockNow")).toBeVisible();
}

async function unlock(page, pin = "123456") {
  await expect(page.locator(`[data-k="1"]`)).toBeVisible();
  await enterPin(page, pin);
  await expect(page.locator("#lockNow")).toBeVisible();
}

async function lock(page) {
  await page.locator("#lockNow").click();
  await expect(page.getByRole("button", { name: "Artist sign-in" })).toBeVisible();
}

async function newClient(page, name = "Alex Example", dob = "1990-01-01") {
  await page.locator('[data-go="clientForm"]').click();
  await page.locator("#legalName").fill(name);
  await page.locator("#dob").fill(dob);
  await page.locator("#phone").fill("9285550100");
  await page.locator("#email").fill("alex@example.com");
  await page.locator("#skipIdPhoto").click();
  await page.locator("#photoOverrideReason").fill("Routine test artist override");
  await page.locator("#confirmPhotoOverride").click();
  await page.locator("#saveClient").click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

async function makeSignature(page, selector = "#sig") {
  const canvas = page.locator(selector);
  await page.evaluate(selector => document.querySelector(selector)?.scrollIntoView({ block: "center" }), selector);
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

async function drawInitials(page, selector) {
  const canvas = page.locator(selector);
  await page.evaluate(value => document.querySelector(value)?.scrollIntoView({ block: "center" }), selector);
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 5, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 5, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

async function goHome(page) {
  await page.locator('[data-go="clients"]').click();
  await page.locator('[data-go="home"]').click();
}

async function answerContract(page) {
  await page.locator(".yn [data-v='no']").evaluateAll(buttons => buttons.forEach(b => b.click()));
  await page.locator(".choice button").evaluateAll(buttons => buttons.filter((b, i) => i === 0 || !b.parentElement.querySelector(".primary")).forEach(b => b.click()));
  for (const box of await page.locator("input[type=checkbox]").all()) await box.check();
  for (const canvas of await page.locator("[data-initials]").all()) await drawInitials(page, await canvas.getAttribute("data-initials").then(si => `[data-initials="${si}"]`));
  await page.evaluate(() => {
    const k = Consent.K();
    k.tpl.sections.forEach((section, si) => {
      section.questions.forEach(q => {
        if (q.type === "check") k.answers[q.id] = { v: true };
        if (q.type === "yesno") k.answers[q.id] = { v: "no" };
        if (q.type === "choice") k.answers[q.id] = { v: q.options[0] };
      });
    });
  });
}

module.exports = { enterPin, setup, unlock, lock, newClient, makeSignature, answerContract, goHome };
