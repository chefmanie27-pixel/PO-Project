import "dotenv/config";
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Every migration and API query is confined to a newly created, uniquely named
// schema. The existing public tables are only read to verify preservation.
export async function withIsolatedDatabase<T>(
  run: (db: PrismaClient) => Promise<T>,
  options: { empty?: boolean } = {},
): Promise<T> {
  const url = new URL(process.env.DATABASE_URL || "");
  if (
    process.env.NODE_ENV !== "test" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/po_command_center"
  )
    throw Error(
      "Isolated verification requires the local development database.",
    );
  const schema = `po_verify_${randomUUID().replaceAll("-", "")}`;
  if (!/^po_verify_[a-f0-9]{32}$/.test(schema))
    throw Error("Unsafe verification schema name");
  const control = new Client({ connectionString: process.env.DATABASE_URL });
  await control.connect();
  const tables = [
    "User",
    "Project",
    "Team",
    "Sprint",
    "Ticket",
    "ProjectMembership",
  ];
  const baseline = new Map<string, string[]>();
  let createdOid: number | undefined,
    db: PrismaClient | undefined,
    inMigration = false;
  try {
    for (const table of tables)
      baseline.set(
        table,
        (await control.query(`SELECT id FROM public."${table}"`)).rows.map(
          (row) => row.id,
        ),
      );
    await control.query(`CREATE SCHEMA "${schema}"`);
    createdOid = (
      await control.query("SELECT oid FROM pg_namespace WHERE nspname=$1", [
        schema,
      ])
    ).rows[0].oid;
    await control.query("BEGIN");
    inMigration = true;
    await control.query(`SET LOCAL search_path TO "${schema}"`);
    const migrations = resolve("backend/prisma/migrations");
    for (const entry of (options.empty
      ? []
      : readdirSync(migrations, { withFileTypes: true })
    )
      .filter((e) => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const sql = readFileSync(
        resolve(migrations, entry.name, "migration.sql"),
        "utf8",
      );
      if (
        /\bpublic\s*\.|\bSET\s+(?:LOCAL\s+)?search_path|\bCREATE\s+SCHEMA|\bDROP\s+SCHEMA/i.test(
          sql,
        )
      )
        throw Error(
          "Migration must be reviewed before use in an isolated schema.",
        );
      await control.query(sql);
    }
    await control.query("COMMIT");
    inMigration = false;
    db = new PrismaClient({
      adapter: new PrismaPg(
        {
          connectionString: process.env.DATABASE_URL,
          options: `-c search_path=${schema}`,
          max: 12,
        },
        { schema },
      ),
    });
    const scope = await db.$queryRaw<
      { scope: string }[]
    >`SELECT current_schema() AS scope`;
    if (scope[0].scope !== schema)
      throw Error("Database isolation check failed");
    return await run(db);
  } finally {
    try {
      await db?.$disconnect();
      if (inMigration) await control.query("ROLLBACK");
      if (createdOid !== undefined) {
        const owned = (
          await control.query(
            "SELECT oid,nspowner=current_user::regrole AS owned FROM pg_namespace WHERE nspname=$1",
            [schema],
          )
        ).rows[0];
        if (!owned?.owned || owned.oid !== createdOid)
          throw Error(
            "Refusing cleanup: verification schema ownership changed",
          );
        // Only the schema created above can reach this statement. Public is never a target.
        await control.query(`DROP SCHEMA "${schema}" CASCADE`);
        if (
          (
            await control.query(
              "SELECT oid FROM pg_namespace WHERE nspname=$1",
              [schema],
            )
          ).rowCount
        )
          throw Error("Verification schema cleanup failed");
      }
      for (const [table, ids] of baseline) {
        const remaining = new Set(
          (await control.query(`SELECT id FROM public."${table}"`)).rows.map(
            (row) => row.id,
          ),
        );
        if (ids.some((id) => !remaining.has(id)))
          throw Error(`Existing ${table} records changed during verification`);
      }
    } finally {
      await control.end();
    }
  }
}
