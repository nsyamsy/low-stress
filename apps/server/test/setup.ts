import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Coba muat .env.test bila ada
const rootEnvTest = resolve(process.cwd(), "../../.env.test");
const localEnvTest = resolve(process.cwd(), ".env.test");
const rootEnv = resolve(process.cwd(), "../../.env");
const localEnv = resolve(process.cwd(), ".env");

if (typeof process.loadEnvFile === "function") {
  if (existsSync(rootEnvTest)) {
    try {
      process.loadEnvFile(rootEnvTest);
    } catch {
      // Abaikan bila berkas tidak terbaca
    }
  } else if (existsSync(localEnvTest)) {
    try {
      process.loadEnvFile(localEnvTest);
    } catch {
      // Abaikan bila berkas tidak terbaca
    }
  }
}

const testDbUrl = process.env.TEST_DATABASE_URL;

// Validasi D-01: Tolak berjalan bila TEST_DATABASE_URL kosong atau tidak berakhiran _test
if (!testDbUrl || !testDbUrl.trim()) {
  throw new Error(
    "GAGAL CEPAT: TEST_DATABASE_URL wajib diatur untuk menjalankan tes server.\n" +
    "Nama database HARUS berakhiran '_test' (contoh: postgres://.../low_stress_test).\n" +
    "Tes menolak berjalan terhadap database pengembangan demi melindungi data asli.\n" +
    "Jalankan 'pnpm test:db:up' untuk menyiapkan database uji."
  );
}

const dbName = (() => {
  try {
    return new URL(testDbUrl).pathname.replace(/^\//, "");
  } catch {
    throw new Error("GAGAL CEPAT: Format TEST_DATABASE_URL tidak valid.");
  }
})();

if (!dbName.endsWith("_test")) {
  throw new Error(
    `GAGAL CEPAT: TEST_DATABASE_URL tidak valid. Nama database HARUS berakhiran '_test' (diterima: '${dbName}'). Demi keamanan data, tes ditolak.`
  );
}

// Pastikan DATABASE_URL diarahkan ke database uji sebelum berkas tes membaca environment
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = "test";

// Muat variabel non-database dari .env bila belum ada
if (typeof process.loadEnvFile === "function") {
  if (existsSync(rootEnv)) {
    try {
      process.loadEnvFile(rootEnv);
    } catch {
      // Abaikan bila berkas tidak terbaca
    }
  } else if (existsSync(localEnv)) {
    try {
      process.loadEnvFile(localEnv);
    } catch {
      // Abaikan bila berkas tidak terbaca
    }
  }
}

// Sekali lagi kunci DATABASE_URL ke database uji
process.env.DATABASE_URL = testDbUrl;
