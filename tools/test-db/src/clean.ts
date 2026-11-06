import { existsSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const envTestPath = resolve(process.cwd(), ".env.test");
if (typeof process.loadEnvFile === "function" && existsSync(envTestPath)) {
  try {
    process.loadEnvFile(envTestPath);
  } catch {
    // Abaikan bila tidak terbaca
  }
}

export async function cleanTestDb(): Promise<void> {
  const testDbUrl = process.env.TEST_DATABASE_URL;
  if (!testDbUrl) {
    throw new Error("TEST_DATABASE_URL tidak disetel. Pembersihan dibatalkan.");
  }

  const parsed = new URL(testDbUrl);
  const dbName = parsed.pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) {
    throw new Error(
      `Pembersihan DITOLAK: Nama database harus berakhiran '_test' (diterima: '${dbName}').`
    );
  }

  const sql = postgres(testDbUrl, { max: 1 });
  try {
    // Truncate semua tabel data uji, biarkan struktur dan __game_migrations
    await sql.unsafe(`
      TRUNCATE TABLE
        users,
        admins,
        sessions,
        settings,
        audit_log,
        banned_words,
        chat_messages,
        chat_mutes,
        email_tokens,
        game_runs,
        game_scores,
        login_attempts
      CASCADE;
    `);
    console.log(`Tabel data pada database uji '${dbName}' telah dibersihkan.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const isMain = process.argv[1]?.includes("clean");
if (isMain) {
  cleanTestDb().catch((err) => {
    console.error("Gagal membersihkan database uji:", err.message);
    process.exit(1);
  });
}
