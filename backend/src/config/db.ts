import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
dotenv.config({ path: [".env", "../.env"] });
export const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://localhost:5432/po_command_center",
  }),
});
