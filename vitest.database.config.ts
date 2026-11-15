import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["backend/database/**/*.test.ts"],
    environment: "node",
    testTimeout: 60000,
    fileParallelism: false,
    env: { NODE_ENV: "test" },
  },
});
