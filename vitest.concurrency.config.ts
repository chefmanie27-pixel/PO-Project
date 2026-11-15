import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["backend/concurrency/**/*.test.ts"],
    environment: "node",
    testTimeout: 120000,
    fileParallelism: false,
    env: { NODE_ENV: "test" },
  },
});
