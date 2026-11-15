import "dotenv/config";
import { createApp } from "./app.js";
import { db } from "./config/db.js";
const server = createApp().listen(
  Number(process.env.PORT || 4000),
  "127.0.0.1",
  () => console.log("PO API listening on http://127.0.0.1:4000"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(() => {
      void db.$disconnect();
    });
  });
