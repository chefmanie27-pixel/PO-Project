import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["backend/performance/**/*.test.ts"],
    environment: "node",
    testTimeout: 120000,
    fileParallelism: false,
    env: { NODE_ENV: "test" },
  },
});
