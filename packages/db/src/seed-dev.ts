import { fileURLToPath } from "node:url";
import { createDb, type Database } from "./client";
import { games } from "./schema";

const ACTIVE_DEV_GAMES: ReadonlyArray<{ id: string; sortOrder: number }> = [
  { id: "flappy-bird", sortOrder: 1 },
  { id: "memory-match", sortOrder: 2 },
  { id: "ludo", sortOrder: 3 },
];

/**
 * Menyalakan ketiga game awal (`flappy-bird`, `memory-match`, `ludo`) secara
 * idempoten tanpa membuat pengguna palsu di database (ROADMAP D10 & D-13).
 * Game `riot` didaftarkan sebagai `inactive` bila belum ada (tetap mengikuti
 * status yang sudah ada bila pernah diatur admin).
 */
export async function seedDevGames(db: Database): Promise<string[]> {
  const now = new Date();
  const activated: string[] = [];

  for (const item of ACTIVE_DEV_GAMES) {
    await db
      .insert(games)
      .values({
        id: item.id,
        status: "active",
        sortOrder: item.sortOrder,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: games.id,
        set: {
          status: "active",
          sortOrder: item.sortOrder,
          updatedAt: now,
        },
      });
    activated.push(item.id);
  }

  await db
    .insert(games)
    .values({
      id: "riot",
      status: "inactive",
      sortOrder: 4,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: games.id });

  return activated;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL wajib diisi untuk menjalankan db:seed:dev.");
    process.exitCode = 1;
  } else {
    const handle = createDb(databaseUrl, { max: 1 });
    seedDevGames(handle.db)
      .then((list) => {
        console.log(`Seed dev selesai: mengaktifkan game [${list.join(", ")}].`);
      })
      .catch((error: unknown) => {
        console.error("Seed dev gagal:", error);
        process.exitCode = 1;
      })
      .finally(() => handle.close());
  }
}
