import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";
import { databaseConfig } from "./database.js";

dotenv.config({ path: [".env", "../.env"] });
const config = databaseConfig();
if (process.env.NODE_ENV !== "test")
  console.info(
    JSON.stringify({
      event: "database_configured",
      target: config.target,
      tls: config.tls,
    }),
  );
export const db = new PrismaClient({ adapter: new PrismaPg(config.pool) });
