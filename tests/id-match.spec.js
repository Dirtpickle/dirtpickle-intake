const { test, expect } = require("@playwright/test");
const IdMatch = require("../js/id-match.js");

test("matches names across punctuation, order, and middle names", () => {
  const scanned = { legalName: "Jane Q Doe", dob: "1990-01-01" };
  expect(IdMatch.compare(scanned, { legalName: "DOE, JANE MARIE", dob: "1990-01-01" })).toMatchObject({ matched: true });
  expect(IdMatch.compare(scanned, { legalName: "Janet Doe", dob: "1990-01-01" })).toMatchObject({ matched: false, nameMatched: false, dobMatched: true });
  expect(IdMatch.compare(scanned, { legalName: "Jane Doe", dob: "1990-01-02" })).toMatchObject({ matched: false, nameMatched: true, dobMatched: false });
});
