import { sql as rawSql } from "drizzle-orm";
import { buildApp } from "./app.ts";
import { EXAMPLE_SALT, loadConfig } from "./config.ts";
import { createDb, runMigrations } from "./db/client.ts";
import { ModeratorNotifier } from "./services/notifier.ts";
import { Storage } from "./storage/storage.ts";

const config = loadConfig();
const { db, sql } = createDb(config.DATABASE_URL);
const storage = new Storage(config);

/**
 * The database and the storage may still be starting (docker compose starts everything
 * at once), so startup waits for each of them instead of crashing on the first attempt.
 */
async function waitFor(name: string, check: () => Promise<unknown>, attempts = 30, delayMs = 2000) {
  for (let i = 1; ; i++) {
    try {
      await check();
      return;
    } catch (err) {
      if (i >= attempts) throw new Error(`${name} is not reachable: ${String(err)}`);
      console.log(JSON.stringify({ level: 40, msg: `waiting for ${name} (${i}/${attempts})` }));
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

await waitFor("database", () => db.execute(rawSql`select 1`));
// Spec section 3: migrations run automatically on startup.
await runMigrations(db);
await waitFor("storage", () => (config.S3_CREATE_BUCKET ? storage.ensureBucket() : storage.ping()));

const notifier = new ModeratorNotifier(db, config);
const app = await buildApp({ config, db, storage, notifier });
notifier.useLogger(app.log);
// Reports that arrived while the server was down (or within the last hourly window).
notifier.reportCreated();
if (config.IP_HASH_SALT === EXAMPLE_SALT && config.NODE_ENV === "production") {
  app.log.warn("IP_HASH_SALT is the example value from .env.example; set a random secret on a real server");
}

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  notifier.stop();
  await app.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: config.HOST, port: config.PORT });
