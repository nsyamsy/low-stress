import { createDb } from "@low-stress/db";

import { buildApp } from "./app";
import { readEnv } from "./env";
import { scanGameManifests, syncGameRegistry } from "./registry/games";

async function main(): Promise<void> {
  const env = readEnv();
  const database = createDb(env.DATABASE_URL);

  const loaded = await scanGameManifests();
  const sync = await syncGameRegistry(database.db, loaded);

  const app = await buildApp({
    env,
    db: database.db,
    games: loaded,
    checkDatabase: async () => {
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          database.sql`select 1`,
          new Promise((_resolve, reject) => {
            timer = setTimeout(
              () => reject(new Error("database timeout")),
              2000,
            );
          }),
        ]);
        return true;
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await database.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ host: env.HOST, port: env.PORT });
    app.log.info(
      {
        games: loaded.length,
        inserted: sync.inserted,
        unchanged: sync.unchanged,
      },
      "game registry synced",
    );
  } catch (error) {
    app.log.error({ err: error }, "failed to start server");
    await database.close();
    process.exit(1);
  }
}

void main();
