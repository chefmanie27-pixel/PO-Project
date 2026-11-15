import "dotenv/config";
import { createApp } from "./app.js";
import { db } from "./config/db.js";
import { readRuntimeConfig } from "./config/runtime.js";
import { getFirebaseAdminApp } from "./config/firebase.js";
const runtime = readRuntimeConfig();
getFirebaseAdminApp();
const server = createApp().listen(runtime.port, runtime.host, () =>
  console.log(`PO API listening on http://${runtime.host}:${runtime.port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(() => {
      void db.$disconnect();
    });
  });
