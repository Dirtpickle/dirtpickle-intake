const { test, expect } = require("@playwright/test");
const fs = require("fs");
const AAMVA = require("../js/aamva.js");

test("parses AAMVA data including the license number", async () => {
  const fixture = fs.statSync("test/sample-license-barcode.png");
  expect(fixture.size).toBeGreaterThan(0);
  const parsed = AAMVA.parse("ANSI 636000\nDCSDOE\nDACJANE\nDADQ\nDBB01011990\nDBA01012030\nDAG123 MAIN ST\nDAIPHOENIX\nDAJAZ\nDAK85001\nDAQNOT-SAVED");
  expect(parsed).toMatchObject({ legalName: "Jane Q Doe", dob: "1990-01-01", idState: "AZ" });
  expect(parsed.idNumber).toBe("NOT-SAVED");
});
