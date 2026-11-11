const { test, expect } = require("@playwright/test");
const { setup } = require("./helpers/app");

test("phone helpers normalize US numbers and preserve validation rules", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(() => ({
    formatted: [Phone.format("9285550199"), Phone.format("+1 (928) 555-0199"), Phone.format("928abc")],
    digits: [Phone.digits("+1 928-555-0199"), Phone.digits("1 (928) 555-0199")],
    valid: [Phone.isValid("(928) 555-0199"), Phone.isValid("(928) 555-019")]
  }));
  expect(result.formatted).toEqual(["(928) 555-0199", "(928) 555-0199", "(928"]);
  expect(result.digits).toEqual(["9285550199", "9285550199"]);
  expect(result.valid).toEqual([true, false]);
});
