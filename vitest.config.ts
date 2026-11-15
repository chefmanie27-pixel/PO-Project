import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "backend",
          include: ["backend/tests/**/*.test.ts"],
          environment: "node",
          testTimeout: 15000,
        },
      },
      {
        test: {
          name: "frontend",
          include: ["frontend/tests/**/*.test.tsx"],
          environment: "jsdom",
          env: {
            VITE_FIREBASE_API_KEY: "fixture-key",
            VITE_FIREBASE_PROJECT_ID: "fixture",
            VITE_FIREBASE_AUTH_DOMAIN: "fixture.invalid",
          },
        },
      },
    ],
  },
});
