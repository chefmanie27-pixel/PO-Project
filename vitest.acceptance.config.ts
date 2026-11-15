import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["backend/acceptance/**/*.test.ts"],
    environment: "node",
    testTimeout: 120000,
    hookTimeout: 30000,
    fileParallelism: false,
    env: { NODE_ENV: "test" },
  },
});
