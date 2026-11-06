import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { runMigrations } from "@low-stress/db";

// Load .env
const envPath = resolve(process.cwd(), ".env");
if (typeof process.loadEnvFile === "function" && existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // Abaikan bila berkas tidak ada
  }
}

const envTestPath = resolve(process.cwd(), ".env.test");
if (typeof process.loadEnvFile === "function" && existsSync(envTestPath)) {
  try {
    process.loadEnvFile(envTestPath);
  } catch {
    // Abaikan bila berkas tidak ada
  }
}

export async function setupTestDb(): Promise<string> {
  let testDbUrl = process.env.TEST_DATABASE_URL;

  if (!testDbUrl) {
    const rawDevUrl = process.env.DATABASE_URL;
    if (!rawDevUrl) {
      throw new Error("DATABASE_URL atau TEST_DATABASE_URL wajib disetel.");
    }
    const url = new URL(rawDevUrl);
    url.pathname = "/low_stress_test";
    testDbUrl = url.toString();
  }

  const parsed = new URL(testDbUrl);
  const dbName = parsed.pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) {
    throw new Error(
      `Nama database uji harus berakhiran '_test' (diterima: '${dbName}'). Demi keamanan, setup dibatalkan.`
    );
  }

  // Koneksi ke server Postgres (maintenance db 'postgres') untuk mengecek keberadaan DB
  const adminUrl = new URL(testDbUrl);
  adminUrl.pathname = "/postgres";

  const adminSql = postgres(adminUrl.toString(), { max: 1 });
  try {
    const [exists] = await adminSql<{ datname: string }[]>`
      SELECT datname FROM pg_database WHERE datname = ${dbName}
    `;

    if (!exists) {
      console.log(`Membuat database '${dbName}'...`);
      await adminSql.unsafe(`CREATE DATABASE "${dbName}"`);
      console.log(`Database '${dbName}' berhasil dibuat.`);
    } else {
      console.log(`Database '${dbName}' sudah ada.`);
    }
  } catch (err: unknown) {
    const pgErr = err as { code?: string; message?: string };
    if (pgErr.code === "42501") {
      throw new Error(
        `Izin CREATE DATABASE ditolak untuk pengguna database. Hubungi pemilik atau buat '${dbName}' secara manual.`,
        { cause: err },
      );
    }
    // Jika tidak bisa terhubung ke database postgres, coba lanjut ke migrasi langsung
    console.warn(`Peringatan: Tidak dapat memeriksa database via /postgres (${pgErr.message ?? String(err)}). Mencoba langsung migrasi...`);
  } finally {
    await adminSql.end({ timeout: 5 });
  }

  // Terapkan migrasi skema inti dan game
  console.log(`Menerapkan migrasi pada database uji '${dbName}'...`);
  await runMigrations(testDbUrl);
  console.log(`Migrasi berhasil diterapkan pada '${dbName}'.`);

  // Tulis ke .env.test bila belum ada atau belum disetel
  let envTestContent = existsSync(envTestPath) ? readFileSync(envTestPath, "utf8") : "";
  if (!envTestContent.includes("TEST_DATABASE_URL=")) {
    envTestContent = `${envTestContent.trim()}\nTEST_DATABASE_URL=${testDbUrl}\n`.trim() + "\n";
    writeFileSync(envTestPath, envTestContent, "utf8");
    console.log(`Konfigurasi tersimpan di .env.test`);
  }

  return testDbUrl;
}

const isMain = process.argv[1]?.includes("setup");
if (isMain) {
  setupTestDb()
    .then((url) => {
      const parsed = new URL(url);
      console.log(`\nDatabase uji '${parsed.pathname.replace(/^\//, "")}' siap digunakan.`);
    })
    .catch((err) => {
      console.error("\nGagal menyiapkan database uji:", err.message);
      process.exit(1);
    });
}
