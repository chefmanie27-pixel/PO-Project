
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: [".env", "../.env"] });

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://localhost:5432/po_command_center";

export const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    ssl: {
      rejectUnauthorized: true,
    },
  }),
});
