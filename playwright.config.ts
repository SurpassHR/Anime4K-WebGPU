import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 15_000,
  },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8766",
    channel: "chrome",
    headless: true,
    launchOptions: {
      args: [
        "--enable-unsafe-webgpu",
        "--use-angle=metal",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev:test",
    url: "http://127.0.0.1:8766",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
