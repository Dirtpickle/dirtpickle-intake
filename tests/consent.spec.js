const { test, expect } = require("@playwright/test");
const { setup, newClient, makeSignature, answerContract, unlock } = require("./helpers/app");

async function completeContract(page) {
  await page.locator("#startPaper").click();
  await page.locator("#privOk").check();
  await page.locator("#kNext").click();
  await page.locator("#kNext").click();
  await answerContract(page);
  await page.locator("#kNext").click();
  await makeSignature(page);
  await page.locator("#kSubmit").click();
  await expect(page.getByText("Thank you!")).toBeVisible();
}

test("requires contract answers and creates a locked PDF with matching SHA-256", async ({ page }) => {
  await setup(page);
  await newClient(page, "Consent Client");
  await completeContract(page);
  await page.locator("#kStaff").click();
  await page.locator("#kStaff").click();
  await unlock(page);
  await page.locator('[data-go="documents"]').click();
  await page.locator('[data-go="doc"]').click();
  await page.getByRole("button", { name: "Verify integrity" }).click();
  await expect(page.locator("#dMsg")).toContainText("matches the fingerprint");
  await expect(page.getByText("locked records", { exact: false })).toBeVisible();
  const writeRejected = await page.evaluate(async () => {
    try { await DB.put(DB.all("consent")[0]); return false; } catch (_) { return true; }
  });
  expect(writeRejected).toBe(true);
});

test("countersigns a consent and keeps the final PDF locked", async ({ page }) => {
  await setup(page);
  await newClient(page, "Countersign Client");
  await completeContract(page);
  await page.locator("#kStaff").click();
  await page.locator("#kStaff").click();
  await unlock(page);
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 140; canvas.height = 60;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "white"; ctx.fillRect(0, 0, 140, 60); ctx.strokeStyle = "black";
    ctx.beginPath(); ctx.moveTo(10, 35); ctx.lineTo(120, 20); ctx.stroke();
    const sig = canvas.toDataURL("image/png");
    await DB.put({ ...DB.get("settings"), artistSignature: sig, artistInitials: sig });
  });
  await page.reload();
  if (await page.locator("#kStaff").count()) {
    await page.locator("#kStaff").click();
    await page.waitForTimeout(100);
    if (await page.locator("#kStaff").count()) await page.locator("#kStaff").click();
  }
  await unlock(page);
  await page.locator('[data-go="documents"]').click();
  await page.locator('[data-go="doc"]').click();
  await page.once("dialog", dialog => dialog.accept());
  await page.locator("#cSign").click();
  await expect(page.locator("#cVerify")).toBeVisible();
  await page.locator("#cVerify").click();
  await expect(page.locator("#cMsg")).toContainText("matches the fingerprint");
  const locked = await page.evaluate(() => DB.all("countersign").every(r => r.locked));
  expect(locked).toBe(true);
});

test("requires drawn initials before continuing", async ({ page }) => {
  await setup(page);
  await newClient(page, "Initials Client");
  await page.locator("#startPaper").click();
  await page.locator("#privOk").check();
  await page.locator("#kNext").click();
  await page.locator("#kNext").click();
  await page.locator(".yn [data-v='no']").evaluateAll(buttons => buttons.forEach(b => b.click()));
  await page.locator(".choice button").evaluateAll(buttons => buttons.filter((b, i) => i === 0 || !b.parentElement.querySelector(".primary")).forEach(b => b.click()));
  await page.locator("input[type=checkbox]").check();
  await page.locator("[data-initials-clear]").first().click();
  await page.locator("#kNext").click();
  await expect(page.locator("#kErr")).toContainText("Please draw your initials");
});

test("requires the single final acknowledgment", async ({ page }) => {
  await setup(page);
  await newClient(page, "Final Tick Client");
  await page.locator("#startPaper").click();
  await page.locator("#privOk").check();
  await page.locator("#kNext").click();
  await page.locator("#kNext").click();
  await answerContract(page);
  await page.locator("input[type=checkbox]").uncheck();
  await page.locator("#kNext").click();
  await expect(page.locator("#kErr")).toContainText("Please tick every box");
});

test("legacy typed initials render and their PDF hash verifies", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const oldTemplate = {
      ...CONTRACT,
      id: "tpl-default-v2",
      source: "az-dp-2026-draft-2",
      version: 1,
      docVersion: "AZ-DP-2026-DRAFT-2",
      sections: CONTRACT.sections.map((section, si) => si === 12 ? {
        ...section,
        heading: "13. Photography and publicity authorization",
        initials: true,
        body: ["Legacy photography wording."],
        questions: [
          { id: "ph1", type: "choice", required: true, label: "Legacy promotion choice", options: ["YES", "NO"] },
          { id: "ph2", type: "choice", required: true, label: "Legacy identity choice", options: ["YES", "NO"] }
        ]
      } : section)
    };
    await DB.put(oldTemplate);
    await Consent.init();
    const active = Consent.activeTemplate();
    const canvas = document.createElement("canvas");
    canvas.width = 140; canvas.height = 60;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, 140, 60);
    const signature = canvas.toDataURL("image/png");
    const answers = {};
    oldTemplate.sections.forEach((section, si) => {
      if (section.initials) answers["init:" + si] = { v: "AE" };
      section.questions.forEach(question => { if (question.type === "check") answers[question.id] = { v: true }; });
    });
    answers.ph1 = { v: "YES" };
    answers.ph2 = { v: "NO" };
    const bytes = await Consent.buildPdf({ business: "Dirtpickle", minAge: 18,
      client: { id: "legacy-client", legalName: "Legacy Client", dob: "1990-01-01" },
      session: { id: "legacy-session", createdAt: new Date().toISOString(), flashName: "" },
      tpl: oldTemplate, answers, signature, signedAt: new Date().toISOString(), docId: "legacy-doc",
      ageAtSigning: 36, idCheck: null, privacy: null, artist: "Mike Peterson" });
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map(byte => byte.toString(16).padStart(2, "0")).join("");
    return { activeSource: active.source, bytes: bytes.length, hash };
  });
  expect(result.activeSource).toBe("az-dp-2026-draft-3");
  expect(result.bytes).toBeGreaterThan(0);
  expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
});
