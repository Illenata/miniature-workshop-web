import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema.ts";

export type Db = ReturnType<typeof createDb>["db"];

export function createDb(databaseUrl: string) {
  const sql = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {},
  });
  const db = drizzle(sql, { schema, casing: "snake_case" });
  return { db, sql };
}

/**
 * Applies pending migrations. The server always runs with apps/api as the working
 * directory (npm workspace scripts and the Docker image both do), so ./drizzle is there.
 */
export async function runMigrations(db: Db, migrationsFolder = path.resolve("drizzle")) {
  await migrate(db, { migrationsFolder });
}
