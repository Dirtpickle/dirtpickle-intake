const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], browserName: "chromium", baseURL: "http://127.0.0.1:8080" },
  webServer: { command: "node tests/server.js", url: "http://127.0.0.1:8080", reuseExistingServer: true, timeout: 30_000 }
});
