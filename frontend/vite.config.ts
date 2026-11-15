import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { apiBaseUrl } from "./src/services/apiConfig";
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  apiBaseUrl(
    env.VITE_API_BASE_URL,
    command === "build" && !["e2e", "emulator"].includes(mode),
  );
  return {
    plugins: [react(), tailwindcss()],
    // Browser fixtures are available only in the explicitly selected test mode.
    resolve:
      mode === "e2e"
        ? {
            alias: {
              "@firebase/auth": fileURLToPath(
                new URL("../e2e/firebaseAuth.fixture.ts", import.meta.url),
              ),
            },
          }
        : undefined,
    define:
      mode === "e2e"
        ? {
            "import.meta.env.VITE_FIREBASE_API_KEY":
              JSON.stringify("fixture-key"),
            "import.meta.env.VITE_FIREBASE_AUTH_DOMAIN":
              JSON.stringify("fixture.invalid"),
            "import.meta.env.VITE_FIREBASE_PROJECT_ID":
              JSON.stringify("fixture"),
          }
        : mode === "emulator"
          ? {
              "import.meta.env.VITE_FIREBASE_API_KEY":
                JSON.stringify("demo-api-key"),
              "import.meta.env.VITE_FIREBASE_AUTH_DOMAIN": JSON.stringify(
                "demo-po-command-center.firebaseapp.com",
              ),
              "import.meta.env.VITE_FIREBASE_PROJECT_ID": JSON.stringify(
                "demo-po-command-center",
              ),
              "import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL": JSON.stringify(
                "http://127.0.0.1:9099",
              ),
            }
          : undefined,
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            firebase: ["@firebase/app", "@firebase/auth"],
            react: ["react", "react-dom", "react-router-dom"],
            query: ["@tanstack/react-query"],
          },
        },
      },
    },
    server: { proxy: { "/api": "http://127.0.0.1:4000" } },
  };
});
