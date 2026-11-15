import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-firebase",
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:5179", trace: "retain-on-failure" },
  projects: [
    {
      name: "firebase-auth-edge",
      use: { ...devices["Desktop Chrome"], channel: "msedge" },
    },
  ],
  webServer: {
    command:
      "npm.cmd run dev -w frontend -- --mode emulator --port 5179 --strictPort",
    url: "http://127.0.0.1:5179",
    reuseExistingServer: false,
  },
});
