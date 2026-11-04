import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type postgres from "postgres";
import { createDb } from "./client";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

export async function runGameMigrations(
  sqlHandle: postgres.Sql,
  gamesDir?: string,
): Promise<string[]> {
  const dir = gamesDir ?? resolve(fileURLToPath(import.meta.url), "../../../../games");
  if (!existsSync(dir)) return [];
  const applied: string[] = [];

  await sqlHandle`
    CREATE TABLE IF NOT EXISTS "__game_migrations" (
      "name" text PRIMARY KEY,
      "applied_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const gameDirs = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();

  for (const gameId of gameDirs) {
    const dbDir = join(dir, gameId, "db");
    if (!existsSync(dbDir)) continue;
    const sqlFiles = readdirSync(dbDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of sqlFiles) {
      const migrationKey = `${gameId}/${file}`;
      const [existing] = await sqlHandle<{ name: string }[]>`
        SELECT "name" FROM "__game_migrations" WHERE "name" = ${migrationKey} LIMIT 1
      `;
      if (!existing) {
        const fullPath = join(dbDir, file);
        const content = readFileSync(fullPath, "utf8");
        await sqlHandle.unsafe(content);
        await sqlHandle`
          INSERT INTO "__game_migrations" ("name") VALUES (${migrationKey})
        `;
        applied.push(migrationKey);
      }
    }
  }

  return applied;
}

export async function runMigrations(databaseUrl: string): Promise<void> {
  const handle = createDb(databaseUrl, { max: 1 });
  try {
    await migrate(handle.db, { migrationsFolder });
    await runGameMigrations(handle.sql);
  } finally {
    await handle.close();
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL wajib diisi untuk menjalankan migrasi.");
    process.exitCode = 1;
  } else {
    runMigrations(databaseUrl)
      .then(() => console.log("Migrasi selesai."))
      .catch((error: unknown) => {
        console.error("Migrasi gagal:", error);
        process.exitCode = 1;
      });
  }
}
