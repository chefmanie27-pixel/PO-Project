import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["backend/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 20000,
    env: { NODE_ENV: "test", FIREBASE_PROJECT_ID: "demo-po-command-center" },
    fileParallelism: false,
  },
});
