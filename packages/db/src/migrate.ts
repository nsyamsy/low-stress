import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

export async function runMigrations(databaseUrl: string): Promise<void> {
  const handle = createDb(databaseUrl, { max: 1 });
  try {
    await migrate(handle.db, { migrationsFolder });
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
