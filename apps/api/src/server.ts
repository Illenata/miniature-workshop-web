import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createDb, runMigrations } from "./db/client.ts";
import { Storage } from "./storage/storage.ts";

const config = loadConfig();
const { db, sql } = createDb(config.DATABASE_URL);
const storage = new Storage(config);

// Spec section 3: migrations run automatically on startup.
await runMigrations(db);
if (config.S3_CREATE_BUCKET) await storage.ensureBucket();

const app = await buildApp({ config, db, storage });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: config.HOST, port: config.PORT });
